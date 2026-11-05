package handlers

import (
	"database/sql"
	"encoding/json"
	"errors"
	"github.com/MarcosJose/quitai/auth"
	"net/http"
	"strconv"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

type contaAdmin struct {
	ID       int    `json:"id"`
	Nome     string `json:"nome"`
	Email    string `json:"email"`
	Perfil   string `json:"perfil"`
	Ativo    bool   `json:"ativo"`
	CriadoEm string `json:"criado_em"`
}

type criarContaAdminRequest struct {
	Nome  string `json:"nome"`
	Email string `json:"email"`
	Senha string `json:"senha"`
}

// AdminContas: GET /admin/contas e POST /admin/contas.
// A proteção de administrador deve ser aplicada no main.go.
func AdminContas(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			listarContasAdmin(db, w, r)
		case http.MethodPost:
			criarContaAdmin(db, w, r)
		default:
			responderAdminJSON(w, http.StatusMethodNotAllowed, map[string]string{
				"mensagem": "Método não permitido.",
			})
		}
	}
}

func listarContasAdmin(db *sql.DB, w http.ResponseWriter, r *http.Request) {
	rows, err := db.Query(`
		SELECT id, nome, email, perfil, ativo, criado_em
		FROM usuarios
		ORDER BY id DESC
	`)
	if err != nil {
		responderAdminJSON(w, http.StatusInternalServerError, map[string]string{
			"mensagem": "Não foi possível listar as contas.",
		})
		return
	}
	defer rows.Close()

	contas := make([]contaAdmin, 0)

	for rows.Next() {
		var conta contaAdmin
		var criadoEm sql.NullTime

		if err := rows.Scan(
			&conta.ID,
			&conta.Nome,
			&conta.Email,
			&conta.Perfil,
			&conta.Ativo,
			&criadoEm,
		); err != nil {
			responderAdminJSON(w, http.StatusInternalServerError, map[string]string{
				"mensagem": "Erro ao ler os dados das contas.",
			})
			return
		}

		if criadoEm.Valid {
			conta.CriadoEm = criadoEm.Time.Format("2006-01-02T15:04:05Z07:00")
		}

		contas = append(contas, conta)
	}

	if err := rows.Err(); err != nil {
		responderAdminJSON(w, http.StatusInternalServerError, map[string]string{
			"mensagem": "Erro ao consultar as contas.",
		})
		return
	}

	responderAdminJSON(w, http.StatusOK, contas)
}

func criarContaAdmin(db *sql.DB, w http.ResponseWriter, r *http.Request) {
	var req criarContaAdminRequest

	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16*1024)).Decode(&req); err != nil {
		responderAdminJSON(w, http.StatusBadRequest, map[string]string{
			"mensagem": "Dados inválidos.",
		})
		return
	}

	req.Nome = strings.TrimSpace(req.Nome)
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))

	if len([]rune(req.Nome)) < 2 || len([]rune(req.Nome)) > 120 || !auth.EmailValido(req.Email) || !auth.SenhaValida(req.Senha) {
		responderAdminJSON(w, http.StatusBadRequest, map[string]string{
			"mensagem": "Informe nome, e-mail e uma senha com 8 a 72 bytes.",
		})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Senha), bcrypt.DefaultCost)
	if err != nil {
		responderAdminJSON(w, http.StatusInternalServerError, map[string]string{
			"mensagem": "Não foi possível proteger a senha.",
		})
		return
	}

	var conta contaAdmin
	var criadoEm sql.NullTime

	err = db.QueryRow(`
		INSERT INTO usuarios (nome, email, senha_hash, perfil, ativo)
		VALUES ($1, $2, $3, 'revendedora', TRUE)
		RETURNING id, nome, email, perfil, ativo, criado_em
	`, req.Nome, req.Email, string(hash)).Scan(
		&conta.ID,
		&conta.Nome,
		&conta.Email,
		&conta.Perfil,
		&conta.Ativo,
		&criadoEm,
	)

	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			responderAdminJSON(w, http.StatusConflict, map[string]string{
				"mensagem": "Já existe uma conta com este e-mail.",
			})
			return
		}

		responderAdminJSON(w, http.StatusInternalServerError, map[string]string{
			"mensagem": "Não foi possível criar a conta.",
		})
		return
	}

	if criadoEm.Valid {
		conta.CriadoEm = criadoEm.Time.Format("2006-01-02T15:04:05Z07:00")
	}

	responderAdminJSON(w, http.StatusCreated, conta)
}

// AdminAlterarStatusConta: PUT /admin/contas/{id}/bloquear
// ou PUT /admin/contas/{id}/reativar.
func AdminAlterarStatusConta(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPut {
			responderAdminJSON(w, http.StatusMethodNotAllowed, map[string]string{
				"mensagem": "Método não permitido.",
			})
			return
		}

		partes := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
		if len(partes) != 4 || partes[0] != "admin" ||
			partes[1] != "contas" {
			responderAdminJSON(w, http.StatusBadRequest, map[string]string{
				"mensagem": "Rota inválida.",
			})
			return
		}

		id, err := strconv.Atoi(partes[2])
		if err != nil || id <= 0 {
			responderAdminJSON(w, http.StatusBadRequest, map[string]string{
				"mensagem": "ID da conta inválido.",
			})
			return
		}

		var ativo bool

		switch partes[3] {
		case "bloquear":
			ativo = false
		case "reativar":
			ativo = true
		default:
			responderAdminJSON(w, http.StatusBadRequest, map[string]string{
				"mensagem": "Ação inválida. Use bloquear ou reativar.",
			})
			return
		}

		resultado, err := db.Exec(`
			UPDATE usuarios
			SET ativo = $1
			WHERE id = $2 AND perfil = 'revendedora'
		`, ativo, id)
		if err != nil {
			responderAdminJSON(w, http.StatusInternalServerError, map[string]string{
				"mensagem": "Não foi possível alterar o status da conta.",
			})
			return
		}

		afetadas, err := resultado.RowsAffected()
		if err != nil {
			responderAdminJSON(w, http.StatusInternalServerError, map[string]string{
				"mensagem": "Não foi possível confirmar a alteração.",
			})
			return
		}

		if afetadas == 0 {
			responderAdminJSON(w, http.StatusNotFound, map[string]string{
				"mensagem": "Conta de revendedora não encontrada.",
			})
			return
		}

		status := "bloqueada"
		if ativo {
			status = "reativada"
		}

		responderAdminJSON(w, http.StatusOK, map[string]string{
			"mensagem": "Conta " + status + " com sucesso.",
		})
	}
}

func responderAdminJSON(w http.ResponseWriter, status int, valor interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)

	if err := json.NewEncoder(w).Encode(valor); err != nil &&
		!errors.Is(err, http.ErrHandlerTimeout) {
		return
	}
}
