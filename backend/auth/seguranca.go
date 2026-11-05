package auth

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"github.com/golang-jwt/jwt/v5"
	"io"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

type claimsKey struct{}

func lerJSON(w http.ResponseWriter, r *http.Request, v any) error {
	d := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16*1024))
	d.DisallowUnknownFields()
	if err := d.Decode(v); err != nil {
		return err
	}
	var extra any
	if err := d.Decode(&extra); err != io.EOF {
		return errors.New("JSON invalido")
	}
	return nil
}

// Politica compartilhada: nao modifica as senhas existentes no login.
func SenhaValida(s string) bool { return len(s) >= 8 && len(s) <= 72 }
func hashPrivado(s string) string {
	h := hmac.New(sha256.New, []byte(jwtSecret()))
	h.Write([]byte(s))
	return hex.EncodeToString(h.Sum(nil))
}
func hashToken(r *http.Request) string {
	h := sha256.Sum256([]byte(strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(r.Header.Get("Authorization")), "Bearer "))))
	return hex.EncodeToString(h[:])
}
func redesProxy() ([]*net.IPNet, error) {
	valor := strings.TrimSpace(os.Getenv("AUTH_TRUSTED_PROXY_CIDRS"))
	if valor == "" {
		return nil, nil
	}
	partes := strings.Split(valor, ",")
	if len(partes) > 32 {
		return nil, errors.New("lista de proxies excessiva")
	}
	redes := make([]*net.IPNet, 0, len(partes))
	for _, p := range partes {
		_, rede, err := net.ParseCIDR(strings.TrimSpace(p))
		if err != nil {
			return nil, errors.New("CIDR de proxy invalido")
		}
		bits, _ := rede.Mask.Size()
		if bits == 0 {
			return nil, errors.New("nao e permitido confiar em toda a internet")
		}
		redes = append(redes, rede)
	}
	return redes, nil
}
func origem(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	peer := net.ParseIP(host)
	if peer == nil {
		return "origem-invalida"
	}
	redes, err := redesProxy()
	confiavel := func(ip net.IP) bool {
		for _, rede := range redes {
			if rede.Contains(ip) {
				return true
			}
		}
		return false
	}
	// Walk from the actual peer towards the client; leftmost spoofed hops are ignored.
	if err == nil && confiavel(peer) {
		cadeia := r.Header.Get("X-Forwarded-For")
		if len(cadeia) <= 2048 && cadeia != "" {
			partes := strings.Split(cadeia, ",")
			if len(partes) <= 20 {
				for i := len(partes) - 1; i >= 0; i-- {
					if !confiavel(peer) {
						break
					}
					anterior := net.ParseIP(strings.TrimSpace(partes[i]))
					if anterior == nil {
						break
					}
					peer = anterior
				}
			}
		}
	}
	if v4 := peer.To4(); v4 != nil {
		return v4.String()
	}
	return peer.Mask(net.CIDRMask(64, 128)).String() + "/64"
}

func limitar(db *sql.DB, w http.ResponseWriter, r *http.Request, acao, conta string) bool {
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	for _, l := range []struct {
		k string
		n int
	}{{acao + ":origem:" + origem(r), 60}, {acao + ":conta:" + normalizarEmail(conta), 10}} {
		if acao == "recuperar" {
			if strings.Contains(l.k, ":origem:") {
				l.n = 15
			} else {
				l.n = 3
			}
		}
		var n int
		err := db.QueryRowContext(ctx, `INSERT INTO limites_autenticacao(escopo,janela,tentativas,expira_em)
   VALUES($1,floor(extract(epoch FROM CURRENT_TIMESTAMP)/900)::bigint,1,CURRENT_TIMESTAMP+interval '30 minutes')
   ON CONFLICT(escopo,janela) DO UPDATE SET tentativas=limites_autenticacao.tentativas+1
   WHERE limites_autenticacao.tentativas<$2 RETURNING tentativas`, hashPrivado(l.k), l.n).Scan(&n)
		if errors.Is(err, sql.ErrNoRows) {
			w.Header().Set("Retry-After", "900")
			responderErro(w, 429, "Muitas tentativas. Aguarde antes de tentar novamente.")
			return false
		}
		if err != nil {
			responderErro(w, 503, "Nao foi possivel validar o acesso agora.")
			return false
		}
	}
	return true
}

