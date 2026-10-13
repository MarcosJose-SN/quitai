package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
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
func SolicitarRecuperacao(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			responderErro(w, http.StatusMethodNotAllowed, "Método não permitido.")
			return
		}

		var req solicitarRecuperacaoRequest
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16*1024)).Decode(&req); err != nil {
			responderErro(w, http.StatusBadRequest, "Dados inválidos.")
			return
		}

		email := normalizarEmail(req.Email)
		if !emailValido(email) {
			responderErro(w, http.StatusBadRequest, "Informe um e-mail válido.")
			return
		}

		var usuarioID int
		var nome string
		err := db.QueryRow(
			`SELECT id, nome FROM usuarios WHERE LOWER(email) = LOWER($1)`,
			email,
		).Scan(&usuarioID, &nome)

		// Mantém a mesma resposta para e-mail existente ou inexistente.
		if err == sql.ErrNoRows {
			responderJSON(w, http.StatusOK, map[string]string{
				"mensagem": "Se o e-mail estiver cadastrado, você receberá um código de recuperação.",
			})
			return
		}
		if err != nil {
			responderErro(w, http.StatusInternalServerError, "Não foi possível solicitar a recuperação agora.")
			return
		}

		codigo, err := gerarCodigoNumerico()
		if err != nil {
			responderErro(w, http.StatusInternalServerError, "Não foi possível gerar o código.")
			return
		}

		hash := hashCodigoRecuperacao(codigo)
		tx, err := db.Begin()
		if err != nil {
			responderErro(w, http.StatusInternalServerError, "Não foi possível iniciar a recuperação.")
			return
		}
		defer tx.Rollback()

		if _, err = tx.Exec(
			`UPDATE codigos_recuperacao_senha
			 SET usado_em = CURRENT_TIMESTAMP
			 WHERE usuario_id = $1 AND usado_em IS NULL`,
			usuarioID,
		); err != nil {
			responderErro(w, http.StatusInternalServerError, "Não foi possível gerar a recuperação.")
			return
		}

		_, err = tx.Exec(
			`INSERT INTO codigos_recuperacao_senha (usuario_id, codigo_hash, expira_em)
			 VALUES ($1, $2, $3)`,
			usuarioID, hash, time.Now().Add(resetCodeMinutes*time.Minute),
		)
		if err != nil {
			responderErro(w, http.StatusInternalServerError, "Não foi possível gerar a recuperação.")
			return
		}
		if err = tx.Commit(); err != nil {
			responderErro(w, http.StatusInternalServerError, "Não foi possível salvar a recuperação.")
			return
		}

		if err := enviarCodigoGmail(email, nome, codigo); err != nil {
			// Invalida o código caso o envio falhe.
			_, _ = db.Exec(
				`UPDATE codigos_recuperacao_senha
				 SET usado_em = CURRENT_TIMESTAMP
				 WHERE usuario_id = $1 AND codigo_hash = $2 AND usado_em IS NULL`,
				usuarioID, hash,
			)
			responderErro(w, http.StatusServiceUnavailable, "Não foi possível enviar o e-mail. Confira a configuração do Gmail e tente novamente.")
			return
		}

		responderJSON(w, http.StatusOK, map[string]string{
			"mensagem": "Se o e-mail estiver cadastrado, você receberá um código de recuperação.",
		})
	}
}

