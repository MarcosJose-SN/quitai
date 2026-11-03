package main

import (
	"database/sql"
	"github.com/MarcosJose/quitai/auth"
	"fmt"
	"net/http"
	"strings"
	"strconv"
	"time"
)


func avisarSuporte() {
    notificarEventos("sistema", 0)
}

func streamSuporte(db *sql.DB) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Método não permitido", http.StatusMethodNotAllowed)
		return
	}
	f, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming indisponível", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("X-Accel-Buffering", "no")
	w.Header().Set("Connection", "keep-alive")
	canal := make(chan struct{}, 1)
        tipo := "sistema"
        usuarioID, _ := auth.UsuarioID(r)
        if r.URL.Path == "/admin/suporte/eventos" {
                tipo = "admin"
        } else if r.URL.Path == "/suporte/eventos" {
                tipo = "revendedora"
                usuarioID, _ = auth.UsuarioID(r)
                if usuarioID <= 0 {
                        http.Error(w, "Sessao invalida.", http.StatusUnauthorized)
                        return
                }
        }
        registrarEvento(canal, tipo, usuarioID)
        defer removerEvento(canal)
	fmt.Fprint(w, "event: atualizar\ndata: conectado\n\n")
	f.Flush()
	pulso := time.NewTicker(25 * time.Second)
	defer pulso.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case <-canal:
                        if !sessaoSSEAtiva(db, r, tipo, usuarioID) { return }
			fmt.Fprint(w, "event: atualizar\ndata: novo\n\n")
			f.Flush()
		case <-pulso.C:
                    if !sessaoSSEAtiva(db, r, tipo, usuarioID) { return }
			fmt.Fprint(w, ": ping\n\n")
			f.Flush()
		}
	}
    }
}

type suporteStatusWriter struct {
	http.ResponseWriter
	status int
}

func (w *suporteStatusWriter) WriteHeader(codigo int) {
	w.status = codigo
	w.ResponseWriter.WriteHeader(codigo)
}
func (w *suporteStatusWriter) Write(b []byte) (int, error) {
	if w.status == 0 {
		w.status = http.StatusOK
	}
	return w.ResponseWriter.Write(b)
}

func suporteComAviso(db *sql.DB, proximo http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost && r.Method != http.MethodPatch {
			proximo.ServeHTTP(w, r)
			return
		}
		capturador := &suporteStatusWriter{ResponseWriter: w}
		proximo.ServeHTTP(capturador, r)
		if capturador.status >= 200 && capturador.status < 300 && (strings.HasSuffix(r.URL.Path, "/respostas") || strings.HasSuffix(r.URL.Path, "/status") || r.URL.Path == "/suporte") {
			usuarioID, err := destinatarioNotificacaoSuporte(db, r); if err == nil && usuarioID > 0 { avisarSuporteDoUsuario(usuarioID) }
		}
	})
}








func proprietarioChamado(db *sql.DB, r *http.Request, id int) (int, error) {
    var revendedoraID int
    err := db.QueryRowContext(r.Context(),
        "SELECT revendedora_id FROM suporte_solicitacoes WHERE id=$1",
        id,
    ).Scan(&revendedoraID)
    return revendedoraID, err
}

func destinatarioNotificacaoSuporte(db *sql.DB, r *http.Request) (int, error) {
    if r.URL.Path == "/suporte" && r.Method == http.MethodPost {
        usuarioID, ok := auth.UsuarioID(r)
        if !ok || usuarioID <= 0 {
            return 0, fmt.Errorf("usuario nao autenticado")
        }
        return usuarioID, nil
    }

    partes := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
    if len(partes) < 3 {
        return 0, fmt.Errorf("rota de suporte invalida")
    }

    var idTexto string
    if partes[0] == "admin" && len(partes) == 4 && partes[1] == "suporte" {
        idTexto = partes[2]
    } else if partes[0] == "suporte" && len(partes) == 3 {
        idTexto = partes[1]
    } else {
        return 0, fmt.Errorf("rota de suporte desconhecida")
    }

    id, err := strconv.Atoi(idTexto)
    if err != nil || id <= 0 {
        return 0, fmt.Errorf("id do chamado invalido")
    }
    return proprietarioChamado(db, r, id)
}





func sessaoSSEAtiva(db *sql.DB, r *http.Request, tipo string, usuarioID int) bool {
    if tipo != "sistema" && !auth.TokenAindaValido(r) { return false }
    if tipo == "revendedora" {
        ativo, _, err := estadoManutencao(db)
        if err != nil || ativo { return false }
    }
    if tipo == "sistema" {
        return true
    }
    if usuarioID <= 0 {
        return false
    }
    var perfil string
    var ativo bool
    err := db.QueryRowContext(r.Context(),
        "SELECT perfil, ativo FROM usuarios WHERE id=$1",
        usuarioID,
    ).Scan(&perfil, &ativo)
    if err != nil || !ativo {
        return false
    }
    if tipo == "admin" {
        return perfil == "admin"
    }
    return perfil == "revendedora"
}
