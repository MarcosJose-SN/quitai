package auth

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"time"
)

// IniciarCadastroProtegido serializa o cadastro com a invalidacao de sessoes.
// Na limpeza futura, bloquear/atualizar usuarios.versao_sessao ANTES de
// remover cadastros. O lock permanece ate Commit/Rollback do cadastro.
// Nao deduplica pedidos novos: impede que sessoes anteriores ao corte gravem.
func IniciarCadastroProtegido(db *sql.DB, w http.ResponseWriter, r *http.Request) (*sql.Tx, func(), bool) {
	c, ok := r.Context().Value(claimsKey{}).(*Claims)
	usuario, identificado := UsuarioID(r)
	if !ok || !identificado || c.UsuarioID != usuario {
		ResponderErroAutenticacao(w, 401, "sessao_invalida", "Sessao invalida ou expirada.")
		return nil, func() {}, false
	}
	ctx, cancelar := context.WithTimeout(r.Context(), 5*time.Second)
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		cancelar()
		responderErro(w, 503, "Nao foi possivel validar o cadastro. Tente novamente.")
		return nil, func() {}, false
	}
	finalizar := func() { _ = tx.Rollback(); cancelar() }
	var ativo bool
	var versao int64
	err = tx.QueryRowContext(ctx, `SELECT ativo, versao_sessao FROM usuarios WHERE id=$1 FOR SHARE`, usuario).Scan(&ativo, &versao)
	if errors.Is(err, sql.ErrNoRows) || (err == nil && versao != c.VersaoSessao) {
		finalizar()
		ResponderErroAutenticacao(w, 401, "sessao_invalida", "Sessao invalida ou expirada.")
		return nil, func() {}, false
	}
	if err == nil && !ativo {
		finalizar()
		ResponderErroAutenticacao(w, 403, "conta_bloqueada", "Esta conta esta bloqueada.")
		return nil, func() {}, false
	}
	var revogada bool
	if err == nil {
		err = tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM sessoes_revogadas WHERE usuario_id=$1 AND token_hash=$2)`, usuario, hashToken(r)).Scan(&revogada)
	}
	if err != nil {
		finalizar()
		responderErro(w, 503, "Nao foi possivel validar a sessao. Tente novamente.")
		return nil, func() {}, false
	}
	if revogada {
		finalizar()
		ResponderErroAutenticacao(w, 401, "sessao_invalida", "Sessao invalida ou expirada.")
		return nil, func() {}, false
	}
	return tx, finalizar, true
}
