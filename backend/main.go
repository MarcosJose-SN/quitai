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

	// AUTENTICAÇÃO
	http.HandleFunc("/auth/cadastro", auth.Cadastro(db))
	http.HandleFunc("/auth/login", auth.Login(db))
	http.Handle("/auth/me", auth.AuthMiddleware(auth.Me(db)))

	if err := auth.InicializarRecuperacao(db); err != nil {
		log.Fatal("Erro ao inicializar recuperação de senha:", err)
	}

	http.HandleFunc("/auth/recuperar-senha", auth.SolicitarRecuperacao(db))
	http.HandleFunc("/auth/redefinir-senha", auth.RedefinirSenha(db))
	http.HandleFunc("/auth/google", auth.LoginGoogle(db))

	// PRODUTOS - ROTAS PROTEGIDAS
	http.Handle("/produtos", auth.AuthMiddleware(handlers.CriarProduto(db)))
	http.Handle("/produtos/listar", auth.AuthMiddleware(handlers.ListarProdutos(db)))

	http.Handle("/produtos/", auth.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPut:
			handlers.EditarProduto(db)(w, r)
		case http.MethodDelete:
			handlers.ExcluirProduto(db)(w, r)
		default:
			http.Error(w, "Método não permitido", http.StatusMethodNotAllowed)
		}
	})))

	// CLIENTES - ROTAS PROTEGIDAS
	http.Handle("/clientes", auth.AuthMiddleware(handlers.CriarCliente(db)))
	http.Handle("/clientes/listar", auth.AuthMiddleware(handlers.ListarClientes(db)))

	http.Handle("/clientes/", auth.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPut:
			handlers.EditarCliente(db)(w, r)
		case http.MethodDelete:
			handlers.ExcluirCliente(db)(w, r)
		default:
			http.Error(w, "Método não permitido", http.StatusMethodNotAllowed)
		}
	})))

	// VENDAS - ROTAS PROTEGIDAS
	http.Handle("/vendas", auth.AuthMiddleware(handlers.CriarVenda(db)))
	http.Handle("/vendas/listar", auth.AuthMiddleware(handlers.ListarVendas(db)))
	http.Handle("/vendas/itens", auth.AuthMiddleware(handlers.AdicionarItemVenda(db)))

	http.Handle("/vendas/", auth.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			handlers.ExcluirVenda(db)(w, r)
			return
		}
		handlers.DetalharVenda(db)(w, r)
	})))

	// PAGAMENTOS - ROTA PROTEGIDA
	http.Handle("/pagamentos", auth.AuthMiddleware(handlers.RegistrarPagamento(db)))

	fmt.Println("QuitaAí API funcionando na porta 8082")
	log.Fatal(http.ListenAndServe(":8082", cors(http.DefaultServeMux)))
}
