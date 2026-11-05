package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestOrigemNegadaPossuiCodigoSemValidarSessao(t *testing.T) {
	req := httptest.NewRequest("OPTIONS", "/auth/me", nil)
	req.Header.Set("Origin", "https://nao-permitida.example.invalid")
	req.Header.Set("Access-Control-Request-Method", "GET")
	rec := httptest.NewRecorder()
	cors(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { t.Error("preflight negado chegou ao handler") })).ServeHTTP(rec, req)
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if rec.Code != 403 || body["codigo"] != "origem_nao_permitida" || body["sessao_validada"] != nil {
		t.Fatal("contrato de origem incorreto")
	}
}
