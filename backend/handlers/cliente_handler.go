package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/MarcosJose/quitai/models"
)

func CriarCliente(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var cliente models.Cliente

		err := json.NewDecoder(r.Body).Decode(&cliente)
		if err != nil {
			http.Error(w, "Dados inválidos", http.StatusBadRequest)
			return
		}

		query := `
			INSERT INTO clientes
			(nome, telefone, observacoes)
			VALUES ($1, $2, $3)
			RETURNING id
		`

		err = db.QueryRow(
			query,
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

		json.NewEncoder(w).Encode(cliente)
	}
}

func ListarClientes(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := db.Query(`
			SELECT id, nome, telefone, observacoes
			FROM clientes
			ORDER BY id DESC
		`)

		if err != nil {
			http.Error(w, "Erro ao buscar clientes", http.StatusInternalServerError)
			return
		}

		defer rows.Close()

		var clientes []models.Cliente

		for rows.Next() {
			var cliente models.Cliente

			err := rows.Scan(
				&cliente.ID,
				&cliente.Nome,
				&cliente.Telefone,
				&cliente.Observacoes,
			)

			if err != nil {
				http.Error(w, "Erro ao ler clientes", http.StatusInternalServerError)
				return
			}

			clientes = append(clientes, cliente)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(clientes)
	}
}

func EditarCliente(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		idTexto := r.URL.Path[len("/clientes/"):]

		id, err := strconv.Atoi(idTexto)
		if err != nil {
			http.Error(w, "ID do cliente inválido", http.StatusBadRequest)
			return
		}

		var cliente models.Cliente

		err = json.NewDecoder(r.Body).Decode(&cliente)
		if err != nil {
			http.Error(w, "Dados inválidos", http.StatusBadRequest)
			return
		}

		query := `
			UPDATE clientes
			SET nome = $1,
				telefone = $2,
				observacoes = $3,
				atualizado_em = CURRENT_TIMESTAMP
			WHERE id = $4
			RETURNING id, nome, telefone, observacoes
		`

		err = db.QueryRow(
			query,
			cliente.Nome,
			cliente.Telefone,
			cliente.Observacoes,
			id,
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
		json.NewEncoder(w).Encode(cliente)
	}
}

func ExcluirCliente(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		idTexto := r.URL.Path[len("/clientes/"):]

		id, err := strconv.Atoi(idTexto)
		if err != nil {
			http.Error(w, "ID do cliente inválido", http.StatusBadRequest)
			return
		}

		result, err := db.Exec(
			"DELETE FROM clientes WHERE id = $1",
			id,
		)

		if err != nil {
			// Cliente possui vendas cadastradas.
			// O PostgreSQL impede a exclusão para preservar o histórico.
			if strings.Contains(err.Error(), "vendas_cliente_id_fkey") ||
				strings.Contains(err.Error(), "violates foreign key constraint") {

				http.Error(
					w,
					"Não é possível excluir este cliente porque ele possui vendas cadastradas.",
					http.StatusConflict,
				)
				return
			}

			http.Error(w, "Erro ao excluir cliente", http.StatusInternalServerError)
			return
		}

		linhas, err := result.RowsAffected()
		if err != nil {
			http.Error(w, "Erro ao verificar exclusão", http.StatusInternalServerError)
			return
		}

		if linhas == 0 {
			http.Error(w, "Cliente não encontrado", http.StatusNotFound)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}
