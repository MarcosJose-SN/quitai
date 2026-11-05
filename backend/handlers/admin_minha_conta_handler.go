package handlers

import (
	"database/sql"
	"github.com/MarcosJose/quitai/auth"
	"net/http"
)

func AdminAtualizarMinhaConta(db *sql.DB) http.HandlerFunc { return auth.AtualizarPerfil(db, "admin") }
func AtualizarMinhaContaRevendedora(db *sql.DB) http.HandlerFunc {
	return auth.AtualizarPerfil(db, "revendedora")
}
func AdminAlterarMinhaSenha(db *sql.DB) http.HandlerFunc { return auth.AlterarSenha(db, "admin") }
func AlterarMinhaSenhaRevendedora(db *sql.DB) http.HandlerFunc {
	return auth.AlterarSenha(db, "revendedora")
}
