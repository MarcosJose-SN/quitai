package handlers

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/MarcosJose/quitai/auth"
)

const exportacaoFormato = "quitai-exportacao-dados"

type limiteExportacao struct {
	bytes, linhaBytes, linhas int
	prazo                     time.Duration
}

var limitesExportacao = limiteExportacao{10 << 20, 256 << 10, 50000, 20 * time.Second}

// Lista positiva: nunca SELECT *, usuarios.senha_hash, fotos ou tabelas de autenticacao.
var tabelasExportacao = []struct{ nome, selectSQL string }{
	{"revendedoras", `SELECT id,nome,email,perfil,ativo,criado_em,atualizado_em FROM public.usuarios WHERE perfil='revendedora'`},
	{"clientes", `SELECT id,usuario_id,nome,telefone,observacoes,criado_em,atualizado_em FROM public.clientes WHERE usuario_id IN (SELECT id FROM public.usuarios WHERE perfil='revendedora')`},
	{"produtos", `SELECT id,usuario_id,nome,codigo,categoria,preco_custo::text,preco_venda::text,estoque,criado_em,atualizado_em FROM public.produtos WHERE usuario_id IN (SELECT id FROM public.usuarios WHERE perfil='revendedora')`},
	{"vendas", `SELECT id,usuario_id,cliente_id,data_compra,prazo_pagamento,vencimento,total::text,valor_pago::text,saldo::text,status,total_parcelas,criado_em,atualizado_em FROM public.vendas WHERE usuario_id IN (SELECT id FROM public.usuarios WHERE perfil='revendedora')`},
	{"itens", `SELECT id,venda_id,produto_id,quantidade,preco_unitario::text,subtotal::text FROM public.venda_itens WHERE venda_id IN (SELECT id FROM public.vendas WHERE usuario_id IN (SELECT id FROM public.usuarios WHERE perfil='revendedora'))`},
	{"parcelas", `SELECT id,venda_id,numero_parcela,total_parcelas,valor::text,vencimento,valor_pago::text,status,criado_em FROM public.parcelas WHERE venda_id IN (SELECT id FROM public.vendas WHERE usuario_id IN (SELECT id FROM public.usuarios WHERE perfil='revendedora'))`},
	{"pagamentos", `SELECT id,venda_id,parcela_id,valor::text,data_pagamento,forma_pagamento FROM public.pagamentos WHERE venda_id IN (SELECT id FROM public.vendas WHERE usuario_id IN (SELECT id FROM public.usuarios WHERE perfil='revendedora'))`},
}

type conteudoExportacao struct {
	Ambiente string                       `json:"ambiente_financeiro"`
	GeradoEm time.Time                    `json:"gerado_em"`
	Escopo   string                       `json:"escopo"`
	Dados    map[string][]json.RawMessage `json:"dados"`
}
type arquivoExportacao struct {
	Formato      string `json:"formato"`
	Versao       int    `json:"versao"`
	SHA256       string `json:"sha256"`
	ConteudoJSON string `json:"conteudo_json"`
}

var errLimiteExportacao = errors.New("limite de exportacao")

// AdminExportarDados embeds the existing admin/session validation, including
// persistent revocation, before acquiring resources or reading business data.
func AdminExportarDados(db *sql.DB) http.Handler {
	return auth.AdminMiddleware(db, exportarDados(db, limitesExportacao))
}

