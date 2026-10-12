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
		if r.Method != http.MethodPost {
			http.Error(w, "Método não permitido", http.StatusMethodNotAllowed)
			return
		}

		var cliente models.Cliente

		if err := json.NewDecoder(r.Body).Decode(&cliente); err != nil {
			http.Error(w, "Dados inválidos", http.StatusBadRequest)
			return
		}

		query := `
			INSERT INTO clientes (nome, telefone, observacoes)
			VALUES ($1, $2, $3)
			RETURNING id
		`

		err := db.QueryRow(
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
		_ = json.NewEncoder(w).Encode(cliente)
	}
}

func ListarClientes(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Método não permitido", http.StatusMethodNotAllowed)
			return
		}

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

		idTexto := strings.TrimPrefix(r.URL.Path, "/clientes/")
		id, err := strconv.Atoi(idTexto)
		if err != nil || id <= 0 {
			http.Error(w, "ID do cliente inválido", http.StatusBadRequest)
			return
		}

		var cliente models.Cliente
		if err := json.NewDecoder(r.Body).Decode(&cliente); err != nil {
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
		_ = json.NewEncoder(w).Encode(cliente)
	}
}

func ExcluirCliente(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodDelete {
			http.Error(w, "Método não permitido", http.StatusMethodNotAllowed)
			return
		}

		idTexto := strings.TrimPrefix(r.URL.Path, "/clientes/")
		id, err := strconv.Atoi(idTexto)
		if err != nil || id <= 0 {
			http.Error(w, "ID do cliente inválido", http.StatusBadRequest)
			return
		}

		// Verifica se o cliente existe.
		var existe bool
		err = db.QueryRow(
			`SELECT EXISTS (SELECT 1 FROM clientes WHERE id = $1)`,
			id,
		).Scan(&existe)

		if err != nil {
			http.Error(w, "Não foi possível verificar o cliente. Tente novamente.", http.StatusInternalServerError)
			return
		}
		if !existe {
			http.Error(w, "Cliente não encontrado.", http.StatusNotFound)
			return
		}

		// Não permite excluir clientes que possuem vendas.
		var possuiVendas bool
		err = db.QueryRow(
			`SELECT EXISTS (SELECT 1 FROM vendas WHERE cliente_id = $1)`,
			id,
		).Scan(&possuiVendas)

		if err != nil {
			http.Error(w, "Não foi possível verificar se o cliente possui vendas vinculadas. Tente novamente.", http.StatusInternalServerError)
			return
		}

		if possuiVendas {
			http.Error(
				w,
				"Este cliente possui uma ou mais vendas registradas. A exclusão foi bloqueada para proteger o histórico de compras e pagamentos. Mantenha este cadastro para que todas as informações continuem disponíveis.",
				http.StatusConflict,
			)
			return
		}

		// Exclui somente se não houver vendas vinculadas.
		result, err := db.Exec(
			`DELETE FROM clientes WHERE id = $1`,
			id,
		)

		if err != nil {
			errorSQL := strings.ToLower(err.Error())

			if strings.Contains(errorSQL, "foreign key") ||
				strings.Contains(errorSQL, "clientes") {
				http.Error(
					w,
					"Este cliente está vinculado a outros registros. A exclusão foi bloqueada para proteger o histórico.",
					http.StatusConflict,
				)
				return
			}

			http.Error(
				w,
				"Não foi possível excluir o cliente neste momento. Tente novamente.",
				http.StatusInternalServerError,
			)
			return
		}

		linhas, err := result.RowsAffected()
		if err != nil {
			http.Error(w, "Não foi possível confirmar a exclusão do cliente.", http.StatusInternalServerError)
			return
		}
		if linhas == 0 {
			http.Error(w, "Cliente não encontrado.", http.StatusNotFound)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}
