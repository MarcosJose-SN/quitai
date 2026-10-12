package auth

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

type UsuarioResponse struct {
	ID    int    `json:"id"`
	Nome  string `json:"nome"`
	Email string `json:"email"`
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
	UsuarioID int    `json:"usuario_id"`
	Email     string `json:"email"`
	jwt.RegisteredClaims
}

func Cadastro(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Método não permitido", http.StatusMethodNotAllowed)
			return
		}

		var req cadastroRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			responderErro(w, http.StatusBadRequest, "Dados inválidos")
			return
		}

		req.Nome = strings.TrimSpace(req.Nome)
		req.Email = normalizarEmail(req.Email)

		if req.Nome == "" {
			responderErro(w, http.StatusBadRequest, "Informe seu nome.")
			return
		}

		if !emailValido(req.Email) {
			responderErro(w, http.StatusBadRequest, "Informe um e-mail válido.")
			return
		}

		if len(req.Senha) < 6 {
			responderErro(w, http.StatusBadRequest, "A senha deve ter pelo menos 6 caracteres.")
			return
		}

		var existe bool
		err := db.QueryRow(
			"SELECT EXISTS(SELECT 1 FROM usuarios WHERE LOWER(email) = LOWER($1))",
			req.Email,
		).Scan(&existe)
		if err != nil {
			responderErro(w, http.StatusInternalServerError, "Erro ao verificar o cadastro.")
			return
		}

		if existe {
			responderErro(w, http.StatusConflict, "Já existe uma conta com este e-mail.")
			return
		}

		hash, err := bcrypt.GenerateFromPassword([]byte(req.Senha), bcrypt.DefaultCost)
		if err != nil {
			responderErro(w, http.StatusInternalServerError, "Erro ao proteger a senha.")
			return
		}

		var usuario UsuarioResponse
		err = db.QueryRow(`
			INSERT INTO usuarios (nome, email, senha_hash)
			VALUES ($1, $2, $3)
			RETURNING id, nome, email
		`, req.Nome, req.Email, string(hash)).Scan(
			&usuario.ID,
			&usuario.Nome,
			&usuario.Email,
		)

		if err != nil {
			responderErro(w, http.StatusInternalServerError, "Não foi possível criar a conta.")
			return
		}

		token, err := gerarToken(usuario)
		if err != nil {
			responderErro(w, http.StatusInternalServerError, "Conta criada, mas não foi possível iniciar a sessão.")
			return
		}

		responderJSON(w, http.StatusCreated, authResponse{
			Token:   token,
			Usuario: usuario,
		})
	}
}

func Login(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Método não permitido", http.StatusMethodNotAllowed)
			return
		}

		var req loginRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			responderErro(w, http.StatusBadRequest, "Dados inválidos")
			return
		}

		req.Email = normalizarEmail(req.Email)

		var usuario UsuarioResponse
		var senhaHash string

		err := db.QueryRow(`
			SELECT id, nome, email, senha_hash
			FROM usuarios
			WHERE LOWER(email) = LOWER($1)
		`, req.Email).Scan(
			&usuario.ID,
			&usuario.Nome,
			&usuario.Email,
			&senhaHash,
		)

		if err == sql.ErrNoRows {
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

		token, err := gerarToken(usuario)
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
		err := db.QueryRow(`
			SELECT id, nome, email
			FROM usuarios
			WHERE id = $1
		`, usuarioID).Scan(&usuario.ID, &usuario.Nome, &usuario.Email)

		if err == sql.ErrNoRows {
			responderErro(w, http.StatusUnauthorized, "Usuário não encontrado.")
			return
		}

		if err != nil {
			responderErro(w, http.StatusInternalServerError, "Erro ao consultar usuário.")
			return
		}

		responderJSON(w, http.StatusOK, usuario)
	}
}

func AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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
		token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
			if token.Method != jwt.SigningMethodHS256 {
				return nil, errors.New("método de assinatura inválido")
			}
			return []byte(jwtSecret()), nil
		})

		if err != nil || !token.Valid {
			responderErro(w, http.StatusUnauthorized, "Sessão inválida ou expirada.")
			return
		}

		ctx := context.WithValue(r.Context(), usuarioIDKey{}, claims.UsuarioID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func UsuarioID(r *http.Request) (int, bool) {
	id, ok := r.Context().Value(usuarioIDKey{}).(int)
	return id, ok && id > 0
}

type usuarioIDKey struct{}

func gerarToken(usuario UsuarioResponse) (string, error) {
	agora := time.Now()
	claims := Claims{
		UsuarioID: usuario.ID,
		Email:     usuario.Email,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   stringID(usuario.ID),
			ExpiresAt: jwt.NewNumericDate(agora.Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(agora),
			NotBefore: jwt.NewNumericDate(agora),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(jwtSecret()))
}

func jwtSecret() string {
	secret := strings.TrimSpace(os.Getenv("QUITAIA_JWT_SECRET"))
	if secret != "" {
		return secret
	}

	return "quitai-desenvolvimento-chave-local-2026-trocar-em-producao"
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
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(valor)
}

func stringID(id int) string {
	return strconv.Itoa(id)
}
