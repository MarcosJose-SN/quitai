package handlers

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"github.com/MarcosJose/quitai/auth"
	"github.com/golang-jwt/jwt/v5"
	_ "github.com/lib/pq"
	"io"
	"math"
	"math/big"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

type bancoFinanceiroTeste struct {
	db       *sql.DB
	servidor *httptest.Server
	tokens   map[int]string
	t        *testing.T
}
type respostaFT struct {
	codigo int
	corpo  []byte
}

func novoBancoFinanceiroTeste(t *testing.T) *bancoFinanceiroTeste {
	t.Helper()
	dsn := os.Getenv("QUITAIA_FINANCEIRO_TEST_DSN")
	if dsn == "" {
		t.Skip("PostgreSQL descartavel nao configurado: QUITAIA_FINANCEIRO_TEST_DSN")
	}
	u, err := url.Parse(dsn)
	if err != nil || u.Hostname() != "127.0.0.1" || u.Port() != "5547" || u.Path != "/quitai_financeiro_test" {
		t.Fatal("Teste recusou destino diferente do PostgreSQL descartavel autorizado")
	}
	raiz, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer raiz.Close()
	schema := fmt.Sprintf("fin_%d", time.Now().UnixNano())
	if _, err = raiz.Exec("CREATE SCHEMA " + schema); err != nil {
		t.Fatal(err)
	}
	q := u.Query()
	q.Set("search_path", schema)
	q.Set("statement_timeout", "10000")
	q.Set("lock_timeout", "5000")
	u.RawQuery = q.Encode()
	db, err := sql.Open("postgres", u.String())
	if err != nil {
		t.Fatal(err)
	}
	db.SetMaxOpenConns(20)
	t.Cleanup(func() { db.Close() })
	b, err := os.ReadFile(filepath.Join("..", "database", "bootstrap", "001_schema_inicial.sql"))
	if err != nil {
		t.Fatal(err)
	}
	if corte := strings.Index(string(b), "-- Controle financeiro persistente"); corte >= 0 {
		b = b[:corte]
	}
	if _, err = db.Exec(string(b)); err != nil {
		t.Fatal(err)
	}
	// Run the additive migration twice to verify upgrades and safe re-execution.
	b, err = os.ReadFile(filepath.Join("..", "database", "migrations", "009_operacoes_financeiras.sql"))
	if err != nil {
		t.Fatal(err)
	}
	for range 2 {
		if _, err = db.Exec(string(b)); err != nil {
			t.Fatal(err)
		}
	}
	b, err = os.ReadFile(filepath.Join("..", "database", "migrations", "010_seguranca_autenticacao.sql"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(string(b)); err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`INSERT INTO usuarios(id,nome,email,senha_hash,perfil,ativo) VALUES(1,'Fixture A','a@example.invalid','fixture-nao-utilizada','revendedora',true),(2,'Fixture B','b@example.invalid','fixture-nao-utilizada','revendedora',true),(3,'Fixture Admin','admin@example.invalid','fixture-nao-utilizada','admin',true);
 INSERT INTO clientes(id,nome,usuario_id) VALUES(1,'Cliente A',1),(2,'Cliente B',2);
 INSERT INTO produtos(id,nome,codigo,preco_custo,preco_venda,estoque,usuario_id) VALUES(1,'Produto A','A',1,10.01,10,1),(2,'Produto B','B',1,5.02,10,1),(3,'Produto C','C',1,7,10,2);`)
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("QUITAIA_JWT_SECRET", chaveTesteFoto)
	h := &bancoFinanceiroTeste{db: db, t: t, tokens: map[int]string{1: tokenTesteFoto(t, 1), 2: tokenTesteFoto(t, 2), 3: tokenTesteFoto(t, 3)}}
	mux := http.NewServeMux()
	mux.Handle("/vendas/completa", auth.AuthMiddlewareComDB(db, CriarVendaCompleta(db)))
	mux.Handle("/pagamentos", auth.AuthMiddlewareComDB(db, RegistrarPagamento(db)))
	mux.Handle("/vendas/listar", auth.AuthMiddlewareComDB(db, ListarVendas(db)))
	mux.Handle("/vendas/", auth.AuthMiddlewareComDB(db, DetalharVenda(db)))
	mux.Handle("/vendas", auth.AuthMiddlewareComDB(db, http.HandlerFunc(ProtocoloVendaDesativado)))
	mux.Handle("/vendas/itens", auth.AuthMiddlewareComDB(db, http.HandlerFunc(ProtocoloVendaDesativado)))
	mux.Handle("/admin/relatorios", auth.AdminMiddleware(db, AdminRelatorios(db)))
	h.servidor = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Fixture-Perder-Resposta") == "sim" {
			mux.ServeHTTP(&perderRespostaFT{w}, r)
			return
		}
		mux.ServeHTTP(w, r)
	}))
	t.Cleanup(h.servidor.Close)
	return h
}

