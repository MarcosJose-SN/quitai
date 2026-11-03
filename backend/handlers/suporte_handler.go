package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/MarcosJose/quitai/auth"
)

type suporteTicket struct {
	ID               int64             `json:"id"`
	RevendedoraID    int               `json:"revendedora_id"`
	RevendedoraNome  string            `json:"revendedora_nome"`
	RevendedoraEmail string            `json:"revendedora_email"`
	Assunto          string            `json:"assunto"`
	Categoria        string            `json:"categoria"`
	Status           string            `json:"status"`
	CriadoEm         string            `json:"criado_em"`
	AtualizadoEm     string            `json:"atualizado_em"`
	Mensagens        []suporteMensagem `json:"mensagens,omitempty"`
}
type suporteMensagem struct {
	ID          int64  `json:"id"`
	AutorPerfil string `json:"autor_perfil"`
	Mensagem    string `json:"mensagem"`
	CriadoEm    string `json:"criado_em"`
}

func suporteErro(w http.ResponseWriter, status int, msg string) {
	responderAdminJSON(w, status, map[string]string{"mensagem": msg})
}
func suporteLerJSON(r *http.Request, destino interface{}) error {
	r.Body = http.MaxBytesReader(nil, r.Body, 16*1024)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	return d.Decode(destino)
}
func suportePerfil(db *sql.DB, r *http.Request) (int, string, error) {
	id, ok := auth.UsuarioID(r)
	if !ok {
		return 0, "", sql.ErrNoRows
	}
	var perfil string
	err := db.QueryRowContext(r.Context(), "SELECT perfil FROM usuarios WHERE id=$1 AND ativo=TRUE", id).Scan(&perfil)
	return id, perfil, err
}
func suporteListar(db *sql.DB, w http.ResponseWriter, r *http.Request, admin bool, usuarioID int) {
	q := `SELECT s.id,s.revendedora_id,u.nome,u.email,s.assunto,s.categoria,s.status,s.criado_em::text,s.atualizado_em::text FROM suporte_solicitacoes s JOIN usuarios u ON u.id=s.revendedora_id`
	args := []interface{}{}
	if !admin {
		q += " WHERE s.revendedora_id=$1"
		args = append(args, usuarioID)
	}
	q += " ORDER BY s.atualizado_em DESC,s.id DESC LIMIT 500"
	rows, err := db.QueryContext(r.Context(), q, args...)
	if err != nil {
		suporteErro(w, 500, "Não foi possível consultar as solicitações.")
		return
	}
	defer rows.Close()
	itens := make([]suporteTicket, 0)
	for rows.Next() {
		var t suporteTicket
		if err := rows.Scan(&t.ID, &t.RevendedoraID, &t.RevendedoraNome, &t.RevendedoraEmail, &t.Assunto, &t.Categoria, &t.Status, &t.CriadoEm, &t.AtualizadoEm); err != nil {
			suporteErro(w, 500, "Erro ao ler solicitações.")
			return
		}
		itens = append(itens, t)
	}
	if rows.Err() != nil {
		suporteErro(w, 500, "Erro ao consultar solicitações.")
		return
	}
	responderAdminJSON(w, 200, itens)
}
func suporteDetalhar(db *sql.DB, w http.ResponseWriter, r *http.Request, id int64, admin bool, usuarioID int) {
	var t suporteTicket
	err := db.QueryRowContext(r.Context(), `SELECT s.id,s.revendedora_id,u.nome,u.email,s.assunto,s.categoria,s.status,s.criado_em::text,s.atualizado_em::text FROM suporte_solicitacoes s JOIN usuarios u ON u.id=s.revendedora_id WHERE s.id=$1 AND ($2 OR s.revendedora_id=$3)`, id, admin, usuarioID).Scan(&t.ID, &t.RevendedoraID, &t.RevendedoraNome, &t.RevendedoraEmail, &t.Assunto, &t.Categoria, &t.Status, &t.CriadoEm, &t.AtualizadoEm)
	if err == sql.ErrNoRows {
		suporteErro(w, 404, "Solicitação não encontrada.")
		return
	}
	if err != nil {
		suporteErro(w, 500, "Erro ao consultar solicitação.")
		return
	}
	rows, err := db.QueryContext(r.Context(), `SELECT m.id,m.autor_perfil,m.mensagem,m.criado_em::text FROM suporte_mensagens m WHERE m.solicitacao_id=$1 ORDER BY m.id`, id)
	if err != nil {
		suporteErro(w, 500, "Erro ao consultar mensagens.")
		return
	}
	defer rows.Close()
	t.Mensagens = make([]suporteMensagem, 0)
	for rows.Next() {
		var m suporteMensagem
		if err := rows.Scan(&m.ID, &m.AutorPerfil, &m.Mensagem, &m.CriadoEm); err != nil {
			suporteErro(w, 500, "Erro ao ler mensagens.")
			return
		}
		t.Mensagens = append(t.Mensagens, m)
	}
	if rows.Err() != nil {
		suporteErro(w, 500, "Erro ao consultar mensagens.")
		return
	}
	responderAdminJSON(w, 200, t)
}
func suporteResponder(db *sql.DB, w http.ResponseWriter, r *http.Request, id int64, admin bool, usuarioID int) {
	var req struct {
		Mensagem string `json:"mensagem"`
	}
	if suporteLerJSON(r, &req) != nil {
		suporteErro(w, 400, "Dados inválidos.")
		return
	}
	req.Mensagem = strings.TrimSpace(req.Mensagem)
	if len(req.Mensagem) == 0 || len([]rune(req.Mensagem)) > 5000 {
		suporteErro(w, 400, "Mensagem deve conter de 1 a 5000 caracteres.")
		return
	}
	perfil := "revendedora"
	if admin {
		perfil = "admin"
	}
	tx, err := db.BeginTx(r.Context(), nil)
	if err != nil {
		suporteErro(w, 500, "Erro ao iniciar operação.")
		return
	}
	defer tx.Rollback()
	var status string
	err = tx.QueryRowContext(r.Context(), `SELECT status FROM suporte_solicitacoes WHERE id=$1 AND ($2 OR revendedora_id=$3) FOR UPDATE`, id, admin, usuarioID).Scan(&status)
	if err == sql.ErrNoRows {
		suporteErro(w, 404, "Solicitação não encontrada.")
		return
	}
	if err != nil {
		suporteErro(w, 500, "Erro ao verificar solicitação.")
		return
	}
	if status == "resolvido" {
		suporteErro(w, http.StatusConflict, "Este atendimento foi encerrado. Abra um novo chamado para continuar.")
		return
	}
	if _, err = tx.ExecContext(r.Context(), `INSERT INTO suporte_mensagens (solicitacao_id,autor_id,autor_perfil,mensagem) VALUES ($1,$2,$3,$4)`, id, usuarioID, perfil, req.Mensagem); err != nil {
		suporteErro(w, 500, "Não foi possível registrar a mensagem.")
		return
	}
	novoStatus := status
	if admin && status == "aberto" {
		novoStatus = "em_andamento"
	}
	if _, err = tx.ExecContext(r.Context(), `UPDATE suporte_solicitacoes SET status=$2,atualizado_em=NOW() WHERE id=$1`, id, novoStatus); err != nil {
		suporteErro(w, 500, "Erro ao atualizar solicitação.")
		return
	}
	if err = tx.Commit(); err != nil {
		suporteErro(w, 500, "Erro ao salvar mensagem.")
		return
	}
	responderAdminJSON(w, 201, map[string]string{"mensagem": "Mensagem registrada com sucesso."})
}
func suporteCriar(db *sql.DB, w http.ResponseWriter, r *http.Request, usuarioID int) {
	var req struct {
		Assunto   string `json:"assunto"`
		Categoria string `json:"categoria"`
		Mensagem  string `json:"mensagem"`
	}
	if suporteLerJSON(r, &req) != nil {
		suporteErro(w, 400, "Dados inválidos.")
		return
	}
	req.Assunto = strings.TrimSpace(req.Assunto)
	req.Categoria = strings.TrimSpace(req.Categoria)
	req.Mensagem = strings.TrimSpace(req.Mensagem)
	if len([]rune(req.Assunto)) < 3 || len([]rune(req.Assunto)) > 160 || len([]rune(req.Categoria)) > 80 || len([]rune(req.Mensagem)) < 1 || len([]rune(req.Mensagem)) > 5000 {
		suporteErro(w, 400, "Informe assunto (3 a 160 caracteres), categoria (até 80) e mensagem (1 a 5000). ")
		return
	}
	if req.Categoria == "" {
		req.Categoria = "Geral"
	}
	tx, err := db.BeginTx(r.Context(), nil)
	if err != nil {
		suporteErro(w, 500, "Erro ao iniciar solicitação.")
		return
	}
	defer tx.Rollback()
	var id int64
	err = tx.QueryRowContext(r.Context(), `INSERT INTO suporte_solicitacoes (revendedora_id,assunto,categoria) VALUES ($1,$2,$3) RETURNING id`, usuarioID, req.Assunto, req.Categoria).Scan(&id)
	if err != nil {
		suporteErro(w, 500, "Não foi possível criar solicitação.")
		return
	}
	if _, err = tx.ExecContext(r.Context(), `INSERT INTO suporte_mensagens (solicitacao_id,autor_id,autor_perfil,mensagem) VALUES ($1,$2,'revendedora',$3)`, id, usuarioID, req.Mensagem); err != nil {
		suporteErro(w, 500, "Não foi possível salvar mensagem.")
		return
	}
	if err = tx.Commit(); err != nil {
		suporteErro(w, 500, "Não foi possível concluir solicitação.")
		return
	}
	responderAdminJSON(w, 201, map[string]interface{}{"id": id, "mensagem": "Solicitação enviada com sucesso."})
}

