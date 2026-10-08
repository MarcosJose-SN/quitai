package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/MarcosJose/quitai/models"
)

func calcularStatusVenda(vencimento string, saldo float64) string {
	if saldo <= 0 {
		return "QUITADO"
	}

	dataVencimento, err := time.Parse("2006-01-02", vencimento)
	if err != nil {
		return "EM_ABERTO"
	}

	hoje := time.Now().Truncate(24 * time.Hour)
	dataVencimento = dataVencimento.Truncate(24 * time.Hour)

	if dataVencimento.Before(hoje) {
		return "VENCIDO"
	}

	diasRestantes := int(dataVencimento.Sub(hoje).Hours() / 24)

	if diasRestantes <= 7 {
		return "VENCE_EM_BREVE"
	}

	return "EM_ABERTO"
}

func CriarVenda(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Método não permitido", http.StatusMethodNotAllowed)
			return
		}

		var venda models.Venda

		if err := json.NewDecoder(r.Body).Decode(&venda); err != nil {
			http.Error(w, "JSON inválido", http.StatusBadRequest)
			return
		}

		// ============================================================
		// VALIDA CLIENTE
		// ============================================================

		if venda.ClienteID <= 0 {
			http.Error(
				w,
				"Informe um cliente válido",
				http.StatusBadRequest,
			)
			return
		}

		// ============================================================
		// VALIDA DATA DA COMPRA
		// ============================================================

		if strings.TrimSpace(venda.DataCompra) == "" {
			http.Error(
				w,
				"Informe a data da compra",
				http.StatusBadRequest,
			)
			return
		}

		dataCompra, err := time.Parse(
			"2006-01-02",
			venda.DataCompra,
		)

		if err != nil {
			http.Error(
				w,
				"Data da compra inválida. Use AAAA-MM-DD",
				http.StatusBadRequest,
			)
			return
		}

		// ============================================================
		// VALIDA PRIMEIRO VENCIMENTO
		// ============================================================

		if strings.TrimSpace(venda.DataVencimento) == "" {
			http.Error(
				w,
				"Informe a data do primeiro vencimento",
				http.StatusBadRequest,
			)
			return
		}

		dataVencimento, err := time.Parse(
			"2006-01-02",
			venda.DataVencimento,
		)

		if err != nil {
			http.Error(
				w,
				"Data do primeiro vencimento inválida. Use AAAA-MM-DD",
				http.StatusBadRequest,
			)
			return
		}

		// O primeiro vencimento não pode ser anterior
		// à data da compra.
		if dataVencimento.Before(dataCompra) {
			http.Error(
				w,
				"A data do primeiro vencimento não pode ser anterior à data da compra",
				http.StatusBadRequest,
			)
			return
		}

		// ============================================================
		// VALIDA NÚMERO DE PARCELAS
		// ============================================================

		if venda.TotalParcelas <= 0 {
			venda.TotalParcelas = 1
		}

		if venda.TotalParcelas > 3 {
			http.Error(
				w,
				"O número máximo de parcelas é 3",
				http.StatusBadRequest,
			)
			return
		}

		// ============================================================
		// COMPATIBILIDADE
		// ============================================================
		//
		// O campo prazo_pagamento continua existindo no banco
		// para manter compatibilidade com registros antigos.
		//
		// A partir de agora ele não determina mais o vencimento.
		// O vencimento é definido diretamente por DataVencimento.
		//
		venda.PrazoPagamento = 0

		vencimento := dataVencimento.Format("2006-01-02")

		status := calcularStatusVenda(
			vencimento,
			0,
		)

		// ============================================================
		// CRIA A VENDA
		// ============================================================
		//
		// A venda começa com:
		// total = 0
		// valor_pago = 0
		// saldo = 0
		//
		// O total será calculado quando os produtos forem adicionados.
		// ============================================================

		err = db.QueryRow(`
			INSERT INTO vendas (
				cliente_id,
				data_compra,
				prazo_pagamento,
				vencimento,
				total,
				valor_pago,
				saldo,
				status,
				total_parcelas
			)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
			RETURNING id
		`,
			venda.ClienteID,
			venda.DataCompra,
			venda.PrazoPagamento,
			vencimento,
			0,
			0,
			0,
			status,
			venda.TotalParcelas,
		).Scan(&venda.ID)

		if err != nil {
			http.Error(
				w,
				"Erro ao criar venda: "+err.Error(),
				http.StatusInternalServerError,
			)
			return
		}

		// ============================================================
		// PREENCHE A RESPOSTA
		// ============================================================

		venda.Total = 0
		venda.ValorPago = 0
		venda.Saldo = 0
		venda.Vencimento = vencimento
		venda.DataVencimento = vencimento
		venda.Status = status

		w.Header().Set(
			"Content-Type",
			"application/json",
		)

		w.WriteHeader(http.StatusCreated)

		json.NewEncoder(w).Encode(venda)
	}
}