func exportarDados(db *sql.DB, limites limiteExportacao) http.HandlerFunc {
	ocupado := make(chan struct{}, 1) // no queue or concurrent snapshots per instance
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		if r.Method != http.MethodGet {
			w.Header().Set("Allow", "GET")
			http.Error(w, "Metodo nao permitido.", 405)
			return
		}
		if r.URL.RawQuery != "" {
			http.Error(w, "A exportacao e completa; filtros nao sao aceitos.", 400)
			return
		}
		ambiente := auth.AmbienteFinanceiro()
		if ambiente == "" {
			http.Error(w, "Ambiente de origem nao configurado.", 503)
			return
		}
		select {
		case ocupado <- struct{}{}:
			defer func() { <-ocupado }()
		default:
			http.Error(w, "Outra exportacao esta em andamento. Aguarde.", 429)
			return
		}
		ctx, cancelar := context.WithTimeout(r.Context(), limites.prazo)
		defer cancelar()
		arquivo, err := gerarExportacao(ctx, db, ambiente, limites)
		if err != nil {
			if errors.Is(err, errLimiteExportacao) {
				http.Error(w, "Exportacao excede o limite seguro. Solicite um backup PostgreSQL protegido.", 413)
			} else {
				http.Error(w, "Nao foi possivel concluir a exportacao. Nenhum arquivo valido foi gerado.", 503)
			}
			return
		}
		// Prepare everything before sending any private data; failures never yield a partial JSON with 200.
		enviarArquivoExportacao(w, arquivo)
	}
}

func enviarArquivoExportacao(w http.ResponseWriter, arquivo []byte) {
	// Bound slow downloads on this route only; do not impose a global timeout on SSE.
	controle := http.NewResponseController(w)
	if err := controle.SetWriteDeadline(time.Now().Add(10 * time.Second)); err != nil {
		http.Error(w, "Download seguro indisponivel neste servidor.", 503)
		return
	}
	defer controle.SetWriteDeadline(time.Time{})
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="quitai-exportacao-v1.json"`)
	if _, err := w.Write(arquivo); err != nil {
		return
	}
	_ = controle.Flush()
}

func gerarExportacao(ctx context.Context, db *sql.DB, ambiente string, limites limiteExportacao) ([]byte, error) {
	tx, err := db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	conteudo := conteudoExportacao{ambiente, time.Now().UTC(), "todas_revendedoras_sem_filtros", make(map[string][]json.RawMessage)}
	total := 0
	for _, tabela := range tabelasExportacao {
		// Row size is checked by the server before transport; column names and table names are constants.
		query := `SELECT CASE WHEN octet_length(row_to_json(d)::text) <= $1 THEN row_to_json(d)::text ELSE NULL END FROM (` + tabela.selectSQL + `) d ORDER BY d.id LIMIT $2`
		rows, err := tx.QueryContext(ctx, query, limites.linhaBytes, limites.linhas+1)
		if err != nil {
			return nil, err
		}
		registros := []json.RawMessage{}
		for rows.Next() {
			var linha sql.NullString
			if err = rows.Scan(&linha); err != nil {
				break
			}
			if !linha.Valid || len(registros) >= limites.linhas || total+len(linha.String) > limites.bytes {
				err = errLimiteExportacao
				break
			}
			if !json.Valid([]byte(linha.String)) {
				err = errors.New("registro invalido")
				break
			}
			total += len(linha.String)
			registros = append(registros, json.RawMessage(linha.String))
		}
		if err == nil {
			err = rows.Err()
		}
		rows.Close()
		if err != nil {
			return nil, err
		}
		conteudo.Dados[tabela.nome] = registros
	}
	// Exact UTF-8 string is hashed, so validation never reserializes monetary values.
	var buffer bytes.Buffer
	enc := json.NewEncoder(&buffer)
	enc.SetEscapeHTML(false)
	if err = enc.Encode(conteudo); err != nil {
		return nil, err
	}
	if buffer.Len() > limites.bytes {
		return nil, errLimiteExportacao
	}
	digest := sha256.Sum256(buffer.Bytes())
	arquivo, err := json.Marshal(arquivoExportacao{exportacaoFormato, 1, hex.EncodeToString(digest[:]), buffer.String()})
	if err != nil {
		return nil, err
	}
	if len(arquivo) > 2*limites.bytes {
		return nil, errLimiteExportacao
	}
	if err = ctx.Err(); err != nil {
		return nil, err
	}
	// End read-only snapshot before sending the download. No write/COMMIT is necessary.
	if err = tx.Rollback(); err != nil {
		return nil, err
	}
	return arquivo, nil
}
