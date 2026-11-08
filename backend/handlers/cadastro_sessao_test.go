package handlers

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/MarcosJose/quitai/auth"
)

func TestCadastroRevalidaSessaoNaTransacao(t *testing.T) {
	t.Setenv("QUITAIA_JWT_SECRET", chaveTesteFoto)
	for _, tabela := range []string{"clientes", "produtos"} {
		for _, caso := range []string{"valida", "versao_antiga", "bloqueada", "revogada", "falha_banco", "falha_commit", "outra_conta"} {
			t.Run(tabela+"/"+caso, func(t *testing.T) {
				db, mock, err := sqlmock.New()
				if err != nil {
					t.Fatal(err)
				}
				defer db.Close()
				id := 2
				if caso == "outra_conta" {
					id = 3
				}
				mock.ExpectBegin()
				q := mock.ExpectQuery("SELECT ativo, versao_sessao FROM usuarios WHERE id=\\$1 FOR SHARE").WithArgs(id)
				esperado := 201
				if caso == "falha_banco" {
					q.WillReturnError(errors.New("banco indisponivel"))
					esperado = 503
				} else {
					versao := 0
					if caso == "versao_antiga" {
						versao = 1
						esperado = 401
					}
					if caso == "bloqueada" {
						esperado = 403
					}
					q.WillReturnRows(sqlmock.NewRows([]string{"ativo", "versao"}).AddRow(caso != "bloqueada", versao))
				}
				if esperado == 201 {
					mock.ExpectQuery("SELECT EXISTS").WithArgs(id, sqlmock.AnyArg()).WillReturnRows(sqlmock.NewRows([]string{"revogada"}).AddRow(caso == "revogada"))
					if caso == "revogada" {
						esperado = 401
					}
				}
				if esperado == 201 {
					q := mock.ExpectQuery("INSERT INTO " + tabela)
					if tabela == "clientes" {
						q.WithArgs(id, "Teste", "", "")
					} else {
						q.WithArgs(id, "Teste", "TESTE", "", 0.0, 0.0, 0)
					}
					q.WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(42))
					if caso == "falha_commit" {
						mock.ExpectCommit().WillReturnError(errors.New("commit incerto"))
						esperado = 503
					} else {
						mock.ExpectCommit()
					}
				} else {
					mock.ExpectRollback()
				}
				body := `{"nome":"Teste","codigo":"TESTE","usuario_id":999}`
				r := httptest.NewRequest("POST", "/"+tabela, strings.NewReader(body))
				r.Header.Set("Authorization", "Bearer "+tokenTesteFoto(t, id))
				w := httptest.NewRecorder()
				var h http.Handler = CriarCliente(db)
				if tabela == "produtos" {
					h = CriarProduto(db)
				}
				auth.AuthMiddleware(h).ServeHTTP(w, r)
				if w.Code != esperado {
					t.Fatalf("status=%d esperado=%d", w.Code, esperado)
				}
				if err := mock.ExpectationsWereMet(); err != nil {
					t.Fatal(err)
				}
			})
		}
	}
}

func TestCadastroSemTokenNaoAcessaBanco(t *testing.T) {
	for _, h := range []http.Handler{CriarCliente(nil), CriarProduto(nil)} {
		w := httptest.NewRecorder()
		auth.AuthMiddleware(h).ServeHTTP(w, httptest.NewRequest("POST", "/", strings.NewReader(`{"nome":"Teste"}`)))
		if w.Code != 401 {
			t.Fatal(w.Code)
		}
	}
}
