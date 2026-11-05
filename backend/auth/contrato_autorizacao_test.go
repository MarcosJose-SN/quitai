package auth

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/golang-jwt/jwt/v5"
)

func TestContratoAdminValidaSessaoAntesDeNegarPermissao(t *testing.T) {
	for _, caso := range []struct {
		nome, perfil         string
		ativa, valida, falha bool
		status               int
		codigo               string
	}{
		{"revendedora valida", "revendedora", true, true, false, 403, "permissao_insuficiente"},
		{"revogada e sem permissao", "revendedora", true, false, false, 401, "sessao_invalida"},
		{"admin revogado", "admin", true, false, false, 401, "sessao_invalida"},
		{"bloqueada", "admin", false, false, false, 403, "conta_bloqueada"},
		{"banco indisponivel", "revendedora", true, false, true, 503, ""},
	} {
		t.Run(caso.nome, func(t *testing.T) {
			db, mock, err := sqlmock.New()
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			token, err := gerarToken(UsuarioResponse{ID: 10})
			if err != nil {
				t.Fatal(err)
			}
			mock.ExpectQuery("SELECT perfil, ativo").WithArgs(10).WillReturnRows(sqlmock.NewRows([]string{"perfil", "ativo"}).AddRow(caso.perfil, caso.ativa))
			if caso.ativa {
				q := mock.ExpectQuery("SELECT versao_sessao")
				if caso.falha {
					q.WillReturnError(errors.New("falha sintetica"))
				} else {
					q.WillReturnRows(sqlmock.NewRows([]string{"valida"}).AddRow(caso.valida))
				}
			}
			req := httptest.NewRequest("GET", "/admin/contas", nil)
			req.Header.Set("Authorization", "Bearer "+token)
			rec := httptest.NewRecorder()
			AdminMiddleware(db, http.HandlerFunc(func(http.ResponseWriter, *http.Request) { t.Error("acesso indevido") })).ServeHTTP(rec, req)
			var resposta struct {
				Codigo   string `json:"codigo"`
				Validada bool   `json:"sessao_validada"`
			}
			if err := json.Unmarshal(rec.Body.Bytes(), &resposta); err != nil {
				t.Fatal(err)
			}
			if rec.Code != caso.status || resposta.Codigo != caso.codigo || resposta.Validada != (caso.codigo == "permissao_insuficiente") {
				t.Fatalf("contrato inesperado: %d %+v", rec.Code, resposta)
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestContratoJWTInvalidoAusenteExpirado(t *testing.T) {
	claims := Claims{UsuarioID: 1, RegisteredClaims: jwt.RegisteredClaims{ExpiresAt: jwt.NewNumericDate(time.Now().Add(-time.Hour))}}
	expirado, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(jwtSecret()))
	if err != nil {
		t.Fatal(err)
	}
	for _, token := range []string{"", "invalido", expirado} {
		req := httptest.NewRequest("GET", "/protegido", nil)
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		rec := httptest.NewRecorder()
		AuthMiddleware(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { t.Error("acesso indevido") })).ServeHTTP(rec, req)
		var body map[string]any
		_ = json.Unmarshal(rec.Body.Bytes(), &body)
		if rec.Code != 401 || body["codigo"] != "sessao_invalida" {
			t.Fatalf("contrato inesperado: %d", rec.Code)
		}
	}
}
