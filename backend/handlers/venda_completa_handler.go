package handlers

import (
	"context"
	"database/sql"
	"errors"
	"github.com/MarcosJose/quitai/auth"
	"github.com/MarcosJose/quitai/models"
	"net/http"
	"sort"
	"time"
)

type itemVendaCompleta struct {
	ProdutoID  int `json:"produto_id"`
	Quantidade int `json:"quantidade"`
}
type pedidoVendaCompleta struct {
	ClienteID      int                 `json:"cliente_id"`
	DataCompra     string              `json:"data_compra"`
	DataVencimento string              `json:"data_vencimento"`
	TotalParcelas  int                 `json:"total_parcelas"`
	Itens          []itemVendaCompleta `json:"itens"`
}

func CriarVendaCompleta(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			erroFinanceiro(w, 405, "Metodo nao permitido.", "nao_confirmado")
			return
		}
		usuario, ok := auth.UsuarioID(r)
		if !ok {
			erroFinanceiro(w, 401, "Sessao invalida.", "nao_confirmado")
			return
		}
		chave, ok := chaveFinanceira(w, r)
		if !ok {
			return
		}
		var pedido pedidoVendaCompleta
		if lerPedidoFinanceiro(w, r, &pedido) != nil {
			erroFinanceiro(w, 400, "Pedido invalido.", "nao_confirmado")
			return
		}
		compra, err := time.Parse("2006-01-02", pedido.DataCompra)
		if err != nil {
			erroFinanceiro(w, 400, "Data de compra invalida.", "nao_confirmado")
			return
		}
		vencimento, err := time.Parse("2006-01-02", pedido.DataVencimento)
		if err != nil || vencimento.Before(compra) {
			erroFinanceiro(w, 400, "Primeiro vencimento invalido.", "nao_confirmado")
			return
		}
		if pedido.TotalParcelas == 0 {
			pedido.TotalParcelas = 1
		}
		if pedido.ClienteID <= 0 || int64(pedido.ClienteID) > 2147483647 || pedido.TotalParcelas < 1 || pedido.TotalParcelas > 3 || len(pedido.Itens) == 0 {
			erroFinanceiro(w, 400, "Informe cliente, produtos e uma a tres parcelas.", "nao_confirmado")
			return
		}
		sort.Slice(pedido.Itens, func(i, j int) bool { return pedido.Itens[i].ProdutoID < pedido.Itens[j].ProdutoID })
		for i, item := range pedido.Itens {
			if item.ProdutoID <= 0 || int64(item.ProdutoID) > 2147483647 || item.Quantidade <= 0 || int64(item.Quantidade) > 2147483647 || (i > 0 && pedido.Itens[i-1].ProdutoID == item.ProdutoID) {
				erroFinanceiro(w, 400, "Produtos devem ser distintos e quantidades inteiras positivas.", "nao_confirmado")
				return
			}
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
		operacao, replay, err := reservarOperacao(tx, r, usuario, "venda_completa", chave, hashPedidoFinanceiro(pedido))
		if err != nil {
			tratarReserva(w, err)
			return
		}
		if replay != nil {
			_ = tx.Rollback()
			enviarResultadoFinanceiro(w, replay)
			return
		}
		var cliente int
		err = tx.QueryRowContext(r.Context(), `SELECT id FROM clientes WHERE id=$1 AND usuario_id=$2 FOR KEY SHARE`, pedido.ClienteID, usuario).Scan(&cliente)
		if errors.Is(err, sql.ErrNoRows) {
			erroFinanceiro(w, 404, "Cliente nao encontrado.", "nao_confirmado")
			return
		}
		if err != nil {
			falhaFinanceira(w, err)
			return
		}
		type itemCalculado struct {
			pedido          itemVendaCompleta
			preco, subtotal int64
		}
		itens := make([]itemCalculado, 0, len(pedido.Itens))
		var total int64
		// Ordem deterministica em todas as vendas completas, independente da ordem recebida.
		for _, item := range pedido.Itens {
			var precoTexto string
			var estoque int
			err = tx.QueryRowContext(r.Context(), `SELECT preco_venda::text,estoque FROM produtos WHERE id=$1 AND usuario_id=$2 FOR UPDATE`, item.ProdutoID, usuario).Scan(&precoTexto, &estoque)
			if errors.Is(err, sql.ErrNoRows) {
				erroFinanceiro(w, 404, "Produto nao encontrado.", "nao_confirmado")
				return
			}
			if err != nil {
				falhaFinanceira(w, err)
				return
			}
			preco, err := centavosDecimal(precoTexto)
			if err != nil {
				falhaFinanceira(w, err)
				return
			}
			if estoque < item.Quantidade {
				erroFinanceiro(w, 409, "Estoque insuficiente. Atualize os produtos antes de tentar novamente.", "nao_confirmado")
				return
			}
			if preco > maxCentavosFinanceiros/int64(item.Quantidade) {
				erroFinanceiro(w, 400, "Valor do item excede o limite monetario.", "nao_confirmado")
				return
			}
			subtotal := preco * int64(item.Quantidade)
			if total > maxCentavosFinanceiros-subtotal {
				erroFinanceiro(w, 400, "Total excede o limite monetario.", "nao_confirmado")
				return
			}
			total += subtotal
			itens = append(itens, itemCalculado{item, preco, subtotal})
		}
		if total < int64(pedido.TotalParcelas) {
			erroFinanceiro(w, 400, "O total nao permite parcelas positivas. Revise o parcelamento.", "nao_confirmado")
			return
		}
		venda := models.Venda{ClienteID: pedido.ClienteID, DataCompra: pedido.DataCompra, DataVencimento: pedido.DataVencimento, Vencimento: pedido.DataVencimento, TotalParcelas: pedido.TotalParcelas, Total: centavosEmValor(total), Saldo: centavosEmValor(total), Status: calcularStatusVenda(pedido.DataVencimento, centavosEmValor(total))}
		err = tx.QueryRowContext(r.Context(), `INSERT INTO vendas(usuario_id,cliente_id,data_compra,prazo_pagamento,vencimento,total,valor_pago,saldo,status,total_parcelas) VALUES($1,$2,$3,0,$4,$5,0,$5,$6,$7) RETURNING id`, usuario, cliente, pedido.DataCompra, pedido.DataVencimento, decimalCentavos(total), venda.Status, pedido.TotalParcelas).Scan(&venda.ID)
		if err != nil {
			falhaFinanceira(w, err)
			return
		}
		for _, item := range itens {
			_, err = tx.ExecContext(r.Context(), `INSERT INTO venda_itens(venda_id,produto_id,quantidade,preco_unitario,subtotal) VALUES($1,$2,$3,$4,$5)`, venda.ID, item.pedido.ProdutoID, item.pedido.Quantidade, decimalCentavos(item.preco), decimalCentavos(item.subtotal))
			if err != nil {
				falhaFinanceira(w, err)
				return
			}
			result, err := tx.ExecContext(r.Context(), `UPDATE produtos SET estoque=estoque-$1,atualizado_em=CURRENT_TIMESTAMP WHERE id=$2 AND usuario_id=$3 AND estoque>=$1`, item.pedido.Quantidade, item.pedido.ProdutoID, usuario)
			if err != nil {
				falhaFinanceira(w, err)
				return
			}
			n, err := result.RowsAffected()
			if err != nil || n != 1 {
				falhaFinanceira(w, errors.New("estoque nao atualizado"))
				return
			}
		}
		base, resto := total/int64(pedido.TotalParcelas), total%int64(pedido.TotalParcelas)
		for i := 0; i < pedido.TotalParcelas; i++ {
			valor := base
			if int64(i) < resto {
				valor++
			}
			_, err = tx.ExecContext(r.Context(), `INSERT INTO parcelas(venda_id,numero_parcela,total_parcelas,valor,vencimento,valor_pago,status) VALUES($1,$2,$3,$4,$5,0,'EM_ABERTO')`, venda.ID, i+1, pedido.TotalParcelas, decimalCentavos(valor), adicionarMesMantendoDia(vencimento, i).Format("2006-01-02"))
			if err != nil {
				falhaFinanceira(w, err)
				return
			}
		}
		var somaItens, somaParcelas string
		err = tx.QueryRowContext(r.Context(), `SELECT (SELECT SUM(subtotal)::text FROM venda_itens WHERE venda_id=$1),(SELECT SUM(valor)::text FROM parcelas WHERE venda_id=$1)`, venda.ID).Scan(&somaItens, &somaParcelas)
		if err != nil {
			falhaFinanceira(w, err)
			return
		}
		a, errA := centavosDecimal(somaItens)
		b, errB := centavosDecimal(somaParcelas)
		if errA != nil || errB != nil || a != total || b != total {
			falhaFinanceira(w, errors.New("totais financeiros divergentes"))
			return
		}
		resultado, err := confirmarOperacao(tx, r, operacao, 201, venda)
		if err != nil {
			falhaFinanceira(w, err)
			return
		}
		enviarResultadoFinanceiro(w, resultado)
	}
}
