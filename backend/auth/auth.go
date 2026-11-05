package auth

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"net/http/httptest"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

type UsuarioResponse struct {
	ID     int    `json:"id"`
	Nome   string `json:"nome"`
	Email  string `json:"email"`
	Perfil string `json:"perfil"`
	Ativo  bool   `json:"ativo"`
}

type cadastroRequest struct {
	Nome  string `json:"nome"`
	Email string `json:"email"`
	Senha string `json:"senha"`
}

type loginRequest struct {
	Email string `json:"email"`
	Senha string `json:"senha"`
}

type authResponse struct {
	Token   string          `json:"token"`
	Usuario UsuarioResponse `json:"usuario"`
}

type Claims struct {
	VersaoSessao int64  `json:"versao_sessao"`
	UsuarioID    int    `json:"usuario_id"`
	Email        string `json:"email"`
	jwt.RegisteredClaims
}

type usuarioIDKey struct{}

func Cadastro(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			responderErro(w, http.StatusMethodNotAllowed, "Método não permitido.")
			return
		}

		responderErro(
			w,
			http.StatusForbidden,
			"Cadastro público desativado. Solicite acesso ao administrador.",
		)
	}
}
func Login(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			responderErro(w, http.StatusMethodNotAllowed, "Método não permitido.")
			return
		}

		var req loginRequest
		if err := lerJSON(w, r, &req); err != nil {
			responderErro(w, http.StatusBadRequest, "Dados inválidos.")
			return
		}

		req.Email = normalizarEmail(req.Email)
		if len(req.Email) > 254 || len(req.Senha) > 72 {
			responderErro(w, 400, "Dados invalidos.")
			return
		}
		if !limitar(db, w, r, "login", req.Email) {
			return
		}
		if !ocuparSenha() {
			responderErro(w, 503, "Tente novamente em instantes.")
			return
		}
		defer liberarSenha()

		var usuario UsuarioResponse
		var senhaHash string
		var versao int64

		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()
		err := db.QueryRowContext(ctx, `
			SELECT id, nome, email, senha_hash, perfil, ativo, versao_sessao
			FROM usuarios
			WHERE LOWER(email) = LOWER($1)
		`, req.Email).Scan(
			&usuario.ID,
			&usuario.Nome,
			&usuario.Email,
			&senhaHash,
			&usuario.Perfil,
			&usuario.Ativo, &versao,
		)

		if err == sql.ErrNoRows {
			_ = bcrypt.CompareHashAndPassword([]byte(hashFicticio), []byte(req.Senha))
			responderErro(w, http.StatusUnauthorized, "E-mail ou senha inválidos.")
			return
		}

		if err != nil {
			responderErro(w, http.StatusInternalServerError, "Erro ao realizar login.")
			return
		}

		if err := bcrypt.CompareHashAndPassword([]byte(senhaHash), []byte(req.Senha)); err != nil {
			responderErro(w, http.StatusUnauthorized, "E-mail ou senha inválidos.")
			return
		}

		if !usuario.Ativo {
			responderErro(w, http.StatusForbidden, "Esta conta está bloqueada. Entre em contato com o suporte.")
			return
		}

		token, err := tokenComVersao(usuario, versao)
		if err != nil {
			responderErro(w, http.StatusInternalServerError, "Não foi possível iniciar a sessão.")
			return
		}

		responderJSON(w, http.StatusOK, authResponse{
			Token:   token,
			Usuario: usuario,
		})
	}
}

func Me(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		usuarioID, ok := UsuarioID(r)
		if !ok {
			responderErro(w, http.StatusUnauthorized, "Sessão inválida ou expirada.")
			return
		}

		var usuario UsuarioResponse
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()
		err := db.QueryRowContext(ctx, `
			SELECT id, nome, email, perfil, ativo
			FROM usuarios
			WHERE id = $1
		`, usuarioID).Scan(
			&usuario.ID,
			&usuario.Nome,
			&usuario.Email,
			&usuario.Perfil,
			&usuario.Ativo,
		)

		if err == sql.ErrNoRows {
			responderErro(w, http.StatusUnauthorized, "Usuário não encontrado.")
			return
		}

		if err != nil {
			responderErro(w, http.StatusInternalServerError, "Erro ao consultar usuário.")
			return
		}

		if !usuario.Ativo {
			responderErro(w, http.StatusForbidden, "Esta conta está bloqueada.")
			return
		}

		responderJSON(w, http.StatusOK, usuario)
	}
}

