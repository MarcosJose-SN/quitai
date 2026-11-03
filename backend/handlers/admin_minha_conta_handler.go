package handlers

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strings"

	"github.com/MarcosJose/quitai/auth"
	"golang.org/x/crypto/bcrypt"
)

func respostaMinhaConta(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func erroMinhaConta(w http.ResponseWriter, status int, mensagem string) {
	respostaMinhaConta(w, status, map[string]string{"mensagem": mensagem})
}

// AdminAtualizarMinhaConta deve ser protegido por auth.AdminMiddleware no main.go.
// PUT /admin/minha-conta
func AdminAtualizarMinhaConta(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPut {
			erroMinhaConta(w, http.StatusMethodNotAllowed, "Método não permitido.")
			return
		}
		id, ok := auth.UsuarioID(r)
		if !ok {
			erroMinhaConta(w, http.StatusUnauthorized, "Sessão inválida.")
			return
		}
		var req struct {
			Nome  string `json:"nome"`
			Email string `json:"email"`
		}
		r.Body = http.MaxBytesReader(w, r.Body, 16*1024)
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			erroMinhaConta(w, http.StatusBadRequest, "Dados inválidos.")
			return
		}
		req.Nome = strings.TrimSpace(req.Nome)
		req.Email = strings.ToLower(strings.TrimSpace(req.Email))
		valido := regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`)
		if len([]rune(req.Nome)) < 2 || len([]rune(req.Nome)) > 120 || len(req.Email) > 254 || !valido.MatchString(req.Email) {
			erroMinhaConta(w, http.StatusBadRequest, "Informe um nome (2 a 120 caracteres) e um e-mail válido.")
			return
		}
		var outroID int
		err := db.QueryRow(`SELECT id FROM usuarios WHERE LOWER(email) = $1 AND id <> $2 LIMIT 1`, req.Email, id).Scan(&outroID)
		if err == nil {
			erroMinhaConta(w, http.StatusConflict, "Este e-mail já está cadastrado.")
			return
		}
		if !errors.Is(err, sql.ErrNoRows) {
			erroMinhaConta(w, http.StatusInternalServerError, "Erro ao validar e-mail.")
			return
		}
		var usuario struct {
			ID     int    `json:"id"`
			Nome   string `json:"nome"`
			Email  string `json:"email"`
			Perfil string `json:"perfil"`
			Ativo  bool   `json:"ativo"`
		}
		err = db.QueryRow(`UPDATE usuarios SET nome=$1, email=$2, atualizado_em=NOW() WHERE id=$3 AND perfil='admin' AND ativo=TRUE RETURNING id, nome, email, perfil, ativo`, req.Nome, req.Email, id).Scan(&usuario.ID, &usuario.Nome, &usuario.Email, &usuario.Perfil, &usuario.Ativo)
		if errors.Is(err, sql.ErrNoRows) {
			erroMinhaConta(w, http.StatusForbidden, "Conta administrativa indisponível.")
			return
		}
		if err != nil {
			erroMinhaConta(w, http.StatusConflict, "Não foi possível atualizar os dados. Verifique se o e-mail já está em uso.")
			return
		}
		respostaMinhaConta(w, http.StatusOK, usuario)
	}
}

// AdminAlterarMinhaSenha deve ser protegido por auth.AdminMiddleware no main.go.
// PUT /admin/minha-conta/senha
func AdminAlterarMinhaSenha(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPut {
			erroMinhaConta(w, http.StatusMethodNotAllowed, "Método não permitido.")
			return
		}
		id, ok := auth.UsuarioID(r)
		if !ok {
			erroMinhaConta(w, http.StatusUnauthorized, "Sessão inválida.")
			return
		}
		var req struct {
			SenhaAtual     string `json:"senha_atual"`
			NovaSenha      string `json:"nova_senha"`
			ConfirmarSenha string `json:"confirmar_senha"`
		}
		r.Body = http.MaxBytesReader(w, r.Body, 16*1024)
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			erroMinhaConta(w, http.StatusBadRequest, "Dados inválidos.")
			return
		}
		if req.NovaSenha != req.ConfirmarSenha {
			erroMinhaConta(w, http.StatusBadRequest, "A confirmação da senha não coincide.")
			return
		}
		if len(req.NovaSenha) < 8 || len(req.NovaSenha) > 72 {
			erroMinhaConta(w, http.StatusBadRequest, "A nova senha deve ter entre 8 e 72 bytes.")
			return
		}
		var hashAtual string
		err := db.QueryRow(`SELECT senha_hash FROM usuarios WHERE id=$1 AND perfil='admin' AND ativo=TRUE`, id).Scan(&hashAtual)
		if errors.Is(err, sql.ErrNoRows) {
			erroMinhaConta(w, http.StatusForbidden, "Conta administrativa indisponível.")
			return
		}
		if err != nil {
			erroMinhaConta(w, http.StatusInternalServerError, "Erro ao consultar a conta.")
			return
		}
		if bcrypt.CompareHashAndPassword([]byte(hashAtual), []byte(req.SenhaAtual)) != nil {
			erroMinhaConta(w, http.StatusUnauthorized, "Senha atual incorreta.")
			return
		}
		if bcrypt.CompareHashAndPassword([]byte(hashAtual), []byte(req.NovaSenha)) == nil {
			erroMinhaConta(w, http.StatusBadRequest, "Escolha uma senha diferente da atual.")
			return
		}
		novoHash, err := bcrypt.GenerateFromPassword([]byte(req.NovaSenha), bcrypt.DefaultCost)
		if err != nil {
			erroMinhaConta(w, http.StatusInternalServerError, "Não foi possível preparar a nova senha.")
			return
		}
		resultado, err := db.Exec(`UPDATE usuarios SET senha_hash=$1, atualizado_em=NOW() WHERE id=$2 AND perfil='admin' AND ativo=TRUE AND senha_hash=$3`, string(novoHash), id, hashAtual)
		if err != nil {
			erroMinhaConta(w, http.StatusInternalServerError, "Não foi possível alterar a senha.")
			return
		}
		linhas, err := resultado.RowsAffected()
		if err != nil || linhas != 1 {
			erroMinhaConta(w, http.StatusConflict, "A senha foi alterada em outra sessão. Tente novamente.")
			return
		}
		respostaMinhaConta(w, http.StatusOK, map[string]string{"mensagem": "Senha alterada com sucesso."})
	}
}

// Funcionalidades da conta da revendedora.
func respostaMinhaContaRevendedora(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func erroMinhaContaRevendedora(w http.ResponseWriter, status int, mensagem string) {
	respostaMinhaContaRevendedora(w, status, map[string]string{"mensagem": mensagem})
}

// AtualizarMinhaContaRevendedora deve ser protegido por auth.AuthMiddlewareComDB no main.go.
// PUT /minha-conta
func AtualizarMinhaContaRevendedora(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPut {
			erroMinhaContaRevendedora(w, http.StatusMethodNotAllowed, "Método não permitido.")
			return
		}
		id, ok := auth.UsuarioID(r)
		if !ok {
			erroMinhaContaRevendedora(w, http.StatusUnauthorized, "Sessão inválida.")
			return
		}
		var req struct {
			Nome  string `json:"nome"`
			Email string `json:"email"`
		}
		r.Body = http.MaxBytesReader(w, r.Body, 16*1024)
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			erroMinhaContaRevendedora(w, http.StatusBadRequest, "Dados inválidos.")
			return
		}
		req.Nome = strings.TrimSpace(req.Nome)
		req.Email = strings.ToLower(strings.TrimSpace(req.Email))
		valido := regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`)
		if len([]rune(req.Nome)) < 2 || len([]rune(req.Nome)) > 120 || len(req.Email) > 254 || !valido.MatchString(req.Email) {
			erroMinhaContaRevendedora(w, http.StatusBadRequest, "Informe um nome (2 a 120 caracteres) e um e-mail válido.")
			return
		}
		var outroID int
		err := db.QueryRow(`SELECT id FROM usuarios WHERE LOWER(email) = $1 AND id <> $2 LIMIT 1`, req.Email, id).Scan(&outroID)
		if err == nil {
			erroMinhaContaRevendedora(w, http.StatusConflict, "Este e-mail já está cadastrado.")
			return
		}
		if !errors.Is(err, sql.ErrNoRows) {
			erroMinhaContaRevendedora(w, http.StatusInternalServerError, "Erro ao validar e-mail.")
			return
		}
		var usuario struct {
			ID     int    `json:"id"`
			Nome   string `json:"nome"`
			Email  string `json:"email"`
			Perfil string `json:"perfil"`
			Ativo  bool   `json:"ativo"`
		}
		err = db.QueryRow(`UPDATE usuarios SET nome=$1, email=$2, atualizado_em=NOW() WHERE id=$3 AND perfil='revendedora' AND ativo=TRUE RETURNING id, nome, email, perfil, ativo`, req.Nome, req.Email, id).Scan(&usuario.ID, &usuario.Nome, &usuario.Email, &usuario.Perfil, &usuario.Ativo)
		if errors.Is(err, sql.ErrNoRows) {
			erroMinhaContaRevendedora(w, http.StatusForbidden, "Conta de revendedora indisponível.")
			return
		}
		if err != nil {
			erroMinhaContaRevendedora(w, http.StatusConflict, "Não foi possível atualizar os dados. Verifique se o e-mail já está em uso.")
			return
		}
		respostaMinhaContaRevendedora(w, http.StatusOK, usuario)
	}
}