var trabalhoSenha = make(chan struct{}, 4)

func ocuparSenha() bool {
	select {
	case trabalhoSenha <- struct{}{}:
		return true
	default:
		return false
	}
}
func liberarSenha() { <-trabalhoSenha }

// Persistente; tokens anteriores ao versionamento equivalem a versao zero.
// Troca/recuperacao incrementa a versao, inclusive para invalidar esses tokens.
func validarSessaoDB(db *sql.DB, r *http.Request) (bool, error) {
	c, ok := r.Context().Value(claimsKey{}).(*Claims)
	if !ok {
		return false, nil
	}
	var valida bool
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	err := db.QueryRowContext(ctx, `SELECT versao_sessao=$2 AND NOT EXISTS(SELECT 1 FROM sessoes_revogadas WHERE token_hash=$3 AND usuario_id=$1) FROM usuarios WHERE id=$1`, c.UsuarioID, c.VersaoSessao, hashToken(r)).Scan(&valida)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	return valida, err
}
func SessaoPersistenteValida(db *sql.DB, r *http.Request) bool {
	valida := false
	AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		ok, err := validarSessaoDB(db, req)
		valida = ok && err == nil
	})).ServeHTTP(&respostaDescartada{h: make(http.Header)}, r)
	return valida
}

type respostaDescartada struct{ h http.Header }

func (w *respostaDescartada) Header() http.Header         { return w.h }
func (w *respostaDescartada) Write(b []byte) (int, error) { return len(b), nil }
func (w *respostaDescartada) WriteHeader(int)             {}
func Logout(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			responderErro(w, 405, "Metodo nao permitido.")
			return
		}
		c, ok := r.Context().Value(claimsKey{}).(*Claims)
		if !ok || c.ExpiresAt == nil {
			responderErro(w, 401, "Sessao invalida.")
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
		defer cancel()
		_, err := db.ExecContext(ctx, `INSERT INTO sessoes_revogadas(token_hash,usuario_id,expira_em) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`, hashToken(r), c.UsuarioID, c.ExpiresAt.Time)
		if err != nil {
			responderErro(w, 503, "Nao foi possivel encerrar a sessao no servidor. Tente novamente.")
			return
		}
		w.WriteHeader(204)
	}
}
func ValidarEsquema(db *sql.DB) error {
	if _, err := redesProxy(); err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	rows, err := db.QueryContext(ctx, `SELECT u.versao_sessao,s.token_hash,l.escopo,e.novo_email FROM usuarios u LEFT JOIN sessoes_revogadas s ON false LEFT JOIN limites_autenticacao l ON false LEFT JOIN alteracoes_email e ON false LIMIT 0`)
	if err != nil {
		return errors.New("esquema de autenticacao ausente: aplique a migracao 010 antes de iniciar")
	}
	return rows.Close()
}
func tokenComVersao(u UsuarioResponse, versao int64) (string, error) {
	agora := time.Now()
	id, err := gerarSegredoAleatorio()
	if err != nil {
		return "", err
	}
	c := Claims{UsuarioID: u.ID, Email: u.Email, VersaoSessao: versao, RegisteredClaims: jwt.RegisteredClaims{ID: id, Subject: strconv.Itoa(u.ID), ExpiresAt: jwt.NewNumericDate(agora.Add(24 * time.Hour)), IssuedAt: jwt.NewNumericDate(agora), NotBefore: jwt.NewNumericDate(agora)}}
	if jwtSecret() == "" {
		return "", errors.New("JWT indisponivel")
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, c).SignedString([]byte(jwtSecret()))
}

func EmailValido(email string) bool { return len(email) <= 254 && emailValido(normalizarEmail(email)) }
