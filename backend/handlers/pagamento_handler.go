package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/MarcosJose/quitai/auth"
)

type Pagamento struct {
	ID             int     `json:"id"`
	VendaID        int     `json:"venda_id"`
	ParcelaID      int     `json:"parcela_id"`
	Valor          float64 `json:"valor"`
	DataPagamento  string  `json:"data_pagamento"`
	FormaPagamento string  `json:"forma_pagamento"`
}

// arredondarCentavos transforma o valor em centavos.
func arredondarCentavos(valor float64) int64 {
	return int64(valor*100 + 0.5)
}

func RegistrarPagamento(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		usuarioID, ok := auth.UsuarioID(r)
		if !ok {
			http.Error(w, "Usuário não autenticado", http.StatusUnauthorized)
			return
		}

		if r.Method == http.MethodGet {
			listarPagamentos(db, usuarioID)(w, r)
			return
		}

		if r.Method != http.MethodPost {
			http.Error(w, "Método não permitido", http.StatusMethodNotAllowed)
			return
		}

		var pagamento Pagamento
		if err := json.NewDecoder(r.Body).Decode(&pagamento); err != nil {
			http.Error(w, "Dados inválidos", http.StatusBadRequest)
			return
		}

		if pagamento.VendaID <= 0 {
			http.Error(w, "Venda inválida", http.StatusBadRequest)
			return
		}
		if pagamento.ParcelaID <= 0 {
			http.Error(w, "Parcela inválida", http.StatusBadRequest)
			return
		}
		if pagamento.Valor <= 0 {
			http.Error(w, "O valor do pagamento deve ser maior que zero", http.StatusBadRequest)
			return
		}

		pagamento.FormaPagamento = strings.ToUpper(
			strings.TrimSpace(pagamento.FormaPagamento),
		)
		if pagamento.FormaPagamento != "PIX" &&
			pagamento.FormaPagamento != "ESPECIE" {
			http.Error(w, "Forma de pagamento inválida. Use PIX ou ESPECIE", http.StatusBadRequest)
			return
		}

		pagamentoCentavos := arredondarCentavos(pagamento.Valor)
		if pagamentoCentavos <= 0 {
			http.Error(w, "O valor do pagamento deve ser maior que zero", http.StatusBadRequest)
			return
		}

		dataPagamento := time.Now().Format("2006-01-02")
		if strings.TrimSpace(pagamento.DataPagamento) != "" {
			data, err := time.Parse("2006-01-02", pagamento.DataPagamento)
			if err != nil {
				http.Error(w, "Data do pagamento inválida. Use AAAA-MM-DD", http.StatusBadRequest)
				return
			}
			dataPagamento = data.Format("2006-01-02")
		}

		tx, err := db.Begin()
		if err != nil {
			http.Error(w, "Erro ao iniciar pagamento", http.StatusInternalServerError)
			return
		}
		defer tx.Rollback()

		// Confirma a propriedade da venda e bloqueia sua alteração simultânea.
		var vendaID int
		err = tx.QueryRow(`
			SELECT id
			FROM vendas
			WHERE id = $1 AND usuario_id = $2
			FOR UPDATE
		`, pagamento.VendaID, usuarioID).Scan(&vendaID)

		if err == sql.ErrNoRows {
			http.Error(w, "Venda não encontrada", http.StatusNotFound)
			return
		}
		if err != nil {
			http.Error(w, "Erro ao consultar venda", http.StatusInternalServerError)
			return
		}

		// Confirma que a parcela pertence à venda autorizada.
		var parcelaSelecionadaID int
		err = tx.QueryRow(`
			SELECT id
			FROM parcelas
			WHERE id = $1 AND venda_id = $2
		`, pagamento.ParcelaID, pagamento.VendaID).Scan(&parcelaSelecionadaID)

		if err == sql.ErrNoRows {
			http.Error(w, "Parcela não encontrada para esta venda", http.StatusNotFound)
			return
		}
		if err != nil {
			http.Error(w, "Erro ao consultar parcela", http.StatusInternalServerError)
			return
		}

		rows, err := tx.Query(`
			SELECT id, valor, valor_pago, vencimento, numero_parcela
			FROM parcelas
			WHERE venda_id = $1
			  AND valor_pago < valor
			ORDER BY vencimento ASC, numero_parcela ASC
			FOR UPDATE
		`, pagamento.VendaID)
		if err != nil {
			http.Error(w, "Erro ao consultar parcelas abertas", http.StatusInternalServerError)
			return
		}

		type ParcelaAberta struct {
			ID                int
			ValorCentavos     int64
			ValorPagoCentavos int64
			Vencimento        time.Time
			NumeroParcela     int
			SaldoCentavos     int64
		}

		parcelasAbertas := []ParcelaAberta{}
		var saldoTotalVendaCentavos int64

		for rows.Next() {
			var (
				id            int
				valor         float64
				valorPago     float64
				vencimento    time.Time
				numeroParcela int
			)

			if err := rows.Scan(&id, &valor, &valorPago, &vencimento, &numeroParcela); err != nil {
				rows.Close()
				http.Error(w, "Erro ao ler parcelas", http.StatusInternalServerError)
				return
			}

			valorCentavos := arredondarCentavos(valor)
			valorPagoCentavos := arredondarCentavos(valorPago)
			if valorPagoCentavos > valorCentavos {
				valorPagoCentavos = valorCentavos
			}

			saldoCentavos := valorCentavos - valorPagoCentavos
			if saldoCentavos <= 0 {
				continue
			}

			parcelasAbertas = append(parcelasAbertas, ParcelaAberta{
				ID:                id,
				ValorCentavos:     valorCentavos,
				ValorPagoCentavos: valorPagoCentavos,
				Vencimento:        vencimento,
				NumeroParcela:     numeroParcela,
				SaldoCentavos:     saldoCentavos,
			})
			saldoTotalVendaCentavos += saldoCentavos
		}

		if err := rows.Err(); err != nil {
			rows.Close()
			http.Error(w, "Erro ao percorrer parcelas", http.StatusInternalServerError)
			return
		}
		if err := rows.Close(); err != nil {
			http.Error(w, "Erro ao finalizar consulta de parcelas", http.StatusInternalServerError)
			return
		}

		if saldoTotalVendaCentavos <= 0 {
			http.Error(w, "Esta venda já está quitada", http.StatusBadRequest)
			return
		}
		if pagamentoCentavos > saldoTotalVendaCentavos {
			http.Error(w, "O valor do pagamento não pode ser maior que o saldo total da venda", http.StatusBadRequest)
			return
		}

		type DistribuicaoPagamento struct {
			ParcelaID int     `json:"parcela_id"`
			Valor     float64 `json:"valor"`
		}
		distribuicoes := []DistribuicaoPagamento{}
		restantePagamentoCentavos := pagamentoCentavos

		for _, parcela := range parcelasAbertas {
			if restantePagamentoCentavos <= 0 {
				break
			}

			valorDistribuidoCentavos := restantePagamentoCentavos
			if valorDistribuidoCentavos > parcela.SaldoCentavos {
				valorDistribuidoCentavos = parcela.SaldoCentavos
			}
			if valorDistribuidoCentavos <= 0 {
				continue
			}

			novoValorPagoCentavos := parcela.ValorPagoCentavos + valorDistribuidoCentavos
			if novoValorPagoCentavos > parcela.ValorCentavos {
				novoValorPagoCentavos = parcela.ValorCentavos
			}

			novoSaldoCentavos := parcela.ValorCentavos - novoValorPagoCentavos
			novoValorPago := float64(novoValorPagoCentavos) / 100
			novoStatusParcela := "EM_ABERTO"
			if novoSaldoCentavos == 0 {
				novoStatusParcela = "QUITADO"
			}

			_, err = tx.Exec(`
				UPDATE parcelas
				SET valor_pago = $1, status = $2
				WHERE id = $3 AND venda_id = $4
			`, novoValorPago, novoStatusParcela, parcela.ID, pagamento.VendaID)
			if err != nil {
				http.Error(w, "Erro ao atualizar parcela", http.StatusInternalServerError)
				return
			}

			valorDistribuido := float64(valorDistribuidoCentavos) / 100
			var pagamentoID int
			err = tx.QueryRow(`
				INSERT INTO pagamentos (
					venda_id, parcela_id, valor, data_pagamento, forma_pagamento
				)
				VALUES ($1, $2, $3, $4, $5)
				RETURNING id
			`, pagamento.VendaID, parcela.ID, valorDistribuido, dataPagamento,
				pagamento.FormaPagamento).Scan(&pagamentoID)
			if err != nil {
				http.Error(w, "Erro ao registrar pagamento", http.StatusInternalServerError)
				return
			}

			if pagamento.ID == 0 {
				pagamento.ID = pagamentoID
			}

			distribuicoes = append(distribuicoes, DistribuicaoPagamento{
				ParcelaID: parcela.ID,
				Valor:     valorDistribuido,
			})
			restantePagamentoCentavos -= valorDistribuidoCentavos
		}

		if restantePagamentoCentavos > 0 {
			http.Error(w, "Não foi possível distribuir todo o pagamento", http.StatusInternalServerError)
			return
		}

		var totalVenda, valorPagoVenda float64
		err = tx.QueryRow(`
			SELECT COALESCE(SUM(valor), 0), COALESCE(SUM(valor_pago), 0)
			FROM parcelas
			WHERE venda_id = $1
		`, pagamento.VendaID).Scan(&totalVenda, &valorPagoVenda)
		if err != nil {
			http.Error(w, "Não foi possível recalcular os valores da venda", http.StatusInternalServerError)
			return
		}

		totalVendaCentavos := arredondarCentavos(totalVenda)
		valorPagoVendaCentavos := arredondarCentavos(valorPagoVenda)
		if valorPagoVendaCentavos > totalVendaCentavos {
			valorPagoVendaCentavos = totalVendaCentavos
		}

		novoSaldoVendaCentavos := totalVendaCentavos - valorPagoVendaCentavos
		totalVenda = float64(totalVendaCentavos) / 100
		valorPagoVenda = float64(valorPagoVendaCentavos) / 100
		novoSaldoVenda := float64(novoSaldoVendaCentavos) / 100

		var proximoVencimento time.Time
		err = tx.QueryRow(`
			SELECT vencimento
			FROM parcelas
			WHERE venda_id = $1 AND valor_pago < valor
			ORDER BY vencimento ASC, numero_parcela ASC
			LIMIT 1
		`, pagamento.VendaID).Scan(&proximoVencimento)

		encontrouParcela := err == nil
		if err != nil && err != sql.ErrNoRows {
			http.Error(w, "Não foi possível calcular o status da venda", http.StatusInternalServerError)
			return
		}

		statusVenda := "QUITADO"
		if novoSaldoVendaCentavos > 0 && encontrouParcela {
			statusVenda = calcularStatusVenda(
				proximoVencimento.Format("2006-01-02"),
				novoSaldoVenda,
			)
		}

		_, err = tx.Exec(`
			UPDATE vendas
			SET total = $1, valor_pago = $2, saldo = $3, status = $4
			WHERE id = $5 AND usuario_id = $6
		`, totalVenda, valorPagoVenda, novoSaldoVenda, statusVenda,
			pagamento.VendaID, usuarioID)
		if err != nil {
			http.Error(w, "Não foi possível atualizar a venda", http.StatusInternalServerError)
			return
		}

		if err := tx.Commit(); err != nil {
			http.Error(w, "Erro ao confirmar pagamento", http.StatusInternalServerError)
			return
		}

		resposta := map[string]interface{}{
			"mensagem":         "Pagamento registrado com sucesso",
			"pagamento_id":     pagamento.ID,
			"venda_id":         pagamento.VendaID,
			"parcela_id":       pagamento.ParcelaID,
			"valor_pago":       pagamento.Valor,
			"valor_pago_venda": valorPagoVenda,
			"saldo_venda":      novoSaldoVenda,
			"status_venda":     statusVenda,
			"forma_pagamento":  pagamento.FormaPagamento,
			"distribuicoes":    distribuicoes,
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(resposta)
	}
}

