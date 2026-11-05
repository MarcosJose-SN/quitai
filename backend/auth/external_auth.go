package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"crypto/tls"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"log"
	"net"
	"net/http"
	"net/smtp"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

const (
	resetCodeMinutes = 15
	maxResetAttempts = 5
)

// InicializarRecuperacao cria a tabela de códigos de recuperação, se necessário.
// Pode ser chamada na inicialização do servidor.
func InicializarRecuperacao(db *sql.DB) error {
	const query = `
	CREATE TABLE IF NOT EXISTS codigos_recuperacao_senha (
		id BIGSERIAL PRIMARY KEY,
		usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
		codigo_hash CHAR(64) NOT NULL,
		expira_em TIMESTAMPTZ NOT NULL,
		usado_em TIMESTAMPTZ,
		tentativas INTEGER NOT NULL DEFAULT 0,
		criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
	);
	CREATE INDEX IF NOT EXISTS idx_codigos_recuperacao_usuario
		ON codigos_recuperacao_senha(usuario_id);
	CREATE INDEX IF NOT EXISTS idx_codigos_recuperacao_expira
		ON codigos_recuperacao_senha(expira_em);`
	_, err := db.Exec(query)
	return err
}

type solicitarRecuperacaoRequest struct {
	Email string `json:"email"`
}

type redefinirSenhaRequest struct {
	Email     string `json:"email"`
	Codigo    string `json:"codigo"`
	NovaSenha string `json:"nova_senha"`
}

type googleLoginRequest struct {
	Credential string `json:"credential"`
}

type googleTokenInfo struct {
	Audience      string `json:"aud"`
	Subject       string `json:"sub"`
	Email         string `json:"email"`
	EmailVerified string `json:"email_verified"`
	Name          string `json:"name"`
	ExpiresIn     string `json:"expires_in"`
}

// SolicitarRecuperacao envia um código temporário para o e-mail cadastrado.
// A resposta não revela se o e-mail existe.
const mensagemRecuperacao = "Se o e-mail estiver cadastrado, voce recebera um codigo de recuperacao."