type perderRespostaFT struct{ http.ResponseWriter }

func (w *perderRespostaFT) WriteHeader(int) {}
func (w *perderRespostaFT) Write(_ []byte) (int, error) {
	c, _, err := w.ResponseWriter.(http.Hijacker).Hijack()
	if err == nil {
		c.Close()
	}
	return 0, io.ErrClosedPipe
}
func (h *bancoFinanceiroTeste) request(method, path, chave string, pedido any, usuario int) respostaFT {
	h.t.Helper()
	var b []byte
	if pedido != nil {
		b, _ = json.Marshal(pedido)
	}
	req, _ := http.NewRequest(method, h.servidor.URL+path, bytes.NewReader(b))
	req.Header.Set("Authorization", "Bearer "+h.tokens[usuario])
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Financial-Environment", "fixture-env-A")
	if chave != "" {
		req.Header.Set("Idempotency-Key", chave)
	}
	res, err := h.servidor.Client().Do(req)
	if err != nil {
		h.t.Errorf("HTTP local falhou: %T", err)
		return respostaFT{}
	}
	defer res.Body.Close()
	corpo, _ := io.ReadAll(res.Body)
	return respostaFT{res.StatusCode, corpo}
}

// Exercita o helper e o handler reais, sem PostgreSQL: a chave ausente
// deve ser rejeitada antes de qualquer acesso ao banco (deliberadamente nil).
func TestFixtureFinanceiroSemChaveMantemAmbiente(t *testing.T) {
	t.Setenv("FINANCIAL_ENVIRONMENT_ID", "fixture-env-A")
	t.Setenv("QUITAIA_JWT_SECRET", chaveTesteFoto)
	servidor := httptest.NewServer(auth.AuthMiddleware(CriarVendaCompleta(nil)))
	defer servidor.Close()
	h := bancoFinanceiroTeste{
		servidor: servidor,
		tokens:   map[int]string{1: tokenTesteFoto(t, 1)},
		t:        t,
	}
	resposta := h.request("POST", "/vendas/completa", "", pedidoFT(), 1)
	if resposta.codigo != http.StatusBadRequest || !strings.Contains(string(resposta.corpo), "Idempotency-Key") {
		t.Fatalf("esperado HTTP 400 por chave ausente, recebido %d: %s", resposta.codigo, resposta.corpo)
	}
}

func (h *bancoFinanceiroTeste) scalar(query string, args ...any) int64 {
	h.t.Helper()
	var texto string
	if err := h.db.QueryRow(query, args...).Scan(&texto); err != nil {
		h.t.Fatal(err)
	}
	numero, ok := new(big.Rat).SetString(texto)
	if !ok || !numero.IsInt() || !numero.Num().IsInt64() {
		h.t.Fatal("Resultado da fixture nao e inteiro exato")
	}
	return numero.Num().Int64()
}

