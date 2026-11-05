package database

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// Somente valida. Migracoes devem ser aplicadas explicitamente no ambiente correto.
func ValidarEsquemaFinanceiro(db *sql.DB) error {
	ctx, cancelar := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancelar()
	rows, err := db.QueryContext(ctx, `SELECT usuario_id,tipo,chave,pedido_hash,codigo_http,resposta,resposta_bytes FROM operacoes_financeiras LIMIT 0`)
	if err != nil {
		return errors.New("esquema financeiro ausente ou incompativel: aplicar migracao 009 antes de iniciar esta versao")
	}
	rows.Close()
	var unica bool
	err = db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='operacoes_financeiras'::regclass AND conname='operacoes_financeiras_unica' AND contype='u')`).Scan(&unica)
	if err != nil || !unica {
		return errors.New("restricao de idempotencia ausente: verificar migracao 009")
	}
	return nil
}
