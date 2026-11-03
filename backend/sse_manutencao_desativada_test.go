package main

import (
    "net/http/httptest"
    "testing"
    "time"

    "github.com/DATA-DOG/go-sqlmock"
    "github.com/golang-jwt/jwt/v5"
)

func TestSSEPermiteRevendedoraSemManutencao(t *testing.T) {
    segredo := "chave-exclusiva-para-testes-com-mais-de-32-caracteres"
    t.Setenv("QUITAIA_JWT_SECRET", segredo)

    db, mock, err := sqlmock.New()
    if err != nil {
        t.Fatal(err)
    }
    defer db.Close()

    claims := jwt.MapClaims{
        "usuario_id": 10,
        "exp": time.Now().Add(time.Hour).Unix(),
        "iat": time.Now().Unix(),
    }

    token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
    assinado, err := token.SignedString([]byte(segredo))
    if err != nil {
        t.Fatal(err)
    }

    mock.ExpectQuery("SELECT manutencao,mensagem FROM sistema_configuracao").
        WillReturnRows(sqlmock.NewRows([]string{"manutencao", "mensagem"}).
            AddRow(false, ""))

    mock.ExpectQuery("SELECT perfil, ativo FROM usuarios WHERE id=").
        WithArgs(10).
        WillReturnRows(sqlmock.NewRows([]string{"perfil", "ativo"}).
            AddRow("revendedora", true))

    requisicao := httptest.NewRequest("GET", "/suporte/eventos", nil)
    requisicao.Header.Set("Authorization", "Bearer "+assinado)

    if !sessaoSSEAtiva(db, requisicao, "revendedora", 10) {
        t.Fatal("Revendedora valida foi bloqueada sem manutencao")
    }

    if err := mock.ExpectationsWereMet(); err != nil {
        t.Fatal(err)
    }
}