func ListarVendas(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(
				w,
				"Método não permitido",
				http.StatusMethodNotAllowed,
			)
			return
		}

		rows, err := db.Query(`
			SELECT
				v.id,
				v.cliente_id,
				COALESCE(c.nome, '') AS cliente_nome,
				v.data_compra,
				v.prazo_pagamento,
				v.vencimento,
				v.total,
				v.valor_pago,
				v.saldo,
				v.total_parcelas
			FROM vendas v
			LEFT JOIN clientes c
				ON c.id = v.cliente_id
			ORDER BY v.id DESC
		`)

		if err != nil {
			http.Error(
				w,
				"Erro ao listar vendas: "+err.Error(),
				http.StatusInternalServerError,
			)
			return
		}

		defer rows.Close()

		vendas := []models.Venda{}

		for rows.Next() {
			var venda models.Venda

			err := rows.Scan(
				&venda.ID,
				&venda.ClienteID,
				&venda.ClienteNome,
				&venda.DataCompra,
				&venda.PrazoPagamento,
				&venda.Vencimento,
				&venda.Total,
				&venda.ValorPago,
				&venda.Saldo,
				&venda.TotalParcelas,
			)

			if err != nil {
				http.Error(
					w,
					"Erro ao ler vendas: "+err.Error(),
					http.StatusInternalServerError,
				)
				return
			}

			// Garante compatibilidade com vendas antigas.
			if venda.TotalParcelas <= 0 {
				venda.TotalParcelas = 1
			}

			// A coluna vencimento representa o primeiro
			// vencimento da venda.
			venda.DataVencimento = venda.Vencimento

			venda.Status = calcularStatusVenda(
				venda.Vencimento,
				venda.Saldo,
			)

			vendas = append(vendas, venda)
		}

		if err := rows.Err(); err != nil {
			http.Error(
				w,
				"Erro ao percorrer vendas: "+err.Error(),
				http.StatusInternalServerError,
			)
			return
		}

		w.Header().Set(
			"Content-Type",
			"application/json",
		)

		json.NewEncoder(w).Encode(vendas)
	}
}

