package auth

import (
	"os"
	"regexp"
)

var ambienteFinanceiroValido = regexp.MustCompile(`^[A-Za-z0-9_-]{8,128}$`)

// Identificador nao secreto, estavel e exclusivo por banco logico.
func AmbienteFinanceiro() string {
	valor := os.Getenv("FINANCIAL_ENVIRONMENT_ID")
	if !ambienteFinanceiroValido.MatchString(valor) {
		return ""
	}
	return valor
}
