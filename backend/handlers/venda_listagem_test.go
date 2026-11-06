package handlers

import (
	"database/sql/driver"
	"encoding/json"
	"math"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/MarcosJose/quitai/auth"
	"github.com/MarcosJose/quitai/models"
)

var colunasListagem601 = []string{"id", "cliente_id", "cliente_nome", "data_compra", "prazo_pagamento", "vencimento", "total", "valor_pago", "saldo", "total_parcelas", "proximo_vencimento", "valor_parcelas_em_aberto_centavos"}

func TestListarVendasContratoAditivoECentavosInteiros(t *testing.T) {
	t.Setenv("QUITAIA_JWT_SECRET", chaveTesteFoto)
	for _, centavos := range []int64{0, 1, 19999999998, 9007199254740991, 9007199254740993, math.MaxInt64} {
		t.Run(jsonNumero601(centavos), func(t *testing.T) {
			db, mock, err := sqlmock.New()
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			mock.ExpectQuery(`(?s)FROM vendas v.*WHERE v.usuario_id = \$1.*ORDER BY v.id DESC`).WithArgs(2).
				WillReturnRows(sqlmock.NewRows(colunasListagem601).AddRow(9, 1, "Cliente fixture", "2026-01-01", 30, "2099-01-01", "100.00", "25.00", "75.00", 3, "2099-02-01", centavos))
			r := httptest.NewRequest("GET", "/vendas/listar", nil)
			r.Header.Set("Authorization", "Bearer "+tokenTesteFoto(t, 2))
			w := httptest.NewRecorder()
			auth.AuthMiddleware(ListarVendas(db)).ServeHTTP(w, r)
			if w.Code != 200 {
				t.Fatalf("status=%d", w.Code)
			}
			var rows []map[string]json.RawMessage
			if err := json.Unmarshal(w.Body.Bytes(), &rows); err != nil || len(rows) != 1 {
				t.Fatal("resposta nao e array de uma venda")
			}
			if string(rows[0]["valor_parcelas_em_aberto_centavos"]) != jsonNumero601(centavos) {
				t.Fatal("centavos perderam precisao na serializacao")
			}
			delete(rows[0], "valor_parcelas_em_aberto_centavos")
			legado := models.Venda{ID: 9, ClienteID: 1, ClienteNome: "Cliente fixture", DataCompra: "2026-01-01", PrazoPagamento: 30, Vencimento: "2099-01-01", DataVencimento: "2099-01-01", Total: 100, ValorPago: 25, Saldo: 75, TotalParcelas: 3, ProximoVencimento: "2099-02-01", Status: calcularStatusVenda("2099-02-01", 75)}
			b, _ := json.Marshal(legado)
			var esperado map[string]json.RawMessage
			_ = json.Unmarshal(b, &esperado)
			if !reflect.DeepEqual(rows[0], esperado) {
				t.Fatal("campos anteriores foram alterados")
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func jsonNumero601(n int64) string { b, _ := json.Marshal(n); return string(b) }

func TestListarVendasArrayVazio(t *testing.T) {
	t.Setenv("QUITAIA_JWT_SECRET", chaveTesteFoto)
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	mock.ExpectQuery("FROM vendas v").WithArgs(1).WillReturnRows(sqlmock.NewRows(colunasListagem601))
	r := httptest.NewRequest("GET", "/vendas/listar", nil)
	r.Header.Set("Authorization", "Bearer "+tokenTesteFoto(t, 1))
	w := httptest.NewRecorder()
	auth.AuthMiddleware(ListarVendas(db)).ServeHTTP(w, r)
	if w.Code != 200 || w.Body.String() != "[]\n" {
		t.Fatal("array vazio mudou")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestListarVendasFallbackAnteriorEAgregadoInvalido(t *testing.T) {
	t.Setenv("QUITAIA_JWT_SECRET", chaveTesteFoto)
	for _, caso := range []struct {
		nome     string
		agregado driver.Value
		status   int
	}{
		{"quitada_sem_parcelas", int64(0), 200}, {"overflow_int64", "9223372036854775808", 500}, {"agregado_null", nil, 500},
	} {
		t.Run(caso.nome, func(t *testing.T) {
			db, mock, err := sqlmock.New()
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			mock.ExpectQuery("FROM vendas v").WithArgs(1).WillReturnRows(sqlmock.NewRows(colunasListagem601).AddRow(1, 1, "Fixture", "2026-01-01", 0, "2099-01-01", "10.00", "10.00", "0.00", 0, nil, caso.agregado))
			r := httptest.NewRequest("GET", "/vendas/listar", nil)
			r.Header.Set("Authorization", "Bearer "+tokenTesteFoto(t, 1))
			w := httptest.NewRecorder()
			auth.AuthMiddleware(ListarVendas(db)).ServeHTTP(w, r)
			if w.Code != caso.status {
				t.Fatalf("status=%d", w.Code)
			}
			if w.Code == 200 {
				var rows []vendaListagem
				_ = json.Unmarshal(w.Body.Bytes(), &rows)
				if len(rows) != 1 || rows[0].Status != "QUITADO" || rows[0].TotalParcelas != 1 || rows[0].ProximoVencimento != "" || rows[0].DataVencimento != "2099-01-01" {
					t.Fatal("fallback anterior alterado")
				}
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestListarVendasSemAutenticacao(t *testing.T) {
	w := httptest.NewRecorder()
	auth.AuthMiddleware(ListarVendas(nil)).ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/vendas/listar", nil))
	if w.Code != 401 {
		t.Fatalf("status=%d", w.Code)
	}
}
