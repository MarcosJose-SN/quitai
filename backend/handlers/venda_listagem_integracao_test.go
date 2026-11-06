package handlers

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"

	"github.com/MarcosJose/quitai/auth"
)

// Opt-in separado: nao chama o helper que aplica migrations. Cria apenas
// tabelas de fixture em schema novo do banco local descartavel identificado.
func bancoListagem601(t *testing.T) *sql.DB {
	t.Helper()
	dsn := os.Getenv("QUITAIA_LISTAGEM_TEST_DSN")
	if dsn == "" {
		t.Skip("PostgreSQL descartavel nao configurado: QUITAIA_LISTAGEM_TEST_DSN")
	}
	u, err := url.Parse(dsn)
	if err != nil || u.Scheme != "postgres" || u.Hostname() != "127.0.0.1" || u.Port() != "5547" || u.Path != "/quitai_financeiro_test" || u.User == nil || u.User.Username() != "quitai_fixture_owner" {
		t.Fatal("DSN recusada: somente o banco descartavel local autorizado")
	}
	q := u.Query()
	q.Set("connect_timeout", "5")
	q.Set("statement_timeout", "10000")
	q.Set("lock_timeout", "5000")
	u.RawQuery = q.Encode()
	root, err := sql.Open("postgres", u.String())
	if err != nil {
		t.Fatal("falha ao preparar conexao de fixture")
	}
	defer root.Close()
	var banco, papel, versao string
	if err = root.QueryRow("SELECT current_database(),current_user,current_setting('server_version')").Scan(&banco, &papel, &versao); err != nil {
		t.Fatal("identidade da fixture nao confirmada")
	}
	if banco != "quitai_financeiro_test" || papel != "quitai_fixture_owner" || !strings.HasPrefix(versao, "18.") {
		t.Fatal("identidade da fixture divergente")
	}
	b := make([]byte, 12)
	if _, err = rand.Read(b); err != nil {
		t.Fatal(err)
	}
	schema := "listagem601_" + hex.EncodeToString(b)
	if _, err = root.Exec("CREATE SCHEMA " + schema); err != nil {
		t.Fatal(err)
	}
	q.Set("search_path", schema)
	u.RawQuery = q.Encode()
	db, err := sql.Open("postgres", u.String())
	if err != nil {
		t.Fatal(err)
	}
	db.SetMaxOpenConns(8)
	t.Cleanup(func() { db.Close() })
	_, err = db.Exec(`
CREATE TABLE usuarios(id integer PRIMARY KEY, ativo boolean NOT NULL, versao_sessao bigint NOT NULL DEFAULT 0);
CREATE TABLE sessoes_revogadas(token_hash char(64),usuario_id integer);
CREATE TABLE clientes(id integer PRIMARY KEY,usuario_id integer,nome text);
CREATE TABLE vendas(id integer PRIMARY KEY,usuario_id integer,cliente_id integer,data_compra date,prazo_pagamento integer,vencimento date,total numeric(10,2),valor_pago numeric(10,2),saldo numeric(10,2),total_parcelas integer);
-- Sem constraint de pagamento maximo apenas nesta fixture nova, para verificar
-- o clamp conservador de registros legados sobrepagos; nao altera tabelas existentes.
CREATE TABLE parcelas(venda_id integer,valor numeric(10,2) NOT NULL,valor_pago numeric(10,2) NOT NULL,vencimento date);
INSERT INTO usuarios(id,ativo) VALUES(1,true),(2,true),(3,true);
INSERT INTO clientes VALUES(1,1,'Fixture A'),(2,2,'Fixture B');
INSERT INTO vendas SELECT n,1,1,DATE '2026-01-01',30,DATE '2099-01-01',100,0,55,3 FROM generate_series(101,108) AS n;
UPDATE vendas SET saldo=0,valor_pago=100 WHERE id=103;
UPDATE vendas SET saldo=99 WHERE id=106;
UPDATE vendas SET total=99999999.99,saldo=99999999.99 WHERE id=108;
INSERT INTO vendas VALUES(201,2,2,'2026-01-01',30,'2099-01-01',777,0,777,1);
INSERT INTO parcelas VALUES
(102,10,0,'2001-01-01'),(102,20,5,'2099-02-01'),(102,30,30,'2099-01-01'),
(103,10,10,'2001-01-01'),(103,20,20,'2099-01-01'),
(104,0.03,0.02,'2099-01-01'),(104,0.10,0,'2099-01-01'),(104,0.20,0,'2099-01-01'),
(105,10,12,'2001-01-01'),(105,5,1,'2099-01-01'),
(106,1,0.25,'2099-01-01'),(107,10,2.34,'2099-01-01'),
(108,99999999.99,0,'2001-01-01'),(108,99999999.99,0,'2099-01-01'),
(201,777,0,'2099-01-01');`)
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("QUITAIA_JWT_SECRET", chaveTesteFoto)
	return db
}

func listarFixture601(t *testing.T, db *sql.DB, usuario int) []vendaListagem {
	t.Helper()
	r := httptest.NewRequest("GET", "/vendas/listar", nil)
	r.Header.Set("Authorization", "Bearer "+tokenTesteFoto(t, usuario))
	w := httptest.NewRecorder()
	auth.AuthMiddlewareComDB(db, ListarVendas(db)).ServeHTTP(w, r)
	if w.Code != 200 {
		t.Fatalf("status listagem=%d", w.Code)
	}
	var rows []vendaListagem
	if err := json.Unmarshal(w.Body.Bytes(), &rows); err != nil {
		t.Fatal(err)
	}
	return rows
}

