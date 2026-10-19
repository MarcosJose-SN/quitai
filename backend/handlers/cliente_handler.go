package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/MarcosJose/quitai/auth"
	"github.com/MarcosJose/quitai/models"
)

func CriarCliente(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Método não permitido", http.StatusMethodNotAllowed)
			return
		}

		usuarioID, ok := auth.UsuarioID(r)
		if !ok {
			http.Error(w, "Usuário não autenticado", http.StatusUnauthorized)
			return
		}

		var cliente models.Cliente
		if err := json.NewDecoder(r.Body).Decode(&cliente); err != nil {
			http.Error(w, "Dados inválidos", http.StatusBadRequest)
			return
		}

		err := db.QueryRow(`
			INSERT INTO clientes (usuario_id, nome, telefone, observacoes)
			VALUES ($1, $2, $3, $4)
			RETURNING id
		`,
			usuarioID,
			cliente.Nome,
			cliente.Telefone,
			cliente.Observacoes,
		).Scan(&cliente.ID)

		if err != nil {
			http.Error(w, "Erro ao cadastrar cliente", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(cliente)
	}
}

func ListarClientes(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Método não permitido", http.StatusMethodNotAllowed)
			return
		}

		usuarioID, ok := auth.UsuarioID(r)
		if !ok {
			http.Error(w, "Usuário não autenticado", http.StatusUnauthorized)
			return
		}

		rows, err := db.Query(`
			SELECT id, nome, telefone, observacoes
			FROM clientes
			WHERE usuario_id = $1
			ORDER BY id DESC
		`, usuarioID)
		if err != nil {
			http.Error(w, "Erro ao buscar clientes", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		clientes := []models.Cliente{}

		for rows.Next() {
			var cliente models.Cliente
			if err := rows.Scan(
				&cliente.ID,
				&cliente.Nome,
				&cliente.Telefone,
				&cliente.Observacoes,
			); err != nil {
				http.Error(w, "Erro ao ler clientes", http.StatusInternalServerError)
				return
			}
			clientes = append(clientes, cliente)
		}

		if err := rows.Err(); err != nil {
			http.Error(w, "Erro ao buscar clientes", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(clientes)
	}
}

func EditarCliente(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPut {
			http.Error(w, "Método não permitido", http.StatusMethodNotAllowed)
			return
		}

		usuarioID, ok := auth.UsuarioID(r)
		if !ok {
			http.Error(w, "Usuário não autenticado", http.StatusUnauthorized)
			return
		}

		id, err := strconv.Atoi(strings.TrimPrefix(r.URL.Path, "/clientes/"))
		if err != nil || id <= 0 {
			http.Error(w, "ID do cliente inválido", http.StatusBadRequest)
			return
		}

		var cliente models.Cliente
		if err := json.NewDecoder(r.Body).Decode(&cliente); err != nil {
			http.Error(w, "Dados inválidos", http.StatusBadRequest)
			return
		}

		err = db.QueryRow(`
			UPDATE clientes
			SET nome = $1,
				telefone = $2,
				observacoes = $3,
				atualizado_em = CURRENT_TIMESTAMP
			WHERE id = $4 AND usuario_id = $5
			RETURNING id, nome, telefone, observacoes
		`,
			cliente.Nome,
			cliente.Telefone,
			cliente.Observacoes,
			id,
			usuarioID,
		).Scan(
			&cliente.ID,
			&cliente.Nome,
			&cliente.Telefone,
			&cliente.Observacoes,
		)

		if err == sql.ErrNoRows {
			http.Error(w, "Cliente não encontrado", http.StatusNotFound)
			return
		}
		if err != nil {
			http.Error(w, "Erro ao editar cliente", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(cliente)
	}
}

func ExcluirCliente(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodDelete {
			http.Error(w, "Método não permitido", http.StatusMethodNotAllowed)
			return
		}

		usuarioID, ok := auth.UsuarioID(r)
		if !ok {
			http.Error(w, "Usuário não autenticado", http.StatusUnauthorized)
			return
		}

		id, err := strconv.Atoi(strings.TrimPrefix(r.URL.Path, "/clientes/"))
		if err != nil || id <= 0 {
			http.Error(w, "ID do cliente inválido", http.StatusBadRequest)
			return
		}

		var possuiVendas bool
		err = db.QueryRow(`
			SELECT EXISTS (
				SELECT 1
				FROM vendas
				WHERE cliente_id = $1 AND usuario_id = $2
			)
		`, id, usuarioID).Scan(&possuiVendas)

		if err != nil {
			http.Error(w, "Não foi possível verificar as vendas do cliente", http.StatusInternalServerError)
			return
		}

		if possuiVendas {
			http.Error(
				w,
				"Este cliente possui vendas registradas. A exclusão foi bloqueada para proteger o histórico de compras e pagamentos.",
				http.StatusConflict,
			)
			return
		}

		result, err := db.Exec(`
			DELETE FROM clientes
			WHERE id = $1 AND usuario_id = $2
		`, id, usuarioID)

		if err != nil {
			errorSQL := strings.ToLower(err.Error())
			if strings.Contains(errorSQL, "foreign key") {
				http.Error(
					w,
					"Este cliente está vinculado a outros registros. A exclusão foi bloqueada para proteger o histórico.",
					http.StatusConflict,
				)
				return
			}

			http.Error(w, "Não foi possível excluir o cliente", http.StatusInternalServerError)
			return
		}

		linhas, err := result.RowsAffected()
		if err != nil {
			http.Error(w, "Não foi possível confirmar a exclusão do cliente", http.StatusInternalServerError)
			return
		}
		if linhas == 0 {
			http.Error(w, "Cliente não encontrado", http.StatusNotFound)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}