// AuthMiddleware valida o token JWT.
// Mantido para compatibilidade com os handlers e testes existentes.
func AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if r.Method == http.MethodOptions {
			next.ServeHTTP(w, r)
			return
		}

		cabecalho := strings.TrimSpace(r.Header.Get("Authorization"))
		if !strings.HasPrefix(cabecalho, "Bearer ") {
			responderErro(w, http.StatusUnauthorized, "Token de autenticação não informado.")
			return
		}

		tokenString := strings.TrimSpace(strings.TrimPrefix(cabecalho, "Bearer "))
		if tokenString == "" {
			responderErro(w, http.StatusUnauthorized, "Token de autenticação inválido.")
			return
		}

		claims := &Claims{}
		token, err := jwt.ParseWithClaims(
			tokenString,
			claims,
			func(token *jwt.Token) (interface{}, error) {
				if token.Method != jwt.SigningMethodHS256 {
					return nil, errors.New("método de assinatura inválido")
				}
				return []byte(jwtSecret()), nil
			},
			jwt.WithExpirationRequired(),
		)

		if err != nil || token == nil || !token.Valid || claims.UsuarioID <= 0 {
			responderErro(w, http.StatusUnauthorized, "Sessão inválida ou expirada.")
			return
		}

		ctx := context.WithValue(r.Context(), usuarioIDKey{}, claims.UsuarioID)
		ctx = context.WithValue(ctx, claimsKey{}, claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// AuthMiddlewareComDB também verifica se a conta continua ativa.
// Use nas rotas comerciais para que bloqueios tenham efeito imediato.
func AuthMiddlewareComDB(db *sql.DB, next http.Handler) http.Handler {
	return AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions {
			next.ServeHTTP(w, r)
			return
		}

		usuarioID, ok := UsuarioID(r)
		if !ok {
			responderErro(w, http.StatusUnauthorized, "Sessão inválida ou expirada.")
			return
		}

		var ativo bool
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()
		err := db.QueryRowContext(ctx,
			"SELECT ativo FROM usuarios WHERE id = $1",
			usuarioID,
		).Scan(&ativo)

		if err == sql.ErrNoRows {
			responderErro(w, http.StatusUnauthorized, "Usuário não encontrado.")
			return
		}

		if err != nil {
			responderErro(w, http.StatusInternalServerError, "Erro ao verificar a conta.")
			return
		}

		if !ativo {
			responderErro(w, http.StatusForbidden, "Esta conta está bloqueada.")
			return
		}

		valida, err := validarSessaoDB(db, r)
		if err != nil {
			responderErro(w, 503, "Nao foi possivel verificar a sessao.")
			return
		}
		if !valida {
			responderErro(w, 401, "Sessao invalida ou revogada.")
			return
		}
		next.ServeHTTP(w, r)
	}))
}

// AdminMiddleware só permite acesso a contas ativas com perfil admin.
func AdminMiddleware(db *sql.DB, next http.Handler) http.Handler {
	return AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions {
			next.ServeHTTP(w, r)
			return
		}

		usuarioID, ok := UsuarioID(r)
		if !ok {
			responderErro(w, http.StatusUnauthorized, "Sessão inválida ou expirada.")
			return
		}

		var perfil string
		var ativo bool

		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()
		err := db.QueryRowContext(ctx, `
			SELECT perfil, ativo
			FROM usuarios
			WHERE id = $1
		`, usuarioID).Scan(&perfil, &ativo)

		if err == sql.ErrNoRows {
			responderErro(w, http.StatusUnauthorized, "Usuário não encontrado.")
			return
		}

		if err != nil {
			log.Printf("Falha na consulta de permissões administrativas: %v", err)
			responderErro(w, http.StatusInternalServerError, "Erro ao validar permissões.")
			return
		}

		if !ativo {
			responderErro(w, http.StatusForbidden, "Esta conta está bloqueada.")
			return
		}

		if perfil != "admin" {
			responderErro(w, http.StatusForbidden, "Acesso restrito ao administrador.")
			return
		}

		valida, err := validarSessaoDB(db, r)
		if err != nil {
			responderErro(w, 503, "Nao foi possivel verificar a sessao.")
			return
		}
		if !valida {
			responderErro(w, 401, "Sessao invalida ou revogada.")
			return
		}
		next.ServeHTTP(w, r)
	}))
}

func UsuarioID(r *http.Request) (int, bool) {
	id, ok := r.Context().Value(usuarioIDKey{}).(int)
	return id, ok && id > 0
}

func gerarToken(usuario UsuarioResponse) (string, error) { return tokenComVersao(usuario, 0) }

func jwtSecret() string {
	secret := strings.TrimSpace(os.Getenv("QUITAIA_JWT_SECRET"))

	if len([]byte(secret)) < 32 {
		return ""
	}

	return secret
}

func ValidarJWTSecret() error {
	if jwtSecret() == "" {
		return errors.New("QUITAIA_JWT_SECRET não configurada ou possui menos de 32 bytes")
	}

	return nil
}

func normalizarEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func emailValido(email string) bool {
	padrao := `^[^@\s]+@[^@\s]+\.[^@\s]+$`
	return regexp.MustCompile(padrao).MatchString(email)
}

func responderErro(w http.ResponseWriter, status int, mensagem string) {
	responderJSON(w, status, map[string]string{
		"mensagem": mensagem,
	})
}

func responderJSON(w http.ResponseWriter, status int, valor interface{}) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(valor)
}

func stringID(id int) string {
	return strconv.Itoa(id)
}

func TokenAindaValido(r *http.Request) bool {
	autorizado := false
	verificador := AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		autorizado = true
	}))
	verificador.ServeHTTP(httptest.NewRecorder(), r)
	return autorizado
}

// Hash de uma senha sintetica, usado apenas para igualar trabalho em email inexistente.
const hashFicticio = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy"
