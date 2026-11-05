package auth

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"github.com/golang-jwt/jwt/v5"
	_ "github.com/lib/pq"
	"golang.org/x/crypto/bcrypt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

const senhaFixture = "SenhaSintetica123!"

type ambienteAuth struct {
	db    *sql.DB
	t     *testing.T
	email string
}

func novoAuth(t *testing.T) *ambienteAuth {
	t.Helper()
	dsn := os.Getenv("QUITAIA_FINANCEIRO_TEST_DSN")
	if dsn == "" {
		t.Skip("PostgreSQL descartavel nao configurado")
	}
	u, err := url.Parse(dsn)
	if err != nil || u.Hostname() != "127.0.0.1" || u.Port() != "5547" || u.Path != "/quitai_financeiro_test" {
		t.Fatal("Destino de teste recusado")
	}
	root, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer root.Close()
	schema := fmt.Sprintf("auth_%d", time.Now().UnixNano())
	if _, err = root.Exec("CREATE SCHEMA " + schema); err != nil {
		t.Fatal(err)
	}
	q := u.Query()
	q.Set("search_path", schema)
	q.Set("statement_timeout", "10000")
	q.Set("lock_timeout", "5000")
	u.RawQuery = q.Encode()
	db, err := sql.Open("postgres", u.String())
	if err != nil {
		t.Fatal(err)
	}
	db.SetMaxOpenConns(20)
	t.Cleanup(func() { db.Close() })
	_, err = db.Exec(`CREATE TABLE usuarios(id SERIAL PRIMARY KEY,nome text NOT NULL,email text NOT NULL,senha_hash text NOT NULL,perfil text NOT NULL,ativo boolean NOT NULL DEFAULT true,atualizado_em timestamptz DEFAULT CURRENT_TIMESTAMP);CREATE UNIQUE INDEX email_unico ON usuarios(lower(email));`)
	if err != nil {
		t.Fatal(err)
	}
	b, err := os.ReadFile(filepath.Join("..", "database", "migrations", "010_seguranca_autenticacao.sql"))
	if err != nil {
		t.Fatal(err)
	}
	for range 2 {
		if _, err = db.Exec(string(b)); err != nil {
			t.Fatal(err)
		}
	}
	if err = InicializarRecuperacao(db); err != nil {
		t.Fatal(err)
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(senhaFixture), bcrypt.DefaultCost)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`INSERT INTO usuarios(id,nome,email,senha_hash,perfil) VALUES(1,'Fixture A','a@example.invalid',$1,'revendedora'),(2,'Fixture B','b@example.invalid',$1,'revendedora'),(3,'Fixture Admin','admin@example.invalid',$1,'admin')`, string(hash))
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("QUITAIA_JWT_SECRET", "chave-somente-para-testes-autenticacao-mais-de-32-bytes")
	return &ambienteAuth{db, t, "a@example.invalid"}
}
func (a *ambienteAuth) req(h http.Handler, metodo, path, token string, body any) *httptest.ResponseRecorder {
	a.t.Helper()
	b, _ := json.Marshal(body)
	r := httptest.NewRequest(metodo, path, bytes.NewReader(b))
	r.Header.Set("Content-Type", "application/json")
	r.RemoteAddr = "127.0.0.20:54321"
	if token != "" {
		r.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}
func (a *ambienteAuth) login(email, senha string) string {
	a.t.Helper()
	w := a.req(Login(a.db), "POST", "/auth/login", "", map[string]string{"email": email, "senha": senha})
	if w.Code != 200 {
		a.t.Fatalf("Login fixture: %d", w.Code)
	}
	var res authResponse
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		a.t.Fatal(err)
	}
	return res.Token
}
func (a *ambienteAuth) status(token string) int {
	return a.req(AuthMiddlewareComDB(a.db, Me(a.db)), "GET", "/auth/me", token, nil).Code
}
func (a *ambienteAuth) exec(q string, args ...any) {
	a.t.Helper()
	if _, err := a.db.Exec(q, args...); err != nil {
		a.t.Fatal(err)
	}
}
func (a *ambienteAuth) codigo() string {
	a.t.Helper()
	var code string
	w := a.req(solicitarRecuperacao(a.db, func(_, _, c string) bool { code = c; return true }), "POST", "/auth/recuperar-senha", "", map[string]string{"email": a.email})
	if w.Code != 200 || len(code) != 6 {
		a.t.Fatalf("Solicitacao fixture falhou: %d", w.Code)
	}
	return code
}
func TestSegurancaLogoutPersistenteIndividual(t *testing.T) {
	a := novoAuth(t)
	um := a.login(a.email, senhaFixture)
	dois := a.login(a.email, senhaFixture)
	outro := a.login("b@example.invalid", senhaFixture)
	if um == dois {
		t.Fatal("Tokens individuais iguais")
	}
	h := AuthMiddleware(Logout(a.db))
	if w := a.req(h, "POST", "/auth/logout", um, nil); w.Code != 204 {
		t.Fatalf("Logout %d", w.Code)
	}
	if a.status(um) != 401 || a.status(dois) != 200 || a.status(outro) != 200 {
		t.Fatal("Logout violou isolamento")
	}
	// Recreate the middleware/handler, reading the same persistent database, as another instance would.
	if a.req(AuthMiddlewareComDB(a.db, Me(a.db)), "GET", "/auth/me", um, nil).Code != 401 {
		t.Fatal("Revogacao nao persistiu")
	}
	a.exec(`UPDATE usuarios SET ativo=false WHERE id=1`)
	if a.status(dois) != 403 {
		t.Fatal("Bloqueio ignorado")
	}
}
func TestSegurancaSenhaRevogaTodasSessoes(t *testing.T) {
	for _, c := range []struct {
		id            int
		email, perfil string
	}{{1, "a@example.invalid", "revendedora"}, {3, "admin@example.invalid", "admin"}} {
		t.Run(c.perfil, func(t *testing.T) {
			a := novoAuth(t)
			token := a.login(c.email, senhaFixture)
			outro := a.login("b@example.invalid", senhaFixture)
			h := AuthMiddlewareComDB(a.db, AlterarSenha(a.db, c.perfil))
			w := a.req(h, "PUT", "/senha", token, map[string]string{"senha_atual": "errada", "nova_senha": "NovaSenha123!", "confirmar_senha": "NovaSenha123!"})
			if w.Code != 401 || a.status(token) != 200 {
				t.Fatal("Senha incorreta alterou sessao")
			}
			w = a.req(h, "PUT", "/senha", token, map[string]string{"senha_atual": senhaFixture, "nova_senha": "NovaSenha123!", "confirmar_senha": "NovaSenha123!"})
			if w.Code != 200 {
				t.Fatalf("Troca %d", w.Code)
			}
			if a.status(token) != 401 || a.status(outro) != 200 {
				t.Fatal("Revogacao de versao falhou")
			}
			novo := a.login(c.email, "NovaSenha123!")
			if a.status(novo) != 200 {
				t.Fatal("Novo login recusado")
			}
		})
	}
}
func TestSegurancaRecuperacaoUniformeERevogacao(t *testing.T) {
	a := novoAuth(t)
	token := a.login(a.email, senhaFixture)
	h := solicitarRecuperacao(a.db, func(string, string, string) bool { return false })
	um := a.req(h, "POST", "/auth/recuperar-senha", "", map[string]string{"email": a.email})
	dois := a.req(h, "POST", "/auth/recuperar-senha", "", map[string]string{"email": "ausente@example.invalid"})
	if um.Code != 200 || dois.Code != 200 || um.Body.String() != dois.Body.String() {
		t.Fatal("Resposta revela entrega/existencia")
	}
	a.exec(`UPDATE codigos_recuperacao_senha SET criado_em=CURRENT_TIMESTAMP-interval '2 minutes'`)
	codigo := a.codigo()
	w := a.req(RedefinirSenha(a.db), "POST", "/auth/redefinir-senha", "", map[string]string{"email": a.email, "codigo": codigo, "nova_senha": "NovaSenha123!"})
	if w.Code != 200 || a.status(token) != 401 {
		t.Fatal("Recuperacao nao revogou")
	}
	a.login(a.email, "NovaSenha123!")
	if w = a.req(RedefinirSenha(a.db), "POST", "/auth/redefinir-senha", "", map[string]string{"email": a.email, "codigo": codigo, "nova_senha": "OutraSenha123!"}); w.Code != 400 {
		t.Fatal("Codigo reutilizado")
	}
}
func TestSegurancaConcorrenciaRecuperacao(t *testing.T) {
	a := novoAuth(t)
	var mu sync.Mutex
	codigos := []string{}
	h := solicitarRecuperacao(a.db, func(_, _, c string) bool { mu.Lock(); defer mu.Unlock(); codigos = append(codigos, c); return true })
	var wg sync.WaitGroup
	for range 3 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if a.req(h, "POST", "/recuperar", "", map[string]string{"email": a.email}).Code != 200 {
				t.Error("Solicitacao concorrente falhou")
			}
		}()
	}
	wg.Wait()
	var n int
	if err := a.db.QueryRow(`SELECT count(*) FROM codigos_recuperacao_senha WHERE usado_em IS NULL`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 1 || len(codigos) != 1 {
		t.Fatal("Mais de um codigo simultaneo")
	}
	// A code can be consumed only once, even by simultaneous requests.
	statuses := make(chan int, 2)
	for range 2 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			statuses <- a.req(RedefinirSenha(a.db), "POST", "/redefinir", "", map[string]string{"email": a.email, "codigo": codigos[0], "nova_senha": "NovaSenha123!"}).Code
		}()
	}
	wg.Wait()
	close(statuses)
	ok := 0
	for s := range statuses {
		if s == 200 {
			ok++
		} else if s != 400 {
			t.Fatalf("Status %d", s)
		}
	}
	if ok != 1 {
		t.Fatal("Recuperacao executada mais de uma vez")
	}
}
func TestSegurancaLimitesPersistentesEOrcamento(t *testing.T) {
	a := novoAuth(t)
	codigo := a.codigo()
	errado := "000000"
	if codigo == errado {
		errado = "111111"
	}
	for range 5 {
		if a.req(RedefinirSenha(a.db), "POST", "/redefinir", "", map[string]string{"email": a.email, "codigo": errado, "nova_senha": "NovaSenha123!"}).Code != 400 {
			t.Fatal("Tentativa inesperada")
		}
	}
	a.exec(`UPDATE codigos_recuperacao_senha SET criado_em=CURRENT_TIMESTAMP-interval '2 minutes'`)
	a.codigo()
	for range 5 {
		a.req(RedefinirSenha(a.db), "POST", "/redefinir", "", map[string]string{"email": a.email, "codigo": errado, "nova_senha": "NovaSenha123!"})
	}
	if a.req(RedefinirSenha(a.db), "POST", "/redefinir", "", map[string]string{"email": a.email, "codigo": errado, "nova_senha": "NovaSenha123!"}).Code != 429 {
		t.Fatal("Reenvio reiniciou orcamento")
	}
	for range 10 {
		a.req(Login(a.db), "POST", "/login", "", map[string]string{"email": a.email, "senha": "errada"})
	}
	if a.req(Login(a.db), "POST", "/login", "", map[string]string{"email": a.email, "senha": senhaFixture}).Code != 429 {
		t.Fatal("Limite de login nao compartilhado")
	}
	// Fixed windows expire; no permanent account lock.
	a.exec(`UPDATE limites_autenticacao SET janela=janela-2`)
	if a.login(a.email, senhaFixture) == "" {
		t.Fatal("Bloqueio permanente")
	}
}
func TestSegurancaFalhaContabilizacaoCodigo(t *testing.T) {
	a := novoAuth(t)
	codigo := a.codigo()
	errado := "000000"
	if codigo == errado {
		errado = "111111"
	}
	a.exec(`CREATE FUNCTION falhar_tentativa() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture'; END $$; CREATE TRIGGER falha BEFORE UPDATE ON codigos_recuperacao_senha FOR EACH ROW EXECUTE FUNCTION falhar_tentativa()`)
	w := a.req(RedefinirSenha(a.db), "POST", "/redefinir", "", map[string]string{"email": a.email, "codigo": errado, "nova_senha": "NovaSenha123!"})
	if w.Code != 503 {
		t.Fatal("Falha de banco ignorada")
	}
	var n int
	if err := a.db.QueryRow(`SELECT tentativas FROM codigos_recuperacao_senha`).Scan(&n); err != nil || n != 0 {
		t.Fatal("Gravacao parcial")
	}
}
func TestSegurancaConfirmacaoEmail(t *testing.T) {
	a := novoAuth(t)
	token := a.login(a.email, senhaFixture)
	var codigo string
	h := AuthMiddlewareComDB(a.db, atualizarPerfil(a.db, "revendedora", func(_, _, c string) bool { codigo = c; return true }))
	body := map[string]string{"nome": "Fixture A", "email": "novo@example.invalid"}
	if a.req(h, "PUT", "/minha-conta", token, body).Code != 401 {
		t.Fatal("Token isolado alterou email")
	}
	body["senha_atual"] = senhaFixture
	if a.req(h, "PUT", "/minha-conta", token, body).Code != 202 {
		t.Fatal("Confirmacao nao solicitada")
	}
	var email string
	a.db.QueryRow(`SELECT email FROM usuarios WHERE id=1`).Scan(&email)
	if email != a.email {
		t.Fatal("Email alterado antes do codigo")
	}
	body["codigo_email"] = codigo
	if a.req(h, "PUT", "/minha-conta", token, body).Code != 200 {
		t.Fatal("Confirmacao falhou")
	}
	a.db.QueryRow(`SELECT email FROM usuarios WHERE id=1`).Scan(&email)
	if email != body["email"] || a.status(token) != 401 {
		t.Fatal("Confirmacao nao revogou ou nao alterou")
	}
	a.login(email, senhaFixture)
}
func TestSegurancaJWTPerfisETamanho(t *testing.T) {
	a := novoAuth(t)
	rev := a.login(a.email, senhaFixture)
	h := AdminMiddleware(a.db, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) }))
	if a.req(h, "GET", "/admin/contas", rev, nil).Code != 403 {
		t.Fatal("Escalada administrativa")
	}
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, Claims{UsuarioID: 1, RegisteredClaims: jwt.RegisteredClaims{ExpiresAt: jwt.NewNumericDate(time.Now().Add(-time.Minute))}}).SignedString([]byte(jwtSecret()))
	if err != nil {
		t.Fatal(err)
	}
	if a.status(token) != 401 {
		t.Fatal("Token expirado aceito")
	}
	if a.req(Login(a.db), "POST", "/login", "", map[string]string{"email": a.email, "senha": strings.Repeat("x", 20000)}).Code != 400 {
		t.Fatal("Corpo excessivo aceito")
	}
	if !SenhaValida("12345678") || SenhaValida("1234567") || SenhaValida(strings.Repeat("x", 73)) {
		t.Fatal("Politica divergente")
	}
	if a.req(Cadastro(a.db), "POST", "/cadastro", "", nil).Code != 403 {
		t.Fatal("Cadastro publico habilitado")
	}
}