// AlterarMinhaSenhaRevendedora deve ser protegido por auth.AuthMiddlewareComDB no main.go.
// PUT /minha-conta/senha
func AlterarMinhaSenhaRevendedora(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPut {
			erroMinhaContaRevendedora(w, http.StatusMethodNotAllowed, "Método não permitido.")
			return
		}
		id, ok := auth.UsuarioID(r)
		if !ok {
			erroMinhaContaRevendedora(w, http.StatusUnauthorized, "Sessão inválida.")
			return
		}
		var req struct {
			SenhaAtual     string `json:"senha_atual"`
			NovaSenha      string `json:"nova_senha"`
			ConfirmarSenha string `json:"confirmar_senha"`
		}
		r.Body = http.MaxBytesReader(w, r.Body, 16*1024)
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			erroMinhaContaRevendedora(w, http.StatusBadRequest, "Dados inválidos.")
			return
		}
		if req.NovaSenha != req.ConfirmarSenha {
			erroMinhaContaRevendedora(w, http.StatusBadRequest, "A confirmação da senha não coincide.")
			return
		}
		if len(req.NovaSenha) < 8 || len(req.NovaSenha) > 72 {
			erroMinhaContaRevendedora(w, http.StatusBadRequest, "A nova senha deve ter entre 8 e 72 bytes.")
			return
		}
		var hashAtual string
		err := db.QueryRow(`SELECT senha_hash FROM usuarios WHERE id=$1 AND perfil='revendedora' AND ativo=TRUE`, id).Scan(&hashAtual)
		if errors.Is(err, sql.ErrNoRows) {
			erroMinhaContaRevendedora(w, http.StatusForbidden, "Conta de revendedora indisponível.")
			return
		}
		if err != nil {
			erroMinhaContaRevendedora(w, http.StatusInternalServerError, "Erro ao consultar a conta.")
			return
		}
		if bcrypt.CompareHashAndPassword([]byte(hashAtual), []byte(req.SenhaAtual)) != nil {
			erroMinhaContaRevendedora(w, http.StatusUnauthorized, "Senha atual incorreta.")
			return
		}
		if bcrypt.CompareHashAndPassword([]byte(hashAtual), []byte(req.NovaSenha)) == nil {
			erroMinhaContaRevendedora(w, http.StatusBadRequest, "Escolha uma senha diferente da atual.")
			return
		}
		novoHash, err := bcrypt.GenerateFromPassword([]byte(req.NovaSenha), bcrypt.DefaultCost)
		if err != nil {
			erroMinhaContaRevendedora(w, http.StatusInternalServerError, "Não foi possível preparar a nova senha.")
			return
		}
		resultado, err := db.Exec(`UPDATE usuarios SET senha_hash=$1, atualizado_em=NOW() WHERE id=$2 AND perfil='revendedora' AND ativo=TRUE AND senha_hash=$3`, string(novoHash), id, hashAtual)
		if err != nil {
			erroMinhaContaRevendedora(w, http.StatusInternalServerError, "Não foi possível alterar a senha.")
			return
		}
		linhas, err := resultado.RowsAffected()
		if err != nil || linhas != 1 {
			erroMinhaContaRevendedora(w, http.StatusConflict, "A senha foi alterada em outra sessão. Tente novamente.")
			return
		}
		respostaMinhaContaRevendedora(w, http.StatusOK, map[string]string{"mensagem": "Senha alterada com sucesso."})
	}
}
