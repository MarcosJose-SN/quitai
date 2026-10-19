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

func TestEditarProdutoNaoPermiteEditarProdutoDeOutroUsuario(t *testing.T) {
	const chaveTeste = "chave-teste-isolamento"

	// Preserva a variável de ambiente anterior.
	valorAnterior, existia := os.LookupEnv("QUITAIA_JWT_SECRET")
	if err := os.Setenv("QUITAIA_JWT_SECRET", chaveTeste); err != nil {
		t.Fatalf("erro ao configurar chave de teste: %v", err)
	}
	defer func() {
		if existia {
			_ = os.Setenv("QUITAIA_JWT_SECRET", valorAnterior)
		} else {
			_ = os.Unsetenv("QUITAIA_JWT_SECRET")
		}
	}()

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("erro ao criar sqlmock: %v", err)
	}
	defer db.Close()

	// Simula que o produto 5 não pertence ao usuário autenticado (ID 2).
	mock.ExpectQuery("UPDATE produtos").
		WithArgs("Produto alterado", "TESTE-1", "Teste", float64(1), float64(2), 3, 5, 2).
		WillReturnError(sql.ErrNoRows)

	agora := time.Now()
	claims := auth.Claims{
		UsuarioID: 2,
		Email:     "teste@example.com",
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   "2",
			ExpiresAt: jwt.NewNumericDate(agora.Add(time.Hour)),
			IssuedAt:  jwt.NewNumericDate(agora),
			NotBefore: jwt.NewNumericDate(agora),
		},
	}

	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).
		SignedString([]byte(chaveTeste))
	if err != nil {
		t.Fatalf("erro ao gerar token: %v", err)
	}

	handler := auth.AuthMiddleware(EditarProduto(db))

	req := httptest.NewRequest(
		http.MethodPut,
		"/produtos/5",
		bytes.NewBufferString(
			`{"nome":"Produto alterado","codigo":"TESTE-1","categoria":"Teste","preco_custo":1,"preco_venda":2,"estoque":3}`,
		),
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
