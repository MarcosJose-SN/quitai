package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"math"
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
		if err := lerPedidoFinanceiro(w, r, &pagamento); err != nil {
			erroFinanceiro(w, 400, "Dados inválidos", "nao_confirmado")
			return
		}

		if pagamento.VendaID <= 0 || int64(pagamento.VendaID) > 2147483647 {
			erroFinanceiro(w, 400, "Venda inválida", "nao_confirmado")
			return
		}
		if pagamento.ParcelaID <= 0 || int64(pagamento.ParcelaID) > 2147483647 {
			erroFinanceiro(w, 400, "Parcela inválida", "nao_confirmado")
			return
		}
		if math.IsNaN(pagamento.Valor) || math.IsInf(pagamento.Valor, 0) || pagamento.Valor <= 0 || pagamento.Valor > 99999999.99 || math.Abs(pagamento.Valor*100-math.Round(pagamento.Valor*100)) > 0.000001 {
			erroFinanceiro(w, 400, "O valor do pagamento deve ser maior que zero", "nao_confirmado")
			return
		}

		pagamento.ID = 0 // IDs de recebimento sao sempre definidos pelo servidor.
		pagamento.FormaPagamento = strings.ToUpper(
			strings.TrimSpace(pagamento.FormaPagamento),
		)
		if pagamento.FormaPagamento != "PIX" &&
			pagamento.FormaPagamento != "ESPECIE" {
			erroFinanceiro(w, 400, "Forma de pagamento inválida. Use PIX ou ESPECIE", "nao_confirmado")
			return
		}

		pagamentoCentavos := arredondarCentavos(pagamento.Valor)
		if pagamentoCentavos <= 0 {
			erroFinanceiro(w, 400, "O valor do pagamento deve ser maior que zero", "nao_confirmado")
			return
		}

		pagamento.Valor = centavosEmValor(pagamentoCentavos)
		dataPagamento := time.Now().Format("2006-01-02")
		if strings.TrimSpace(pagamento.DataPagamento) != "" {
			data, err := time.Parse("2006-01-02", pagamento.DataPagamento)
			if err != nil {
				erroFinanceiro(w, 400, "Data do pagamento inválida. Use AAAA-MM-DD", "nao_confirmado")
				return
			}
			dataPagamento = data.Format("2006-01-02")
		}

		chave, ok := chaveFinanceira(w, r)
		if !ok {
			return
		}
		ctx, cancelar := context.WithTimeout(r.Context(), 20*time.Second)
		defer cancelar()
		r = r.WithContext(ctx)
		tx, err := db.BeginTx(r.Context(), &sql.TxOptions{Isolation: sql.LevelReadCommitted})
		if err != nil {
			falhaFinanceira(w, err)
			return
		}
		defer tx.Rollback()
		pedidoNormalizado := struct {
			VendaID   int
			ParcelaID int
			Centavos  int64
			Data      string
			Forma     string
		}{pagamento.VendaID, pagamento.ParcelaID, pagamentoCentavos, strings.TrimSpace(pagamento.DataPagamento), pagamento.FormaPagamento}
		operacao, replay, err := reservarOperacao(tx, r, usuarioID, "pagamento", chave, hashPedidoFinanceiro(pedidoNormalizado))
		if err != nil {
			tratarReserva(w, err)
			return
		}
		if replay != nil {
			_ = tx.Rollback()
			enviarResultadoFinanceiro(w, replay)
			return
		}

		// Confirma a propriedade da venda e bloqueia sua alteração simultânea.
		var vendaID int
		err = tx.QueryRowContext(r.Context(), `
			SELECT id
			FROM vendas
			WHERE id = $1 AND usuario_id = $2
			FOR UPDATE
		`, pagamento.VendaID, usuarioID).Scan(&vendaID)

		if err == sql.ErrNoRows {
			erroFinanceiro(w, 404, "Venda não encontrada", "nao_confirmado")
			return
		}
		if err != nil {
			falhaFinanceira(w, err)
			return
		}

		// Confirma que a parcela pertence à venda autorizada.
		var parcelaSelecionadaID int
		err = tx.QueryRowContext(r.Context(), `
			SELECT id
			FROM parcelas
			WHERE id = $1 AND venda_id = $2
		`, pagamento.ParcelaID, pagamento.VendaID).Scan(&parcelaSelecionadaID)

		if err == sql.ErrNoRows {
			erroFinanceiro(w, 404, "Parcela não encontrada para esta venda", "nao_confirmado")
			return
		}
		if err != nil {
			falhaFinanceira(w, err)
			return
		}

		rows, err := tx.QueryContext(r.Context(), `
			SELECT id, valor, valor_pago, vencimento, numero_parcela
			FROM parcelas
			WHERE venda_id = $1
			  AND valor_pago < valor
			ORDER BY vencimento ASC, numero_parcela ASC
			FOR UPDATE
		`, pagamento.VendaID)
		if err != nil {
			falhaFinanceira(w, err)
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
				falhaFinanceira(w, err)
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
			falhaFinanceira(w, err)
			return
		}
		if err := rows.Close(); err != nil {
			falhaFinanceira(w, err)
			return
		}

		if saldoTotalVendaCentavos <= 0 {
			erroFinanceiro(w, 400, "Esta venda já está quitada", "nao_confirmado")
			return
		}
		if pagamentoCentavos > saldoTotalVendaCentavos {
			erroFinanceiro(w, 400, "O valor do pagamento não pode ser maior que o saldo total da venda", "nao_confirmado")
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

			_, err = tx.ExecContext(r.Context(), `
				UPDATE parcelas
				SET valor_pago = $1, status = $2
				WHERE id = $3 AND venda_id = $4
			`, novoValorPago, novoStatusParcela, parcela.ID, pagamento.VendaID)
			if err != nil {
				falhaFinanceira(w, err)
				return
			}

			valorDistribuido := float64(valorDistribuidoCentavos) / 100
			var pagamentoID int
			err = tx.QueryRowContext(r.Context(), `
				INSERT INTO pagamentos (
					venda_id, parcela_id, valor, data_pagamento, forma_pagamento
				)
				VALUES ($1, $2, $3, $4, $5)
				RETURNING id
			`, pagamento.VendaID, parcela.ID, valorDistribuido, dataPagamento,
				pagamento.FormaPagamento).Scan(&pagamentoID)
			if err != nil {
				falhaFinanceira(w, err)
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
			falhaFinanceira(w, err)
			return
		}

		var totalVenda, valorPagoVenda float64
		err = tx.QueryRowContext(r.Context(), `
			SELECT COALESCE(SUM(valor), 0), COALESCE(SUM(valor_pago), 0)
			FROM parcelas
			WHERE venda_id = $1
		`, pagamento.VendaID).Scan(&totalVenda, &valorPagoVenda)
		if err != nil {
			falhaFinanceira(w, err)
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
		err = tx.QueryRowContext(r.Context(), `
			SELECT vencimento
			FROM parcelas
			WHERE venda_id = $1 AND valor_pago < valor
			ORDER BY vencimento ASC, numero_parcela ASC
			LIMIT 1
		`, pagamento.VendaID).Scan(&proximoVencimento)

		encontrouParcela := err == nil
		if err != nil && err != sql.ErrNoRows {
			falhaFinanceira(w, err)
			return
		}

		statusVenda := "QUITADO"
		if novoSaldoVendaCentavos > 0 && encontrouParcela {
			statusVenda = calcularStatusVenda(
				proximoVencimento.Format("2006-01-02"),
				novoSaldoVenda,
			)
		}

		_, err = tx.ExecContext(r.Context(), `
			UPDATE vendas
			SET total = $1, valor_pago = $2, saldo = $3, status = $4
			WHERE id = $5 AND usuario_id = $6
		`, totalVenda, valorPagoVenda, novoSaldoVenda, statusVenda,
			pagamento.VendaID, usuarioID)
		if err != nil {
			falhaFinanceira(w, err)
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

		var consistente bool
		err = tx.QueryRowContext(r.Context(), `SELECT
          v.total=COALESCE((SELECT sum(subtotal) FROM venda_itens WHERE venda_id=v.id),0)
          AND v.total=COALESCE((SELECT sum(valor) FROM parcelas WHERE venda_id=v.id),0)
          AND v.valor_pago=COALESCE((SELECT sum(valor_pago) FROM parcelas WHERE venda_id=v.id),0)
          AND v.valor_pago=COALESCE((SELECT sum(valor) FROM pagamentos WHERE venda_id=v.id),0)
          AND v.saldo=v.total-v.valor_pago
          FROM vendas v WHERE v.id=$1 AND v.usuario_id=$2`, pagamento.VendaID, usuarioID).Scan(&consistente)
		if err != nil {
			falhaFinanceira(w, err)
			return
		}
		if !consistente {
			falhaFinanceira(w, fmt.Errorf("somas financeiras divergentes"))
			return
		}
		resultado, err := confirmarOperacao(tx, r, operacao, 201, resposta)
		if err != nil {
			falhaFinanceira(w, err)
			return
		}
		enviarResultadoFinanceiro(w, resultado)
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
