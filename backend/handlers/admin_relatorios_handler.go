package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"time"
)

// AdminRelatorios disponibiliza dados consolidados somente pela rota protegida
// com auth.AdminMiddleware no main.go.
// GET /admin/relatorios?revendedora_id=1&inicio=2026-10-01&fim=2026-10-31
// O intervalo filtra vendas por data_compra e pagamentos por data_pagamento.
// Cadastros e estoque sao fotografias atuais, independentes do intervalo.
func AdminRelatorios(db *sql.DB) http.HandlerFunc {
	type Resumo struct {
		Revendedoras     int64   `json:"revendedoras"`
		Vendas           int64   `json:"vendas"`
		TotalVendido     float64 `json:"total_vendido"`
		TotalRecebido    float64 `json:"total_recebido"`
		SaldoVendas      float64 `json:"saldo_vendas"`
		Clientes         int64   `json:"clientes"`
		Produtos         int64   `json:"produtos"`
		UnidadesVendidas int64   `json:"unidades_vendidas"`
		ParcelasVencidas int64   `json:"parcelas_vencidas"`
	}
	type Revendedora struct {
		ID            int64   `json:"id"`
		Nome          string  `json:"nome"`
		Email         string  `json:"email"`
		Ativo         bool    `json:"ativo"`
		Clientes      int64   `json:"clientes"`
		Produtos      int64   `json:"produtos"`
		Vendas        int64   `json:"vendas"`
		TotalVendido  float64 `json:"total_vendido"`
		TotalRecebido float64 `json:"total_recebido"`
	}
	type Produto struct {
		ID                int64   `json:"id"`
		RevendedoraID     int64   `json:"revendedora_id"`
		Nome              string  `json:"nome"`
		Codigo            string  `json:"codigo"`
		Estoque           int64   `json:"estoque"`
		QuantidadeVendida int64   `json:"quantidade_vendida"`
		Faturamento       float64 `json:"faturamento"`
	}
	type Cliente struct {
		ID            int64   `json:"id"`
		RevendedoraID int64   `json:"revendedora_id"`
		Nome          string  `json:"nome"`
		Compras       int64   `json:"compras"`
		TotalCompras  float64 `json:"total_compras"`
	}
	type Resposta struct {
		Resumo       Resumo        `json:"resumo"`
		Revendedoras []Revendedora `json:"revendedoras"`
		Produtos     []Produto     `json:"produtos"`
		Clientes     []Cliente     `json:"clientes"`
	}
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		if r.Method != http.MethodGet {
			w.Header().Set("Allow", "GET")
			http.Error(w, `{"mensagem":"Método não permitido"}`, http.StatusMethodNotAllowed)
			return
		}
		q := r.URL.Query()
		var id int64
		if s := q.Get("revendedora_id"); s != "" {
			n, e := strconv.ParseInt(s, 10, 64)
			if e != nil || n <= 0 {
				http.Error(w, `{"mensagem":"revendedora_id inválido"}`, 400)
				return
			}
			id = n
		}
		var inicio, fim *time.Time
		parseData := func(s string) (*time.Time, error) {
			if s == "" {
				return nil, nil
			}
			t, e := time.Parse("2006-01-02", s)
			if e != nil {
				return nil, e
			}
			return &t, nil
		}
		var err error
		inicio, err = parseData(q.Get("inicio"))
		if err != nil {
			http.Error(w, `{"mensagem":"Data inicial inválida (AAAA-MM-DD)"}`, 400)
			return
		}
		fim, err = parseData(q.Get("fim"))
		if err != nil {
			http.Error(w, `{"mensagem":"Data final inválida (AAAA-MM-DD)"}`, 400)
			return
		}
		if inicio != nil && fim != nil && inicio.After(*fim) {
			http.Error(w, `{"mensagem":"Data inicial posterior à final"}`, 400)
			return
		}
		var di, df interface{}
		if inicio != nil {
			di = *inicio
		}
		if fim != nil {
			df = *fim
		}
		leitura, err := db.BeginTx(r.Context(), &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
		if err != nil {
			http.Error(w, "Nao foi possivel iniciar o relatorio.", 500)
			return
		}
		defer leitura.Rollback()
		ctx := r.Context()
		resp := Resposta{Revendedoras: []Revendedora{}, Produtos: []Produto{}, Clientes: []Cliente{}}
		// Contagens de cadastros: estado atual, sem recorte por data.
		err = leitura.QueryRowContext(ctx, `SELECT
   (SELECT COUNT(*) FROM usuarios WHERE perfil='revendedora' AND ($1::bigint=0 OR id=$1)),
   (SELECT COUNT(*) FROM clientes WHERE ($1::bigint=0 OR usuario_id=$1) AND usuario_id IN (SELECT id FROM usuarios WHERE perfil='revendedora')),
   (SELECT COUNT(*) FROM produtos WHERE ($1::bigint=0 OR usuario_id=$1) AND usuario_id IN (SELECT id FROM usuarios WHERE perfil='revendedora'))`, id).Scan(&resp.Resumo.Revendedoras, &resp.Resumo.Clientes, &resp.Resumo.Produtos)
		if err != nil {
			http.Error(w, `{"mensagem":"Erro ao consultar cadastros"}`, 500)
			return
		}
		// Totais de vendas, sem JOIN com itens ou pagamentos (evita multiplicação de valores).
		err = leitura.QueryRowContext(ctx, `SELECT COUNT(*),COALESCE(SUM(v.total),0),COALESCE(SUM(v.saldo),0)
   FROM vendas v JOIN usuarios u ON u.id=v.usuario_id AND u.perfil='revendedora'
   WHERE ($1::bigint=0 OR v.usuario_id=$1) AND ($2::date IS NULL OR v.data_compra >= $2::date) AND ($3::date IS NULL OR v.data_compra <= $3::date)`, id, di, df).Scan(&resp.Resumo.Vendas, &resp.Resumo.TotalVendido, &resp.Resumo.SaldoVendas)
		if err != nil {
			http.Error(w, `{"mensagem":"Erro ao consultar vendas"}`, 500)
			return
		}
		err = leitura.QueryRowContext(ctx, `SELECT COALESCE(SUM(p.valor),0) FROM pagamentos p JOIN vendas v ON v.id=p.venda_id JOIN usuarios u ON u.id=v.usuario_id AND u.perfil='revendedora'
   WHERE ($1::bigint=0 OR v.usuario_id=$1) AND ($2::date IS NULL OR p.data_pagamento >= $2::date) AND ($3::date IS NULL OR p.data_pagamento <= $3::date)`, id, di, df).Scan(&resp.Resumo.TotalRecebido)
		if err != nil {
			http.Error(w, `{"mensagem":"Erro ao consultar pagamentos"}`, 500)
			return
		}
		err = leitura.QueryRowContext(ctx, `SELECT COALESCE(SUM(vi.quantidade),0) FROM venda_itens vi JOIN vendas v ON v.id=vi.venda_id JOIN usuarios u ON u.id=v.usuario_id AND u.perfil='revendedora'
   WHERE ($1::bigint=0 OR v.usuario_id=$1) AND ($2::date IS NULL OR v.data_compra >= $2::date) AND ($3::date IS NULL OR v.data_compra <= $3::date)`, id, di, df).Scan(&resp.Resumo.UnidadesVendidas)
		if err != nil {
			http.Error(w, `{"mensagem":"Erro ao consultar itens vendidos"}`, 500)
			return
		}
		err = leitura.QueryRowContext(ctx, `SELECT COUNT(*) FROM parcelas pa JOIN vendas v ON v.id=pa.venda_id JOIN usuarios u ON u.id=v.usuario_id AND u.perfil='revendedora'
   WHERE ($1::bigint=0 OR v.usuario_id=$1) AND pa.vencimento<CURRENT_DATE AND pa.valor_pago<pa.valor
   AND ($2::date IS NULL OR pa.vencimento >= $2::date) AND ($3::date IS NULL OR pa.vencimento <= $3::date)`, id, di, df).Scan(&resp.Resumo.ParcelasVencidas)
		if err != nil {
			http.Error(w, `{"mensagem":"Erro ao consultar parcelas"}`, 500)
			return
		}
		rows, err := leitura.QueryContext(ctx, `SELECT u.id,u.nome,u.email,u.ativo,
   (SELECT COUNT(*) FROM clientes c WHERE c.usuario_id=u.id),
   (SELECT COUNT(*) FROM produtos p WHERE p.usuario_id=u.id),
   (SELECT COUNT(*) FROM vendas v WHERE v.usuario_id=u.id AND ($2::date IS NULL OR v.data_compra >= $2::date) AND ($3::date IS NULL OR v.data_compra <= $3::date)),
   (SELECT COALESCE(SUM(v.total),0) FROM vendas v WHERE v.usuario_id=u.id AND ($2::date IS NULL OR v.data_compra >= $2::date) AND ($3::date IS NULL OR v.data_compra <= $3::date)),
   (SELECT COALESCE(SUM(p.valor),0) FROM pagamentos p JOIN vendas v ON v.id=p.venda_id WHERE v.usuario_id=u.id AND ($2::date IS NULL OR p.data_pagamento >= $2::date) AND ($3::date IS NULL OR p.data_pagamento <= $3::date))
   FROM usuarios u WHERE u.perfil='revendedora' AND ($1::bigint=0 OR u.id=$1) ORDER BY u.nome,u.id`, id, di, df)
		if err != nil {
			http.Error(w, `{"mensagem":"Erro ao consultar revendedoras"}`, 500)
			return
		}
		for rows.Next() {
			var x Revendedora
			if err = rows.Scan(&x.ID, &x.Nome, &x.Email, &x.Ativo, &x.Clientes, &x.Produtos, &x.Vendas, &x.TotalVendido, &x.TotalRecebido); err != nil {
				break
			}
			resp.Revendedoras = append(resp.Revendedoras, x)
		}
		if err == nil {
			err = rows.Err()
		}
		rows.Close()
		if err != nil {
			http.Error(w, `{"mensagem":"Erro ao ler revendedoras"}`, 500)
			return
		}
		rows, err = leitura.QueryContext(ctx, `SELECT p.id,p.usuario_id,p.nome,p.codigo,p.estoque,
   COALESCE(SUM(vi.quantidade) FILTER (WHERE ($2::date IS NULL OR v.data_compra >= $2::date) AND ($3::date IS NULL OR v.data_compra <= $3::date)),0),
   COALESCE(SUM(vi.subtotal) FILTER (WHERE ($2::date IS NULL OR v.data_compra >= $2::date) AND ($3::date IS NULL OR v.data_compra <= $3::date)),0)
   FROM produtos p JOIN usuarios u ON u.id=p.usuario_id AND u.perfil='revendedora'
   LEFT JOIN venda_itens vi ON vi.produto_id=p.id LEFT JOIN vendas v ON v.id=vi.venda_id AND v.usuario_id=p.usuario_id
   WHERE ($1::bigint=0 OR p.usuario_id=$1)
   GROUP BY p.id,p.usuario_id,p.nome,p.codigo,p.estoque ORDER BY 6 DESC,p.nome,p.id`, id, di, df)
		if err != nil {
			http.Error(w, `{"mensagem":"Erro ao consultar produtos"}`, 500)
			return
		}
		for rows.Next() {
			var x Produto
			if err = rows.Scan(&x.ID, &x.RevendedoraID, &x.Nome, &x.Codigo, &x.Estoque, &x.QuantidadeVendida, &x.Faturamento); err != nil {
				break
			}
			resp.Produtos = append(resp.Produtos, x)
		}
		if err == nil {
			err = rows.Err()
		}
		rows.Close()
		if err != nil {
			http.Error(w, `{"mensagem":"Erro ao ler produtos"}`, 500)
			return
		}
		rows, err = leitura.QueryContext(ctx, `SELECT c.id,c.usuario_id,c.nome,COUNT(v.id),COALESCE(SUM(v.total),0)
   FROM clientes c JOIN usuarios u ON u.id=c.usuario_id AND u.perfil='revendedora'
   LEFT JOIN vendas v ON v.cliente_id=c.id AND v.usuario_id=c.usuario_id
    AND ($2::date IS NULL OR v.data_compra >= $2::date) AND ($3::date IS NULL OR v.data_compra <= $3::date)
   WHERE ($1::bigint=0 OR c.usuario_id=$1)
   GROUP BY c.id,c.usuario_id,c.nome ORDER BY 5 DESC,c.nome,c.id`, id, di, df)
		if err != nil {
			http.Error(w, `{"mensagem":"Erro ao consultar clientes"}`, 500)
			return
		}
		for rows.Next() {
			var x Cliente
			if err = rows.Scan(&x.ID, &x.RevendedoraID, &x.Nome, &x.Compras, &x.TotalCompras); err != nil {
				break
			}
			resp.Clientes = append(resp.Clientes, x)
		}
		if err == nil {
			err = rows.Err()
		}
		rows.Close()
		if err != nil {
			http.Error(w, `{"mensagem":"Erro ao ler clientes"}`, 500)
			return
		}
		if err = leitura.Commit(); err != nil {
			http.Error(w, "Falha ao concluir relatorio.", 500)
			return
		}
		_ = json.NewEncoder(w).Encode(resp)
	}
}
