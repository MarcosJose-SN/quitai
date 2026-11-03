package main

import "testing"

func TestIsolamentoNotificacoesSuporte(t *testing.T) {
    admin := make(chan struct{}, 2)
    revendedora1 := make(chan struct{}, 2)
    revendedora2 := make(chan struct{}, 2)
    publico := make(chan struct{}, 2)

    registrarEvento(admin, "admin", 1)
    registrarEvento(revendedora1, "revendedora", 10)
    registrarEvento(revendedora2, "revendedora", 20)
    registrarEvento(publico, "sistema", 0)

    defer removerEvento(admin)
    defer removerEvento(revendedora1)
    defer removerEvento(revendedora2)
    defer removerEvento(publico)

    avisarSuporteDoUsuario(10)

    if len(admin) != 1 {
        t.Error("Administrador nao recebeu a notificacao")
    }
    if len(revendedora1) != 1 {
        t.Error("Revendedora responsavel nao recebeu a notificacao")
    }
    if len(revendedora2) != 0 {
        t.Error("FALHA DE SEGURANCA: outra revendedora recebeu notificacao privada")
    }
    if len(publico) != 0 {
        t.Error("FALHA DE SEGURANCA: canal publico recebeu notificacao privada")
    }
}

func TestNotificacoesGlobais(t *testing.T) {
    admin := make(chan struct{}, 2)
    revendedora := make(chan struct{}, 2)
    publico := make(chan struct{}, 2)

    registrarEvento(admin, "admin", 1)
    registrarEvento(revendedora, "revendedora", 10)
    registrarEvento(publico, "sistema", 0)

    defer removerEvento(admin)
    defer removerEvento(revendedora)
    defer removerEvento(publico)

    notificarEventos("sistema", 0)

    if len(admin) != 1 || len(revendedora) != 1 || len(publico) != 1 {
        t.Error("Evento global nao chegou a todos os destinatarios")
    }
}

func TestNotificacaoUsuarioInvalido(t *testing.T) {
    admin := make(chan struct{}, 2)
    registrarEvento(admin, "admin", 1)
    defer removerEvento(admin)

    avisarSuporteDoUsuario(0)

    if len(admin) != 0 {
        t.Error("Notificacao enviada para usuario invalido")
    }
}
