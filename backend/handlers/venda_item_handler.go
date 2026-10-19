package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"time"

	"github.com/MarcosJose/quitai/auth"
	"github.com/MarcosJose/quitai/models"
)

func valorEmCentavos(valor float64) int64 {
	return int64(valor*100 + 0.5)
}

func centavosEmValor(centavos int64) float64 {
	return float64(centavos) / 100
}

func adicionarMesMantendoDia(data time.Time, meses int) time.Time {
	ano, mes, dia := data.Date()

	alvo := time.Date(
		ano, mes+time.Month(meses), 1,
		0, 0, 0, 0, data.Location(),
	)

	ultimoDia := alvo.AddDate(0, 1, -1).Day()
	if dia > ultimoDia {
		dia = ultimoDia
	}

	return time.Date(
		alvo.Year(), alvo.Month(), dia,
		0, 0, 0, 0, data.Location(),
	)
}

func AdicionarItemVenda(db *sql.DB) http.HandlerFunc {
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

		var item models.VendaItem
		if err := json.NewDecoder(r.Body).Decode(&item); err != nil {
			http.Error(w, "Dados inválidos", http.StatusBadRequest)
			return
		}

		if item.VendaID <= 0 || item.ProdutoID <= 0 {
			http.Error(w, "Venda ou produto inválido", http.StatusBadRequest)
			return
		}
		if item.Quantidade <= 0 {
			http.Error(w, "A quantidade deve ser maior que zero", http.StatusBadRequest)
			return
		}

		tx, err := db.Begin()
		if err != nil {
			http.Error(w, "Não foi possível iniciar a operação", http.StatusInternalServerError)
			return
		}
		defer tx.Rollback()

		// Bloqueia a venda e confirma que ela pertence ao usuário.
		var valorPago float64
		var totalParcelas int
		var dataCompra time.Time
		var dataVencimento time.Time

		err = tx.QueryRow(`
			SELECT valor_pago, total_parcelas, data_compra, vencimento
			FROM vendas
			WHERE id = $1 AND usuario_id = $2
			FOR UPDATE
		`, item.VendaID, usuarioID).Scan(
			&valorPago,
			&totalParcelas,
			&dataCompra,
			&dataVencimento,
		)

		if err == sql.ErrNoRows {
			http.Error(w, "Venda não encontrada", http.StatusNotFound)
			return
		}
		if err != nil {
			http.Error(w, "Erro ao verificar venda", http.StatusInternalServerError)
			return
		}

		if valorEmCentavos(valorPago) > 0 {
			http.Error(
				w,
				"Não é possível adicionar produtos a uma venda que já possui pagamentos registrados",
				http.StatusBadRequest,
			)
			return
		}

		if totalParcelas <= 0 {
			totalParcelas = 1
		}
		if totalParcelas > 3 {
			http.Error(w, "O número máximo de parcelas é 3", http.StatusBadRequest)
			return
		}

		dataCompra = time.Date(
			dataCompra.Year(), dataCompra.Month(), dataCompra.Day(),
			0, 0, 0, 0, time.Local,
		)
		dataVencimento = time.Date(
			dataVencimento.Year(), dataVencimento.Month(), dataVencimento.Day(),
			0, 0, 0, 0, time.Local,
		)

		if dataVencimento.IsZero() {
			http.Error(w, "A venda não possui uma data de primeiro vencimento", http.StatusBadRequest)
			return
		}
		if dataVencimento.Before(dataCompra) {
			http.Error(w, "A data de vencimento não pode ser anterior à data da compra", http.StatusBadRequest)
			return
		}

		// Bloqueia o produto e confirma a propriedade e o estoque.
		var precoVenda float64
		var estoqueAtual int

		err = tx.QueryRow(`
			SELECT preco_venda, estoque
			FROM produtos
			WHERE id = $1 AND usuario_id = $2
			FOR UPDATE
		`, item.ProdutoID, usuarioID).Scan(&precoVenda, &estoqueAtual)

		if err == sql.ErrNoRows {
			http.Error(w, "Produto não encontrado", http.StatusNotFound)
			return
		}
		if err != nil {
			http.Error(w, "Erro ao buscar produto", http.StatusInternalServerError)
			return
		}
		if estoqueAtual < item.Quantidade {
			http.Error(w, "Estoque insuficiente", http.StatusBadRequest)
			return
		}

		item.PrecoUnitario = precoVenda
		item.Subtotal = precoVenda * float64(item.Quantidade)

		// Insere o item somente depois de validar venda e produto.
		err = tx.QueryRow(`
			INSERT INTO venda_itens (
				venda_id, produto_id, quantidade, preco_unitario, subtotal
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
			http.Error(w, "Erro ao adicionar item à venda", http.StatusInternalServerError)
			return
		}

		result, err := tx.Exec(`
			UPDATE produtos
			SET estoque = estoque - $1,
			    atualizado_em = CURRENT_TIMESTAMP
			WHERE id = $2
			  AND usuario_id = $3
			  AND estoque >= $1
		`, item.Quantidade, item.ProdutoID, usuarioID)
		if err != nil {
			http.Error(w, "Erro ao atualizar estoque", http.StatusInternalServerError)
			return
		}

		linhas, err := result.RowsAffected()
		if err != nil || linhas != 1 {
			http.Error(w, "Não foi possível atualizar o estoque", http.StatusConflict)
			return
		}

		var total float64
		err = tx.QueryRow(`
			SELECT COALESCE(SUM(subtotal), 0)
			FROM venda_itens
			WHERE venda_id = $1
		`, item.VendaID).Scan(&total)
		if err != nil {
			http.Error(w, "Erro ao calcular total da venda", http.StatusInternalServerError)
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

		_, err = tx.Exec(`
			UPDATE vendas
			SET total = $1,
			    valor_pago = $2,
			    saldo = $3,
			    atualizado_em = CURRENT_TIMESTAMP
			WHERE id = $4 AND usuario_id = $5
		`, total, valorPago, saldo, item.VendaID, usuarioID)
		if err != nil {
			http.Error(w, "Erro ao atualizar total da venda", http.StatusInternalServerError)
			return
		}

		// Remove as parcelas anteriores e recria as parcelas atualizadas
		// dentro da mesma transação.
		_, err = tx.Exec(
			"DELETE FROM parcelas WHERE venda_id = $1",
			item.VendaID,
		)
		if err != nil {
			http.Error(w, "Erro ao atualizar parcelas da venda", http.StatusInternalServerError)
			return
		}

		valoresParcelas := make([]int64, totalParcelas)
		valorBase := totalCentavos / int64(totalParcelas)
		resto := totalCentavos % int64(totalParcelas)

		for i := 0; i < totalParcelas; i++ {
			valoresParcelas[i] = valorBase
			if int64(i) < resto {
				valoresParcelas[i]++
			}
		}

		for i := 0; i < totalParcelas; i++ {
			vencimentoParcela := adicionarMesMantendoDia(dataVencimento, i)
			valorParcela := centavosEmValor(valoresParcelas[i])

			_, err = tx.Exec(`
				INSERT INTO parcelas (
					venda_id, numero_parcela, total_parcelas,
					valor, vencimento, valor_pago, status
				)
				VALUES ($1, $2, $3, $4, $5, $6, $7)
			`,
				item.VendaID,
				i+1,
				totalParcelas,
				valorParcela,
				vencimentoParcela.Format("2006-01-02"),
				0,
				"EM_ABERTO",
			)
			if err != nil {
				http.Error(w, "Erro ao criar parcelas da venda", http.StatusInternalServerError)
				return
			}
		}

		if err = tx.Commit(); err != nil {
			http.Error(w, "Não foi possível concluir a inclusão do item", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(item)
	}
}