func TestListarVendasPostgresAgregadoEquivalente(t *testing.T) {
	db := bancoListagem601(t)
	want := map[int]int64{101: 0, 102: 2500, 103: 0, 104: 31, 105: 400, 106: 75, 107: 766, 108: 19999999998}
	rows := listarFixture601(t, db, 1)
	if len(rows) != len(want) {
		t.Fatal("numero de vendas alterado ou linhas duplicadas")
	}
	for i, v := range rows {
		if v.ID != 108-i || v.ValorParcelasEmAbertoCentavos != want[v.ID] {
			t.Fatalf("venda %d: centavos=%d", v.ID, v.ValorParcelasEmAbertoCentavos)
		}
		// Oraculo independente: aplica o clamp parcela a parcela, em centavos
		// exatos, sem usar SUM/GREATEST da consulta de producao.
		parcelas, err := db.Query("SELECT (valor*100)::bigint,(valor_pago*100)::bigint FROM parcelas WHERE venda_id=$1", v.ID)
		if err != nil {
			t.Fatal(err)
		}
		var total int64
		for parcelas.Next() {
			var valor, pago int64
			if err = parcelas.Scan(&valor, &pago); err != nil {
				t.Fatal(err)
			}
			if valor > pago {
				total += valor - pago
			}
		}
		err = parcelas.Err()
		parcelas.Close()
		if err != nil {
			t.Fatal(err)
		}
		if total != v.ValorParcelasEmAbertoCentavos {
			t.Fatal("agregado diferente das parcelas")
		}
		var proximo sql.NullString
		if err = db.QueryRow("SELECT MIN(vencimento)::text FROM parcelas WHERE venda_id=$1 AND valor_pago<valor", v.ID).Scan(&proximo); err != nil {
			t.Fatal(err)
		}
		if v.ProximoVencimento != proximo.String {
			t.Fatal("proximo vencimento alterado")
		}
		if v.ID == 103 && v.Status != "QUITADO" {
			t.Fatal("venda quitada alterada")
		}
		if v.ID == 106 && v.Saldo != 99 {
			t.Fatal("saldo substituido pelo resumo de parcelas")
		}
	}
	other := listarFixture601(t, db, 2)
	if len(other) != 1 || other[0].ID != 201 || other[0].ValorParcelasEmAbertoCentavos != 77700 || other[0].ClienteNome != "Fixture B" {
		t.Fatal("isolamento por revendedora violado")
	}
	if len(listarFixture601(t, db, 3)) != 0 {
		t.Fatal("conta sem vendas deve receber array vazio")
	}
}

func TestListarVendasPostgresSnapshotConcorrente(t *testing.T) {
	db := bancoListagem601(t)
	if _, err := db.Exec("DELETE FROM parcelas; DELETE FROM vendas; INSERT INTO vendas VALUES(301,1,1,'2026-01-01',30,'2099-01-01',10,0,10,1); INSERT INTO parcelas VALUES(301,10,0,'2099-01-01')"); err != nil {
		t.Fatal(err)
	}
	tx, err := db.Begin()
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	if _, err = tx.Exec("UPDATE vendas SET saldo=5,valor_pago=5 WHERE id=301; UPDATE parcelas SET valor_pago=5 WHERE venda_id=301"); err != nil {
		t.Fatal(err)
	}
	antes := listarFixture601(t, db, 1)
	if len(antes) != 1 || antes[0].Saldo != 10 || antes[0].ValorParcelasEmAbertoCentavos != 1000 {
		t.Fatal("leitura suja durante transacao nao confirmada")
	}
	if err = tx.Commit(); err != nil {
		t.Fatal(err)
	}
	depois := listarFixture601(t, db, 1)
	if len(depois) != 1 || depois[0].Saldo != 5 || depois[0].ValorParcelasEmAbertoCentavos != 500 {
		t.Fatal("snapshot apos COMMIT incorreto")
	}
	done := make(chan error, 1)
	go func() {
		for i := 0; i < 30; i++ {
			tx, err := db.Begin()
			if err != nil {
				done <- err
				return
			}
			pago := i % 2 * 5
			if _, err = tx.Exec("UPDATE vendas SET saldo=10-$1,valor_pago=$1 WHERE id=301", pago); err == nil {
				_, err = tx.Exec("UPDATE parcelas SET valor_pago=$1 WHERE venda_id=301", pago)
			}
			if err != nil {
				tx.Rollback()
				done <- err
				return
			}
			if err = tx.Commit(); err != nil {
				done <- err
				return
			}
		}
		done <- nil
	}()
	defer func() {
		if err := <-done; err != nil {
			t.Error(err)
		}
	}()
	for i := 0; i < 30; i++ {
		rows := listarFixture601(t, db, 1)
		if len(rows) != 1 || int64(rows[0].Saldo*100) != rows[0].ValorParcelasEmAbertoCentavos {
			t.Fatal("saldo e parcelas vieram de snapshots diferentes")
		}
	}
}
