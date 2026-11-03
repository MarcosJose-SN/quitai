package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"

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
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		}

		if r.Method == http.MethodOptions && r.Header.Get("Access-Control-Request-Method") != "" {
			if !permitida {
				http.Error(w, "Origem não permitida", http.StatusForbidden)
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
	if err := auth.ValidarJWTSecret(); err != nil {
		log.Fatal("Configuração JWT inválida: ", err)
	}

	db, err := database.Connect()
	if err != nil {
		log.Fatal("Erro ao conectar ao PostgreSQL:", err)
	}
	defer db.Close()
	if err := inicializarComunicados(db); err != nil {
		log.Fatal("Erro ao preparar avisos e manutenção: ", err)
	}
	http.HandleFunc("/sistema/publico", sistemaPublico(db))
	// Apenas sinal de atualização, sem dados privados; funciona até durante manutenção.
	http.HandleFunc("/sistema/eventos", streamSuporte(db))
	http.Handle("/admin/sistema/avisos", auth.AdminMiddleware(db, sistemaAdmin(db)))
	http.Handle("/admin/sistema/avisos/", auth.AdminMiddleware(db, sistemaAdminAviso(db)))
	http.Handle("/admin/sistema/manutencao", auth.AdminMiddleware(db, sistemaAdminManutencao(db)))

	// AUTENTICAÃ‡ÃƒO
	http.HandleFunc("/auth/cadastro", func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "Cadastro público desativado. Entre em contato com o administrador.", http.StatusForbidden)
	})
	http.HandleFunc("/auth/login", auth.Login(db))
	http.Handle("/auth/me", auth.AuthMiddlewareComDB(db, auth.Me(db)))
	// MINHA CONTA - REVENDEDORA
	http.Handle("/minha-conta", auth.AuthMiddlewareComDB(db, bloquearManutencao(db, handlers.AtualizarMinhaContaRevendedora(db))))
	http.Handle("/minha-conta/senha", auth.AuthMiddlewareComDB(db, bloquearManutencao(db, handlers.AlterarMinhaSenhaRevendedora(db))))

	if err := auth.InicializarRecuperacao(db); err != nil {
		log.Fatal("Erro ao inicializar recuperação de senha:", err)
	}

	http.HandleFunc("/auth/recuperar-senha", auth.SolicitarRecuperacao(db))
	http.HandleFunc("/auth/redefinir-senha", auth.RedefinirSenha(db))
	http.HandleFunc("/auth/google", func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "Login com Google desativado.", http.StatusForbidden)
	})

	// GESTOR ADMINISTRATIVO - SOMENTE ADMINISTRADOR
	http.Handle("/admin/contas", auth.AdminMiddleware(db, handlers.AdminContas(db)))
	http.Handle("/admin/contas/", auth.AdminMiddleware(db, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			handlers.AdminExcluirConta(db)(w, r)
			return
		}
		handlers.AdminAlterarStatusConta(db)(w, r)
	})))
	http.Handle("/admin/perfil/foto", auth.AdminMiddleware(db, handlers.AdminFotoPerfil(db)))
	http.Handle("/admin/minha-conta", auth.AdminMiddleware(db, handlers.AdminAtualizarMinhaConta(db)))
	http.Handle("/admin/minha-conta/senha", auth.AdminMiddleware(db, handlers.AdminAlterarMinhaSenha(db)))
	http.Handle("/admin/dashboard", auth.AdminMiddleware(db, handlers.AdminDashboard(db)))
	http.Handle("/admin/relatorios", auth.AdminMiddleware(db, handlers.AdminRelatorios(db)))

	http.Handle("/admin/suporte/eventos", auth.AdminMiddleware(db, streamSuporte(db)))
	http.Handle("/suporte/eventos", auth.AuthMiddlewareComDB(db, bloquearManutencao(db, streamSuporte(db))))

	// CENTRAL DE SUPORTE - ADMINISTRADOR E REVENDEDORA
	http.Handle("/admin/suporte", auth.AdminMiddleware(db, suporteComAviso(db, handlers.SuporteAdmin(db))))
	http.Handle("/admin/suporte/", auth.AdminMiddleware(db, suporteComAviso(db, handlers.SuporteAdmin(db))))
	http.Handle("/suporte", auth.AuthMiddlewareComDB(db, bloquearManutencao(db, suporteComAviso(db, handlers.SuporteRevendedora(db)))))
	http.Handle("/suporte/", auth.AuthMiddlewareComDB(db, bloquearManutencao(db, suporteComAviso(db, handlers.SuporteRevendedora(db)))))

	// PRODUTOS
	http.Handle("/produtos", auth.AuthMiddlewareComDB(db, bloquearManutencao(db, handlers.CriarProduto(db))))
	http.Handle("/produtos/listar", auth.AuthMiddlewareComDB(db, bloquearManutencao(db, handlers.ListarProdutos(db))))
	http.Handle("/produtos/", auth.AuthMiddlewareComDB(db, bloquearManutencao(db, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPut:
			handlers.EditarProduto(db)(w, r)
		case http.MethodDelete:
			handlers.ExcluirProduto(db)(w, r)
		default:
			http.Error(w, "Método não permitido", http.StatusMethodNotAllowed)
		}
	}))))

	// CLIENTES
	http.Handle("/clientes", auth.AuthMiddlewareComDB(db, bloquearManutencao(db, handlers.CriarCliente(db))))
	http.Handle("/clientes/listar", auth.AuthMiddlewareComDB(db, bloquearManutencao(db, handlers.ListarClientes(db))))
	http.Handle("/clientes/", auth.AuthMiddlewareComDB(db, bloquearManutencao(db, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPut:
			handlers.EditarCliente(db)(w, r)
		case http.MethodDelete:
			handlers.ExcluirCliente(db)(w, r)
		default:
			http.Error(w, "Método não permitido", http.StatusMethodNotAllowed)
		}
	}))))

	// VENDAS
	http.Handle("/vendas", auth.AuthMiddlewareComDB(db, bloquearManutencao(db, handlers.CriarVenda(db))))
	http.Handle("/vendas/listar", auth.AuthMiddlewareComDB(db, bloquearManutencao(db, handlers.ListarVendas(db))))
	http.Handle("/vendas/itens", auth.AuthMiddlewareComDB(db, bloquearManutencao(db, handlers.AdicionarItemVenda(db))))
	http.Handle("/vendas/", auth.AuthMiddlewareComDB(db, bloquearManutencao(db, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			handlers.ExcluirVenda(db)(w, r)
			return
		}
		handlers.DetalharVenda(db)(w, r)
	}))))

	// PAGAMENTOS
	http.Handle("/pagamentos", auth.AuthMiddlewareComDB(db, bloquearManutencao(db, handlers.RegistrarPagamento(db))))

	porta := strings.TrimSpace(os.Getenv("PORT"))
	if porta == "" {
		porta = "8082"
	}

	fmt.Printf("QuitaAí API funcionando na porta %s\n", porta)
	log.Fatal(http.ListenAndServe(":"+porta, cors(http.DefaultServeMux)))
}