func pedidoFT() pedidoVendaCompleta {
	return pedidoVendaCompleta{ClienteID: 1, DataCompra: "2026-01-01", DataVencimento: "2026-01-31", TotalParcelas: 3, Itens: []itemVendaCompleta{{1, 1}, {2, 2}}}
}
func (h *bancoFinanceiroTeste) venda(p pedidoVendaCompleta, chave string) int {
	h.t.Helper()
	r := h.request("POST", "/vendas/completa", chave, p, 1)
	if r.codigo != 201 {
		h.t.Fatalf("venda: %d %s", r.codigo, r.corpo)
	}
	var v struct{ ID int }
	if err := json.Unmarshal(r.corpo, &v); err != nil {
		h.t.Fatal(err)
	}
	return v.ID
}
func (h *bancoFinanceiroTeste) pagamento(venda int, valor float64) Pagamento {
	var parcela int
	if err := h.db.QueryRow("SELECT id FROM parcelas WHERE venda_id=$1 ORDER BY numero_parcela LIMIT 1", venda).Scan(&parcela); err != nil {
		h.t.Fatal(err)
	}
	return Pagamento{VendaID: venda, ParcelaID: parcela, Valor: valor, DataPagamento: "2026-02-01", FormaPagamento: "PIX"}
}
func (h *bancoFinanceiroTeste) falha(tabela, evento string, deferrable bool) {
	h.t.Helper()
	sqlTrigger := "CREATE TRIGGER falha_teste AFTER " + evento + " ON " + tabela + " FOR EACH ROW EXECUTE FUNCTION falhar_teste()"
	if deferrable {
		sqlTrigger = "CREATE CONSTRAINT TRIGGER falha_teste AFTER " + evento + " ON " + tabela + " DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION falhar_teste()"
	}
	_, err := h.db.Exec(`CREATE TABLE falha_fixture(ativa boolean NOT NULL);INSERT INTO falha_fixture VALUES(true);CREATE FUNCTION falhar_teste() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF (SELECT ativa FROM falha_fixture) THEN RAISE EXCEPTION 'falha intermediaria de fixture';END IF;RETURN NEW;END $$;` + sqlTrigger)
	if err != nil {
		h.t.Fatal(err)
	}
}
func TestFinanceiroAtomicidadeReal(t *testing.T) {
	t.Setenv("FINANCIAL_ENVIRONMENT_ID", "fixture-env-A")
	for _, c := range []struct {
		nome, tabela, evento string
		deferida             bool
	}{{"apos_cabecalho", "vendas", "INSERT", false}, {"apos_item", "venda_itens", "INSERT", false}, {"apos_estoque", "produtos", "UPDATE", false}, {"geracao_parcela", "parcelas", "INSERT", false}, {"registro_operacao", "operacoes_financeiras", "UPDATE", false}, {"falha_commit", "operacoes_financeiras", "UPDATE", true}} {
		t.Run(c.nome, func(t *testing.T) {
			h := novoBancoFinanceiroTeste(t)
			h.falha(c.tabela, c.evento, c.deferida)
			r := h.request("POST", "/vendas/completa", "atomicidade-mesma-chave", pedidoFT(), 1)
			if r.codigo != 503 {
				t.Fatalf("esperava falha 503, recebeu %d", r.codigo)
			}
			for _, tabela := range []string{"vendas", "venda_itens", "parcelas", "operacoes_financeiras"} {
				if n := h.scalar("SELECT count(*) FROM " + tabela); n != 0 {
					t.Fatalf("rollback deixou %d registros em %s", n, tabela)
				}
			}
			if h.scalar("SELECT SUM(estoque) FROM produtos") != 30 {
				t.Fatal("estoque nao revertido")
			}
			h.db.Exec("UPDATE falha_fixture SET ativa=false")
			h.venda(pedidoFT(), "atomicidade-mesma-chave")
		})
	}
}
func TestFinanceiroRepeticaoNormalizada(t *testing.T) {
	t.Setenv("FINANCIAL_ENVIRONMENT_ID", "fixture-env-A")
	h := novoBancoFinanceiroTeste(t)
	p := pedidoFT()
	a := h.request("POST", "/vendas/completa", "repeticao-venda-chave", p, 1)
	p.Itens[0], p.Itens[1] = p.Itens[1], p.Itens[0]
	b := h.request("POST", "/vendas/completa", "repeticao-venda-chave", p, 1)
	if a.codigo != 201 || b.codigo != 201 || !bytes.Equal(a.corpo, b.corpo) {
		t.Fatal("replay nao reproduziu resposta exata")
	}
	if h.scalar("SELECT count(*) FROM vendas") != 1 || h.scalar("SELECT estoque FROM produtos WHERE id=1") != 9 {
		t.Fatal("venda duplicada")
	}
	p.Itens[0].Quantidade++
	r := h.request("POST", "/vendas/completa", "repeticao-venda-chave", p, 1)
	if r.codigo != 409 {
		t.Fatal("pedido diferente nao gerou conflito")
	}
}
func TestFinanceiroPerdaResposta(t *testing.T) {
	t.Setenv("FINANCIAL_ENVIRONMENT_ID", "fixture-env-A")
	h := novoBancoFinanceiroTeste(t)
	b, _ := json.Marshal(pedidoFT())
	req, _ := http.NewRequest("POST", h.servidor.URL+"/vendas/completa", bytes.NewReader(b))
	req.Header.Set("Authorization", "Bearer "+h.tokens[1])
	req.Header.Set("X-Financial-Environment", "fixture-env-A")
	req.Header.Set("Idempotency-Key", "resposta-perdida-chave")
	req.Header.Set("X-Fixture-Perder-Resposta", "sim")
	res, err := h.servidor.Client().Do(req)
	if err == nil {
		res.Body.Close()
		t.Fatal("fixture nao perdeu resposta")
	}
	r := h.request("POST", "/vendas/completa", "resposta-perdida-chave", pedidoFT(), 1)
	if r.codigo != 201 || h.scalar("SELECT count(*) FROM vendas") != 1 {
		t.Fatal("retry apos perda duplicou venda")
	}
}
func TestFinanceiroConcorrenciaMesmaChave(t *testing.T) {
	t.Setenv("FINANCIAL_ENVIRONMENT_ID", "fixture-env-A")
	h := novoBancoFinanceiroTeste(t)
	var wg sync.WaitGroup
	res := make(chan respostaFT, 16)
	start := make(chan struct{})
	for range 16 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			res <- h.request("POST", "/vendas/completa", "concorrencia-mesma-chave", pedidoFT(), 1)
		}()
	}
	close(start)
	wg.Wait()
	close(res)
	var primeiro []byte
	for r := range res {
		if r.codigo != 201 {
			t.Fatalf("concorrencia retornou %d", r.codigo)
		}
		if primeiro == nil {
			primeiro = r.corpo
		}
		if !bytes.Equal(primeiro, r.corpo) {
			t.Fatal("resultados distintos")
		}
	}
	if h.scalar("SELECT count(*) FROM vendas") != 1 || h.scalar("SELECT count(*) FROM operacoes_financeiras") != 1 {
		t.Fatal("operacao duplicada")
	}
}
func TestFinanceiroDisputaEstoque(t *testing.T) {
	t.Setenv("FINANCIAL_ENVIRONMENT_ID", "fixture-env-A")
	h := novoBancoFinanceiroTeste(t)
	p := pedidoFT()
	p.Itens = []itemVendaCompleta{{1, 7}}
	var wg sync.WaitGroup
	res := make(chan int, 2)
	for i := range 2 {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			res <- h.request("POST", "/vendas/completa", fmt.Sprintf("disputa-estoque-chave-%d", i), p, 1).codigo
		}(i)
	}
	wg.Wait()
	close(res)
	sucessos := 0
	for c := range res {
		if c == 201 {
			sucessos++
		} else if c != 409 {
			t.Fatalf("retorno inesperado %d", c)
		}
	}
	if sucessos != 1 || h.scalar("SELECT estoque FROM produtos WHERE id=1") != 3 || h.scalar("SELECT count(*) FROM vendas") != 1 {
		t.Fatal("disputa nao preservou estoque")
	}
}
func TestFinanceiroCentavosCalendario(t *testing.T) {
	t.Setenv("FINANCIAL_ENVIRONMENT_ID", "fixture-env-A")
	h := novoBancoFinanceiroTeste(t)
	id := h.venda(pedidoFT(), "centavos-calendario-chave")
	rows, err := h.db.Query("SELECT valor::text,vencimento::text FROM parcelas WHERE venda_id=$1 ORDER BY numero_parcela", id)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	valores := []string{"6.69", "6.68", "6.68"}
	datas := []string{"2026-01-31", "2026-02-28", "2026-03-31"}
	i := 0
	for rows.Next() {
		var v, d string
		rows.Scan(&v, &d)
		if i >= 3 || v != valores[i] || d != datas[i] {
			t.Fatalf("parcela incorreta: %s %s", v, d)
		}
		i++
	}
	if i != 3 {
		t.Fatal("parcelas ausentes")
	}
}
func TestFinanceiroPagamentoIdempotente(t *testing.T) {
	t.Setenv("FINANCIAL_ENVIRONMENT_ID", "fixture-env-A")
	h := novoBancoFinanceiroTeste(t)
	id := h.venda(pedidoFT(), "venda-pagamento-chave")
	p := h.pagamento(id, 7)
	a := h.request("POST", "/pagamentos", "pagamento-dividido-chave", p, 1)
	b := h.request("POST", "/pagamentos", "pagamento-dividido-chave", p, 1)
	if a.codigo != 201 || b.codigo != 201 || !bytes.Equal(a.corpo, b.corpo) {
		t.Fatalf("pagamento/replay falhou: %d %s", a.codigo, a.corpo)
	}
	if h.scalar("SELECT count(*) FROM pagamentos") != 2 || h.scalar("SELECT SUM(valor)*100 FROM pagamentos") != 700 {
		t.Fatal("distribuicao duplicada")
	}
	p.Valor = 13.05
	c := h.request("POST", "/pagamentos", "pagamento-final-chave", p, 1)
	d := h.request("POST", "/pagamentos", "pagamento-final-chave", p, 1)
	if c.codigo != 201 || d.codigo != 201 || !bytes.Equal(c.corpo, d.corpo) || h.scalar("SELECT saldo*100 FROM vendas WHERE id=$1", id) != 0 {
		t.Fatal("replay de pagamento quitado falhou")
	}

	rel := h.request("GET", "/admin/relatorios", "", nil, 3)
	var resumo struct {
		Resumo struct {
			Recebido float64 `json:"total_recebido"`
			Vendas   int     `json:"vendas"`
		}
	}
	if rel.codigo != 200 || json.Unmarshal(rel.corpo, &resumo) != nil || math.Round(resumo.Resumo.Recebido*100) != 2005 || resumo.Resumo.Vendas != 1 {
		t.Fatal("relatorio duplicou operacoes repetidas")
	}
	p.Valor = 1
	if h.request("POST", "/pagamentos", "pagamento-final-chave", p, 1).codigo != 409 {
		t.Fatal("chave divergente aceita")
	}
}
func TestFinanceiroRollbackPagamento(t *testing.T) {
	t.Setenv("FINANCIAL_ENVIRONMENT_ID", "fixture-env-A")
	for _, c := range []struct {
		nome, tabela string
		deferida     bool
	}{{"parcela", "parcelas", false}, {"recebimento", "pagamentos", false}, {"cabecalho", "vendas", false}, {"commit", "operacoes_financeiras", true}} {
		t.Run(c.nome, func(t *testing.T) {
			h := novoBancoFinanceiroTeste(t)
			id := h.venda(pedidoFT(), "venda-rollback-pagamento")
			evento := "UPDATE"
			if c.tabela == "pagamentos" {
				evento = "INSERT"
			}
			h.falha(c.tabela, evento, c.deferida)
			p := h.pagamento(id, 7)
			if h.request("POST", "/pagamentos", "rollback-pagamento-chave", p, 1).codigo != 503 {
				t.Fatal("falha nao propagada")
			}
			if h.scalar("SELECT count(*) FROM pagamentos") != 0 || h.scalar("SELECT SUM(valor_pago)*100 FROM parcelas") != 0 || h.scalar("SELECT saldo*100 FROM vendas WHERE id=$1", id) != 2005 || h.scalar("SELECT count(*) FROM operacoes_financeiras") != 1 {
				t.Fatal("pagamento parcial persistido")
			}
			h.db.Exec("UPDATE falha_fixture SET ativa=false")
			if h.request("POST", "/pagamentos", "rollback-pagamento-chave", p, 1).codigo != 201 {
				t.Fatal("retry apos rollback falhou")
			}
		})
	}
}
func TestFinanceiroPagamentosConcorrentes(t *testing.T) {
	t.Setenv("FINANCIAL_ENVIRONMENT_ID", "fixture-env-A")
	for _, mesma := range []bool{true, false} {
		t.Run(fmt.Sprintf("mesma_chave_%t", mesma), func(t *testing.T) {
			h := novoBancoFinanceiroTeste(t)
			id := h.venda(pedidoFT(), "venda-concorrente-chave")
			p := h.pagamento(id, 15)
			res := make(chan int, 2)
			var wg sync.WaitGroup
			for i := range 2 {
				wg.Add(1)
				go func(i int) {
					defer wg.Done()
					key := "recebimento-concorrente-chave"
					if !mesma {
						key += fmt.Sprint(i)
					}
					res <- h.request("POST", "/pagamentos", key, p, 1).codigo
				}(i)
			}
			wg.Wait()
			close(res)
			ok := 0
			for c := range res {
				if c == 201 {
					ok++
				} else if c != 400 {
					t.Fatalf("pagamento concorrente: %d", c)
				}
			}
			esperado := 1
			if mesma {
				esperado = 2
			}
			if ok != esperado || h.scalar("SELECT SUM(valor)*100 FROM pagamentos") != 1500 || h.scalar("SELECT saldo*100 FROM vendas WHERE id=$1", id) != 505 {
				t.Fatal("duplicacao ou saldo incorreto")
			}
		})
	}
}
func TestFinanceiroIsolamento(t *testing.T) {
	t.Setenv("FINANCIAL_ENVIRONMENT_ID", "fixture-env-A")
	h := novoBancoFinanceiroTeste(t)
	a := h.request("POST", "/vendas/completa", "mesma-chave-duas-contas", pedidoFT(), 1)
	if a.codigo != 201 {
		t.Fatal("venda A falhou")
	}
	if h.request("POST", "/vendas/completa", "mesma-chave-duas-contas", pedidoFT(), 2).codigo != 404 {
		t.Fatal("acesso cruzado")
	}
	p := pedidoFT()
	p.ClienteID = 2
	p.Itens = []itemVendaCompleta{{3, 1}}
	if h.request("POST", "/vendas/completa", "mesma-chave-duas-contas", p, 2).codigo != 201 || h.scalar("SELECT count(*) FROM operacoes_financeiras") != 2 {
		t.Fatal("chave nao isolada por usuario")
	}
}
func TestFinanceiroProtocoloAntigo(t *testing.T) {
	t.Setenv("FINANCIAL_ENVIRONMENT_ID", "fixture-env-A")
	h := novoBancoFinanceiroTeste(t)
	for _, path := range []string{"/vendas", "/vendas/itens"} {
		if h.request("POST", path, "", map[string]int{}, 1).codigo != 410 {
			t.Fatal("protocolo antigo permaneceu ativo")
		}
	}
	if h.scalar("SELECT count(*) FROM vendas") != 0 {
		t.Fatal("protocolo antigo criou venda")
	}
}
func TestFinanceiroValidacaoIntegral(t *testing.T) {
	t.Setenv("FINANCIAL_ENVIRONMENT_ID", "fixture-env-A")
	for _, caso := range []string{"sem_chave", "produto_alheio", "duplicado", "parcela_zero", "excesso_valor"} {
		t.Run(caso, func(t *testing.T) {
			h := novoBancoFinanceiroTeste(t)
			p := pedidoFT()
			key := "validacao-integral-chave"
			want := 400
			switch caso {
			case "sem_chave":
				key = ""
			case "produto_alheio":
				p.Itens = []itemVendaCompleta{{3, 1}}
				want = 404
			case "duplicado":
				p.Itens = []itemVendaCompleta{{1, 1}, {1, 1}}
			case "parcela_zero":
				h.db.Exec("UPDATE produtos SET preco_venda=0.01 WHERE id=1")
				p.Itens = []itemVendaCompleta{{1, 1}}
			case "excesso_valor":
				h.db.Exec("UPDATE produtos SET preco_venda=99999999.99 WHERE id=1")
				p.Itens = []itemVendaCompleta{{1, 2}}
			}
			if h.request("POST", "/vendas/completa", key, p, 1).codigo != want || h.scalar("SELECT count(*) FROM vendas") != 0 || h.scalar("SELECT SUM(estoque) FROM produtos") != 30 {
				t.Fatal("validacao deixou efeitos")
			}
		})
	}
}
func TestFinanceiroSnapshotConcorrente(t *testing.T) {
	t.Setenv("FINANCIAL_ENVIRONMENT_ID", "fixture-env-A")
	h := novoBancoFinanceiroTeste(t)
	id := h.venda(pedidoFT(), "snapshot-venda-chave")
	p := h.pagamento(id, 0.01)
	_, err := h.db.Exec(`CREATE FUNCTION pausar_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.015);RETURN NEW;END $$;CREATE TRIGGER pausar AFTER UPDATE ON parcelas FOR EACH ROW EXECUTE FUNCTION pausar_fixture()`)
	if err != nil {
		t.Fatal(err)
	}
	done := make(chan struct{})
	go func() {
		defer close(done)
		for i := range 12 {
			if h.request("POST", "/pagamentos", fmt.Sprintf("snapshot-pagamento-%03d", i), p, 1).codigo != 201 {
				t.Error("pagamento fixture falhou")
				return
			}
		}
	}()
	for range 12 {
		r := h.request("GET", fmt.Sprintf("/vendas/%d", id), "", nil, 1)
		var d struct {
			Venda struct {
				Total, Saldo float64
				ValorPago    float64 `json:"valor_pago"`
			}
			Parcelas []struct {
				Valor float64
				Pago  float64 `json:"valor_pago"`
			}
		}
		if r.codigo != 200 || json.Unmarshal(r.corpo, &d) != nil {
			t.Fatalf("detalhe falhou %d %s", r.codigo, r.corpo)
		}
		var total, pago float64
		for _, pa := range d.Parcelas {
			total += pa.Valor
			pago += pa.Pago
		}
		if math.Round(total*100) != math.Round(d.Venda.Total*100) || math.Round(pago*100) != math.Round(d.Venda.ValorPago*100) {
			t.Fatal("snapshot misturou saldos")
		}
		r = h.request("GET", "/admin/relatorios", "", nil, 3)
		var rel struct {
			Resumo struct {
				Vendido  float64 `json:"total_vendido"`
				Recebido float64 `json:"total_recebido"`
				Saldo    float64 `json:"saldo_vendas"`
			}
		}
		if r.codigo != 200 || json.Unmarshal(r.corpo, &rel) != nil {
			t.Fatalf("relatorio falhou %d %s", r.codigo, r.corpo)
		}
		if math.Round((rel.Resumo.Recebido+rel.Resumo.Saldo)*100) != math.Round(rel.Resumo.Vendido*100) {
			t.Fatal("relatorio inconsistente")
		}
	}
	<-done
}
func TestFinanceiroProximoVencimento(t *testing.T) {
	t.Setenv("FINANCIAL_ENVIRONMENT_ID", "fixture-env-A")
	h := novoBancoFinanceiroTeste(t)
	p := pedidoFT()
	primeiro := time.Now().AddDate(0, 0, -1)
	p.DataCompra = primeiro.AddDate(0, 0, -10).Format("2006-01-02")
	p.DataVencimento = primeiro.Format("2006-01-02")
	p.TotalParcelas = 2
	p.Itens = []itemVendaCompleta{{1, 1}}
	id := h.venda(p, "proximo-vencimento-venda")
	pay := h.pagamento(id, 5.01)
	if h.request("POST", "/pagamentos", "proximo-vencimento-pago", pay, 1).codigo != 201 {
		t.Fatal("pagamento falhou")
	}
	for _, path := range []string{fmt.Sprintf("/vendas/%d", id), "/vendas/listar"} {
		r := h.request("GET", path, "", nil, 1)
		var objeto map[string]json.RawMessage
		var v struct {
			Vencimento string
			Proximo    string `json:"proximo_vencimento"`
			Status     string
		}
		if strings.HasSuffix(path, "listar") {
			var vs []json.RawMessage
			json.Unmarshal(r.corpo, &vs)
			if len(vs) != 1 {
				t.Fatal("lista invalida")
			}
			json.Unmarshal(vs[0], &v)
		} else {
			json.Unmarshal(r.corpo, &objeto)
			json.Unmarshal(objeto["venda"], &v)
		}
		if r.codigo != 200 || !strings.HasPrefix(v.Vencimento, p.DataVencimento) || v.Proximo != adicionarMesMantendoDia(primeiro, 1).Format("2006-01-02") || v.Status != "EM_ABERTO" {
			t.Fatalf("status/data incorretos: %+v", v)
		}
	}
}

