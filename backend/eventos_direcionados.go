package main

import "sync"

type destinatarioEvento struct {
    tipo      string
    usuarioID int
}

var eventosDirecionados = struct {
    sync.Mutex
    clientes map[chan struct{}]destinatarioEvento
}{
    clientes: make(map[chan struct{}]destinatarioEvento),
}

func registrarEvento(canal chan struct{}, tipo string, usuarioID int) {
    eventosDirecionados.Lock()
    defer eventosDirecionados.Unlock()
    eventosDirecionados.clientes[canal] = destinatarioEvento{
        tipo:      tipo,
        usuarioID: usuarioID,
    }
}

func removerEvento(canal chan struct{}) {
    eventosDirecionados.Lock()
    defer eventosDirecionados.Unlock()
    delete(eventosDirecionados.clientes, canal)
}

func notificarEventos(tipo string, usuarioID int) {
    eventosDirecionados.Lock()
    defer eventosDirecionados.Unlock()

    for canal, destinatario := range eventosDirecionados.clientes {
        permitido := false

        switch tipo {
        case "sistema":
            permitido = true
        case "suporte":
            permitido = destinatario.tipo == "admin" ||
                (destinatario.tipo == "revendedora" &&
                    destinatario.usuarioID == usuarioID)
        }

        if permitido {
            select {
            case canal <- struct{}{}:
            default:
            }
        }
    }
}

func avisarSuporteDoUsuario(usuarioID int) {
    if usuarioID <= 0 { return }
    notificarEventos("suporte", usuarioID)
}
