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

func TestExcluirVendaNaoPermiteExclusaoDeOutroUsuario(t *testing.T) {
db, mock, err := sqlmock.New()
if err != nil {
t.Fatal(err)
}
defer db.Close()

secret := os.Getenv("QUITAIA_JWT_SECRET")
	if secret == "" {
		secret = "quitai-desenvolvimento-chave-local-2026-trocar-em-producao"
	}
if secret == "" {
t.Fatal("QUITAIA_JWT_SECRET não está definida")
}

now := time.Now()
claims := auth.Claims{
UsuarioID: 2,
Email:     "usuario2@teste.com",
RegisteredClaims: jwt.RegisteredClaims{
Subject:   "2",
ExpiresAt: jwt.NewNumericDate(now.Add(time.Hour)),
IssuedAt:  jwt.NewNumericDate(now),
NotBefore: jwt.NewNumericDate(now),
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
WillReturnError(sql.ErrNoRows)
mock.ExpectRollback()

req := httptest.NewRequest(http.MethodDelete, "/vendas/9", nil)
req.Header.Set("Authorization", "Bearer "+tokenString)
rec := httptest.NewRecorder()

auth.AuthMiddleware(ExcluirVenda(db)).ServeHTTP(rec, req)

if rec.Code != http.StatusNotFound {
t.Fatalf("esperava status %d, recebeu %d: %s",
http.StatusNotFound, rec.Code, rec.Body.String())
}

if err := mock.ExpectationsWereMet(); err != nil {
t.Fatal(err)
}
}

