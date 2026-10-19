
package handlers

import (
	"bytes"
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

func TestEditarClienteNaoPermiteEditarClienteDeOutroUsuario(t *testing.T) {
	// Usa uma chave de teste para o JWT.
	os.Setenv("QUITAIA_JWT_SECRET", "chave-teste-isolamento")
	defer os.Unsetenv("QUITAIA_JWT_SECRET")

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("erro ao criar sqlmock: %v", err)
	}
	defer db.Close()

	// O UPDATE não encontra linha porque o cliente 9 pertence a outro usuário.
	mock.ExpectQuery("UPDATE clientes").
		WithArgs("Cliente alterado", "", "", 9, 2).
		WillReturnError(sql.ErrNoRows)

	agora := time.Now()
	claims := auth.Claims{
		UsuarioID: 2,
		Email:     "miquelvicto@gmail.com",
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

	handler := auth.AuthMiddleware(EditarCliente(db))

	req := httptest.NewRequest(
		http.MethodPut,
		"/clientes/9",
		bytes.NewBufferString(`{"nome":"Cliente alterado","telefone":"","observacoes":""}`),
	)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("esperava HTTP 404, recebeu %d (%s)", rec.Code, rec.Body.String())
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("expectativas SQL não atendidas: %v", err)
	}
}
