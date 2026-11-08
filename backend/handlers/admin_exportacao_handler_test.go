package handlers

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
)

type respostaExportacaoTeste struct {
	*httptest.ResponseRecorder
	deadlines []time.Time
}

func (w *respostaExportacaoTeste) SetWriteDeadline(prazo time.Time) error {
	w.deadlines = append(w.deadlines, prazo)
	return nil
}

func authExportacao(t *testing.T, mock sqlmock.Sqlmock, perfil string) {
	t.Helper()
	mock.ExpectQuery("SELECT perfil, ativo").WithArgs(1).WillReturnRows(sqlmock.NewRows([]string{"perfil", "ativo"}).AddRow(perfil, true))
	mock.ExpectQuery("SELECT versao_sessao").WillReturnRows(sqlmock.NewRows([]string{"valida"}).AddRow(true))
}
func requisicaoExportacao(t *testing.T) *http.Request {
	t.Helper()
	r := httptest.NewRequest("GET", "/admin/relatorios/exportar", nil)
	r.Header.Set("Authorization", "Bearer "+tokenTesteFoto(t, 1))
	return r
}
func configurarExportacao(t *testing.T) {
	t.Helper()
	t.Setenv("QUITAIA_JWT_SECRET", chaveTesteFoto)
	t.Setenv("FINANCIAL_ENVIRONMENT_ID", "fixture-env-A")
}
func queryExportacao(tabela int) string {
	return "SELECT CASE WHEN octet_length(row_to_json(d)::text) <= $1 THEN row_to_json(d)::text ELSE NULL END FROM (" + tabelasExportacao[tabela].selectSQL + ") d ORDER BY d.id LIMIT $2"
}