func respostaRecuperacao(w http.ResponseWriter) {
	responderJSON(w, 200, map[string]string{"mensagem": mensagemRecuperacao})
}
func SolicitarRecuperacao(db *sql.DB) http.HandlerFunc { return solicitarRecuperacao(db, agendarEmail) }
func solicitarRecuperacao(db *sql.DB, enviar func(string, string, string) bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			responderErro(w, 405, "Metodo nao permitido.")
			return
		}
		var req solicitarRecuperacaoRequest
		if lerJSON(w, r, &req) != nil {
			responderErro(w, 400, "Dados invalidos.")
			return
		}
		email := normalizarEmail(req.Email)
		if len(email) > 254 || !emailValido(email) {
			responderErro(w, 400, "Informe um e-mail valido.")
			return
		}
		if !limitar(db, w, r, "recuperar", email) {
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()
		tx, err := db.BeginTx(ctx, nil)
		if err != nil {
			responderErro(w, 503, "Nao foi possivel solicitar a recuperacao agora.")
			return
		}
		defer tx.Rollback()
		var id int
		var nome string
		err = tx.QueryRowContext(ctx, `SELECT id,nome FROM usuarios WHERE LOWER(email)=$1 AND ativo=TRUE FOR UPDATE`, email).Scan(&id, &nome)
		if errors.Is(err, sql.ErrNoRows) {
			respostaRecuperacao(w)
			return
		}
		if err != nil {
			responderErro(w, 503, "Nao foi possivel solicitar a recuperacao agora.")
			return
		}
		var recente bool
		err = tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM codigos_recuperacao_senha WHERE usuario_id=$1 AND criado_em>CURRENT_TIMESTAMP-interval '60 seconds')`, id).Scan(&recente)
		if err != nil {
			responderErro(w, 503, "Nao foi possivel solicitar a recuperacao agora.")
			return
		}
		if recente {
			respostaRecuperacao(w)
			return
		}
		codigo, err := gerarCodigoNumerico()
		if err != nil {
			responderErro(w, 503, "Nao foi possivel solicitar a recuperacao agora.")
			return
		}
		_, err = tx.ExecContext(ctx, `UPDATE codigos_recuperacao_senha SET usado_em=CURRENT_TIMESTAMP WHERE usuario_id=$1 AND usado_em IS NULL`, id)
		if err == nil {
			_, err = tx.ExecContext(ctx, `INSERT INTO codigos_recuperacao_senha(usuario_id,codigo_hash,expira_em) VALUES($1,$2,CURRENT_TIMESTAMP+interval '15 minutes')`, id, hashCodigoRecuperacao(codigo))
		}
		if err != nil {
			responderErro(w, 503, "Nao foi possivel solicitar a recuperacao agora.")
			return
		}
		if err = tx.Commit(); err != nil {
			responderErro(w, 503, "Nao foi possivel solicitar a recuperacao agora.")
			return
		}
		enviar(email, nome, codigo) // bounded asynchronous SMTP; public response never depends on delivery.
		respostaRecuperacao(w)
	}
}
func RedefinirSenha(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			responderErro(w, 405, "Metodo nao permitido.")
			return
		}
		var req redefinirSenhaRequest
		if lerJSON(w, r, &req) != nil {
			responderErro(w, 400, "Dados invalidos.")
			return
		}
		email := normalizarEmail(req.Email)
		codigo := strings.TrimSpace(req.Codigo)
		if len(email) > 254 || !emailValido(email) || len(codigo) != 6 || !somenteDigitos(codigo) || !SenhaValida(req.NovaSenha) {
			responderErro(w, 400, "Informe email, codigo e senha de 8 a 72 bytes.")
			return
		}
		if !limitar(db, w, r, "verificar", email) {
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
		defer cancel()
		tx, err := db.BeginTx(ctx, nil)
		if err != nil {
			responderErro(w, 503, "Nao foi possivel validar a recuperacao.")
			return
		}
		defer tx.Rollback()
		var id int
		err = tx.QueryRowContext(ctx, `SELECT id FROM usuarios WHERE LOWER(email)=$1 AND ativo=TRUE FOR UPDATE`, email).Scan(&id)
		if errors.Is(err, sql.ErrNoRows) {
			responderErro(w, 400, "Codigo invalido ou expirado.")
			return
		}
		if err != nil {
			responderErro(w, 503, "Nao foi possivel validar a recuperacao.")
			return
		}
		var codigoID int64
		var hash string
		err = tx.QueryRowContext(ctx, `SELECT id,codigo_hash FROM codigos_recuperacao_senha WHERE usuario_id=$1 AND usado_em IS NULL AND expira_em>CURRENT_TIMESTAMP AND tentativas<5 ORDER BY criado_em DESC,id DESC LIMIT 1 FOR UPDATE`, id).Scan(&codigoID, &hash)
		if errors.Is(err, sql.ErrNoRows) {
			responderErro(w, 400, "Codigo invalido ou expirado.")
			return
		}
		if err != nil {
			responderErro(w, 503, "Nao foi possivel validar a recuperacao.")
			return
		}
		if subtle.ConstantTimeCompare([]byte(hash), []byte(hashCodigoRecuperacao(codigo))) != 1 {
			result, e := tx.ExecContext(ctx, `UPDATE codigos_recuperacao_senha SET tentativas=tentativas+1 WHERE id=$1`, codigoID)
			if e == nil {
				var n int64
				n, e = result.RowsAffected()
				if e == nil && n != 1 {
					e = errors.New("tentativa nao contabilizada")
				}
			}
			if e == nil {
				e = tx.Commit()
			}
			if e != nil {
				responderErro(w, 503, "Nao foi possivel validar a recuperacao.")
				return
			}
			responderErro(w, 400, "Codigo invalido ou expirado.")
			return
		}
		if !ocuparSenha() {
			responderErro(w, 503, "Tente novamente em instantes.")
			return
		}
		defer liberarSenha()
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
			responderErro(w, 503, "Nao foi possivel concluir a recuperacao.")
			return
		}
		responderJSON(w, 200, map[string]string{"mensagem": "Senha redefinida. Entre novamente com a nova senha."})
	}
}

// LoginGoogle valida no servidor a credencial emitida pelo Google Identity Services.
func LoginGoogle(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			responderErro(w, http.StatusMethodNotAllowed, "Método não permitido.")
			return
		}

		var req googleLoginRequest
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 32*1024)).Decode(&req); err != nil {
			responderErro(w, http.StatusBadRequest, "Dados inválidos.")
			return
		}

		credential := strings.TrimSpace(req.Credential)
		if credential == "" {
			responderErro(w, http.StatusBadRequest, "Credencial do Google não informada.")
			return
		}

		info, err := validarCredencialGoogle(r.Context(), credential)
		if err != nil {
			responderErro(w, http.StatusUnauthorized, "Não foi possível validar sua conta Google.")
			return
		}

		email := normalizarEmail(info.Email)
		var usuario UsuarioResponse

		err = db.QueryRow(`
