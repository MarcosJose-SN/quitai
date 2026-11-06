package handlers

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"github.com/MarcosJose/quitai/auth"
	"github.com/lib/pq"
	"io"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"strings"
)

const maxCentavosFinanceiros int64 = 9999999999 // NUMERIC(10,2)
var chaveFinanceiraValida = regexp.MustCompile(`^[A-Za-z0-9_-]{16,128}$`)

type resultadoFinanceiro struct {
	Codigo int
	Corpo  []byte
}

func erroFinanceiro(w http.ResponseWriter, codigo int, mensagem, resultado string) {
	responderAdminJSON(w, codigo, map[string]string{"mensagem": mensagem, "resultado": resultado})
}
func falhaFinanceira(w http.ResponseWriter, err error) {
	// Nunca registrar pedidos, respostas, credenciais ou chaves de idempotencia.
	var postgres *pq.Error
	if errors.As(err, &postgres) {
		log.Printf("Falha em operacao financeira: SQLSTATE=%s", postgres.Code)
	} else {
		log.Printf("Falha em operacao financeira (%T)", err)
	}
	erroFinanceiro(w, 503, "Nao foi possivel confirmar o resultado. Repita o mesmo pedido com a mesma chave.", "incerto")
}
func lerPedidoFinanceiro(w http.ResponseWriter, r *http.Request, destino any) error {
	d := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10))
	d.DisallowUnknownFields()
	if err := d.Decode(destino); err != nil {
		return err
	}
	if err := d.Decode(new(any)); err != io.EOF {
		return errors.New("conteudo extra no pedido")
	}
	return nil
}
func validarAmbienteFinanceiro(w http.ResponseWriter, r *http.Request) bool {
	ambiente := auth.AmbienteFinanceiro()
	if ambiente == "" {
		erroFinanceiro(w, 503, "Ambiente financeiro indisponivel.", "incerto")
		return false
	}
	valoresAmbiente := r.Header.Values("X-Financial-Environment")
	if len(valoresAmbiente) != 1 || valoresAmbiente[0] != ambiente {
		erroFinanceiro(w, 409, "Ambiente financeiro ausente ou divergente. Preserve a intencao original.", "conflito")
		return false
	}

	return true
}

func chaveFinanceira(w http.ResponseWriter, r *http.Request) (string, bool) {
	if !validarAmbienteFinanceiro(w, r) {
		return "", false
	}

	valores := r.Header.Values("Idempotency-Key")
	if len(valores) != 1 || !chaveFinanceiraValida.MatchString(valores[0]) {
		erroFinanceiro(w, 400, "Informe Idempotency-Key com 16 a 128 caracteres (letras, numeros, _ ou -).", "nao_confirmado")
		return "", false
	}
	return valores[0], true
}
func hashPedidoFinanceiro(pedido any) string {
	b, _ := json.Marshal(pedido)
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:])
}

// A reserva e a resposta pertencem a MESMA transacao dos efeitos financeiros.
// A restricao unica faz a segunda conexao aguardar a primeira confirmar ou reverter.
func reservarOperacao(tx *sql.Tx, r *http.Request, usuario int, tipo, chave, hash string) (int64, *resultadoFinanceiro, error) {
	var id int64
	err := tx.QueryRowContext(r.Context(), `INSERT INTO operacoes_financeiras(usuario_id,tipo,chave,pedido_hash) VALUES($1,$2,$3,$4) ON CONFLICT(usuario_id,tipo,chave) DO NOTHING RETURNING id`, usuario, tipo, chave, hash).Scan(&id)
	if err == nil {
		return id, nil, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return 0, nil, err
	}
	var anterior string
	var codigo sql.NullInt64
	var corpo []byte
	err = tx.QueryRowContext(r.Context(), `SELECT id,pedido_hash,codigo_http,resposta_bytes FROM operacoes_financeiras WHERE usuario_id=$1 AND tipo=$2 AND chave=$3`, usuario, tipo, chave).Scan(&id, &anterior, &codigo, &corpo)
	if err != nil {
		return 0, nil, err
	}
	if anterior != hash {
		return 0, nil, errChaveReutilizada
	}
	if !codigo.Valid || len(corpo) == 0 {
		return 0, nil, errors.New("operacao sem resultado confirmado")
	}
	return id, &resultadoFinanceiro{Codigo: int(codigo.Int64), Corpo: corpo}, nil
}

var errChaveReutilizada = errors.New("chave ja utilizada com outro pedido")

func tratarReserva(w http.ResponseWriter, err error) {
	if errors.Is(err, errChaveReutilizada) {
		erroFinanceiro(w, 409, "Esta chave pertence a outro pedido. Resolva a operacao original antes de iniciar outra.", "conflito")
		return
	}
	falhaFinanceira(w, err)
}
func enviarResultadoFinanceiro(w http.ResponseWriter, res *resultadoFinanceiro) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(res.Codigo)
	_, _ = w.Write(res.Corpo)
}
func confirmarOperacao(tx *sql.Tx, r *http.Request, id int64, codigo int, resposta any) (*resultadoFinanceiro, error) {
	b, err := json.Marshal(resposta)
	if err != nil {
		return nil, err
	}
	res, err := tx.ExecContext(r.Context(), `UPDATE operacoes_financeiras SET codigo_http=$1,resposta=$2::jsonb,resposta_bytes=$3 WHERE id=$4 AND codigo_http IS NULL`, codigo, string(b), b, id)
	if err != nil {
		return nil, err
	}
	n, err := res.RowsAffected()
	if err != nil || n != 1 {
		return nil, errors.New("resultado financeiro nao registrado")
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}
	return &resultadoFinanceiro{Codigo: codigo, Corpo: b}, nil
}
func centavosDecimal(s string) (int64, error) {
	partes := strings.Split(s, ".")
	if len(partes) > 2 || strings.HasPrefix(s, "-") {
		return 0, errors.New("valor monetario invalido")
	}
	inteiro, err := strconv.ParseInt(partes[0], 10, 64)
	if err != nil || inteiro < 0 || inteiro > 99999999 {
		return 0, errors.New("valor fora do limite")
	}
	fracao := "00"
	if len(partes) == 2 {
		fracao = partes[1]
		if len(fracao) > 2 {
			return 0, errors.New("fracao invalida")
		}
		fracao += strings.Repeat("0", 2-len(fracao))
	}
	centavos, err := strconv.ParseInt(fracao, 10, 64)
	if err != nil {
		return 0, err
	}
	return inteiro*100 + centavos, nil
}
func decimalCentavos(c int64) string { return strconv.FormatInt(c/100, 10) + "." + fmtDois(c%100) }
func fmtDois(n int64) string {
	if n < 10 {
		return "0" + strconv.FormatInt(n, 10)
	}
	return strconv.FormatInt(n, 10)
}

// Mantido como rota explicita para orientar versoes antigas, sem criar cabecalhos parciais.
func ProtocoloVendaDesativado(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		erroFinanceiro(w, 405, "Metodo nao permitido.", "nao_confirmado")
		return
	}
	erroFinanceiro(w, 410, "Protocolo antigo desativado. Atualize o aplicativo e utilize POST /vendas/completa.", "nao_confirmado")
}
