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

func obterUsuarioID(w http.ResponseWriter, r *http.Request) (int, bool) {
	usuarioID, ok := auth.UsuarioID(r)
	if !ok {
		http.Error(w, "Usuário não autenticado", http.StatusUnauthorized)
		return 0, false
	}
	return usuarioID, true
}

func CriarProduto(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Método não permitido", http.StatusMethodNotAllowed)
			return
		}

		usuarioID, ok := obterUsuarioID(w, r)
		if !ok {
			return
		}

		var produto models.Produto
		if err := json.NewDecoder(r.Body).Decode(&produto); err != nil {
			http.Error(w, "Dados inválidos", http.StatusBadRequest)
			return
		}

		err := db.QueryRow(`
			INSERT INTO produtos
				(usuario_id, nome, codigo, categoria, preco_custo, preco_venda, estoque)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
			RETURNING id
		`,
			usuarioID,
			produto.Nome,
			produto.Codigo,
			produto.Categoria,
			produto.PrecoCusto,
			produto.PrecoVenda,
			produto.Estoque,
		).Scan(&produto.ID)

		if err != nil {
			if strings.Contains(strings.ToLower(err.Error()), "duplicate key") {
				http.Error(w, "Você já possui um produto com esse código", http.StatusConflict)
				return
			}
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

		usuarioID, ok := obterUsuarioID(w, r)
		if !ok {
			return
		}

		rows, err := db.Query(`
			SELECT id, nome, codigo, categoria, preco_custo, preco_venda, estoque
			FROM produtos
			WHERE usuario_id = $1
			ORDER BY id DESC
		`, usuarioID)
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

		usuarioID, ok := obterUsuarioID(w, r)
		if !ok {
			return
		}

		id, err := strconv.Atoi(strings.TrimPrefix(r.URL.Path, "/produtos/"))
		if err != nil || id <= 0 {
			http.Error(w, "ID do produto inválido", http.StatusBadRequest)
			return
		}

		var produto models.Produto
		if err := json.NewDecoder(r.Body).Decode(&produto); err != nil {
			http.Error(w, "Dados inválidos", http.StatusBadRequest)
			return
		}

		err = db.QueryRow(`
			UPDATE produtos
			SET nome = $1,
				codigo = $2,
				categoria = $3,
				preco_custo = $4,
				preco_venda = $5,
				estoque = $6,
				atualizado_em = CURRENT_TIMESTAMP
			WHERE id = $7 AND usuario_id = $8
			RETURNING id, nome, codigo, categoria, preco_custo, preco_venda, estoque
		`,
			produto.Nome,
			produto.Codigo,
			produto.Categoria,
			produto.PrecoCusto,
			produto.PrecoVenda,
			produto.Estoque,
			id,
			usuarioID,
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
			if strings.Contains(strings.ToLower(err.Error()), "duplicate key") {
				http.Error(w, "Você já possui um produto com esse código", http.StatusConflict)
				return
			}
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

		usuarioID, ok := obterUsuarioID(w, r)
		if !ok {
			return
		}

		id, err := strconv.Atoi(strings.TrimPrefix(r.URL.Path, "/produtos/"))
		if err != nil || id <= 0 {
			http.Error(w, "ID do produto inválido", http.StatusBadRequest)
			return
		}

		var possuiVendas bool
		err = db.QueryRow(`
			SELECT EXISTS (
				SELECT 1
				FROM venda_itens vi
				JOIN vendas v ON v.id = vi.venda_id
				WHERE vi.produto_id = $1
				  AND v.usuario_id = $2
			)
		`, id, usuarioID).Scan(&possuiVendas)

		if err != nil {
			http.Error(w, "Não foi possível verificar as vendas do produto", http.StatusInternalServerError)
			return
		}

		if possuiVendas {
			http.Error(
				w,
				"Este produto está vinculado a vendas. A exclusão foi bloqueada para preservar o histórico.",
				http.StatusConflict,
			)
			return
		}

		result, err := db.Exec(`
			DELETE FROM produtos
			WHERE id = $1 AND usuario_id = $2
		`, id, usuarioID)

		if err != nil {
			errorSQL := strings.ToLower(err.Error())
			if strings.Contains(errorSQL, "foreign key") ||
				strings.Contains(errorSQL, "venda_itens_produto_id_fkey") {
				http.Error(w, "Este produto está vinculado a vendas. A exclusão foi bloqueada para preservar o histórico.", http.StatusConflict)
				return
			}
			http.Error(w, "Não foi possível excluir o produto", http.StatusInternalServerError)
			return
		}

		linhas, err := result.RowsAffected()
		if err != nil {
			http.Error(w, "Não foi possível confirmar a exclusão do produto", http.StatusInternalServerError)
			return
		}
		if linhas == 0 {
			http.Error(w, "Produto não encontrado", http.StatusNotFound)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}