SELECT id, nome, email, perfil, ativo
FROM usuarios
WHERE LOWER(email) = LOWER($1)
`, email).Scan(
			&usuario.ID,
			&usuario.Nome,
			&usuario.Email,
			&usuario.Perfil,
			&usuario.Ativo,
		)

		if err == sql.ErrNoRows {
			responderErro(w, http.StatusForbidden, "Conta não cadastrada. Solicite acesso ao administrador.")
			return
		}
		if err != nil {
			responderErro(w, http.StatusInternalServerError, "Não foi possível acessar sua conta.")
			return
		}
		if !usuario.Ativo {
			responderErro(w, http.StatusForbidden, "Esta conta está bloqueada.")
			return
		}

		token, err := gerarToken(usuario)
		if err != nil {
			responderErro(w, http.StatusInternalServerError, "Não foi possível iniciar sua sessão.")
			return
		}

		responderJSON(w, http.StatusOK, authResponse{
			Token:   token,
			Usuario: usuario,
		})
	}
}
func validarCredencialGoogle(ctx context.Context, credential string) (googleTokenInfo, error) {
	client := &http.Client{Timeout: 8 * time.Second}
	endpoint := "https://oauth2.googleapis.com/tokeninfo?id_token=" + url.QueryEscape(credential)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return googleTokenInfo{}, err
	}
	resp, err := client.Do(req)
	if err != nil {
		return googleTokenInfo{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return googleTokenInfo{}, errors.New("token Google recusado")
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	if err != nil {
		return googleTokenInfo{}, err
	}
	var info googleTokenInfo
	if err := json.Unmarshal(body, &info); err != nil {
		return googleTokenInfo{}, err
	}

	clientID := strings.TrimSpace(os.Getenv("GOOGLE_CLIENT_ID"))
	if clientID == "" || info.Audience != clientID || info.Subject == "" ||
		!emailValido(normalizarEmail(info.Email)) ||
		(info.EmailVerified != "true" && info.EmailVerified != "1") {
		return googleTokenInfo{}, errors.New("token Google inválido")
	}
	expiraEm, err := strconv.ParseInt(info.ExpiresIn, 10, 64)
	if err != nil || expiraEm <= 0 {
		return googleTokenInfo{}, errors.New("token Google expirado")
	}
	return info, nil
}

var filaEmail = make(chan struct{}, 4)

func agendarEmail(destinatario, nome, codigo string) bool {
	select {
	case filaEmail <- struct{}{}:
	default:
		return false
	}
	go func() {
		defer func() { <-filaEmail }()
		if enviarCodigoGmail(destinatario, nome, codigo) != nil {
			log.Print("Envio de codigo indisponivel; verificar SMTP (dados omitidos).")
		}
	}()
	return true
}
func enviarCodigoGmail(destinatario, nome, codigo string) error {
	remetente := strings.TrimSpace(os.Getenv("GMAIL_EMAIL"))
	senha := strings.TrimSpace(os.Getenv("GMAIL_APP_PASSWORD"))
	if remetente == "" || senha == "" {
		return errors.New("SMTP indisponivel")
	}
	if strings.ContainsAny(remetente+destinatario, "\r\n") {
		return errors.New("endereco invalido")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	conn, err := (&net.Dialer{}).DialContext(ctx, "tcp", "smtp.gmail.com:587")
	if err != nil {
		return errors.New("SMTP indisponivel")
	}
	defer conn.Close()
	deadline, _ := ctx.Deadline()
	conn.SetDeadline(deadline)
	c, err := smtp.NewClient(conn, "smtp.gmail.com")
	if err != nil {
		return errors.New("SMTP indisponivel")
	}
	defer c.Close()
	if err = c.StartTLS(&tls.Config{ServerName: "smtp.gmail.com", MinVersion: tls.VersionTLS12}); err != nil {
		return errors.New("TLS SMTP indisponivel")
	}
	if err = c.Auth(smtp.PlainAuth("", remetente, strings.ReplaceAll(senha, " ", ""), "smtp.gmail.com")); err != nil {
		return errors.New("SMTP indisponivel")
	}
	if err = c.Mail(remetente); err != nil {
		return errors.New("SMTP indisponivel")
	}
	if err = c.Rcpt(destinatario); err != nil {
		return errors.New("SMTP indisponivel")
	}
	out, err := c.Data()
	if err != nil {
		return errors.New("SMTP indisponivel")
	}
	mensagem := "From: QuitaAi <" + remetente + ">\r\nTo: " + destinatario + "\r\nSubject: Codigo de seguranca do QuitaAi\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\nOla, " + html.EscapeString(nome) + "! Seu codigo de seguranca e: " + codigo + ". Expira em 15 minutos. Se voce nao solicitou, ignore esta mensagem.\r\n"
	if _, err = io.WriteString(out, mensagem); err != nil {
		return errors.New("SMTP indisponivel")
	}
	if err = out.Close(); err != nil {
		return errors.New("SMTP indisponivel")
	}
	return c.Quit()
}

func gerarCodigoNumerico() (string, error) {
	b := make([]byte, 4)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	valor := (uint32(b[0])<<24 | uint32(b[1])<<16 | uint32(b[2])<<8 | uint32(b[3])) % 1000000
	return fmt.Sprintf("%06d", valor), nil
}

func gerarSegredoAleatorio() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func hashCodigoRecuperacao(codigo string) string {
	// Hash SHA-256 do código de curta duração; não armazena o código em texto puro.
	hash := sha256.Sum256([]byte(codigo))
	return hex.EncodeToString(hash[:])
}

func somenteDigitos(valor string) bool {
	for _, r := range valor {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}
