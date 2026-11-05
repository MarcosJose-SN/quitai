package auth

import (
	"context"
	"crypto/subtle"
	"database/sql"
	"errors"
	"golang.org/x/crypto/bcrypt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

func AlterarSenha(db *sql.DB, perfil string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "PUT" {
			responderErro(w, 405, "Metodo nao permitido.")
			return
		}
		id, ok := UsuarioID(r)
		if !ok {
			responderErro(w, 401, "Sessao invalida.")
			return
		}
		var req struct {
			SenhaAtual     string `json:"senha_atual"`
			NovaSenha      string `json:"nova_senha"`
			ConfirmarSenha string `json:"confirmar_senha"`
		}
		if lerJSON(w, r, &req) != nil || !SenhaValida(req.NovaSenha) || req.NovaSenha != req.ConfirmarSenha || len(req.SenhaAtual) > 72 {
			responderErro(w, 400, "Confirme a senha atual e a nova senha de 8 a 72 bytes.")
			return
		}
		if !limitar(db, w, r, "senha", strconv.Itoa(id)) {
			return
		}
		if !ocuparSenha() {
			responderErro(w, 503, "Tente novamente em instantes.")
			return
		}
		defer liberarSenha()
		ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
		defer cancel()
		tx, err := db.BeginTx(ctx, nil)
		if err != nil {
			responderErro(w, 503, "Nao foi possivel alterar a senha.")
			return
		}
		defer tx.Rollback()
		var hash string
		var versao int64
		err = tx.QueryRowContext(ctx, `SELECT senha_hash,versao_sessao FROM usuarios WHERE id=$1 AND perfil=$2 AND ativo=TRUE FOR UPDATE`, id, perfil).Scan(&hash, &versao)
		if errors.Is(err, sql.ErrNoRows) {
			responderErro(w, 403, "Conta indisponivel.")
			return
		}
		if err != nil {
			responderErro(w, 503, "Nao foi possivel alterar a senha.")
			return
		}
		c, ok := r.Context().Value(claimsKey{}).(*Claims)
		if !ok || c.VersaoSessao != versao {
			responderErro(w, 401, "Sessao revogada.")
			return
		}
		if bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.SenhaAtual)) != nil {
			responderJSON(w, 401, map[string]string{"mensagem": "Senha atual incorreta.", "codigo": "senha_atual_incorreta"})
			return
		}
		if bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.NovaSenha)) == nil {
			responderErro(w, 400, "Escolha uma senha diferente da atual.")
			return
		}
		nova, err := bcrypt.GenerateFromPassword([]byte(req.NovaSenha), bcrypt.DefaultCost)
		if err == nil {
			_, err = tx.ExecContext(ctx, `UPDATE usuarios SET senha_hash=$1,versao_sessao=versao_sessao+1,atualizado_em=CURRENT_TIMESTAMP WHERE id=$2`, string(nova), id)
		}
		if err == nil {
			_, err = tx.ExecContext(ctx, `UPDATE codigos_recuperacao_senha SET usado_em=CURRENT_TIMESTAMP WHERE usuario_id=$1 AND usado_em IS NULL`, id)
		}
		if err == nil {
			err = tx.Commit()
		}
		if err != nil {
			responderErro(w, 503, "Nao foi possivel alterar a senha.")
			return
		}
		responderJSON(w, 200, map[string]string{"mensagem": "Senha alterada. Entre novamente.", "codigo": "reautenticar"})
	}
}