// RedefinirSenha valida o código temporário e grava a nova senha com bcrypt.
func RedefinirSenha(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			responderErro(w, http.StatusMethodNotAllowed, "Método não permitido.")
			return
		}

		var req redefinirSenhaRequest
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16*1024)).Decode(&req); err != nil {
			responderErro(w, http.StatusBadRequest, "Dados inválidos.")
			return
		}

		email := normalizarEmail(req.Email)
		codigo := strings.TrimSpace(req.Codigo)
		if !emailValido(email) || len(codigo) != 6 || !somenteDigitos(codigo) {
			responderErro(w, http.StatusBadRequest, "Informe o e-mail e o código de 6 dígitos.")
			return
		}
		if len(req.NovaSenha) < 6 || len(req.NovaSenha) > 72 {
			responderErro(w, http.StatusBadRequest, "A nova senha deve ter entre 6 e 72 bytes.")
			return
		}

		hashSenha, err := bcrypt.GenerateFromPassword([]byte(req.NovaSenha), bcrypt.DefaultCost)
		if err != nil {
			responderErro(w, http.StatusInternalServerError, "Não foi possível proteger a nova senha.")
			return
		}

		tx, err := db.Begin()
		if err != nil {
			responderErro(w, http.StatusInternalServerError, "Não foi possível iniciar a redefinição.")
			return
		}
		defer tx.Rollback()

		var usuarioID int
		var codigoHash string
		var codigoID int64
		err = tx.QueryRow(`
			SELECT c.id, c.usuario_id, c.codigo_hash
			FROM codigos_recuperacao_senha c
			JOIN usuarios u ON u.id = c.usuario_id
			WHERE LOWER(u.email) = LOWER($1)
			  AND c.usado_em IS NULL
			  AND c.expira_em > CURRENT_TIMESTAMP
			  AND c.tentativas < $2
			ORDER BY c.criado_em DESC
			LIMIT 1
			FOR UPDATE OF c
		`, email, maxResetAttempts).Scan(&codigoID, &usuarioID, &codigoHash)
		if err == sql.ErrNoRows {
			responderErro(w, http.StatusBadRequest, "Código inválido ou expirado. Solicite um novo código.")
			return
		}
		if err != nil {
			responderErro(w, http.StatusInternalServerError, "Não foi possível validar o código.")
			return
		}

		fornecido := hashCodigoRecuperacao(codigo)
		if subtle.ConstantTimeCompare([]byte(codigoHash), []byte(fornecido)) != 1 {
			_, _ = tx.Exec(
				`UPDATE codigos_recuperacao_senha SET tentativas = tentativas + 1 WHERE id = $1`,
				codigoID,
			)
			_ = tx.Commit()
			responderErro(w, http.StatusBadRequest, "Código inválido ou expirado. Solicite um novo código.")
			return
		}

		resultado, err := tx.Exec(
			`UPDATE usuarios SET senha_hash = $1, atualizado_em = CURRENT_TIMESTAMP WHERE id = $2`,
			string(hashSenha), usuarioID,
		)
		if err != nil {
			responderErro(w, http.StatusInternalServerError, "Não foi possível atualizar a senha.")
			return
		}
		afetadas, err := resultado.RowsAffected()
		if err != nil || afetadas != 1 {
			responderErro(w, http.StatusInternalServerError, "Não foi possível atualizar a senha.")
			return
		}

		if _, err = tx.Exec(
			`UPDATE codigos_recuperacao_senha SET usado_em = CURRENT_TIMESTAMP WHERE usuario_id = $1 AND usado_em IS NULL`,
			usuarioID,
		); err != nil {
			responderErro(w, http.StatusInternalServerError, "Não foi possível concluir a redefinição.")
			return
		}

		if err = tx.Commit(); err != nil {
			responderErro(w, http.StatusInternalServerError, "Não foi possível concluir a redefinição.")
			return
		}

		responderJSON(w, http.StatusOK, map[string]string{
			"mensagem": "Senha redefinida com sucesso. Entre com sua nova senha.",
		})
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
		err = db.QueryRow(
			`SELECT id, nome, email FROM usuarios WHERE LOWER(email) = LOWER($1)`,
			email,
		).Scan(&usuario.ID, &usuario.Nome, &usuario.Email)

		if err == sql.ErrNoRows {
			nome := strings.TrimSpace(info.Name)
			if nome == "" {
				nome = email
			}
			// Usuários Google recebem uma senha aleatória desconhecida por eles.
			senhaAleatoria, genErr := gerarSegredoAleatorio()
			if genErr != nil {
				responderErro(w, http.StatusInternalServerError, "Não foi possível criar a conta.")
				return
			}
			hashSenha, hashErr := bcrypt.GenerateFromPassword([]byte(senhaAleatoria), bcrypt.DefaultCost)
			if hashErr != nil {
				responderErro(w, http.StatusInternalServerError, "Não foi possível proteger a conta.")
				return
			}
			err = db.QueryRow(`
				INSERT INTO usuarios (nome, email, senha_hash)
				VALUES ($1, $2, $3)
				RETURNING id, nome, email
			`, nome, email, string(hashSenha)).Scan(&usuario.ID, &usuario.Nome, &usuario.Email)
		}

		if err != nil {
			responderErro(w, http.StatusInternalServerError, "Não foi possível acessar sua conta.")
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

func enviarCodigoGmail(destinatario, nome, codigo string) error {
	remetente := strings.TrimSpace(os.Getenv("GMAIL_EMAIL"))
	senhaApp := strings.TrimSpace(os.Getenv("GMAIL_APP_PASSWORD"))
	if remetente == "" || senhaApp == "" {
		return errors.New("GMAIL_EMAIL e GMAIL_APP_PASSWORD precisam estar configurados")
	}

	host := "smtp.gmail.com"
	endereco := host + ":587"
	authSMTP := smtp.PlainAuth("", remetente, strings.ReplaceAll(senhaApp, " ", ""), host)
	nomeSeguro := html.EscapeString(nome)
	assunto := "Seu código de recuperação do QuitaAí"
	corpo := fmt.Sprintf(
		"Olá, %s!\r\n\r\nSeu código de recuperação do QuitaAí é: %s\r\n\r\nEle expira em %d minutos. Se você não solicitou essa alteração, ignore este e-mail.\r\n",
		nomeSeguro, codigo, resetCodeMinutes,
	)
	mensagem := "From: QuitaAí <" + remetente + ">\r\n" +
		"To: " + destinatario + "\r\n" +
		"Subject: " + assunto + "\r\n" +
		"MIME-Version: 1.0\r\n" +
		"Content-Type: text/plain; charset=UTF-8\r\n\r\n" + corpo

	return smtp.SendMail(endereco, authSMTP, remetente, []string{destinatario}, []byte(mensagem))
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
