package main

import (
	"fmt"
	"log"
	"net/http"

	"github.com/MarcosJose/quitai/auth"
	"github.com/MarcosJose/quitai/database"
	"github.com/MarcosJose/quitai/handlers"
)

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:5174")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func main() {
	db, err := database.Connect()
	if err != nil {
		log.Fatal("Erro ao conectar ao PostgreSQL:", err)
	}

	defer db.Close()

	// ==========================================
	// AUTENTICAÇÃO
	// ==========================================

	http.HandleFunc("/auth/cadastro", auth.Cadastro(db))
	http.HandleFunc("/auth/login", auth.Login(db))
	http.Handle("/auth/me", auth.AuthMiddleware(auth.Me(db)))

	if err := auth.InicializarRecuperacao(db); err != nil {
		log.Fatal("Erro ao inicializar recuperação de senha:", err)
	}

	http.HandleFunc("/auth/recuperar-senha", auth.SolicitarRecuperacao(db))
	http.HandleFunc("/auth/redefinir-senha", auth.RedefinirSenha(db))
	http.HandleFunc("/auth/google", auth.LoginGoogle(db))
	// ==========================================
	// PRODUTOS
	// ==========================================

	http.HandleFunc("/produtos", handlers.CriarProduto(db))
	http.HandleFunc("/produtos/listar", handlers.ListarProdutos(db))

	http.HandleFunc("/produtos/", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPut:
			handlers.EditarProduto(db)(w, r)

		case http.MethodDelete:
			handlers.ExcluirProduto(db)(w, r)

		default:
			http.Error(w, "Método não permitido", http.StatusMethodNotAllowed)
		}
	})

	// ==========================================
	// CLIENTES
	// ==========================================

	http.HandleFunc("/clientes", handlers.CriarCliente(db))
	http.HandleFunc("/clientes/listar", handlers.ListarClientes(db))

	http.HandleFunc("/clientes/", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPut:
			handlers.EditarCliente(db)(w, r)

		case http.MethodDelete:
			handlers.ExcluirCliente(db)(w, r)

		default:
			http.Error(w, "Método não permitido", http.StatusMethodNotAllowed)
		}
	})

	// ==========================================
	// VENDAS
	// ==========================================

	http.HandleFunc("/vendas", handlers.CriarVenda(db))
	http.HandleFunc("/vendas/listar", handlers.ListarVendas(db))
	http.HandleFunc("/vendas/itens", handlers.AdicionarItemVenda(db))

	http.HandleFunc("/vendas/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			handlers.ExcluirVenda(db)(w, r)
			return
		}

		handlers.DetalharVenda(db)(w, r)
	})

	// ==========================================
	// PAGAMENTOS
	// ==========================================

	http.HandleFunc("/pagamentos", handlers.RegistrarPagamento(db))

	// ==========================================
	// INICIALIZAÇÃO DO SERVIDOR
	// ==========================================

	fmt.Println("QuitaAí API funcionando na porta 8082")

	log.Fatal(http.ListenAndServe(":8082", cors(http.DefaultServeMux)))
}
