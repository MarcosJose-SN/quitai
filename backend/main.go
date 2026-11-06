package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/MarcosJose/quitai/auth"
	"github.com/MarcosJose/quitai/database"
	"github.com/MarcosJose/quitai/handlers"
	"github.com/joho/godotenv"
)

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Configure FRONTEND_URL com a origem HTTPS exata na hospedagem.
		origemPermitida := strings.TrimRight(strings.TrimSpace(os.Getenv("FRONTEND_URL")), "/")
		if origemPermitida == "" {
			origemPermitida = "http://localhost:5174"
		}

		w.Header().Add("Vary", "Origin")
		origem := r.Header.Get("Origin")
		permitida := origem == origemPermitida

		if permitida {
			w.Header().Set("Access-Control-Allow-Origin", origemPermitida)
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, Idempotency-Key, X-Financial-Environment")
		}

		if r.Method == http.MethodOptions && r.Header.Get("Access-Control-Request-Method") != "" {
			if !permitida {
				auth.ResponderErroAutenticacao(w, http.StatusForbidden, "origem_nao_permitida", "Origem não permitida")
				return
			}
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("Aviso: arquivo .env nao carregado; usando variaveis do ambiente.")
	}

	// Validação obrigatória da chave JWT.
	if err := auth.ValidarJWTSecret(); err != nil {
		log.Fatal("Configuração JWT inválida: ", err)
	}

	// Conexão com PostgreSQL.
	db, err := database.Connect()
	if err != nil {
		log.Fatal("Erro ao conectar ao PostgreSQL: ", err)
	}
	defer db.Close()
	if err := database.ValidarEsquemaFinanceiro(db); err != nil {
		log.Fatal(err)
	}

	// Inicialização dos avisos e da manutenção.
	if err := inicializarComunicados(db); err != nil {
		log.Fatal("Erro ao preparar avisos e manutenção: ", err)
	}

	if err := auth.ValidarEsquema(db); err != nil {
		log.Fatal(err)
	}

	// HEALTH CHECK - RENDER
	// Verifica se a API está respondendo.
	// Não expõe informações privadas e não exige autenticação.
	http.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.Header().Set("Allow", http.MethodGet)
			http.Error(w, "Método não permitido", http.StatusMethodNotAllowed)
			return
		}

		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		fmt.Fprintln(w, "OK")
	})

	// SISTEMA - AVISOS E MANUTENÇÃO
	http.HandleFunc("/sistema/publico", sistemaPublico(db))

	// Apenas sinal de atualização, sem dados privados;
	// funciona até durante manutenção.
	http.HandleFunc("/sistema/eventos", streamSuporte(db))

	http.Handle(
		"/admin/sistema/avisos",
		auth.AdminMiddleware(db, sistemaAdmin(db)),
	)

	http.Handle(
		"/admin/sistema/avisos/",
		auth.AdminMiddleware(db, sistemaAdminAviso(db)),
	)

	http.Handle(
		"/admin/sistema/manutencao",
		auth.AdminMiddleware(db, sistemaAdminManutencao(db)),
	)

	// AUTENTICAÇÃO

	// Cadastro público desativado.
	http.HandleFunc("/auth/cadastro", func(w http.ResponseWriter, r *http.Request) {
		auth.ResponderErroAutenticacao(w, http.StatusForbidden, "cadastro_desativado", "Cadastro público desativado. Entre em contato com o administrador.")
	})

	http.HandleFunc("/auth/login", auth.Login(db))
	http.Handle("/auth/logout", auth.AuthMiddleware(auth.Logout(db)))

	http.Handle(
		"/auth/me",
		auth.AuthMiddlewareComDB(db, auth.Me(db)),
	)

	// MINHA CONTA - REVENDEDORA
	http.Handle(
		"/minha-conta",
		auth.AuthMiddlewareComDB(
			db,
			bloquearManutencao(db, handlers.AtualizarMinhaContaRevendedora(db)),
		),
	)

	http.Handle(
		"/minha-conta/senha",
		auth.AuthMiddlewareComDB(
			db,
			bloquearManutencao(db, handlers.AlterarMinhaSenhaRevendedora(db)),
		),
	)

	// RECUPERAÇÃO DE SENHA
	if err := auth.InicializarRecuperacao(db); err != nil {
		log.Fatal("Erro ao inicializar recuperação de senha: ", err)
	}

	http.HandleFunc(
		"/auth/recuperar-senha",
		auth.SolicitarRecuperacao(db),
	)

	http.HandleFunc(
		"/auth/redefinir-senha",
		auth.RedefinirSenha(db),
	)

	// Login Google desativado.
	http.HandleFunc("/auth/google", func(w http.ResponseWriter, r *http.Request) {
		auth.ResponderErroAutenticacao(w, http.StatusForbidden, "autenticacao_desativada", "Login com Google desativado.")
	})

	// GESTOR ADMINISTRATIVO - SOMENTE ADMINISTRADOR

	http.Handle(
		"/admin/contas",
		auth.AdminMiddleware(db, handlers.AdminContas(db)),
	)

	http.Handle(
		"/admin/contas/",
		auth.AdminMiddleware(
			db,
			http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method == http.MethodDelete {
					handlers.AdminExcluirConta(db)(w, r)
					return
				}

				handlers.AdminAlterarStatusConta(db)(w, r)
			}),
		),
	)

	http.Handle(
		"/admin/perfil/foto",
		auth.AdminMiddleware(db, handlers.AdminFotoPerfil(db)),
	)

	http.Handle(
		"/admin/minha-conta",
		auth.AdminMiddleware(db, handlers.AdminAtualizarMinhaConta(db)),
	)

	http.Handle(
		"/admin/minha-conta/senha",
		auth.AdminMiddleware(db, handlers.AdminAlterarMinhaSenha(db)),
	)

	http.Handle(
		"/admin/dashboard",
		auth.AdminMiddleware(db, handlers.AdminDashboard(db)),
	)

	http.Handle(
		"/admin/relatorios",
		auth.AdminMiddleware(db, handlers.AdminRelatorios(db)),
	)

	// EVENTOS DE SUPORTE

	http.Handle(
		"/admin/suporte/eventos",
		auth.AdminMiddleware(db, streamSuporte(db)),
	)

	http.Handle(
		"/suporte/eventos",
		auth.AuthMiddlewareComDB(
			db,
			bloquearManutencao(db, streamSuporte(db)),
		),
	)

	// CENTRAL DE SUPORTE - ADMINISTRADOR

	http.Handle(
		"/admin/suporte",
		auth.AdminMiddleware(
			db,
			suporteComAviso(db, handlers.SuporteAdmin(db)),
		),
	)

	http.Handle(
		"/admin/suporte/",
		auth.AdminMiddleware(
			db,
			suporteComAviso(db, handlers.SuporteAdmin(db)),
		),
	)

	// CENTRAL DE SUPORTE - REVENDEDORA

	http.Handle(
		"/suporte",
		auth.AuthMiddlewareComDB(
			db,
			bloquearManutencao(
				db,
				suporteComAviso(db, handlers.SuporteRevendedora(db)),
			),
		),
	)

	http.Handle(
		"/suporte/",
		auth.AuthMiddlewareComDB(
			db,
			bloquearManutencao(
				db,
				suporteComAviso(db, handlers.SuporteRevendedora(db)),
			),
		),
	)

	// PRODUTOS

	http.Handle(
		"/produtos",
		auth.AuthMiddlewareComDB(
			db,
			bloquearManutencao(db, handlers.CriarProduto(db)),
		),
	)

	http.Handle(
		"/produtos/listar",
		auth.AuthMiddlewareComDB(
			db,
			bloquearManutencao(db, handlers.ListarProdutos(db)),
		),
	)

	http.Handle(
		"/produtos/",
		auth.AuthMiddlewareComDB(
			db,
			bloquearManutencao(
				db,
				http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					switch r.Method {
					case http.MethodPut:
						handlers.EditarProduto(db)(w, r)

					case http.MethodDelete:
						handlers.ExcluirProduto(db)(w, r)

					default:
						http.Error(
							w,
							"Método não permitido",
							http.StatusMethodNotAllowed,
						)
					}
				}),
			),
		),
	)

	// CLIENTES

	http.Handle(
		"/clientes",
		auth.AuthMiddlewareComDB(
			db,
			bloquearManutencao(db, handlers.CriarCliente(db)),
		),
	)

	http.Handle(
		"/clientes/listar",
		auth.AuthMiddlewareComDB(
			db,
			bloquearManutencao(db, handlers.ListarClientes(db)),
		),
	)

	http.Handle(
		"/clientes/",
		auth.AuthMiddlewareComDB(
			db,
			bloquearManutencao(
				db,
				http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					switch r.Method {
					case http.MethodPut:
						handlers.EditarCliente(db)(w, r)

					case http.MethodDelete:
						handlers.ExcluirCliente(db)(w, r)

					default:
						http.Error(
							w,
							"Método não permitido",
							http.StatusMethodNotAllowed,
						)
					}
				}),
			),
		),
	)

	// VENDAS

	http.Handle("/vendas/completa", auth.AuthMiddlewareComDB(db, bloquearManutencao(db, handlers.CriarVendaCompleta(db))))

	http.Handle(
		"/vendas",
		auth.AuthMiddlewareComDB(
			db,
			bloquearManutencao(db, http.HandlerFunc(handlers.ProtocoloVendaDesativado)),
		),
	)

	http.Handle(
		"/vendas/listar",
		auth.AuthMiddlewareComDB(
			db,
			bloquearManutencao(db, handlers.ListarVendas(db)),
		),
	)

	http.Handle(
		"/vendas/itens",
		auth.AuthMiddlewareComDB(
			db,
			bloquearManutencao(db, http.HandlerFunc(handlers.ProtocoloVendaDesativado)),
		),
	)

	http.Handle(
		"/vendas/",
		auth.AuthMiddlewareComDB(
			db,
			bloquearManutencao(
				db,
				http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					if r.Method == http.MethodDelete {
						handlers.ExcluirVenda(db)(w, r)
						return
					}

					handlers.DetalharVenda(db)(w, r)
				}),
			),
		),
	)

	// PAGAMENTOS

	http.Handle(
		"/pagamentos",
		auth.AuthMiddlewareComDB(
			db,
			bloquearManutencao(db, handlers.RegistrarPagamento(db)),
		),
	)

	// PORTA DA API
	// Render utiliza a variável PORT.
	// Localmente, o padrão continua sendo 8082.

	porta := strings.TrimSpace(os.Getenv("PORT"))
	if porta == "" {
		porta = "8082"
	}

	fmt.Printf("QuitaAí API funcionando na porta %s\n", porta)

	servidor := &http.Server{Addr: ":" + porta, Handler: cors(http.DefaultServeMux), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 32 << 10}
	// No global WriteTimeout: authenticated SSE validates its session on every pulse.
	log.Fatal(servidor.ListenAndServe())
}
