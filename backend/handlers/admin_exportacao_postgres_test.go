package handlers

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/MarcosJose/quitai/auth"
	"github.com/golang-jwt/jwt/v5"
)

// Opt-in; uses only the dedicated fixture database, never loads .env or starts
// the application. Synthetic updates require a second explicit opt-in.
func TestExportacaoPostgresHTTPIsolado(t *testing.T) {
	dsn := os.Getenv("QUITAIA_EXPORTACAO_TEST_DSN")
	if dsn == "" {
		t.Skip("PostgreSQL exclusivo nao configurado: QUITAIA_EXPORTACAO_TEST_DSN")
	}
	u, err := url.Parse(dsn)
	if err != nil || u.Scheme != "postgres" || u.Path != "/quitai_exportacao_auditoria" || u.User == nil || u.User.Username() != "quitai_exportacao_auditoria" {
		t.Fatal("DSN recusada: destino nao autorizado")
	}
	socket := os.Getenv("QUITAIA_EXPORTACAO_SOCKET_AUDITORIA") == "1"
	if socket {
		if u.Host != "" || u.Query().Get("host") != "/var/run/postgresql" {
			t.Fatal("Socket exclusivo nao confirmado")
		}
	} else if u.Hostname() != "127.0.0.1" || u.Port() != "5548" {
		t.Fatal("Porta de fixture nao autorizada")
	}
	for k := range u.Query() {
		if k != "sslmode" && k != "connect_timeout" && !(socket && k == "host") {
			t.Fatal("opcao de conexao nao autorizada")
		}
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal("conexao de fixture indisponivel")
	}
	defer db.Close()
	db.SetMaxOpenConns(3)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	var banco, papel, versao string
	if err := db.QueryRowContext(ctx, "SELECT current_database(),current_user,current_setting('server_version')").Scan(&banco, &papel, &versao); err != nil {
		t.Fatal("identidade da fixture nao confirmada")
	}
	if banco != "quitai_exportacao_auditoria" || papel != "quitai_exportacao_auditoria" || !strings.HasPrefix(versao, "18.6") {
		t.Fatal("identidade de fixture divergente")
	}
	const segredo = "chave-somente-para-exportacao-local-descartavel-2026"
	t.Setenv("QUITAIA_JWT_SECRET", segredo)
	t.Setenv("FINANCIAL_ENVIRONMENT_ID", "fixture-exportacao-local-A")
	assinar := func(id int) string {
		token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, auth.Claims{UsuarioID: id, RegisteredClaims: jwt.RegisteredClaims{ExpiresAt: jwt.NewNumericDate(time.Now().Add(5 * time.Minute))}}).SignedString([]byte(segredo))
		if err != nil {
			t.Fatal("token sintetico indisponivel")
		}
		return token
	}
	admin := assinar(10)
	server := httptest.NewServer(AdminExportarDados(db))
	defer server.Close()
	client := &http.Client{Timeout: 25 * time.Second, Transport: &http.Transport{Proxy: nil}}
	defer client.CloseIdleConnections()
	solicitar := func(t *testing.T, token string) (int, []byte, http.Header) {
		req, _ := http.NewRequest("GET", server.URL+"/admin/relatorios/exportar", nil)
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		resp, err := client.Do(req)
		if err != nil {
			t.Fatal("HTTP local indisponivel")
		}
		defer resp.Body.Close()
		body, err := io.ReadAll(io.LimitReader(resp.Body, (20<<20)+1))
		if err != nil || len(body) > 20<<20 {
			t.Fatal("download invalido")
		}
		return resp.StatusCode, body, resp.Header
	}
	validar := func(t *testing.T, body []byte) conteudoExportacao {
		var arquivo arquivoExportacao
		if err := json.Unmarshal(body, &arquivo); err != nil {
			t.Fatal("JSON exportado invalido")
		}
		hash := sha256.Sum256([]byte(arquivo.ConteudoJSON))
		if arquivo.SHA256 != hex.EncodeToString(hash[:]) || arquivo.Formato != exportacaoFormato || arquivo.Versao != 1 {
			t.Fatal("integridade invalida")
		}
		var c conteudoExportacao
		if err := json.Unmarshal([]byte(arquivo.ConteudoJSON), &c); err != nil {
			t.Fatal("conteudo invalido")
		}
		if c.Ambiente != "fixture-exportacao-local-A" || len(c.Dados) != 7 {
			t.Fatal("origem ou categorias divergentes")
		}
		for _, tabela := range tabelasExportacao {
			if len(c.Dados[tabela.nome]) != 2 {
				t.Fatalf("contagem divergente: %s", tabela.nome)
			}
		}
		for _, termo := range []string{"senha_hash", "versao_sessao", "token_hash", "fixture-hash-que-nao-pode-sair", "Admin sintetico", "Admin bloqueado", "Admin revogado"} {
			if strings.Contains(arquivo.ConteudoJSON, termo) {
				t.Fatal("campo sensivel ou conta administrativa exportada")
			}
		}
		var vendas []struct {
			ID, UsuarioID, ClienteID int
			Total, ValorPago, Saldo  string
		}
		for _, raw := range c.Dados["vendas"] {
			var v struct {
				ID        int    `json:"id"`
				UsuarioID int    `json:"usuario_id"`
				ClienteID int    `json:"cliente_id"`
				Total     string `json:"total"`
				ValorPago string `json:"valor_pago"`
				Saldo     string `json:"saldo"`
			}
			if err := json.Unmarshal(raw, &v); err != nil {
				t.Fatal("decimal deixou de ser texto")
			}
			vendas = append(vendas, struct {
				ID, UsuarioID, ClienteID int
				Total, ValorPago, Saldo  string
			}{v.ID, v.UsuarioID, v.ClienteID, v.Total, v.ValorPago, v.Saldo})
		}
		if vendas[0].UsuarioID != 11 || vendas[0].ClienteID != 101 || vendas[0].Total != "179.80" || vendas[0].ValorPago != "40.00" || vendas[0].Saldo != "139.80" || vendas[1].UsuarioID != 12 || vendas[1].Total != "99999999.99" || vendas[1].ValorPago != "0.01" || vendas[1].Saldo != "99999999.98" {
			t.Fatal("relacionamentos ou precisao financeira divergentes")
		}
		return c
	}
	t.Run("admin_snapshot_hash_decimais", func(t *testing.T) {
		status, body, headers := solicitar(t, admin)
		if status != 200 || headers.Get("Cache-Control") != "no-store" || !strings.Contains(headers.Get("Content-Disposition"), "attachment") {
			t.Fatal("download protegido indisponivel")
		}
		validar(t, body)
	})
	for _, caso := range []struct {
		nome       string
		id, status int
	}{{"revendedora_A", 11, 403}, {"revendedora_B", 12, 403}, {"admin_bloqueado", 13, 403}, {"admin_revogado", 14, 401}, {"sem_token", 0, 401}} {
		t.Run(caso.nome, func(t *testing.T) {
			token := ""
			if caso.id != 0 {
				token = assinar(caso.id)
			}
			status, body, _ := solicitar(t, token)
			if status != caso.status || strings.Contains(string(body), "conteudo_json") {
				t.Fatal("negativa administrativa incorreta")
			}
		})
	}
	t.Run("sem_ambiente_falha_segura", func(t *testing.T) {
		t.Setenv("FINANCIAL_ENVIRONMENT_ID", "")
		status, body, headers := solicitar(t, admin)
		if status != 503 || headers.Get("Content-Disposition") != "" || strings.Contains(string(body), "conteudo_json") {
			t.Fatal("exportacao sem origem aceita")
		}
	})
	if os.Getenv("QUITAIA_EXPORTACAO_CONCORRENCIA") == "1" {
		t.Run("snapshot_consistente_durante_alteracoes_sinteticas", func(t *testing.T) {
			alterar := func(pago string) error {
				ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				defer cancel()
				tx, err := db.BeginTx(ctx, nil)
				if err != nil {
					return err
				}
				defer tx.Rollback()
				for _, query := range []string{
					"UPDATE vendas SET valor_pago=$1::numeric,saldo=total-$1::numeric WHERE id=301 AND usuario_id=11",
					"UPDATE parcelas SET valor_pago=$1::numeric WHERE id=501 AND venda_id=301",
					"UPDATE pagamentos SET valor=$1::numeric WHERE id=601 AND venda_id=301",
				} {
					if _, err := tx.ExecContext(ctx, query, pago); err != nil {
						return err
					}
				}
				return tx.Commit()
			}
			var escritos atomic.Int32
			parar, resultado := make(chan struct{}), make(chan error, 1)
			go func() {
				for i := 0; ; i++ {
					select {
					case <-parar:
						resultado <- nil
						return
					default:
					}
					pago := "40.00"
					if i%2 == 0 {
						pago = "41.00"
					}
					if err := alterar(pago); err != nil {
						resultado <- err
						return
					}
					escritos.Add(1)
					time.Sleep(time.Millisecond)
				}
			}()
			defer func() {
				close(parar)
				if err := <-resultado; err != nil {
					t.Error("falha na transacao sintetica")
				}
				if err := alterar("40.00"); err != nil {
					t.Error("fixture sintetica nao foi restaurada")
				}
			}()
			centavos := func(raw json.RawMessage, campo string) int64 {
				var registro map[string]json.RawMessage
				if err := json.Unmarshal(raw, &registro); err != nil {
					t.Fatal("registro invalido")
				}
				var valor string
				if err := json.Unmarshal(registro[campo], &valor); err != nil {
					t.Fatal("decimal nao e texto")
				}
				partes := strings.Split(valor, ".")
				if len(partes) != 2 || len(partes[1]) != 2 {
					t.Fatal("decimal fora do contrato")
				}
				v, err := strconv.ParseInt(partes[0]+partes[1], 10, 64)
				if err != nil {
					t.Fatal("centavos invalidos")
				}
				return v
			}
			for i := 0; i < 12; i++ {
				status, body, _ := solicitar(t, admin)
				if status != 200 {
					t.Fatal("snapshot HTTP indisponivel")
				}
				var arquivo arquivoExportacao
				if err := json.Unmarshal(body, &arquivo); err != nil {
					t.Fatal(err)
				}
				hash := sha256.Sum256([]byte(arquivo.ConteudoJSON))
				if arquivo.SHA256 != hex.EncodeToString(hash[:]) {
					t.Fatal("hash divergente")
				}
				var c conteudoExportacao
				if err := json.Unmarshal([]byte(arquivo.ConteudoJSON), &c); err != nil {
					t.Fatal(err)
				}
				pago := centavos(c.Dados["vendas"][0], "valor_pago")
				if pago != centavos(c.Dados["parcelas"][0], "valor_pago") || pago != centavos(c.Dados["pagamentos"][0], "valor") || centavos(c.Dados["vendas"][0], "saldo")+pago != 17980 {
					t.Fatal("snapshot mistura transacoes")
				}
			}
			if escritos.Load() == 0 {
				t.Fatal("nao houve concorrencia efetiva")
			}
		})
	}
}
