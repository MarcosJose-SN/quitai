package models

type Produto struct {
	ID          int     `json:"id"`
	Nome        string  `json:"nome"`
	Codigo      string  `json:"codigo"`
	Categoria   string  `json:"categoria"`
	PrecoCusto  float64 `json:"preco_custo"`
	PrecoVenda  float64 `json:"preco_venda"`
	Estoque     int     `json:"estoque"`
}