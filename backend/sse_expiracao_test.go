package main

import (
    "net/http/httptest"
    "testing"
    "time"

    "github.com/golang-jwt/jwt/v5"
)

func TestSSERejeitaTokenExpirado(t *testing.T) {
    t.Setenv("QUITAIA_JWT_SECRET", "chave-exclusiva-para-testes-com-mais-de-32-caracteres")

    claims := jwt.MapClaims{
        "usuario_id": 10,
        "exp": time.Now().Add(-time.Hour).Unix(),
        "iat": time.Now().Add(-2 * time.Hour).Unix(),
    }

    token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
    assinado, err := token.SignedString([]byte("chave-exclusiva-para-testes-com-mais-de-32-caracteres"))
    if err != nil {
        t.Fatal(err)
    }

    requisicao := httptest.NewRequest("GET", "/suporte/eventos", nil)
    requisicao.Header.Set("Authorization", "Bearer "+assinado)

    if sessaoSSEAtiva(nil, requisicao, "revendedora", 10) {
        t.Fatal("FALHA DE SEGURANCA: SSE aceitou JWT expirado")
    }
}
