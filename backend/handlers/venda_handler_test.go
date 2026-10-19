package handlers

import (
"database/sql"
"net/http"
"net/http/httptest"
"os"
"testing"
"time"

"github.com/DATA-DOG/go-sqlmock"
"github.com/MarcosJose/quitai/auth"
"github.com/golang-jwt/jwt/v5"
)

func TestDetalharVendaNaoPermiteAcessoDeOutroUsuario(t *testing.T) {
secretAnterior, existia := os.LookupEnv("QUITAIA_JWT_SECRET")
os.Setenv("QUITAIA_JWT_SECRET", "chave-teste-isolamento")
defer func() {
if existia {
os.Setenv("QUITAIA_JWT_SECRET", secretAnterior)
} else {
os.Unsetenv("QUITAIA_JWT_SECRET")
}
}()

db, mock, err := sqlmock.New()
if err != nil {
t.Fatalf("erro ao criar sqlmock: %v", err)
}
defer db.Close()

mock.ExpectQuery("FROM vendas v").
WithArgs(9, 2).
WillReturnError(sql.ErrNoRows)

agora := time.Now()
claims := auth.Claims{
UsuarioID: 2,
Email:     "teste@quitai.com",
RegisteredClaims: jwt.RegisteredClaims{
Subject:   "2",
ExpiresAt: jwt.NewNumericDate(agora.Add(time.Hour)),
IssuedAt:  jwt.NewNumericDate(agora),
NotBefore: jwt.NewNumericDate(agora),
},
}

token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).
SignedString([]byte("chave-teste-isolamento"))
if err != nil {
t.Fatalf("erro ao gerar token: %v", err)
}

handler := auth.AuthMiddleware(DetalharVenda(db))
req := httptest.NewRequest(http.MethodGet, "/vendas/9", nil)
req.Header.Set("Authorization", "Bearer "+token)

rec := httptest.NewRecorder()
handler.ServeHTTP(rec, req)

if rec.Code != http.StatusNotFound {
t.Fatalf("esperava HTTP 404, recebeu %d (%s)", rec.Code, rec.Body.String())
}

if err := mock.ExpectationsWereMet(); err != nil {
t.Fatalf("expectativas SQL nao atendidas: %v", err)
}
}
