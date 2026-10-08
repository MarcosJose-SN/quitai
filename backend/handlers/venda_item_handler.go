package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"time"

	"github.com/MarcosJose/quitai/models"
)

// valorEmCentavos converte um valor monetário para centavos.
// Exemplo: 14,90 -> 1490
func valorEmCentavos(valor float64) int64 {
	return int64(valor*100 + 0.5)
}

// centavosEmValor converte centavos para valor monetário.
// Exemplo: 1490 -> 14,90
func centavosEmValor(centavos int64) float64 {
	return float64(centavos) / 100
}

// adicionarMesMantendoDia adiciona meses mantendo o dia original.
//
// Exemplo:
// 30/10/2026 + 1 mês = 30/11/2026
// 30/10/2026 + 2 meses = 30/12/2026
//
// Quando o mês não possui o dia escolhido, usa o último dia do mês.
//
// Exemplo:
// 31/01/2026 + 1 mês = 28/02/2026
func adicionarMesMantendoDia(data time.Time, meses int) time.Time {
	ano, mes, dia := data.Date()

	// Vai para o primeiro dia do mês desejado.
	alvo := time.Date(
		ano,
		mes+time.Month(meses),
		1,
		0,
		0,
		0,
		0,
		data.Location(),
	)

	// Descobre o último dia do mês desejado.
	ultimoDia := alvo.AddDate(0, 1, -1).Day()

	// Se o dia original não existir no mês,
	// utiliza o último dia disponível.
	if dia > ultimoDia {
		dia = ultimoDia
	}

	return time.Date(
		alvo.Year(),
		alvo.Month(),
		dia,
		0,
		0,
		0,
		0,
		data.Location(),
	)
}

