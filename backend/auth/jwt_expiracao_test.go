package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/golang-jwt/jwt/v5"
)

func TestAuthMiddlewareRejeitaTokenSemExpiracao(t *testing.T) {
	t.Setenv("QUITAIA_JWT_SECRET", "chave-exclusiva-para-testes-jwt-com-mais-de-32-bytes")

	claims := Claims{UsuarioID: 1}
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(jwtSecret()))
	if err != nil {
		t.Fatalf("erro ao gerar token de teste: %v", err)
	}

	proximo := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("a rota protegida nao deveria ser executada")
	})

	req := httptest.NewRequest(http.MethodGet, "/protegido", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()

	AuthMiddleware(proximo).ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("esperado HTTP 401, recebido %d", rec.Code)
	}
}
