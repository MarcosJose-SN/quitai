package main

import (
    "net/http/httptest"
    "testing"
)

func TestSSERejeitaSessaoSemToken(t *testing.T) {
    requisicao := httptest.NewRequest("GET", "/suporte/eventos", nil)

    if sessaoSSEAtiva(nil, requisicao, "revendedora", 10) {
        t.Fatal("FALHA DE SEGURANCA: SSE aceitou revendedora sem JWT")
    }
}

func TestSSERejeitaAdminSemToken(t *testing.T) {
    requisicao := httptest.NewRequest("GET", "/admin/suporte/eventos", nil)

    if sessaoSSEAtiva(nil, requisicao, "admin", 1) {
        t.Fatal("FALHA DE SEGURANCA: SSE aceitou administrador sem JWT")
    }
}
