package handlers

import (
    "net/http"
    "net/http/httptest"
    "strings"
    "testing"

    "github.com/DATA-DOG/go-sqlmock"
    "github.com/MarcosJose/quitai/auth"
    "github.com/golang-jwt/jwt/v5"
    "os"
    "time"
)

func TestRegistrarPagamentoRejeitaValoresInvalidos(t *testing.T) {
    anterior, existia := os.LookupEnv("QUITAIA_JWT_SECRET")
    os.Setenv("QUITAIA_JWT_SECRET", "quitai-chave-teste-financeiro-2026")
    defer func() {
        if existia {
            os.Setenv("QUITAIA_JWT_SECRET", anterior)
        } else {
            os.Unsetenv("QUITAIA_JWT_SECRET")
        }
    }()

    agora := time.Now()
    claims := auth.Claims{
        UsuarioID: 2,
        Email: "teste@quitai.com",
        RegisteredClaims: jwt.RegisteredClaims{
            Subject: "2",
            ExpiresAt: jwt.NewNumericDate(agora.Add(time.Hour)),
            IssuedAt: jwt.NewNumericDate(agora),
        },
    }
    token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).
        SignedString([]byte("quitai-chave-teste-financeiro-2026"))
    if err != nil {
        t.Fatal(err)
    }

    valores := []string{"0", "-1", "10.999", "90000000000001", "1e309"}
    for _, valor := range valores {
        t.Run(valor, func(t *testing.T) {
            db, mock, err := sqlmock.New()
            if err != nil {
                t.Fatal(err)
            }
            defer db.Close()

            corpo := strings.NewReader(`{"venda_id":1,"parcela_id":1,"valor":` +
                valor + `,"forma_pagamento":"PIX"}`)
            req := httptest.NewRequest(http.MethodPost, "/pagamentos", corpo)
            req.Header.Set("Authorization", "Bearer "+token)
            req.Header.Set("Content-Type", "application/json")

            rec := httptest.NewRecorder()
            auth.AuthMiddleware(RegistrarPagamento(db)).ServeHTTP(rec, req)

            if rec.Code != http.StatusBadRequest {
                t.Fatalf("valor %s: esperado 400, recebido %d: %s",
                    valor, rec.Code, rec.Body.String())
            }
            if err := mock.ExpectationsWereMet(); err != nil {
                t.Fatal(err)
            }
        })
    }
}