func DetalharVenda(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(
				w,
				"Método não permitido",
				http.StatusMethodNotAllowed,
			)
			return
		}

		// Esperado:
		// GET /vendas/9

		idTexto := strings.TrimPrefix(
			r.URL.Path,
			"/vendas/",
		)

		idTexto = strings.TrimSpace(idTexto)

		if idTexto == "" {
			http.Error(
				w,
				"Informe o ID da venda",
				http.StatusBadRequest,
			)
			return
		}

		vendaID, err := strconv.Atoi(idTexto)

		if err != nil || vendaID <= 0 {
			http.Error(
				w,
				"ID da venda inválido",
				http.StatusBadRequest,
			)
			return
		}

		var venda models.Venda

		err = db.QueryRow(`
			SELECT
				v.id,
				v.cliente_id,
				COALESCE(c.nome, '') AS cliente_nome,
				v.data_compra,
				v.prazo_pagamento,
				v.vencimento,
				v.total,
				v.valor_pago,
				v.saldo,
				v.total_parcelas
			FROM vendas v
			LEFT JOIN clientes c
				ON c.id = v.cliente_id
			WHERE v.id = $1
		`, vendaID).Scan(
			&venda.ID,
			&venda.ClienteID,
			&venda.ClienteNome,
			&venda.DataCompra,
			&venda.PrazoPagamento,
			&venda.Vencimento,
			&venda.Total,
			&venda.ValorPago,
			&venda.Saldo,
			&venda.TotalParcelas,
		)

		if err == sql.ErrNoRows {
			http.Error(
				w,
				"Venda não encontrada",
				http.StatusNotFound,
			)
			return
		}

		if err != nil {
			http.Error(
				w,
				"Erro ao buscar venda: "+err.Error(),
				http.StatusInternalServerError,
			)
			return
		}

		if venda.TotalParcelas <= 0 {
			venda.TotalParcelas = 1
		}

		venda.DataVencimento = venda.Vencimento

		venda.Status = calcularStatusVenda(
			venda.Vencimento,
			venda.Saldo,
		)

		// ============================================================
		// BUSCA OS ITENS DA VENDA
		// ============================================================

		rows, err := db.Query(`
			SELECT
				vi.id,
				vi.venda_id,
				vi.produto_id,
				p.nome,
				vi.quantidade,
				vi.preco_unitario,
				vi.subtotal
			FROM venda_itens vi
			LEFT JOIN produtos p
				ON p.id = vi.produto_id
			WHERE vi.venda_id = $1
			ORDER BY vi.id ASC
		`, vendaID)

		if err != nil {
			http.Error(
				w,
				"Erro ao buscar itens da venda: "+err.Error(),
				http.StatusInternalServerError,
			)
			return
		}

		defer rows.Close()

		type ItemVenda struct {
			ID            int     `json:"id"`
			VendaID       int     `json:"venda_id"`
			ProdutoID     int     `json:"produto_id"`
			ProdutoNome   string  `json:"produto_nome"`
			Quantidade    int     `json:"quantidade"`
			PrecoUnitario float64 `json:"preco_unitario"`
			Subtotal      float64 `json:"subtotal"`
		}

		itens := []ItemVenda{}

		for rows.Next() {
			var item ItemVenda

			err := rows.Scan(
				&item.ID,
				&item.VendaID,
				&item.ProdutoID,
				&item.ProdutoNome,
				&item.Quantidade,
				&item.PrecoUnitario,
				&item.Subtotal,
			)

			if err != nil {
				http.Error(
					w,
					"Erro ao ler itens da venda: "+err.Error(),
					http.StatusInternalServerError,
				)
				return
			}

			itens = append(itens, item)
		}

		if err := rows.Err(); err != nil {
			http.Error(
				w,
				"Erro ao percorrer itens da venda: "+err.Error(),
				http.StatusInternalServerError,
			)
			return
		}

		// ============================================================
		// BUSCA AS PARCELAS DA VENDA
		// ============================================================

		parcelasRows, err := db.Query(`
			SELECT
				id,
				venda_id,
				numero_parcela,
				total_parcelas,
				valor,
				vencimento,
				valor_pago,
				status
			FROM parcelas
			WHERE venda_id = $1
			ORDER BY numero_parcela ASC
		`, vendaID)

		if err != nil {
			http.Error(
				w,
				"Erro ao buscar parcelas da venda: "+err.Error(),
				http.StatusInternalServerError,
			)
			return
		}

		defer parcelasRows.Close()

		type ParcelaVenda struct {
			ID            int     `json:"id"`
			VendaID       int     `json:"venda_id"`
			NumeroParcela int     `json:"numero_parcela"`
			TotalParcelas int     `json:"total_parcelas"`
			Valor         float64 `json:"valor"`
			Vencimento    string  `json:"vencimento"`
			ValorPago     float64 `json:"valor_pago"`
			Status        string  `json:"status"`
		}

		parcelas := []ParcelaVenda{}

		for parcelasRows.Next() {
			var parcela ParcelaVenda

			err := parcelasRows.Scan(
				&parcela.ID,
				&parcela.VendaID,
				&parcela.NumeroParcela,
				&parcela.TotalParcelas,
				&parcela.Valor,
				&parcela.Vencimento,
				&parcela.ValorPago,
				&parcela.Status,
			)

			if err != nil {
				http.Error(
					w,
					"Erro ao ler parcelas da venda: "+err.Error(),
					http.StatusInternalServerError,
				)
				return
			}

			parcelas = append(parcelas, parcela)
		}

		if err := parcelasRows.Err(); err != nil {
			http.Error(
				w,
				"Erro ao percorrer parcelas da venda: "+err.Error(),
				http.StatusInternalServerError,
			)
			return
		}

		// ============================================================
		// RESPOSTA
		// ============================================================

		resposta := map[string]interface{}{
			"venda":    venda,
			"itens":    itens,
			"parcelas": parcelas,
		}

		w.Header().Set(
			"Content-Type",
			"application/json",
		)

		json.NewEncoder(w).Encode(resposta)
	}
}