func TestFinanceiroOrdensOpostas(t *testing.T) {
	t.Setenv("FINANCIAL_ENVIRONMENT_ID", "fixture-env-A")
	h := novoBancoFinanceiroTeste(t)
	p := pedidoFT()
	p.Itens = []itemVendaCompleta{{1, 2}, {2, 2}}
	q := pedidoFT()
	q.Itens = []itemVendaCompleta{{2, 2}, {1, 2}}
	var wg sync.WaitGroup
	res := make(chan int, 2)
	start := make(chan struct{})
	for i, pedido := range []pedidoVendaCompleta{p, q} {
		wg.Add(1)
		go func(i int, pedido pedidoVendaCompleta) {
			defer wg.Done()
			<-start
			res <- h.request("POST", "/vendas/completa", fmt.Sprintf("ordem-oposta-chave-%d", i), pedido, 1).codigo
		}(i, pedido)
	}
	close(start)
	wg.Wait()
	close(res)
	for c := range res {
		if c != 201 {
			t.Fatalf("ordem oposta gerou %d", c)
		}
	}
	if h.scalar("SELECT estoque FROM produtos WHERE id=1") != 6 || h.scalar("SELECT estoque FROM produtos WHERE id=2") != 6 {
		t.Fatal("estoque divergente")
	}
}
func TestFinanceiroPerdaRespostaPagamento(t *testing.T) {
	t.Setenv("FINANCIAL_ENVIRONMENT_ID", "fixture-env-A")
	h := novoBancoFinanceiroTeste(t)
	id := h.venda(pedidoFT(), "venda-resposta-pagamento")
	p := h.pagamento(id, 20.05)
	b, _ := json.Marshal(p)
	req, _ := http.NewRequest("POST", h.servidor.URL+"/pagamentos", bytes.NewReader(b))
	req.Header.Set("Authorization", "Bearer "+h.tokens[1])
	req.Header.Set("X-Financial-Environment", "fixture-env-A")
	req.Header.Set("Idempotency-Key", "perda-pagamento-chave")
	req.Header.Set("X-Fixture-Perder-Resposta", "sim")
	res, err := h.servidor.Client().Do(req)
	if err == nil {
		res.Body.Close()
		t.Fatal("fixture nao perdeu resposta")
	}
	r := h.request("POST", "/pagamentos", "perda-pagamento-chave", p, 1)
	if r.codigo != 201 || h.scalar("SELECT SUM(valor)*100 FROM pagamentos") != 2005 || h.scalar("SELECT saldo*100 FROM vendas WHERE id=$1", id) != 0 {
		t.Fatal("pagamento duplicado apos perda")
	}
}

