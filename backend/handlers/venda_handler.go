package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/MarcosJose/quitai/auth"
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

func ExcluirVenda(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodDelete {
			http.Error(w, "Método não permitido", http.StatusMethodNotAllowed)
			return
		}

		usuarioID, ok := auth.UsuarioID(r)
		if !ok {
			http.Error(w, "Usuário não autenticado", http.StatusUnauthorized)
			return
		}

		idTexto := strings.TrimSpace(strings.TrimPrefix(r.URL.Path, "/vendas/"))
		vendaID, err := strconv.Atoi(idTexto)
		if err != nil || vendaID <= 0 {
			http.Error(w, "ID da venda inválido", http.StatusBadRequest)
			return
		}

		tx, err := db.Begin()
		if err != nil {
			http.Error(w, "Não foi possível iniciar a exclusão da venda.", http.StatusInternalServerError)
			return
		}
		defer tx.Rollback()

		var existente int
		err = tx.QueryRow(
			"SELECT id FROM vendas WHERE id = $1 AND usuario_id = $2 FOR UPDATE",
			vendaID, usuarioID,
		).Scan(&existente)

		if err == sql.ErrNoRows {
			http.Error(w, "Venda não encontrada.", http.StatusNotFound)
			return
		}
		if err != nil {
			http.Error(w, "Não foi possível localizar a venda para exclusão.", http.StatusInternalServerError)
			return
		}

		// Devolve o estoque apenas dos produtos pertencentes ao usuário.
		_, err = tx.Exec(`
			UPDATE produtos p
			SET estoque = p.estoque + itens.quantidade,
			    atualizado_em = CURRENT_TIMESTAMP
			FROM (
				SELECT produto_id, SUM(quantidade)::INTEGER AS quantidade
				FROM venda_itens
				WHERE venda_id = $1
				GROUP BY produto_id
			) AS itens
			WHERE p.id = itens.produto_id
			  AND p.usuario_id = $2
		`, vendaID, usuarioID)
		if err != nil {
			http.Error(w, "Não foi possível devolver os produtos ao estoque. A venda não foi excluída.", http.StatusInternalServerError)
			return
		}

		if _, err = tx.Exec(
			"DELETE FROM pagamentos WHERE venda_id = $1",
			vendaID,
		); err != nil {
			http.Error(w, "Não foi possível remover os pagamentos relacionados. A venda não foi excluída.", http.StatusInternalServerError)
			return
		}

		if _, err = tx.Exec(
			"DELETE FROM parcelas WHERE venda_id = $1",
			vendaID,
		); err != nil {
			http.Error(w, "Não foi possível remover as parcelas relacionadas. A venda não foi excluída.", http.StatusInternalServerError)
			return
		}

		if _, err = tx.Exec(
			"DELETE FROM venda_itens WHERE venda_id = $1",
			vendaID,
		); err != nil {
			http.Error(w, "Não foi possível remover os itens relacionados. A venda não foi excluída.", http.StatusInternalServerError)
			return
		}

		result, err := tx.Exec(
			"DELETE FROM vendas WHERE id = $1 AND usuario_id = $2",
			vendaID, usuarioID,
		)
		if err != nil {
			http.Error(w, "Não foi possível excluir a venda. Nenhuma alteração foi confirmada.", http.StatusInternalServerError)
			return
		}

		linhas, err := result.RowsAffected()
		if err != nil || linhas == 0 {
			http.Error(w, "Não foi possível confirmar a exclusão da venda.", http.StatusInternalServerError)
			return
		}

		if err = tx.Commit(); err != nil {
			http.Error(w, "Não foi possível concluir a exclusão da venda.", http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

func CriarVenda(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Método não permitido", http.StatusMethodNotAllowed)
			return
		}

		usuarioID, ok := auth.UsuarioID(r)
		if !ok {
			http.Error(w, "Usuário não autenticado", http.StatusUnauthorized)
			return
		}

		var venda models.Venda
		if err := json.NewDecoder(r.Body).Decode(&venda); err != nil {
			http.Error(w, "JSON inválido", http.StatusBadRequest)
			return
		}

		if venda.ClienteID <= 0 {
			http.Error(w, "Informe um cliente válido", http.StatusBadRequest)
			return
		}

		// Impede criar uma venda para um cliente de outra conta.
		var clienteExiste bool
		err := db.QueryRow(
			"SELECT EXISTS(SELECT 1 FROM clientes WHERE id = $1 AND usuario_id = $2)",
			venda.ClienteID, usuarioID,
		).Scan(&clienteExiste)
		if err != nil {
			http.Error(w, "Erro ao validar cliente", http.StatusInternalServerError)
			return
		}
		if !clienteExiste {
			http.Error(w, "Cliente não encontrado.", http.StatusNotFound)
			return
		}

		if strings.TrimSpace(venda.DataCompra) == "" {
			http.Error(w, "Informe a data da compra", http.StatusBadRequest)
			return
		}

		dataCompra, err := time.Parse("2006-01-02", venda.DataCompra)
		if err != nil {
			http.Error(w, "Data da compra inválida. Use AAAA-MM-DD", http.StatusBadRequest)
			return
		}

		if strings.TrimSpace(venda.DataVencimento) == "" {
			http.Error(w, "Informe a data do primeiro vencimento", http.StatusBadRequest)
			return
		}

		dataVencimento, err := time.Parse("2006-01-02", venda.DataVencimento)
		if err != nil {
			http.Error(w, "Data do primeiro vencimento inválida. Use AAAA-MM-DD", http.StatusBadRequest)
			return
		}

		if dataVencimento.Before(dataCompra) {
			http.Error(w, "A data do primeiro vencimento não pode ser anterior à data da compra", http.StatusBadRequest)
			return
		}

		if venda.TotalParcelas <= 0 {
			venda.TotalParcelas = 1
		}
		if venda.TotalParcelas > 3 {
			http.Error(w, "O número máximo de parcelas é 3", http.StatusBadRequest)
			return
		}

		// Mantém compatibilidade com registros antigos.
		venda.PrazoPagamento = 0
		vencimento := dataVencimento.Format("2006-01-02")
		status := calcularStatusVenda(vencimento, 0)

		err = db.QueryRow(`
			INSERT INTO vendas (
				usuario_id,
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
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
			RETURNING id
		`,
			usuarioID,
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
			http.Error(w, "Erro ao criar venda: "+err.Error(), http.StatusInternalServerError)
			return
		}

		venda.Total = 0
		venda.ValorPago = 0
		venda.Saldo = 0
		venda.Vencimento = vencimento
		venda.DataVencimento = vencimento
		venda.Status = status

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(venda)
	}
}

func ListarVendas(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Método não permitido", http.StatusMethodNotAllowed)
			return
		}

		usuarioID, ok := auth.UsuarioID(r)
		if !ok {
			http.Error(w, "Usuário não autenticado", http.StatusUnauthorized)
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
				AND c.usuario_id = v.usuario_id
			WHERE v.usuario_id = $1
			ORDER BY v.id DESC
		`, usuarioID)
		if err != nil {
			http.Error(w, "Erro ao listar vendas: "+err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		vendas := []models.Venda{}

		for rows.Next() {
			var venda models.Venda
			if err := rows.Scan(
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
			); err != nil {
				http.Error(w, "Erro ao ler vendas: "+err.Error(), http.StatusInternalServerError)
				return
			}

			if venda.TotalParcelas <= 0 {
				venda.TotalParcelas = 1
			}

			venda.DataVencimento = venda.Vencimento
			venda.Status = calcularStatusVenda(venda.Vencimento, venda.Saldo)
			vendas = append(vendas, venda)
		}

		if err := rows.Err(); err != nil {
			http.Error(w, "Erro ao percorrer vendas: "+err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(vendas)
	}
}

func DetalharVenda(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Método não permitido", http.StatusMethodNotAllowed)
			return
		}

		usuarioID, ok := auth.UsuarioID(r)
		if !ok {
			http.Error(w, "Usuário não autenticado", http.StatusUnauthorized)
			return
		}

		idTexto := strings.TrimSpace(strings.TrimPrefix(r.URL.Path, "/vendas/"))
		if idTexto == "" || strings.Contains(idTexto, "/") {
			http.Error(w, "Informe um ID de venda válido", http.StatusBadRequest)
			return
		}

		vendaID, err := strconv.Atoi(idTexto)
		if err != nil || vendaID <= 0 {
			http.Error(w, "ID da venda inválido", http.StatusBadRequest)
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
				AND c.usuario_id = v.usuario_id
			WHERE v.id = $1
			  AND v.usuario_id = $2
		`, vendaID, usuarioID).Scan(
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
			http.Error(w, "Venda não encontrada", http.StatusNotFound)
			return
		}
		if err != nil {
			http.Error(w, "Erro ao buscar venda: "+err.Error(), http.StatusInternalServerError)
			return
		}

		if venda.TotalParcelas <= 0 {
			venda.TotalParcelas = 1
		}
		venda.DataVencimento = venda.Vencimento
		venda.Status = calcularStatusVenda(venda.Vencimento, venda.Saldo)

		// ITENS: a venda já foi validada como pertencente ao usuário.
		rows, err := db.Query(`
			SELECT
				vi.id,
				vi.venda_id,
				vi.produto_id,
				COALESCE(p.nome, '') AS produto_nome,
				vi.quantidade,
				vi.preco_unitario,
				vi.subtotal
			FROM venda_itens vi
			LEFT JOIN produtos p
				ON p.id = vi.produto_id
				AND p.usuario_id = $2
			WHERE vi.venda_id = $1
			ORDER BY vi.id ASC
		`, vendaID, usuarioID)
		if err != nil {
			http.Error(w, "Erro ao buscar itens da venda: "+err.Error(), http.StatusInternalServerError)
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
			if err := rows.Scan(
				&item.ID,
				&item.VendaID,
				&item.ProdutoID,
				&item.ProdutoNome,
				&item.Quantidade,
				&item.PrecoUnitario,
				&item.Subtotal,
			); err != nil {
				http.Error(w, "Erro ao ler itens da venda: "+err.Error(), http.StatusInternalServerError)
				return
			}
			itens = append(itens, item)
		}
		if err := rows.Err(); err != nil {
			http.Error(w, "Erro ao percorrer itens da venda: "+err.Error(), http.StatusInternalServerError)
			return
		}

		// PARCELAS
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
			http.Error(w, "Erro ao buscar parcelas da venda: "+err.Error(), http.StatusInternalServerError)
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
			if err := parcelasRows.Scan(
				&parcela.ID,
				&parcela.VendaID,
				&parcela.NumeroParcela,
				&parcela.TotalParcelas,
				&parcela.Valor,
				&parcela.Vencimento,
				&parcela.ValorPago,
				&parcela.Status,
			); err != nil {
				http.Error(w, "Erro ao ler parcelas da venda: "+err.Error(), http.StatusInternalServerError)
				return
			}
			parcelas = append(parcelas, parcela)
		}
		if err := parcelasRows.Err(); err != nil {
			http.Error(w, "Erro ao percorrer parcelas da venda: "+err.Error(), http.StatusInternalServerError)
			return
		}

		resposta := map[string]interface{}{
			"venda":    venda,
			"itens":    itens,
			"parcelas": parcelas,
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resposta)
	}
}
