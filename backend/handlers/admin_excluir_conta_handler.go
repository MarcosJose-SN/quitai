package handlers

import (
	"database/sql"
	"errors"
	"net/http"
	"strconv"
	"strings"
)

// AdminExcluirConta: DELETE /admin/contas/{id}.
// A rota deve estar protegida por auth.AdminMiddleware no main.go.
// Exclui somente revendedoras bloqueadas e sem registros de negócio associados.
func AdminExcluirConta(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodDelete {
			w.Header().Set("Allow", "DELETE")
			responderAdminJSON(w, http.StatusMethodNotAllowed, map[string]string{"mensagem": "Método não permitido."})
			return
		}

		partes := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
		if len(partes) != 3 || partes[0] != "admin" || partes[1] != "contas" {
			responderAdminJSON(w, http.StatusBadRequest, map[string]string{"mensagem": "Rota inválida."})
			return
		}
		id, err := strconv.Atoi(partes[2])
		if err != nil || id <= 0 {
			responderAdminJSON(w, http.StatusBadRequest, map[string]string{"mensagem": "ID da conta inválido."})
			return
		}

		// A consulta e a exclusão ocorrem numa única instrução. O banco ainda
		// aplica as chaves estrangeiras, impedindo exclusão de dados vinculados.
		var excluidoID int
		err = db.QueryRowContext(r.Context(), `
            DELETE FROM usuarios AS u
            WHERE u.id = $1
              AND u.perfil = 'revendedora'
              AND u.ativo = FALSE
              AND NOT EXISTS (SELECT 1 FROM clientes c WHERE c.usuario_id = u.id)
              AND NOT EXISTS (SELECT 1 FROM produtos p WHERE p.usuario_id = u.id)
              AND NOT EXISTS (SELECT 1 FROM vendas v WHERE v.usuario_id = u.id)
            RETURNING u.id
        `, id).Scan(&excluidoID)

		if errors.Is(err, sql.ErrNoRows) {
			// Não revela se a conta não existe, está ativa ou possui dependências.
			responderAdminJSON(w, http.StatusConflict, map[string]string{
				"mensagem": "Exclusão não permitida. A conta deve ser uma revendedora bloqueada, sem clientes, produtos ou vendas vinculados.",
			})
			return
		}
		if err != nil {
			// Restrições de integridade adicionais continuam protegendo o banco.
			responderAdminJSON(w, http.StatusConflict, map[string]string{
				"mensagem": "Não foi possível excluir a conta. Verifique se existem registros vinculados.",
			})
			return
		}
		responderAdminJSON(w, http.StatusOK, map[string]string{"mensagem": "Conta bloqueada excluída com sucesso."})
	}
}
