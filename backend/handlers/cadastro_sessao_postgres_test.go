package handlers

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/MarcosJose/quitai/auth"
	"github.com/golang-jwt/jwt/v5"
)

func TestCadastroPostgresCorteDeSessao(t *testing.T) {
	dsn := os.Getenv("QUITAIA_CADASTRO_TEST_DSN")
	if dsn == "" {
		t.Skip("PostgreSQL descartavel nao configurado")
	}
	u, err := url.Parse(dsn)
	if err != nil || u.Scheme != "postgres" || u.Host != "" || u.Path != "/quitai_financeiro_test" || u.User == nil || u.User.Username() != "quitai_fixture_owner" || u.Query().Get("host") != "/var/run/postgresql" || os.Getenv("QUITAIA_CADASTRO_TEST_SOCKET") != "1" {
		t.Fatal("DSN de teste recusada")
	}
	for k := range u.Query() {
		if k != "host" && k != "sslmode" {
			t.Fatal("Parametro DSN recusado")
		}
	}
	admin, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer admin.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()
	var identity bool
	if err := admin.QueryRowContext(ctx, `SELECT current_database()='quitai_financeiro_test' AND current_user='quitai_fixture_owner' AND current_setting('server_version_num')::int=180006 AND inet_server_addr() IS NULL`).Scan(&identity); err != nil || !identity {
		t.Fatal("Identidade de teste nao confirmada")
	}
	schema := fmt.Sprintf("cadastro_corte_%d", time.Now().UnixNano())
	if _, err := admin.ExecContext(ctx, "CREATE SCHEMA "+schema); err != nil {
		t.Fatal(err)
	}
	defer admin.ExecContext(context.Background(), "DROP SCHEMA "+schema+" CASCADE")
	q := u.Query()
	q.Set("search_path", schema)
	u.RawQuery = q.Encode()
	db, err := sql.Open("postgres", u.String())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	db.SetMaxOpenConns(5)
	_, err = db.ExecContext(ctx, `CREATE TABLE usuarios(id int PRIMARY KEY,ativo boolean NOT NULL,versao_sessao bigint NOT NULL); INSERT INTO usuarios VALUES(2,true,0),(3,true,0); CREATE TABLE sessoes_revogadas(usuario_id int,token_hash text); CREATE TABLE clientes(id serial PRIMARY KEY,usuario_id int REFERENCES usuarios(id),nome text,telefone text,observacoes text); CREATE TABLE produtos(id serial PRIMARY KEY,usuario_id int REFERENCES usuarios(id),nome text,codigo text,categoria text,preco_custo numeric,preco_venda numeric,estoque int)`)
	if err != nil {
		t.Fatal(err)
	}
	const segredo = "teste-local-cadastro-corte-sessao-2026-xxxxxxxx"
	t.Setenv("QUITAIA_JWT_SECRET", segredo)
	token := func(id int, version int64) string {
		b, err := jwt.NewWithClaims(jwt.SigningMethodHS256, auth.Claims{UsuarioID: id, VersaoSessao: version, RegisteredClaims: jwt.RegisteredClaims{ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour))}}).SignedString([]byte(segredo))
		if err != nil {
			t.Fatal(err)
		}
		return b
	}
	// A request validated before the cut holds the same row lock until its INSERT commits.
	var held *sql.Tx
	var finish func()
	r := httptest.NewRequest("POST", "/clientes", nil)
	r.Header.Set("Authorization", "Bearer "+token(2, 0))
	w := httptest.NewRecorder()
	auth.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var ok bool
		held, finish, ok = auth.IniciarCadastroProtegido(db, w, r)
		if !ok {
			t.Fatal("Reserva recusada")
		}
	})).ServeHTTP(w, r)
	if held == nil {
		t.Fatal("Transacao ausente")
	}
	defer finish()
	cut, err := db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer cut.Rollback()
	var pid int
	if err := cut.QueryRowContext(ctx, "SELECT pg_backend_pid()").Scan(&pid); err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() {
		_, err := cut.ExecContext(ctx, `UPDATE usuarios SET versao_sessao=versao_sessao+1 WHERE id=2`)
		done <- err
	}()
	blocked := false
	for deadline := time.Now().Add(3 * time.Second); time.Now().Before(deadline); {
		if err := db.QueryRowContext(ctx, `SELECT cardinality(pg_blocking_pids($1))>0`, pid).Scan(&blocked); err != nil {
			t.Fatal(err)
		}
		if blocked {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if !blocked {
		t.Fatal("O corte nao aguardou o cadastro em voo")
	}
	// Another account is not held by account 2's shared row lock.
	if _, err := db.ExecContext(ctx, `UPDATE usuarios SET versao_sessao=versao_sessao+1 WHERE id=3`); err != nil {
		t.Fatal(err)
	}
	if _, err := held.ExecContext(ctx, `INSERT INTO clientes(usuario_id,nome) VALUES(2,'sintetico')`); err != nil {
		t.Fatal(err)
	}
	if err := held.Commit(); err != nil {
		t.Fatal(err)
	}
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	// A request which reaches the handler while the cut is still uncommitted
	// must wait and read the NEW version, rather than trusting its middleware.
	late := make(chan int, 1)
	go func() {
		req := httptest.NewRequest("POST", "/clientes", strings.NewReader(`{"nome":"atrasado"}`))
		req.Header.Set("Authorization", "Bearer "+token(2, 0))
		out := httptest.NewRecorder()
		auth.AuthMiddleware(CriarCliente(db)).ServeHTTP(out, req)
		late <- out.Code
	}()
	blocked = false
	for deadline := time.Now().Add(3 * time.Second); time.Now().Before(deadline); {
		if err := db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid)))`, pid).Scan(&blocked); err != nil {
			t.Fatal(err)
		}
		if blocked {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if !blocked {
		t.Fatal("Cadastro atrasado nao aguardou o corte")
	}
	// This models the future cleanup's cut, without deleting any rows even locally.
	if err := cut.Commit(); err != nil {
		t.Fatal(err)
	}
	select {
	case status := <-late:
		if status != 401 {
			t.Fatalf("Cadastro atrasado status=%d", status)
		}
	case <-ctx.Done():
		t.Fatal("Cadastro atrasado nao terminou")
	}
	for _, table := range []string{"clientes", "produtos"} {
		for _, c := range []struct {
			id      int
			version int64
			want    int
		}{{2, 0, 401}, {2, 1, 201}, {3, 0, 401}, {3, 1, 201}} {
			var before, after int
			if err := db.QueryRowContext(ctx, "SELECT count(*) FROM "+table).Scan(&before); err != nil {
				t.Fatal(err)
			}
			req := httptest.NewRequest("POST", "/"+table, strings.NewReader(`{"nome":"sintetico","codigo":"TESTE","usuario_id":999}`))
			req.Header.Set("Authorization", "Bearer "+token(c.id, c.version))
			out := httptest.NewRecorder()
			var h http.Handler = CriarCliente(db)
			if table == "produtos" {
				h = CriarProduto(db)
			}
			auth.AuthMiddleware(h).ServeHTTP(out, req)
			if out.Code != c.want {
				t.Fatalf("%s conta=%d versao=%d status=%d", table, c.id, c.version, out.Code)
			}
			if err := db.QueryRowContext(ctx, "SELECT count(*) FROM "+table).Scan(&after); err != nil {
				t.Fatal(err)
			}
			increment := 0
			if c.want == 201 {
				increment = 1
			}
			if after != before+increment {
				t.Fatal("Escrita inesperada")
			}
		}
	}
	var wrong int
	if err := db.QueryRowContext(ctx, `SELECT (SELECT count(*) FROM clientes WHERE usuario_id NOT IN(2,3))+(SELECT count(*) FROM produtos WHERE usuario_id NOT IN(2,3))`).Scan(&wrong); err != nil || wrong != 0 {
		t.Fatal("Isolamento violado")
	}
}