func TestSegurancaEmailIncorretoExpiradoEAdmin(t *testing.T) {
	for _, perfil := range []string{"revendedora", "admin"} {
		t.Run(perfil, func(t *testing.T) {
			a := novoAuth(t)
			email := a.email
			id := 1
			if perfil == "admin" {
				email = "admin@example.invalid"
				id = 3
			}
			token := a.login(email, senhaFixture)
			var codigo string
			h := AuthMiddlewareComDB(a.db, atualizarPerfil(a.db, perfil, func(_, _, c string) bool { codigo = c; return true }))
			body := map[string]string{"nome": "Fixture Segura", "email": "novo@example.invalid", "senha_atual": senhaFixture}
			if a.req(h, "PUT", "/perfil", token, body).Code != 202 {
				t.Fatal("Solicitacao falhou")
			}
			if a.req(h, "PUT", "/perfil", token, body).Code != 429 {
				t.Fatal("Cooldown ignorado")
			}
			errado := "000000"
			if codigo == errado {
				errado = "111111"
			}
			body["codigo_email"] = errado
			if a.req(h, "PUT", "/perfil", token, body).Code != 400 {
				t.Fatal("Codigo errado aceito")
			}
			var atual string
			if err := a.db.QueryRow(`SELECT email FROM usuarios WHERE id=$1`, id).Scan(&atual); err != nil || atual != email {
				t.Fatal("Endereco anterior nao preservado")
			}
			a.exec(`UPDATE alteracoes_email SET expira_em=CURRENT_TIMESTAMP-interval '1 second'`)
			body["codigo_email"] = codigo
			if a.req(h, "PUT", "/perfil", token, body).Code != 400 {
				t.Fatal("Codigo expirado aceito")
			}
		})
	}
}
func TestSegurancaLimiteOrigemEntreContas(t *testing.T) {
	a := novoAuth(t)
	for i := range 60 {
		w := httptest.NewRecorder()
		r := httptest.NewRequest("POST", "/fixture", nil)
		r.RemoteAddr = "127.0.0.44:1234"
		if !limitar(a.db, w, r, "login", fmt.Sprintf("fixture%d@example.invalid", i)) {
			t.Fatalf("Limite antecipado: %d", i)
		}
	}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/fixture", nil)
	r.RemoteAddr = "127.0.0.44:1234"
	r.Header.Set("X-Forwarded-For", "192.0.2.1")
	if limitar(a.db, w, r, "login", "outra@example.invalid") || w.Code != 429 {
		t.Fatal("Cabecalho forjado contornou limite de origem")
	}
}
func TestSegurancaSMTPIndisponivelSemSegredos(t *testing.T) {
	t.Setenv("GMAIL_EMAIL", "")
	t.Setenv("GMAIL_APP_PASSWORD", "")
	if err := enviarCodigoGmail("fixture@example.invalid", "Fixture", "000001"); err == nil || strings.Contains(err.Error(), "000001") {
		t.Fatal("Erro SMTP inseguro")
	}
}

func TestSegurancaOrigemProxyConfiavel(t *testing.T) {
	t.Setenv("AUTH_TRUSTED_PROXY_CIDRS", "")
	r := httptest.NewRequest("GET", "/", nil)
	r.RemoteAddr = "203.0.113.4:1234"
	r.Header.Set("X-Forwarded-For", "198.51.100.8")
	if origem(r) != "203.0.113.4" {
		t.Fatal("IP forjado aceito")
	}
	t.Setenv("AUTH_TRUSTED_PROXY_CIDRS", "10.0.0.0/8")
	r.RemoteAddr = "10.1.2.3:1234"
	r.Header.Set("X-Forwarded-For", "198.51.100.8,203.0.113.4,10.2.3.4")
	if origem(r) != "203.0.113.4" {
		t.Fatal("Cadeia de proxies insegura")
	}
	t.Setenv("AUTH_TRUSTED_PROXY_CIDRS", "0.0.0.0/0")
	if _, err := redesProxy(); err == nil {
		t.Fatal("Proxy universal aceito")
	}
}
