package handlers

import (
	"database/sql"
	"net/http"
)

// AdminDashboard retorna indicadores reais das contas de revendedoras.
// Registre esta função no main.go com auth.AdminMiddleware.
// GET /admin/dashboard
func AdminDashboard(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			responderAdminJSON(w, http.StatusMethodNotAllowed, map[string]string{"mensagem": "Método não permitido."})
			return
		}

		var total, ativas, bloqueadas, novas30Dias int64
		err := db.QueryRowContext(r.Context(), `
            SELECT
                COUNT(*),
                COUNT(*) FILTER (WHERE ativo = TRUE),
                COUNT(*) FILTER (WHERE ativo = FALSE),
                COUNT(*) FILTER (WHERE criado_em >= NOW() - INTERVAL '30 days')
            FROM usuarios
            WHERE perfil = 'revendedora'
        `).Scan(&total, &ativas, &bloqueadas, &novas30Dias)
		if err != nil {
			responderAdminJSON(w, http.StatusInternalServerError, map[string]string{"mensagem": "Não foi possível consultar os indicadores."})
			return
		}

		w.Header().Set("Cache-Control", "no-store")
		responderAdminJSON(w, http.StatusOK, struct {
			TotalRevendedoras int64 `json:"total_revendedoras"`
			ContasAtivas      int64 `json:"contas_ativas"`
			ContasBloqueadas  int64 `json:"contas_bloqueadas"`
			NovosCadastros    int64 `json:"novos_cadastros_30_dias"`
		}{total, ativas, bloqueadas, novas30Dias})
	}
}
