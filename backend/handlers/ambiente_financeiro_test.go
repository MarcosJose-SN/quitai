package handlers

import (
	"github.com/MarcosJose/quitai/auth"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestAmbienteFinanceiroBloqueiaAntesDeQualquerAcessoSQL(t *testing.T) {
	t.Setenv("QUITAIA_JWT_SECRET", chaveTesteFoto)
	for _, path := range []string{"/vendas/completa", "/pagamentos", "/vendas/9"} {
		for _, caso := range []struct {
			nome, config string
			headers      []string
			status       int
		}{
			{"antigo", "production-bank-01", nil, 409},
			{"homologacao", "production-bank-01", []string{"homolog-bank-01"}, 409},
			{"duplicado", "production-bank-01", []string{"production-bank-01", "production-bank-01"}, 409},
			{"malformado", "production-bank-01", []string{"production bank 01"}, 409},
			{"comma", "production-bank-01", []string{"production-bank-01,production-bank-01"}, 409},
			{"sem_config", "", []string{"production-bank-01"}, 503},
			{"config_invalida", "bad value", []string{"bad value"}, 503},
		} {
			t.Run(path+caso.nome, func(t *testing.T) {
				t.Setenv("FINANCIAL_ENVIRONMENT_ID", caso.config)
				method := "POST"
				if path == "/vendas/9" {
					method = "DELETE"
				}
				r := httptest.NewRequest(method, path, strings.NewReader(`{"venda_id":1,"parcela_id":2,"valor":10,"forma_pagamento":"PIX"}`))
				r.Header.Set("Authorization", "Bearer "+tokenTesteFoto(t, 1))
				r.Header.Set("Idempotency-Key", "fixture-financial-key-123")
				for _, h := range caso.headers {
					r.Header.Add("X-Financial-Environment", h)
				}
				w := httptest.NewRecorder()
				// nil DB makes any accidental database access fail the test immediately.
				var handler http.Handler = CriarVendaCompleta(nil)
				if path == "/vendas/9" {
					handler = ExcluirVenda(nil)
					r.Header.Del("Idempotency-Key")
				}
				if path == "/pagamentos" {
					handler = RegistrarPagamento(nil)
				}
				auth.AuthMiddleware(handler).ServeHTTP(w, r)
				if w.Code != caso.status {
					t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
				}
			})
		}
	}
}

func TestAmbienteFinanceiroCorrespondentePreservaChave(t *testing.T) {
	t.Setenv("FINANCIAL_ENVIRONMENT_ID", "production-bank-01")
	r := httptest.NewRequest("POST", "/pagamentos", nil)
	r.Header.Set("X-Financial-Environment", "production-bank-01")
	r.Header.Set("Idempotency-Key", "fixture-financial-key-123")
	chave, ok := chaveFinanceira(httptest.NewRecorder(), r)
	if !ok || chave != "fixture-financial-key-123" {
		t.Fatal("chave alterada")
	}
	// A configuration switch between discovery and submission must reject the old origin.
	t.Setenv("FINANCIAL_ENVIRONMENT_ID", "production-bank-02")
	w := httptest.NewRecorder()
	_, ok = chaveFinanceira(w, r)
	if ok || w.Code != 409 {
		t.Fatal("ambiente antigo aceito")
	}
}
