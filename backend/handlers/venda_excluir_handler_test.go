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
	t.Setenv("FINANCIAL_ENVIRONMENT_ID", "fixture-env-A")
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	// Usa uma chave exclusiva para este teste e restaura o ambiente ao terminar.
	secret := "quitai-chave-teste-isolamento-2026-segura"
	secretAnterior, existia := os.LookupEnv("QUITAIA_JWT_SECRET")

	if err := os.Setenv("QUITAIA_JWT_SECRET", secret); err != nil {
		t.Fatal(err)
	}

	t.Cleanup(func() {
		if existia {
			_ = os.Setenv("QUITAIA_JWT_SECRET", secretAnterior)
		} else {
			_ = os.Unsetenv("QUITAIA_JWT_SECRET")
		}
	})

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
	req.Header.Set("X-Financial-Environment", "fixture-env-A")
	req.Header.Set("Authorization", "Bearer "+tokenString)

	rec := httptest.NewRecorder()

	auth.AuthMiddleware(ExcluirVenda(db)).ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf(
			"esperava status %d, recebeu %d: %s",
			http.StatusNotFound,
			rec.Code,
			rec.Body.String(),
		)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestExcluirVendaAmbienteValidoSemIdempotencyKey(t *testing.T) {
	t.Setenv("FINANCIAL_ENVIRONMENT_ID", "fixture-env-A")
	t.Setenv("QUITAIA_JWT_SECRET", chaveTesteFoto)
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	mock.ExpectBegin()
	mock.ExpectQuery("SELECT id FROM vendas").WithArgs(9, 2).WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(9))
	mock.ExpectQuery("SELECT EXISTS").WithArgs(9).WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
	mock.ExpectExec("UPDATE produtos").WithArgs(9, 2).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("DELETE FROM parcelas").WithArgs(9).WillReturnResult(sqlmock.NewResult(0, 2))
	mock.ExpectExec("DELETE FROM venda_itens").WithArgs(9).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("DELETE FROM vendas").WithArgs(9, 2).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()
	r := httptest.NewRequest("DELETE", "/vendas/9", nil)
	r.Header.Set("Authorization", "Bearer "+tokenTesteFoto(t, 2))
	r.Header.Set("X-Financial-Environment", "fixture-env-A")
	w := httptest.NewRecorder()
	auth.AuthMiddleware(ExcluirVenda(db)).ServeHTTP(w, r)
	if w.Code != 204 {
		t.Fatalf("status %d: %s", w.Code, w.Body.String())
	}
	if err = mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
func TestExcluirVendaAmbienteNaoSubstituiAutenticacao(t *testing.T) {
	t.Setenv("FINANCIAL_ENVIRONMENT_ID", "fixture-env-A")
	r := httptest.NewRequest("DELETE", "/vendas/9", nil)
	r.Header.Set("X-Financial-Environment", "fixture-env-A")
	w := httptest.NewRecorder()
	auth.AuthMiddleware(ExcluirVenda(nil)).ServeHTTP(w, r)
	if w.Code != 401 {
		t.Fatalf("status=%d", w.Code)
	}
}
