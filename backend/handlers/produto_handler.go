package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/MarcosJose/quitai/models"
)

func CriarProduto(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var produto models.Produto

		err := json.NewDecoder(r.Body).Decode(&produto)
		if err != nil {
			http.Error(w, "Dados inválidos", http.StatusBadRequest)
			return
		}

		query := `
			INSERT INTO produtos
			(nome, codigo, categoria, preco_custo, preco_venda, estoque)
			VALUES ($1, $2, $3, $4, $5, $6)
			RETURNING id
		`

		err = db.QueryRow(
			query,
			produto.Nome,
			produto.Codigo,
			produto.Categoria,
			produto.PrecoCusto,
			produto.PrecoVenda,
			produto.Estoque,
		).Scan(&produto.ID)

		if err != nil {
			http.Error(w, "Erro ao cadastrar produto", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)

		json.NewEncoder(w).Encode(produto)
	}
}

func ListarProdutos(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {

		rows, err := db.Query(`
			SELECT id, nome, codigo, categoria, preco_custo, preco_venda, estoque
			FROM produtos
			ORDER BY id DESC
		`)

		if err != nil {
			http.Error(w, "Erro ao buscar produtos", http.StatusInternalServerError)
			return
		}

		defer rows.Close()

		var produtos []models.Produto

		for rows.Next() {
			var produto models.Produto

			err := rows.Scan(
				&produto.ID,
				&produto.Nome,
				&produto.Codigo,
				&produto.Categoria,
				&produto.PrecoCusto,
				&produto.PrecoVenda,
				&produto.Estoque,
			)

			if err != nil {
				http.Error(w, "Erro ao ler produtos", http.StatusInternalServerError)
				return
			}

			produtos = append(produtos, produto)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(produtos)
	}
}

func EditarProduto(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		idTexto := r.URL.Path[len("/produtos/"):]

		id, err := strconv.Atoi(idTexto)
		if err != nil {
			http.Error(w, "ID do produto inválido", http.StatusBadRequest)
			return
		}

		var produto models.Produto

		err = json.NewDecoder(r.Body).Decode(&produto)
		if err != nil {
			http.Error(w, "Dados inválidos", http.StatusBadRequest)
			return
		}

		query := `
			UPDATE produtos
			SET nome = $1,
				codigo = $2,
				categoria = $3,
				preco_custo = $4,
				preco_venda = $5,
				estoque = $6,
				atualizado_em = CURRENT_TIMESTAMP
			WHERE id = $7
			RETURNING id, nome, codigo, categoria, preco_custo, preco_venda, estoque
		`

		err = db.QueryRow(
			query,
			produto.Nome,
			produto.Codigo,
			produto.Categoria,
			produto.PrecoCusto,
			produto.PrecoVenda,
			produto.Estoque,
			id,
		).Scan(
			&produto.ID,
			&produto.Nome,
			&produto.Codigo,
			&produto.Categoria,
			&produto.PrecoCusto,
			&produto.PrecoVenda,
			&produto.Estoque,
		)

		if err == sql.ErrNoRows {
			http.Error(w, "Produto não encontrado", http.StatusNotFound)
			return
		}

		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(produto)
	}
}

func ExcluirProduto(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		idTexto := r.URL.Path[len("/produtos/"):]

		id, err := strconv.Atoi(idTexto)
		if err != nil {
			http.Error(w, "ID do produto inválido", http.StatusBadRequest)
			return
		}

		result, err := db.Exec(
			"DELETE FROM produtos WHERE id = $1",
			id,
		)

		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		linhas, err := result.RowsAffected()
		if err != nil {
			http.Error(w, "Erro ao verificar exclusão", http.StatusInternalServerError)
			return
		}

		if linhas == 0 {
			http.Error(w, "Produto não encontrado", http.StatusNotFound)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}
