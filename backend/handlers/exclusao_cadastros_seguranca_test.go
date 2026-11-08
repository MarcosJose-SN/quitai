package handlers

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/MarcosJose/quitai/auth"
)

// Existing deletion policy is intentionally preserved pending approval of archiving.
func TestExclusaoCadastrosPreservaVinculosEIsolamento(t *testing.T) {
	t.Setenv("QUITAIA_JWT_SECRET", chaveTesteFoto)
	for _, tipo := range []string{"clientes", "produtos"} {
		for _, vinculado := range []bool{false, true} {
			t.Run(tipo+map[bool]string{true: "_vinculado", false: "_outra_conta"}[vinculado], func(t *testing.T) {
				db, mock, err := sqlmock.New()
				if err != nil {
					t.Fatal(err)
				}
				defer db.Close()
				mock.ExpectQuery("SELECT EXISTS").WithArgs(99, 1).WillReturnRows(sqlmock.NewRows([]string{"existe"}).AddRow(vinculado))
				if !vinculado {
					mock.ExpectExec("DELETE FROM "+tipo+"[[:space:]]+WHERE id = \\$1 AND usuario_id = \\$2").WithArgs(99, 1).WillReturnResult(sqlmock.NewResult(0, 0))
				}
				r := httptest.NewRequest("DELETE", "/"+tipo+"/99", nil)
				r.Header.Set("Authorization", "Bearer "+tokenTesteFoto(t, 1))
				w := httptest.NewRecorder()
				var handler http.HandlerFunc = ExcluirCliente(db)
				if tipo == "produtos" {
					handler = ExcluirProduto(db)
				}
				auth.AuthMiddleware(handler).ServeHTTP(w, r)
				esperado := 404
				if vinculado {
					esperado = 409
				}
				if w.Code != esperado {
					t.Fatalf("status=%d", w.Code)
				}
				if err := mock.ExpectationsWereMet(); err != nil {
					t.Fatal(err)
				}
			})
		}
	}
}