func TestExportacaoSnapshotCompletoHashEPrecisao(t *testing.T) {
	configurarExportacao(t)
	db, mock, _ := sqlmock.New()
	defer db.Close()
	authExportacao(t, mock, "admin")
	mock.ExpectBegin()
	registros := []string{
		`{"id":1,"perfil":"revendedora","ativo":false,"nome":"Fixture"}`,
		`{"id":2,"usuario_id":1}`, `{"id":3,"usuario_id":1,"preco_venda":"99999999.99"}`,
		`{"id":4,"usuario_id":1,"cliente_id":2,"total":"99999999.99","valor_pago":"0.01","saldo":"99999999.98"}`,
		`{"id":5,"venda_id":4,"produto_id":3,"preco_unitario":"99999999.99"}`,
		`{"id":6,"venda_id":4,"valor":"99999999.99","valor_pago":"0.01"}`,
		`{"id":7,"venda_id":4,"parcela_id":6,"valor":"0.01"}`,
	}
	for i := range tabelasExportacao {
		mock.ExpectQuery(regexp.QuoteMeta(queryExportacao(i))).WithArgs(limitesExportacao.linhaBytes, limitesExportacao.linhas+1).WillReturnRows(sqlmock.NewRows([]string{"json"}).AddRow(registros[i])).RowsWillBeClosed()
	}
	mock.ExpectRollback()
	w := &respostaExportacaoTeste{ResponseRecorder: httptest.NewRecorder()}
	AdminExportarDados(db).ServeHTTP(w, requisicaoExportacao(t))
	if w.Code != 200 {
		t.Fatalf("status %d", w.Code)
	}
	if w.Header().Get("Cache-Control") != "no-store" || !strings.Contains(w.Header().Get("Content-Disposition"), "attachment") {
		t.Fatal("download nao protegido")
	}
	var arquivo arquivoExportacao
	if err := json.Unmarshal(w.Body.Bytes(), &arquivo); err != nil {
		t.Fatal(err)
	}
	h := sha256.Sum256([]byte(arquivo.ConteudoJSON))
	if arquivo.Versao != 1 || arquivo.Formato != exportacaoFormato || arquivo.SHA256 != hex.EncodeToString(h[:]) {
		t.Fatal("integridade invalida")
	}
	var conteudo conteudoExportacao
	if err := json.Unmarshal([]byte(arquivo.ConteudoJSON), &conteudo); err != nil {
		t.Fatal(err)
	}
	if len(conteudo.Dados) != 7 || conteudo.Ambiente != "fixture-env-A" {
		t.Fatal("escopo incorreto")
	}
	for i, tabela := range tabelasExportacao {
		if len(conteudo.Dados[tabela.nome]) != 1 || string(conteudo.Dados[tabela.nome][0]) != registros[i] {
			t.Fatal("registro, relacionamento ou decimal alterado")
		}
	}
	for _, sql := range tabelasExportacao {
		for _, proibido := range []string{"SELECT *", "senha_hash", "token", "foto_perfil", "versao_sessao", "sessoes_revogadas", "limites_autenticacao", "alteracoes_email"} {
			if strings.Contains(sql.selectSQL, proibido) {
				t.Fatal("campo sensivel na consulta")
			}
		}
		if !strings.Contains(sql.selectSQL, "perfil='revendedora'") {
			t.Fatal("escopo nao restrito")
		}
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
	if len(w.deadlines) != 2 || w.deadlines[0].IsZero() || !w.deadlines[1].IsZero() {
		t.Fatal("limite de transferencia nao restaurado")
	}
}

func TestExportacaoSemSuporteADeadlineNaoEnviaDados(t *testing.T) {
	w := httptest.NewRecorder()
	enviarArquivoExportacao(w, []byte("dados-sensiveis"))
	if w.Code != 503 || strings.Contains(w.Body.String(), "dados-sensiveis") || w.Header().Get("Content-Disposition") != "" {
		t.Fatal("download sem limite permitido")
	}
}

func TestExportacaoRevendedoraNegadaAntesDeSnapshot(t *testing.T) {
	configurarExportacao(t)
	db, mock, _ := sqlmock.New()
	defer db.Close()
	authExportacao(t, mock, "revendedora")
	w := httptest.NewRecorder()
	AdminExportarDados(db).ServeHTTP(w, requisicaoExportacao(t))
	if w.Code != 403 {
		t.Fatal("revendedora autorizada")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestExportacaoSemTokenNaoAcessaBanco(t *testing.T) {
	w := httptest.NewRecorder()
	AdminExportarDados(nil).ServeHTTP(w, httptest.NewRequest("GET", "/admin/relatorios/exportar", nil))
	if w.Code != 401 {
		t.Fatal("exportacao publica")
	}
}

func TestExportacaoAmbienteAusenteOuInvalidoFalhaAntesDeSnapshot(t *testing.T) {
	for _, ambiente := range []string{"", "curto", " invalido-ambiente", "ambiente com espacos"} {
		t.Run(ambiente, func(t *testing.T) {
			configurarExportacao(t)
			t.Setenv("FINANCIAL_ENVIRONMENT_ID", ambiente)
			db, mock, err := sqlmock.New()
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			authExportacao(t, mock, "admin")
			w := httptest.NewRecorder()
			AdminExportarDados(db).ServeHTTP(w, requisicaoExportacao(t))
			if w.Code != 503 || w.Header().Get("Content-Disposition") != "" || strings.Contains(w.Body.String(), "conteudo_json") {
				t.Fatal("exportacao aceita sem origem valida")
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestExportacaoFalhasNaoEnviamArquivoParcial(t *testing.T) {
	configurarExportacao(t)
	for _, caso := range []string{"linha_grande", "bytes", "linhas", "sql", "leitura", "rollback", "prazo"} {
		t.Run(caso, func(t *testing.T) {
			db, mock, _ := sqlmock.New()
			defer db.Close()
			limites := limiteExportacao{1000, 50, 1, time.Second}
			mock.ExpectBegin()
			if caso == "rollback" {
				for i := range tabelasExportacao {
					mock.ExpectQuery(regexp.QuoteMeta(queryExportacao(i))).WillReturnRows(sqlmock.NewRows([]string{"json"}))
				}
			} else {
				q := mock.ExpectQuery(regexp.QuoteMeta(queryExportacao(0)))
				switch caso {
				case "sql":
					q.WillReturnError(errors.New("senha-e-dados-sensiveis"))
				case "prazo":
					limites.prazo = time.Millisecond
					q.WillDelayFor(100 * time.Millisecond).WillReturnRows(sqlmock.NewRows([]string{"json"}))
				case "linha_grande":
					q.WillReturnRows(sqlmock.NewRows([]string{"json"}).AddRow(nil))
				case "bytes":
					limites.bytes = 1
					q.WillReturnRows(sqlmock.NewRows([]string{"json"}).AddRow(`{"id":1}`))
				case "linhas":
					q.WillReturnRows(sqlmock.NewRows([]string{"json"}).AddRow(`{"id":1}`).AddRow(`{"id":2}`))
				case "leitura":
					q.WillReturnRows(sqlmock.NewRows([]string{"json"}).AddRow(`{"id":1}`).RowError(0, errors.New("dados-sensiveis")))
				}
			}
			if caso == "rollback" {
				mock.ExpectRollback().WillReturnError(errors.New("dados-sensiveis"))
			} else {
				mock.ExpectRollback()
			}
			w := httptest.NewRecorder()
			exportarDados(db, limites).ServeHTTP(w, httptest.NewRequest("GET", "/", nil))
			if w.Code != 413 && w.Code != 503 {
				t.Fatalf("status %d", w.Code)
			}
			if w.Header().Get("Content-Disposition") != "" || strings.Contains(w.Body.String(), "sensiveis") || strings.Contains(w.Body.String(), "conteudo_json") {
				t.Fatal("arquivo parcial ou erro sensivel")
			}
			// database/sql may rollback asynchronously after a deadline, but the
			// expectation must still be fulfilled; never silently ignore it.
			limite := time.Now().Add(time.Second)
			for {
				err := mock.ExpectationsWereMet()
				if err == nil {
					break
				}
				if caso != "prazo" || time.Now().After(limite) {
					t.Fatal(err)
				}
				time.Sleep(time.Millisecond)
			}
		})
	}
}

func TestExportacaoMetodoFiltroEOrigemInvalidos(t *testing.T) {
	configurarExportacao(t)
	for _, caso := range []struct {
		metodo, url, ambiente string
		status                int
	}{
		{"POST", "/", "fixture-env-A", 405}, {"GET", "/?revendedora_id=1", "fixture-env-A", 400}, {"GET", "/", "", 503},
	} {
		t.Setenv("FINANCIAL_ENVIRONMENT_ID", caso.ambiente)
		w := httptest.NewRecorder()
		exportarDados(nil, limitesExportacao).ServeHTTP(w, httptest.NewRequest(caso.metodo, caso.url, nil))
		if w.Code != caso.status {
			t.Fatal("precondicao ignorada")
		}
	}
}

func TestExportacaoContextoCancelado(t *testing.T) {
	configurarExportacao(t)
	db, mock, _ := sqlmock.New()
	defer db.Close()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	w := httptest.NewRecorder()
	exportarDados(db, limitesExportacao).ServeHTTP(w, httptest.NewRequest("GET", "/", nil).WithContext(ctx))
	if w.Code != 503 {
		t.Fatal("cancelamento ignorado")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestExportacaoConcorrenteRetorna429SemSegundoSnapshot(t *testing.T) {
	configurarExportacao(t)
	db, mock, _ := sqlmock.New()
	defer db.Close()
	mock.ExpectBegin().WillDelayFor(100 * time.Millisecond).WillReturnError(errors.New("fixture"))
	handler := exportarDados(db, limitesExportacao)
	done := make(chan int, 1)
	go func() {
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, httptest.NewRequest("GET", "/", nil))
		done <- w.Code
	}()
	limite := time.Now().Add(time.Second)
	for db.Stats().InUse == 0 {
		if time.Now().After(limite) {
			t.Fatal("primeira exportacao nao iniciou")
		}
		time.Sleep(time.Millisecond)
	}
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, httptest.NewRequest("GET", "/", nil))
	if w.Code != 429 {
		t.Fatal("exportacoes concorrentes permitidas")
	}
	if status := <-done; status != 503 {
		t.Fatal("erro de abertura ignorado")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