// SuporteAdmin deve ser protegido por auth.AdminMiddleware no main.go.
func SuporteAdmin(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) { suporteRotas(db, w, r, true) }
}

// SuporteRevendedora deve ser protegido por auth.AuthMiddlewareComDB no main.go.
func SuporteRevendedora(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) { suporteRotas(db, w, r, false) }
}
func suporteRotas(db *sql.DB, w http.ResponseWriter, r *http.Request, admin bool) {
	usuarioID, perfil, err := suportePerfil(db, r)
	if err != nil {
		suporteErro(w, 401, "Sessão inválida.")
		return
	}
	if admin && perfil != "admin" || !admin && perfil != "revendedora" {
		suporteErro(w, 403, "Acesso não permitido.")
		return
	}
	base := "/suporte"
	if admin {
		base = "/admin/suporte"
	}
	path := strings.TrimPrefix(r.URL.Path, base)
	if path == "" || path == "/" {
		switch r.Method {
		case http.MethodGet:
			suporteListar(db, w, r, admin, usuarioID)
		case http.MethodPost:
			if admin {
				suporteErro(w, 405, "Método não permitido.")
			} else {
				suporteCriar(db, w, r, usuarioID)
			}
		default:
			suporteErro(w, 405, "Método não permitido.")
		}
		return
	}
	partes := strings.Split(strings.Trim(path, "/"), "/")
	if len(partes) < 1 || len(partes) > 2 {
		suporteErro(w, 404, "Rota não encontrada.")
		return
	}
	id, err := strconv.ParseInt(partes[0], 10, 64)
	if err != nil || id <= 0 {
		suporteErro(w, 400, "ID inválido.")
		return
	}
	if len(partes) == 1 && r.Method == http.MethodGet {
		suporteDetalhar(db, w, r, id, admin, usuarioID)
		return
	}
	if len(partes) == 2 && partes[1] == "respostas" && r.Method == http.MethodPost {
		suporteResponder(db, w, r, id, admin, usuarioID)
		return
	}
	if admin && len(partes) == 2 && partes[1] == "status" && r.Method == http.MethodPatch {
		var req struct {
			Status string `json:"status"`
		}
		if suporteLerJSON(r, &req) != nil {
			suporteErro(w, 400, "Dados inválidos.")
			return
		}
		if req.Status != "aberto" && req.Status != "em_andamento" && req.Status != "resolvido" {
			suporteErro(w, 400, "Status inválido.")
			return
		}
		result, err := db.ExecContext(r.Context(), `UPDATE suporte_solicitacoes SET status=$1,atualizado_em=NOW() WHERE id=$2`, req.Status, id)
		if err != nil {
			suporteErro(w, 500, "Erro ao atualizar status.")
			return
		}
		n, _ := result.RowsAffected()
		if n == 0 {
			suporteErro(w, 404, "Solicitação não encontrada.")
			return
		}
		responderAdminJSON(w, 200, map[string]string{"mensagem": "Status atualizado."})
		return
	}
	suporteErro(w, 404, "Rota não encontrada.")
}