func AtualizarPerfil(db *sql.DB, perfil string) http.HandlerFunc {
	return atualizarPerfil(db, perfil, agendarEmail)
}
func atualizarPerfil(db *sql.DB, perfil string, enviar func(string, string, string) bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "PUT" {
			responderErro(w, 405, "Metodo nao permitido.")
			return
		}
		id, ok := UsuarioID(r)
		if !ok {
			responderErro(w, 401, "Sessao invalida.")
			return
		}
		var req struct {
			Nome       string `json:"nome"`
			Email      string `json:"email"`
			SenhaAtual string `json:"senha_atual"`
			Codigo     string `json:"codigo_email"`
		}
		if lerJSON(w, r, &req) != nil {
			responderErro(w, 400, "Dados invalidos.")
			return
		}
		req.Nome = strings.TrimSpace(req.Nome)
		req.Email = normalizarEmail(req.Email)
		req.Codigo = strings.TrimSpace(req.Codigo)
		if len([]rune(req.Nome)) < 2 || len([]rune(req.Nome)) > 120 || len(req.Email) > 254 || !emailValido(req.Email) || len(req.SenhaAtual) > 72 {
			responderErro(w, 400, "Informe nome e e-mail validos.")
			return
		}
		if !limitar(db, w, r, "perfil", strconv.Itoa(id)) {
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
		defer cancel()
		tx, err := db.BeginTx(ctx, nil)
		if err != nil {
			responderErro(w, 503, "Nao foi possivel atualizar a conta.")
			return
		}
		defer tx.Rollback()
		var u UsuarioResponse
		var hash string
		var versao int64
		err = tx.QueryRowContext(ctx, `SELECT id,nome,email,perfil,ativo,senha_hash,versao_sessao FROM usuarios WHERE id=$1 AND perfil=$2 AND ativo=TRUE FOR UPDATE`, id, perfil).Scan(&u.ID, &u.Nome, &u.Email, &u.Perfil, &u.Ativo, &hash, &versao)
		if errors.Is(err, sql.ErrNoRows) {
			responderErro(w, 403, "Conta indisponivel.")
			return
		}
		if err != nil {
			responderErro(w, 503, "Nao foi possivel atualizar a conta.")
			return
		}
		c, ok := r.Context().Value(claimsKey{}).(*Claims)
		if !ok || c.VersaoSessao != versao {
			responderErro(w, 401, "Sessao revogada.")
			return
		}
		mudou := normalizarEmail(u.Email) != req.Email
		if mudou {
			if !ocuparSenha() {
				responderErro(w, 503, "Tente novamente em instantes.")
				return
			}
			defer liberarSenha()
			if bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.SenhaAtual)) != nil {
				responderJSON(w, 401, map[string]string{"mensagem": "Senha atual incorreta.", "codigo": "senha_atual_incorreta"})
				return
			}
			var existe bool
			if err = tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM usuarios WHERE LOWER(email)=$1 AND id<>$2)`, req.Email, id).Scan(&existe); err != nil {
				responderErro(w, 503, "Nao foi possivel atualizar a conta.")
				return
			}
			if existe {
				responderErro(w, 409, "Endereco indisponivel.")
				return
			}
			if req.Codigo == "" {
				var recente bool
				if err = tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM alteracoes_email WHERE usuario_id=$1 AND enviado_em>CURRENT_TIMESTAMP-interval '60 seconds')`, id).Scan(&recente); err != nil {
					responderErro(w, 503, "Nao foi possivel solicitar a confirmacao.")
					return
				}
				if recente {
					w.Header().Set("Retry-After", "60")
					responderErro(w, 429, "Aguarde um minuto antes de reenviar o codigo.")
					return
				}
				codigo, e := gerarCodigoNumerico()
				if e != nil {
					responderErro(w, 503, "Nao foi possivel solicitar a confirmacao.")
					return
				}
				_, err = tx.ExecContext(ctx, `INSERT INTO alteracoes_email(usuario_id,novo_email,codigo_hash,versao_sessao,expira_em) VALUES($1,$2,$3,$4,CURRENT_TIMESTAMP+interval '15 minutes') ON CONFLICT(usuario_id) DO UPDATE SET novo_email=excluded.novo_email,codigo_hash=excluded.codigo_hash,versao_sessao=excluded.versao_sessao,expira_em=excluded.expira_em,tentativas=0,enviado_em=CURRENT_TIMESTAMP,confirmado_em=NULL`, id, req.Email, hashCodigoRecuperacao(codigo), versao)
				if err == nil {
					err = tx.Commit()
				}
				if err != nil {
					responderErro(w, 503, "Nao foi possivel solicitar a confirmacao.")
					return
				}
				if !enviar(req.Email, req.Nome, codigo) {
					responderErro(w, 503, "Envio indisponivel. Seu e-mail anterior foi preservado.")
					return
				}
				responderJSON(w, 202, map[string]any{"email_pendente": true, "mensagem": "Confira o codigo enviado ao novo endereco. Seu e-mail atual permanece inalterado."})
				return
			}
			if len(req.Codigo) != 6 || !somenteDigitos(req.Codigo) {
				responderErro(w, 400, "Codigo invalido ou expirado.")
				return
			}
			var esperado string
			err = tx.QueryRowContext(ctx, `SELECT codigo_hash FROM alteracoes_email WHERE usuario_id=$1 AND novo_email=$2 AND versao_sessao=$3 AND confirmado_em IS NULL AND expira_em>CURRENT_TIMESTAMP AND tentativas<5 FOR UPDATE`, id, req.Email, versao).Scan(&esperado)
			if errors.Is(err, sql.ErrNoRows) {
				responderErro(w, 400, "Codigo invalido ou expirado.")
				return
			}
			if err != nil {
				responderErro(w, 503, "Nao foi possivel confirmar o endereco.")
				return
			}
			if subtle.ConstantTimeCompare([]byte(esperado), []byte(hashCodigoRecuperacao(req.Codigo))) != 1 {
				_, err = tx.ExecContext(ctx, `UPDATE alteracoes_email SET tentativas=tentativas+1 WHERE usuario_id=$1`, id)
				if err == nil {
					err = tx.Commit()
				}
				if err != nil {
					responderErro(w, 503, "Nao foi possivel validar o codigo.")
					return
				}
				responderErro(w, 400, "Codigo invalido ou expirado.")
				return
			}
			_, err = tx.ExecContext(ctx, `UPDATE alteracoes_email SET confirmado_em=CURRENT_TIMESTAMP WHERE usuario_id=$1`, id)
			if err == nil {
				_, err = tx.ExecContext(ctx, `UPDATE codigos_recuperacao_senha SET usado_em=CURRENT_TIMESTAMP WHERE usuario_id=$1 AND usado_em IS NULL`, id)
			}
			if err != nil {
				responderErro(w, 503, "Nao foi possivel confirmar o endereco.")
				return
			}
		}
		err = tx.QueryRowContext(ctx, `UPDATE usuarios SET nome=$1,email=$2,versao_sessao=versao_sessao+$3,atualizado_em=CURRENT_TIMESTAMP WHERE id=$4 RETURNING id,nome,email,perfil,ativo`, req.Nome, req.Email, boolInt(mudou), id).Scan(&u.ID, &u.Nome, &u.Email, &u.Perfil, &u.Ativo)
		if err != nil {
			responderErro(w, 409, "Nao foi possivel atualizar a conta. Verifique o endereco.")
			return
		}
		if err = tx.Commit(); err != nil {
			responderErro(w, 503, "Nao foi possivel atualizar a conta.")
			return
		}
		if mudou {
			responderJSON(w, 200, map[string]string{"codigo": "reautenticar", "mensagem": "E-mail confirmado. Entre novamente."})
			return
		}
		responderJSON(w, 200, u)
	}
}
func boolInt(v bool) int {
	if v {
		return 1
	}
	return 0
}
