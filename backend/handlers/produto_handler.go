package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/MarcosJose/quitai/models"
)

func CriarProduto(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Método não permitido", http.StatusMethodNotAllowed)
			return
		}

		var produto models.Produto

		if err := json.NewDecoder(r.Body).Decode(&produto); err != nil {
			http.Error(w, "Dados inválidos", http.StatusBadRequest)
			return
		}

		query := `
			INSERT INTO produtos
				(nome, codigo, categoria, preco_custo, preco_venda, estoque)
			VALUES ($1, $2, $3, $4, $5, $6)
			RETURNING id
		`

		err := db.QueryRow(
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
		_ = json.NewEncoder(w).Encode(produto)
	}
}

func ListarProdutos(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Método não permitido", http.StatusMethodNotAllowed)
			return
		}

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

		produtos := []models.Produto{}

		for rows.Next() {
			var produto models.Produto

			if err := rows.Scan(
				&produto.ID,
				&produto.Nome,
				&produto.Codigo,
				&produto.Categoria,
				&produto.PrecoCusto,
				&produto.PrecoVenda,
				&produto.Estoque,
			); err != nil {
				http.Error(w, "Erro ao ler produtos", http.StatusInternalServerError)
				return
			}

			produtos = append(produtos, produto)
		}

		if err := rows.Err(); err != nil {
			http.Error(w, "Erro ao buscar produtos", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(produtos)
	}
}

func EditarProduto(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPut {
			http.Error(w, "Método não permitido", http.StatusMethodNotAllowed)
			return
		}

		idTexto := strings.TrimPrefix(r.URL.Path, "/produtos/")
		id, err := strconv.Atoi(idTexto)
		if err != nil || id <= 0 {
			http.Error(w, "ID do produto inválido", http.StatusBadRequest)
			return
		}

		var produto models.Produto
		if err := json.NewDecoder(r.Body).Decode(&produto); err != nil {
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
			http.Error(w, "Erro ao editar produto", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(produto)
	}
}

func ExcluirProduto(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodDelete {
			http.Error(w, "Método não permitido", http.StatusMethodNotAllowed)
			return
		}

		idTexto := strings.TrimPrefix(r.URL.Path, "/produtos/")
		id, err := strconv.Atoi(idTexto)
		if err != nil || id <= 0 {
			http.Error(w, "ID do produto inválido", http.StatusBadRequest)
			return
		}

		// Verifica se o produto existe.
		var existe bool
		err = db.QueryRow(
			`SELECT EXISTS (SELECT 1 FROM produtos WHERE id = $1)`,
			id,
		).Scan(&existe)

		if err != nil {
			http.Error(w, "Não foi possível verificar o produto. Tente novamente.", http.StatusInternalServerError)
			return
		}
		if !existe {
			http.Error(w, "Produto não encontrado.", http.StatusNotFound)
			return
		}

		// Impede a exclusão se o produto estiver em alguma venda.
		var possuiVendas bool
		err = db.QueryRow(
			`SELECT EXISTS (SELECT 1 FROM venda_itens WHERE produto_id = $1)`,
			id,
		).Scan(&possuiVendas)

		if err != nil {
			http.Error(w, "Não foi possível verificar se o produto está vinculado a vendas. Tente novamente.", http.StatusInternalServerError)
			return
		}

		if possuiVendas {
			http.Error(
				w,
				"Este produto está vinculado a uma ou mais vendas cadastradas. Para preservar o histórico dos produtos vendidos e dos pagamentos, a exclusão foi bloqueada. Você pode manter o cadastro e continuar consultando essas vendas.",
				http.StatusConflict,
			)
			return
		}

		// Só exclui produtos sem vendas vinculadas.
		result, err := db.Exec(
			`DELETE FROM produtos WHERE id = $1`,
			id,
		)

		if err != nil {
			errorSQL := strings.ToLower(err.Error())

			if strings.Contains(errorSQL, "foreign key") ||
				strings.Contains(errorSQL, "venda_itens_produto_id_fkey") {
				http.Error(
					w,
					"Este produto está vinculado a vendas. A exclusão foi bloqueada para preservar o histórico.",
					http.StatusConflict,
				)
				return
			}

			http.Error(
				w,
				"Não foi possível excluir o produto neste momento. Tente novamente.",
				http.StatusInternalServerError,
			)
			return
		}

		linhas, err := result.RowsAffected()
		if err != nil {
			http.Error(w, "Não foi possível confirmar a exclusão do produto.", http.StatusInternalServerError)
			return
		}
		if linhas == 0 {
			http.Error(w, "Produto não encontrado.", http.StatusNotFound)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}
