package handlers

import (
    "database/sql"
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

func TestAdicionarItemVendaNaoPermiteVendaDeOutroUsuario(t *testing.T) {
    segredoAnterior, existia := os.LookupEnv("QUITAIA_JWT_SECRET")
    os.Setenv("QUITAIA_JWT_SECRET", "quitai-chave-teste-isolamento-2026-segura")
    defer func() {
        if existia {
            os.Setenv("QUITAIA_JWT_SECRET", segredoAnterior)
        } else {
            os.Unsetenv("QUITAIA_JWT_SECRET")
        }
    }()

    db, mock, err := sqlmock.New()
    if err != nil {
        t.Fatalf("erro ao criar sqlmock: %v", err)
    }
    defer db.Close()

    mock.ExpectBegin()
    mock.ExpectQuery("FROM vendas").
        WithArgs(9, 2).
        WillReturnError(sql.ErrNoRows)
    mock.ExpectRollback()

    agora := time.Now()
    claims := auth.Claims{
        UsuarioID: 2,
        Email: "teste@quitai.com",
        RegisteredClaims: jwt.RegisteredClaims{
            Subject: "2",
            ExpiresAt: jwt.NewNumericDate(agora.Add(time.Hour)),
            IssuedAt: jwt.NewNumericDate(agora),
            NotBefore: jwt.NewNumericDate(agora),
        },
    }

    token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).
        SignedString([]byte("quitai-chave-teste-isolamento-2026-segura"))
    if err != nil {
        t.Fatalf("erro ao gerar token: %v", err)
    }

    handler := auth.AuthMiddleware(AdicionarItemVenda(db))
    corpo := strings.NewReader(`{"venda_id":9,"produto_id":5,"quantidade":1}`)
    req := httptest.NewRequest(http.MethodPost, "/venda-itens", corpo)
    req.Header.Set("Authorization", "Bearer "+token)
    req.Header.Set("Content-Type", "application/json")

    rec := httptest.NewRecorder()
    handler.ServeHTTP(rec, req)

    if rec.Code != http.StatusNotFound {
        t.Fatalf("esperava HTTP 404, recebeu %d (%s)", rec.Code, rec.Body.String())
    }

    if err := mock.ExpectationsWereMet(); err != nil {
        t.Fatalf("expectativas SQL nao atendidas: %v", err)
    }
}