func TestFinanceiroSessaoRevogadaAposCommit(t *testing.T) {
	t.Setenv("FINANCIAL_ENVIRONMENT_ID", "fixture-env-A")
	for _, tipo := range []string{"venda", "pagamento"} {
		t.Run(tipo, func(t *testing.T) {
			h := novoBancoFinanceiroTeste(t)
			path := "/vendas/completa"
			var pedido any = pedidoFT()
			if tipo == "pagamento" {
				id := h.venda(pedidoFT(), "venda-base-expiracao")
				path = "/pagamentos"
				pedido = h.pagamento(id, 20.05)
			}
			body, _ := json.Marshal(pedido)
			req, _ := http.NewRequest("POST", h.servidor.URL+path, bytes.NewReader(body))
			req.Header.Set("Authorization", "Bearer "+h.tokens[1])
			req.Header.Set("X-Financial-Environment", "fixture-env-A")
			req.Header.Set("Idempotency-Key", "chave-expiracao-apos-commit")
			req.Header.Set("X-Fixture-Perder-Resposta", "sim")
			res, err := http.DefaultClient.Do(req)
			if err == nil {
				res.Body.Close()
				t.Fatal("Fixture deveria perder resposta")
			}
			if _, err = h.db.Exec(`UPDATE usuarios SET versao_sessao=versao_sessao+1 WHERE id=1`); err != nil {
				t.Fatal(err)
			}
			if h.request("POST", path, "chave-expiracao-apos-commit", pedido, 1).codigo != 401 {
				t.Fatal("Sessao anterior aceita")
			}
			claims := auth.Claims{UsuarioID: 1, VersaoSessao: 1, RegisteredClaims: jwt.RegisteredClaims{ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour))}}
			h.tokens[1], err = jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(chaveTesteFoto))
			if err != nil {
				t.Fatal(err)
			}
			if h.request("POST", path, "chave-expiracao-apos-commit", pedido, 1).codigo != 201 {
				t.Fatal("Novo login nao recuperou resultado")
			}
			if h.scalar(`SELECT count(*) FROM vendas`) != 1 {
				t.Fatal("Venda duplicada")
			}
			if tipo == "pagamento" && h.scalar(`SELECT (sum(valor)*100)::bigint FROM pagamentos`) != 2005 {
				t.Fatal("Pagamento duplicado")
			}
		})
	}
}

