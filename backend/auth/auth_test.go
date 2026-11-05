package auth

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"golang.org/x/crypto/bcrypt"
)

func TestAuthMiddlewareRejeitaTokenAusente(t *testing.T) {
	proximo := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("o handler seguinte não deveria ser executado")
	})

	handler := AuthMiddleware(proximo)
	req := httptest.NewRequest(http.MethodGet, "/protegido", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("esperado status 401, recebido %d", rec.Code)
	}
}

func TestAdminMiddlewareRejeitaRevendedora(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("erro ao criar banco simulado: %v", err)
	}
	defer db.Close()

	usuario := UsuarioResponse{
		ID:     10,
		Email:  "revendedora@teste.local",
		Perfil: "revendedora",
		Ativo:  true,
	}

	token, err := gerarToken(usuario)
	if err != nil {
		t.Fatalf("erro ao gerar token de teste: %v", err)
	}

	mock.ExpectQuery("SELECT perfil, ativo").
		WithArgs(10).
		WillReturnRows(
			sqlmock.NewRows([]string{"perfil", "ativo"}).
				AddRow("revendedora", true),
		)

	mock.ExpectQuery("SELECT versao_sessao").WillReturnRows(sqlmock.NewRows([]string{"valida"}).AddRow(true))
	proximo := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("uma revendedora não deveria acessar a rota administrativa")
	})

	handler := AdminMiddleware(db, proximo)
	req := httptest.NewRequest(http.MethodGet, "/admin/contas", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("esperado status 403, recebido %d", rec.Code)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("consulta esperada não executada: %v", err)
	}
}

func TestAuthMiddlewareComDBRejeitaContaBloqueada(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("erro ao criar banco simulado: %v", err)
	}
	defer db.Close()

	usuario := UsuarioResponse{
		ID:     20,
		Email:  "bloqueada@teste.local",
		Perfil: "revendedora",
		Ativo:  false,
	}

	token, err := gerarToken(usuario)
	if err != nil {
		t.Fatalf("erro ao gerar token de teste: %v", err)
	}

	mock.ExpectQuery("SELECT ativo FROM usuarios WHERE id = \\$1").
		WithArgs(20).
		WillReturnRows(
			sqlmock.NewRows([]string{"ativo"}).AddRow(false),
		)

	proximo := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("uma conta bloqueada não deveria acessar a rota")
	})

	handler := AuthMiddlewareComDB(db, proximo)
	req := httptest.NewRequest(http.MethodGet, "/clientes", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("esperado status 403, recebido %d", rec.Code)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("consulta esperada não executada: %v", err)
	}
}

func TestAdminMiddlewarePermiteAdministradorAtivo(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("erro ao criar banco simulado: %v", err)
	}
	defer db.Close()

	usuario := UsuarioResponse{
		ID:     30,
		Email:  "admin@teste.local",
		Perfil: "admin",
		Ativo:  true,
	}

	token, err := gerarToken(usuario)
	if err != nil {
		t.Fatalf("erro ao gerar token de teste: %v", err)
	}

	mock.ExpectQuery("SELECT perfil, ativo").
		WithArgs(30).
		WillReturnRows(
			sqlmock.NewRows([]string{"perfil", "ativo"}).
				AddRow("admin", true),
		)

	mock.ExpectQuery("SELECT versao_sessao").WillReturnRows(sqlmock.NewRows([]string{"valida"}).AddRow(true))
	proximo := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	handler := AdminMiddleware(db, proximo)
	req := httptest.NewRequest(http.MethodGet, "/admin/contas", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("esperado status 200, recebido %d", rec.Code)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("consulta esperada não executada: %v", err)
	}
}

func TestLoginComSenhaCorreta(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("erro ao criar banco simulado: %v", err)
	}
	defer db.Close()

	hash, err := bcrypt.GenerateFromPassword(
		[]byte("senha123"),
		bcrypt.MinCost,
	)
	if err != nil {
		t.Fatalf("erro ao gerar hash: %v", err)
	}

	for range 2 {
		mock.ExpectQuery("INSERT INTO limites_autenticacao").WillReturnRows(sqlmock.NewRows([]string{"tentativas"}).AddRow(1))
	}
	mock.ExpectQuery("SELECT id, nome, email, senha_hash, perfil, ativo").
		WithArgs("teste@exemplo.com").
		WillReturnRows(
			sqlmock.NewRows([]string{
				"id", "nome", "email", "senha_hash", "perfil", "ativo", "versao_sessao",
			}).AddRow(
				1,
				"Usuário Teste",
				"teste@exemplo.com",
				string(hash),
				"revendedora",
				true, 0,
			),
		)

	body := strings.NewReader(
		`{"email":" TESTE@EXEMPLO.COM ","senha":"senha123"}`,
	)
	req := httptest.NewRequest(http.MethodPost, "/auth/login", body)
	rec := httptest.NewRecorder()

	Login(db).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf(
			"esperado status 200, recebido %d: %s",
			rec.Code,
			rec.Body.String(),
		)
	}

	var resposta authResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resposta); err != nil {
		t.Fatalf("resposta JSON inválida: %v", err)
	}

	if resposta.Token == "" {
		t.Fatal("o token JWT não deveria estar vazio")
	}

	if resposta.Usuario.ID != 1 {
		t.Fatalf("esperado ID 1, recebido %d", resposta.Usuario.ID)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("consulta esperada não executada: %v", err)
	}
}