func AdicionarItemVenda(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {

		if r.Method != http.MethodPost {
			http.Error(
				w,
				"Método não permitido",
				http.StatusMethodNotAllowed,
			)
			return
		}

		var item models.VendaItem

		if err := json.NewDecoder(r.Body).Decode(&item); err != nil {
			http.Error(
				w,
				"Dados inválidos",
				http.StatusBadRequest,
			)
			return
		}

		if item.VendaID <= 0 || item.ProdutoID <= 0 {
			http.Error(
				w,
				"Venda ou produto inválido",
				http.StatusBadRequest,
			)
			return
		}

		if item.Quantidade <= 0 {
			http.Error(
				w,
				"A quantidade deve ser maior que zero",
				http.StatusBadRequest,
			)
			return
		}

		// ============================================================
		// BUSCA PREÇO E ESTOQUE DO PRODUTO
		// ============================================================

		var precoVenda float64
		var estoqueAtual int

		err := db.QueryRow(`
			SELECT preco_venda, estoque
			FROM produtos
			WHERE id = $1
		`, item.ProdutoID).Scan(
			&precoVenda,
			&estoqueAtual,
		)

		if err == sql.ErrNoRows {
			http.Error(
				w,
				"Produto não encontrado",
				http.StatusNotFound,
			)
			return
		}

		if err != nil {
			http.Error(
				w,
				"Erro ao buscar produto",
				http.StatusInternalServerError,
			)
			return
		}

		if estoqueAtual < item.Quantidade {
			http.Error(
				w,
				"Estoque insuficiente",
				http.StatusBadRequest,
			)
			return
		}

		// ============================================================
		// BUSCA OS DADOS DA VENDA
		// ============================================================

		var (
			vendaExiste    bool
			valorPago      float64
			totalParcelas  int
			dataCompra     time.Time
			dataVencimento time.Time
		)

		err = db.QueryRow(`
			SELECT
				EXISTS(
					SELECT 1
					FROM vendas
					WHERE id = $1
				),

				COALESCE(
					(
						SELECT valor_pago
						FROM vendas
						WHERE id = $1
					),
					0
				),

				COALESCE(
					(
						SELECT total_parcelas
						FROM vendas
						WHERE id = $1
					),
					1
				),

				(
					SELECT data_compra
					FROM vendas
					WHERE id = $1
				),

				(
					SELECT vencimento
					FROM vendas
					WHERE id = $1
				)
		`, item.VendaID).Scan(
			&vendaExiste,
			&valorPago,
			&totalParcelas,
			&dataCompra,
			&dataVencimento,
		)

		if err != nil {
			http.Error(
				w,
				"Erro ao verificar venda",
				http.StatusInternalServerError,
			)
			return
		}

		if !vendaExiste {
			http.Error(
				w,
				"Venda não encontrada",
				http.StatusNotFound,
			)
			return
		}

		// ============================================================
		// VALIDA O PRIMEIRO VENCIMENTO
		// ============================================================

		dataCompra = time.Date(
			dataCompra.Year(),
			dataCompra.Month(),
			dataCompra.Day(),
			0,
			0,
			0,
			0,
			time.Local,
		)

		dataVencimento = time.Date(
			dataVencimento.Year(),
			dataVencimento.Month(),
			dataVencimento.Day(),
			0,
			0,
			0,
			0,
			time.Local,
		)

		if dataVencimento.IsZero() {
			http.Error(
				w,
				"A venda não possui uma data de primeiro vencimento",
				http.StatusBadRequest,
			)
			return
		}

		if dataVencimento.Before(dataCompra) {
			http.Error(
				w,
				"A data de vencimento não pode ser anterior à data da compra",
				http.StatusBadRequest,
			)
			return
		}

		// ============================================================
		// NÃO PERMITE ALTERAR ITENS DE UMA VENDA QUE JÁ POSSUI
		// PAGAMENTO REGISTRADO.
		// ============================================================

		if valorEmCentavos(valorPago) > 0 {
			http.Error(
				w,
				"Não é possível adicionar produtos a uma venda que já possui pagamentos registrados",
				http.StatusBadRequest,
			)
			return
		}

		// Garante pelo menos uma parcela.
		if totalParcelas <= 0 {
			totalParcelas = 1
		}

		// O sistema permite no máximo 3 parcelas.
		if totalParcelas > 3 {
			http.Error(
				w,
				"O número máximo de parcelas é 3",
				http.StatusBadRequest,
			)
			return
		}

		// ============================================================
		// CALCULA O ITEM
		// ============================================================

		item.PrecoUnitario = precoVenda

		item.Subtotal = precoVenda * float64(item.Quantidade)

		// ============================================================
		// ADICIONA O ITEM À VENDA
		// ============================================================

		err = db.QueryRow(`
			INSERT INTO venda_itens (
				venda_id,
				produto_id,
				quantidade,
				preco_unitario,
				subtotal
			)
			VALUES ($1, $2, $3, $4, $5)
			RETURNING id
		`,
			item.VendaID,
			item.ProdutoID,
			item.Quantidade,
			item.PrecoUnitario,
			item.Subtotal,
		).Scan(&item.ID)

		if err != nil {
			http.Error(
				w,
				"Erro ao adicionar item à venda",
				http.StatusInternalServerError,
			)
			return
		}

		// ============================================================
		// BAIXA O ESTOQUE
		// ============================================================

		_, err = db.Exec(`
			UPDATE produtos
			SET
				estoque = estoque - $1,
				atualizado_em = CURRENT_TIMESTAMP
			WHERE id = $2
		`,
			item.Quantidade,
			item.ProdutoID,
		)

		if err != nil {
			http.Error(
				w,
				"Erro ao atualizar estoque",
				http.StatusInternalServerError,
			)
			return
		}

		// ============================================================
		// RECALCULA O TOTAL DA VENDA
		// ============================================================

		var total float64

		err = db.QueryRow(`
			SELECT COALESCE(SUM(subtotal), 0)
			FROM venda_itens
			WHERE venda_id = $1
		`, item.VendaID).Scan(&total)

		if err != nil {
			http.Error(
				w,
				"Erro ao calcular total da venda",
				http.StatusInternalServerError,
			)
			return
		}

		totalCentavos := valorEmCentavos(total)

		valorPagoCentavos := valorEmCentavos(valorPago)

		if valorPagoCentavos > totalCentavos {
			valorPagoCentavos = totalCentavos
		}

		saldoCentavos := totalCentavos - valorPagoCentavos

		total = centavosEmValor(totalCentavos)
		valorPago = centavosEmValor(valorPagoCentavos)

		saldo := centavosEmValor(saldoCentavos)

		// ============================================================
		// ATUALIZA TOTAL E SALDO DA VENDA
		// ============================================================

		_, err = db.Exec(`
			UPDATE vendas
			SET
				total = $1,
				valor_pago = $2,
				saldo = $3,
				atualizado_em = CURRENT_TIMESTAMP
			WHERE id = $4
		`,
			total,
			valorPago,
			saldo,
			item.VendaID,
		)

		if err != nil {
			http.Error(
				w,
				"Erro ao atualizar total da venda",
				http.StatusInternalServerError,
			)
			return
		}

		// ============================================================
		// REMOVE PARCELAS ANTIGAS
		// ============================================================

		_, err = db.Exec(`
			DELETE FROM parcelas
			WHERE venda_id = $1
		`, item.VendaID)

		if err != nil {
			http.Error(
				w,
				"Erro ao atualizar parcelas da venda",
				http.StatusInternalServerError,
			)
			return
		}

		// ============================================================
		// CALCULA AS PARCELAS EM CENTAVOS
		// ============================================================

		valoresParcelas := make([]int64, totalParcelas)

		valorBase := totalCentavos / int64(totalParcelas)

		resto := totalCentavos % int64(totalParcelas)

		for i := 0; i < totalParcelas; i++ {
			valoresParcelas[i] = valorBase

			// Distribui os centavos restantes nas primeiras parcelas.
			if int64(i) < resto {
				valoresParcelas[i]++
			}
		}

		// ============================================================
		// CRIA AS PARCELAS
		// ============================================================

		for i := 0; i < totalParcelas; i++ {

			numeroParcela := i + 1

			// A primeira parcela usa exatamente a data escolhida
			// na venda.
			//
			// As próximas parcelas vencem mensalmente,
			// mantendo o mesmo dia sempre que possível.
			vencimentoParcela := adicionarMesMantendoDia(
				dataVencimento,
				i,
			)

			valorParcela := centavosEmValor(
				valoresParcelas[i],
			)

			_, err = db.Exec(`
				INSERT INTO parcelas (
					venda_id,
					numero_parcela,
					total_parcelas,
					valor,
					vencimento,
					valor_pago,
					status
				)
				VALUES ($1, $2, $3, $4, $5, $6, $7)
			`,
				item.VendaID,
				numeroParcela,
				totalParcelas,
				valorParcela,
				vencimentoParcela.Format("2006-01-02"),
				0,
				"EM_ABERTO",
			)

			if err != nil {
				http.Error(
					w,
					"Erro ao criar parcelas da venda",
					http.StatusInternalServerError,
				)
				return
			}
		}

		// ============================================================
		// GARANTE O SALDO FINAL DA VENDA
		// ============================================================

		_, err = db.Exec(`
			UPDATE vendas
			SET
				total = $1,
				valor_pago = $2,
				saldo = $3,
				atualizado_em = CURRENT_TIMESTAMP
			WHERE id = $4
		`,
			total,
			valorPago,
			saldo,
			item.VendaID,
		)

		if err != nil {
			http.Error(
				w,
				"Erro ao atualizar saldo da venda",
				http.StatusInternalServerError,
			)
			return
		}

		// ============================================================
		// RESPOSTA
		// ============================================================

		w.Header().Set(
			"Content-Type",
			"application/json",
		)

		w.WriteHeader(http.StatusCreated)

		json.NewEncoder(w).Encode(item)
	}
}
