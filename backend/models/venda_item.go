package models

type VendaItem struct {
	ID            int     `json:"id"`
	VendaID       int     `json:"venda_id"`
	ProdutoID     int     `json:"produto_id"`
	Quantidade    int     `json:"quantidade"`
	PrecoUnitario float64 `json:"preco_unitario"`
	Subtotal      float64 `json:"subtotal"`
}