func TestFinanceiroContaBloqueadaNaoLeNemRepeteOperacao(t *testing.T) {
	t.Setenv("FINANCIAL_ENVIRONMENT_ID", "fixture-env-A")
	h := novoBancoFinanceiroTeste(t)
	id := h.venda(pedidoFT(), "venda-antes-bloqueio")
	if _, err := h.db.Exec(`UPDATE usuarios SET ativo=false WHERE id=1`); err != nil {
		t.Fatal(err)
	}
	if h.request("POST", "/vendas/completa", "venda-antes-bloqueio", pedidoFT(), 1).codigo != 403 {
		t.Fatal("Bloqueio nao impediu replay")
	}
	if h.request("GET", fmt.Sprintf("/vendas/%d", id), "", nil, 1).codigo != 403 {
		t.Fatal("Bloqueio nao impediu leitura")
	}
	if h.request("POST", "/pagamentos", "pagamento-conta-bloqueada", h.pagamento(id, 1), 1).codigo != 403 {
		t.Fatal("Bloqueio nao impediu pagamento")
	}
	if h.scalar(`SELECT count(*) FROM vendas`) != 1 || h.scalar(`SELECT count(*) FROM pagamentos`) != 0 {
		t.Fatal("Bloqueio permitiu escrita")
	}
}
