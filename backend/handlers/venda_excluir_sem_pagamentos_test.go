package handlers

import (
    "net/http"
    "net/http/httptest"
    "os"
    "testing"
    "time"

    "github.com/DATA-DOG/go-sqlmock"
    "github.com/MarcosJose/quitai/auth"
    "github.com/golang-jwt/jwt/v5"
)

func TestExcluirVendaSemPagamentosPermiteExclusao(t *testing.T) {
    t.Setenv("FINANCIAL_ENVIRONMENT_ID", "fixture-env-A")
    db, mock, err := sqlmock.New()
    if err != nil {
        t.Fatal(err)
    }
    defer db.Close()

    secret := "quitai-chave-teste-exclusao-sem-pagamentos-2026"
    anterior, existia := os.LookupEnv("QUITAIA_JWT_SECRET")

    if err := os.Setenv("QUITAIA_JWT_SECRET", secret); err != nil {
        t.Fatal(err)
    }
    t.Cleanup(func() {
        if existia {
            _ = os.Setenv("QUITAIA_JWT_SECRET", anterior)
        } else {
            _ = os.Unsetenv("QUITAIA_JWT_SECRET")
        }
    })

    agora := time.Now()
    claims := auth.Claims{
        UsuarioID: 2,
        Email: "usuario2@teste.com",
        RegisteredClaims: jwt.RegisteredClaims{
            Subject: "2",
            ExpiresAt: jwt.NewNumericDate(agora.Add(time.Hour)),
            IssuedAt: jwt.NewNumericDate(agora),
            NotBefore: jwt.NewNumericDate(agora),
        },
    }

    token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
    tokenString, err := token.SignedString([]byte(secret))
    if err != nil {
        t.Fatal(err)
    }

    mock.ExpectBegin()

    mock.ExpectQuery("SELECT id FROM vendas WHERE id = \\$1 AND usuario_id = \\$2 FOR UPDATE").
        WithArgs(9, 2).
        WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(9))

    mock.ExpectQuery("SELECT EXISTS").
        WithArgs(9).
        WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))

    mock.ExpectExec("UPDATE produtos").
        WithArgs(9, 2).
        WillReturnResult(sqlmock.NewResult(0, 1))

    mock.ExpectExec("DELETE FROM parcelas WHERE venda_id = \\$1").
        WithArgs(9).
        WillReturnResult(sqlmock.NewResult(0, 2))

    mock.ExpectExec("DELETE FROM venda_itens WHERE venda_id = \\$1").
        WithArgs(9).
        WillReturnResult(sqlmock.NewResult(0, 1))

    mock.ExpectExec("DELETE FROM vendas WHERE id = \\$1 AND usuario_id = \\$2").
        WithArgs(9, 2).
        WillReturnResult(sqlmock.NewResult(0, 1))

    mock.ExpectCommit()

    req := httptest.NewRequest(http.MethodDelete, "/vendas/9", nil)
    req.Header.Set("X-Financial-Environment", "fixture-env-A")
    req.Header.Set("Authorization", "Bearer "+tokenString)
    rec := httptest.NewRecorder()

    auth.AuthMiddleware(ExcluirVenda(db)).ServeHTTP(rec, req)

    if rec.Code != http.StatusNoContent {
        t.Fatalf("esperava HTTP 204, recebeu %d: %s", rec.Code, rec.Body.String())
    }

    if err := mock.ExpectationsWereMet(); err != nil {
        t.Fatal(err)
    }
}
