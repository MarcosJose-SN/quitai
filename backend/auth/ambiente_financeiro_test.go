package auth

import "testing"

func TestAmbienteFinanceiroConfiguracaoObrigatoria(t *testing.T) {
	for _, valor := range []string{"", "curto", " production-bank-01", "production bank 01"} {
		t.Setenv("FINANCIAL_ENVIRONMENT_ID", valor)
		if AmbienteFinanceiro() != "" {
			t.Fatal("configuracao invalida aceita")
		}
	}
	t.Setenv("FINANCIAL_ENVIRONMENT_ID", "production-bank-01")
	if AmbienteFinanceiro() != "production-bank-01" {
		t.Fatal("identificador alterado")
	}
}
