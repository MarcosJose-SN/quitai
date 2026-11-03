package main

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/MarcosJose/quitai/auth"
)

type aviso struct {
	ID       int64     `json:"id"`
	Titulo   string    `json:"titulo"`
	Mensagem string    `json:"mensagem"`
	Tipo     string    `json:"tipo"`
	Ativo    bool      `json:"ativo"`
	CriadoEm time.Time `json:"criado_em"`
}

func inicializarComunicados(db *sql.DB) error {
	_, err := db.Exec(`CREATE TABLE IF NOT EXISTS sistema_configuracao (id INTEGER PRIMARY KEY CHECK (id=1), manutencao BOOLEAN NOT NULL DEFAULT FALSE, mensagem TEXT NOT NULL DEFAULT 'Estamos realizando melhorias. Volte em instantes.'); INSERT INTO sistema_configuracao(id) VALUES (1) ON CONFLICT (id) DO NOTHING; CREATE TABLE IF NOT EXISTS sistema_avisos (id BIGSERIAL PRIMARY KEY, titulo VARCHAR(160) NOT NULL, mensagem TEXT NOT NULL, tipo VARCHAR(20) NOT NULL DEFAULT 'informacao', ativo BOOLEAN NOT NULL DEFAULT TRUE, criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW());`)
	return err
}
func jsonSistema(w http.ResponseWriter, codigo int, valor any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(codigo)
	_ = json.NewEncoder(w).Encode(valor)
}
func estadoManutencao(db *sql.DB) (bool, string, error) {
	var ativo bool
	var mensagem string
	err := db.QueryRow(`SELECT manutencao,mensagem FROM sistema_configuracao WHERE id=1`).Scan(&ativo, &mensagem)
	return ativo, mensagem, err
}
func sistemaPublico(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			jsonSistema(w, 405, map[string]string{"mensagem": "Método não permitido"})
			return
		}
		ativo, mensagem, err := estadoManutencao(db)
		if err != nil {
			jsonSistema(w, 500, map[string]string{"mensagem": "Falha ao consultar configuração"})
			return
		}
		rows, err := db.QueryContext(r.Context(), `SELECT id,titulo,mensagem,tipo,ativo,criado_em FROM sistema_avisos WHERE ativo=TRUE ORDER BY criado_em DESC,id DESC LIMIT 30`)
		if err != nil {
			jsonSistema(w, 500, map[string]string{"mensagem": "Falha ao consultar avisos"})
			return
		}
		defer rows.Close()
		avisos := make([]aviso, 0)
		for rows.Next() {
			var a aviso
			if err := rows.Scan(&a.ID, &a.Titulo, &a.Mensagem, &a.Tipo, &a.Ativo, &a.CriadoEm); err != nil {
				jsonSistema(w, 500, map[string]string{"mensagem": "Falha ao ler avisos"})
				return
			}
			avisos = append(avisos, a)
		}
		if rows.Err() != nil {
			jsonSistema(w, 500, map[string]string{"mensagem": "Falha ao ler avisos"})
			return
		}
		jsonSistema(w, 200, map[string]any{"manutencao": ativo, "mensagem_manutencao": mensagem, "avisos": avisos})
	}
}
func sistemaAdmin(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			ativo, mensagem, err := estadoManutencao(db)
			if err != nil {
				jsonSistema(w, 500, map[string]string{"mensagem": "Erro ao consultar manutenção"})
				return
			}
			rows, err := db.QueryContext(r.Context(), `SELECT id,titulo,mensagem,tipo,ativo,criado_em FROM sistema_avisos ORDER BY criado_em DESC,id DESC LIMIT 200`)
			if err != nil {
				jsonSistema(w, 500, map[string]string{"mensagem": "Erro ao listar avisos"})
				return
			}
			defer rows.Close()
			avisos := make([]aviso, 0)
			for rows.Next() {
				var a aviso
				if err := rows.Scan(&a.ID, &a.Titulo, &a.Mensagem, &a.Tipo, &a.Ativo, &a.CriadoEm); err != nil {
					jsonSistema(w, 500, map[string]string{"mensagem": "Erro ao ler avisos"})
					return
				}
				avisos = append(avisos, a)
			}
			if rows.Err() != nil {
				jsonSistema(w, 500, map[string]string{"mensagem": "Erro ao ler avisos"})
				return
			}
			jsonSistema(w, 200, map[string]any{"manutencao": ativo, "mensagem_manutencao": mensagem, "avisos": avisos})
		case http.MethodPost:
			var req struct {
				Titulo   string `json:"titulo"`
				Mensagem string `json:"mensagem"`
				Tipo     string `json:"tipo"`
			}
			r.Body = http.MaxBytesReader(w, r.Body, 16000)
			d := json.NewDecoder(r.Body)
			d.DisallowUnknownFields()
			if d.Decode(&req) != nil {
				jsonSistema(w, 400, map[string]string{"mensagem": "Dados inválidos"})
				return
			}
			req.Titulo = strings.TrimSpace(req.Titulo)
			req.Mensagem = strings.TrimSpace(req.Mensagem)
			if len([]rune(req.Titulo)) < 3 || len([]rune(req.Titulo)) > 160 || len([]rune(req.Mensagem)) < 3 || len([]rune(req.Mensagem)) > 5000 {
				jsonSistema(w, 400, map[string]string{"mensagem": "Título (3–160) e mensagem (3–5000) obrigatórios"})
				return
			}
			if req.Tipo != "informacao" && req.Tipo != "alerta" && req.Tipo != "novidade" {
				jsonSistema(w, 400, map[string]string{"mensagem": "Tipo inválido"})
				return
			}
			var id int64
			if err := db.QueryRowContext(r.Context(), `INSERT INTO sistema_avisos(titulo,mensagem,tipo) VALUES($1,$2,$3) RETURNING id`, req.Titulo, req.Mensagem, req.Tipo).Scan(&id); err != nil {
				jsonSistema(w, 500, map[string]string{"mensagem": "Erro ao criar aviso"})
				return
			}
			avisarSuporte()
			jsonSistema(w, 201, map[string]any{"id": id, "mensagem": "Aviso publicado"})
		default:
			jsonSistema(w, 405, map[string]string{"mensagem": "Método não permitido"})
		}
	}
}
func sistemaAdminManutencao(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPatch {
			jsonSistema(w, 405, map[string]string{"mensagem": "Método não permitido"})
			return
		}
		var req struct {
			Manutencao bool   `json:"manutencao"`
			Mensagem   string `json:"mensagem"`
		}
		r.Body = http.MaxBytesReader(w, r.Body, 8000)
		d := json.NewDecoder(r.Body)
		d.DisallowUnknownFields()
		if d.Decode(&req) != nil {
			jsonSistema(w, 400, map[string]string{"mensagem": "Dados inválidos"})
			return
		}
		req.Mensagem = strings.TrimSpace(req.Mensagem)
		if len([]rune(req.Mensagem)) > 1000 {
			jsonSistema(w, 400, map[string]string{"mensagem": "Mensagem muito longa"})
			return
		}
		if req.Mensagem == "" {
			req.Mensagem = "Estamos realizando melhorias. Volte em instantes."
		}
		_, err := db.ExecContext(r.Context(), `UPDATE sistema_configuracao SET manutencao=$1,mensagem=$2 WHERE id=1`, req.Manutencao, req.Mensagem)
		if err != nil {
			jsonSistema(w, 500, map[string]string{"mensagem": "Erro ao salvar manutenção"})
			return
		}
		avisarSuporte()
		jsonSistema(w, 200, map[string]string{"mensagem": "Configuração salva"})
	}
}
func sistemaAdminAviso(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := strings.TrimPrefix(r.URL.Path, "/admin/sistema/avisos/")
		if id == "" || strings.Contains(id, "/") {
			jsonSistema(w, 404, map[string]string{"mensagem": "Aviso não encontrado"})
			return
		}
		var result sql.Result
		var err error
		switch r.Method {
		case http.MethodPatch:
			var req struct {
				Ativo bool `json:"ativo"`
			}
			if json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024)).Decode(&req) != nil {
				jsonSistema(w, 400, map[string]string{"mensagem": "Dados inválidos"})
				return
			}
			result, err = db.ExecContext(r.Context(), `UPDATE sistema_avisos SET ativo=$1 WHERE id=$2`, req.Ativo, id)
		case http.MethodDelete:
			result, err = db.ExecContext(r.Context(), `DELETE FROM sistema_avisos WHERE id=$1`, id)
		default:
			jsonSistema(w, 405, map[string]string{"mensagem": "Método não permitido"})
			return
		}
		if err != nil {
			jsonSistema(w, 500, map[string]string{"mensagem": "Erro ao atualizar aviso"})
			return
		}
		n, _ := result.RowsAffected()
		if n == 0 {
			jsonSistema(w, 404, map[string]string{"mensagem": "Aviso não encontrado"})
			return
		}
		avisarSuporte()
		jsonSistema(w, 200, map[string]string{"mensagem": "Aviso atualizado"})
	}
}

// Coloque este middleware dentro do middleware de autenticação: somente revendedoras são bloqueadas.
func bloquearManutencao(db *sql.DB, proximo http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ativo, _, err := estadoManutencao(db)
		if err != nil {
			jsonSistema(w, 503, map[string]string{"mensagem": "Serviço temporariamente indisponível"})
			return
		}
		if ativo {
			jsonSistema(w, 503, map[string]string{"mensagem": "Sistema em manutenção. Tente novamente mais tarde."})
			return
		}
		proximo.ServeHTTP(w, r)
	})
}

// Mantém o pacote auth importado para garantir compatibilidade com a estrutura do projeto.
var _ = auth.UsuarioID
