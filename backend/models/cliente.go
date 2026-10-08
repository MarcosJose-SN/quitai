package models

type Cliente struct {
	ID          int    `json:"id"`
	Nome        string `json:"nome"`
	Telefone    string `json:"telefone"`
	Observacoes string `json:"observacoes"`
}