package main

import (
	"fmt"
	"log"
	"net/http"

	"github.com/MarcosJose/quitai/database"
	"github.com/MarcosJose/quitai/handlers"
)

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:5174")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

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

	http.HandleFunc("/produtos", handlers.CriarProduto(db))
	http.HandleFunc("/produtos/listar", handlers.ListarProdutos(db))

	http.HandleFunc("/clientes", handlers.CriarCliente(db))
	http.HandleFunc("/clientes/listar", handlers.ListarClientes(db))

	http.HandleFunc("/vendas", handlers.CriarVenda(db))
	http.HandleFunc("/vendas/listar", handlers.ListarVendas(db))
	http.HandleFunc("/vendas/itens", handlers.AdicionarItemVenda(db))
	http.HandleFunc("/vendas/", handlers.DetalharVenda(db))

	http.HandleFunc("/pagamentos", handlers.RegistrarPagamento(db))

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

	fmt.Println("QuitaAí API funcionando na porta 8082")

	log.Fatal(http.ListenAndServe(":8082", cors(http.DefaultServeMux)))
}