func listarPagamentos(db *sql.DB, usuarioID int) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vendaIDTexto := strings.TrimSpace(r.URL.Query().Get("venda_id"))
		if vendaIDTexto == "" {
			http.Error(w, "Informe venda_id", http.StatusBadRequest)
			return
		}

		vendaID, err := strconv.Atoi(vendaIDTexto)
		if err != nil || vendaID <= 0 {
			http.Error(w, "Venda inválida", http.StatusBadRequest)
			return
		}

		rows, err := db.Query(`
			SELECT
				p.id,
				p.venda_id,
				COALESCE(p.parcela_id, 0),
				p.valor,
				p.data_pagamento,
				p.forma_pagamento
			FROM pagamentos p
			INNER JOIN vendas v ON v.id = p.venda_id
			WHERE p.venda_id = $1 AND v.usuario_id = $2
			ORDER BY p.data_pagamento ASC, p.id ASC
		`, vendaID, usuarioID)
		if err != nil {
			http.Error(w, "Erro ao buscar pagamentos", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		pagamentos := []Pagamento{}
		for rows.Next() {
			var pagamento Pagamento
			if err := rows.Scan(
				&pagamento.ID,
				&pagamento.VendaID,
				&pagamento.ParcelaID,
				&pagamento.Valor,
				&pagamento.DataPagamento,
				&pagamento.FormaPagamento,
			); err != nil {
				http.Error(w, "Erro ao ler pagamentos", http.StatusInternalServerError)
				return
			}
			pagamentos = append(pagamentos, pagamento)
		}

		if err := rows.Err(); err != nil {
			http.Error(w, "Erro ao percorrer pagamentos", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(pagamentos)
	}
}