func TestLoginComSenhaIncorreta(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("erro ao criar banco simulado: %v", err)
	}
	defer db.Close()

	hash, err := bcrypt.GenerateFromPassword(
		[]byte("senhaCorreta"),
		bcrypt.MinCost,
	)
	if err != nil {
		t.Fatalf("erro ao gerar hash: %v", err)
	}

	for range 2 {
		mock.ExpectQuery("INSERT INTO limites_autenticacao").WillReturnRows(sqlmock.NewRows([]string{"tentativas"}).AddRow(1))
	}
	mock.ExpectQuery("SELECT id, nome, email, senha_hash, perfil, ativo").
		WithArgs("teste@exemplo.com").
		WillReturnRows(
			sqlmock.NewRows([]string{
				"id", "nome", "email", "senha_hash", "perfil", "ativo", "versao_sessao",
			}).AddRow(
				1,
				"Usuário Teste",
				"teste@exemplo.com",
				string(hash),
				"revendedora",
				true, 0,
			),
		)

	body := strings.NewReader(
		`{"email":"teste@exemplo.com","senha":"senhaErrada"}`,
	)
	req := httptest.NewRequest(http.MethodPost, "/auth/login", body)
	rec := httptest.NewRecorder()

	Login(db).ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("esperado status 401, recebido %d", rec.Code)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("consulta esperada não executada: %v", err)
	}
}

func TestAuthMiddlewareRejeitaTokenInvalido(t *testing.T) {
	proximo := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("o handler seguinte não deveria ser executado")
	})

	handler := AuthMiddleware(proximo)
	req := httptest.NewRequest(http.MethodGet, "/protegido", nil)
	req.Header.Set("Authorization", "Bearer token-invalido")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("esperado status 401, recebido %d", rec.Code)
	}
}

func TestLoginRejeitaContaBloqueada(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("erro ao criar banco simulado: %v", err)
	}
	defer db.Close()

	hash, err := bcrypt.GenerateFromPassword(
		[]byte("senha123"),
		bcrypt.MinCost,
	)
	if err != nil {
		t.Fatalf("erro ao gerar hash: %v", err)
	}

	for range 2 {
		mock.ExpectQuery("INSERT INTO limites_autenticacao").WillReturnRows(sqlmock.NewRows([]string{"tentativas"}).AddRow(1))
	}
	mock.ExpectQuery("SELECT id, nome, email, senha_hash, perfil, ativo").
		WithArgs("bloqueada@teste.local").
		WillReturnRows(
			sqlmock.NewRows([]string{
				"id", "nome", "email", "senha_hash", "perfil", "ativo", "versao_sessao",
			}).AddRow(
				2,
				"Conta Bloqueada",
				"bloqueada@teste.local",
				string(hash),
				"revendedora",
				false, 0,
			),
		)

	body := strings.NewReader(
		`{"email":"bloqueada@teste.local","senha":"senha123"}`,
	)
	req := httptest.NewRequest(http.MethodPost, "/auth/login", body)
	rec := httptest.NewRecorder()

	Login(db).ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("esperado status 403, recebido %d", rec.Code)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("consulta esperada não executada: %v", err)
	}
}

func TestLoginRejeitaEmailInexistente(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("erro ao criar banco simulado: %v", err)
	}
	defer db.Close()

	for range 2 {
		mock.ExpectQuery("INSERT INTO limites_autenticacao").WillReturnRows(sqlmock.NewRows([]string{"tentativas"}).AddRow(1))
	}
	mock.ExpectQuery("SELECT id, nome, email, senha_hash, perfil, ativo").
		WithArgs("inexistente@teste.local").
		WillReturnError(sql.ErrNoRows)

	body := strings.NewReader(
		`{"email":"inexistente@teste.local","senha":"senha123"}`,
	)
	req := httptest.NewRequest(http.MethodPost, "/auth/login", body)
	rec := httptest.NewRecorder()

	Login(db).ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("esperado status 401, recebido %d", rec.Code)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("consulta esperada não executada: %v", err)
	}
}

func TestCadastroPublicoDesativado(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("erro ao criar banco simulado: %v", err)
	}
	defer db.Close()

	body := strings.NewReader(
		`{"nome":"Teste","email":"novo@teste.local","senha":"senha123"}`,
	)
	req := httptest.NewRequest(http.MethodPost, "/auth/cadastro", body)
	rec := httptest.NewRecorder()

	Cadastro(db).ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("esperado status 403, recebido %d; resposta: %s", rec.Code, rec.Body.String())
	}

	if !strings.Contains(rec.Body.String(), "Cadastro público desativado") {
		t.Fatalf("resposta não informou que o cadastro público está desativado: %s", rec.Body.String())
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("foram executadas consultas inesperadas: %v", err)
	}
}
