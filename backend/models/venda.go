package models

type Venda struct {
	ID             int     `json:"id"`
	ClienteID      int     `json:"cliente_id"`
	ClienteNome    string  `json:"cliente_nome"`
	DataCompra     string  `json:"data_compra"`
	DataVencimento string  `json:"data_vencimento"`
	PrazoPagamento int     `json:"prazo_pagamento"`
	Vencimento     string  `json:"vencimento"`
	Total          float64 `json:"total"`
	ValorPago      float64 `json:"valor_pago"`
	Saldo          float64 `json:"saldo"`
	Status         string  `json:"status"`
	TotalParcelas  int     `json:"total_parcelas"`
}
