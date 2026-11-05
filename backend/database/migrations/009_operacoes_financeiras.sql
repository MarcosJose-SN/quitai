-- Aditiva: nao modifica vendas, estoque, parcelas ou pagamentos existentes.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS operacoes_financeiras (
 id BIGSERIAL PRIMARY KEY,
 usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
 tipo VARCHAR(32) NOT NULL CHECK (tipo IN ('venda_completa','pagamento')),
 chave VARCHAR(128) NOT NULL CHECK (chave ~ '^[A-Za-z0-9_-]{16,128}$'),
 pedido_hash CHAR(64) NOT NULL,
 codigo_http SMALLINT CHECK (codigo_http BETWEEN 200 AND 299),
 resposta JSONB,
 resposta_bytes BYTEA,
 criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT operacoes_financeiras_unica UNIQUE(usuario_id,tipo,chave),
 CONSTRAINT operacoes_financeiras_resultado CHECK (
  (codigo_http IS NULL AND resposta IS NULL AND resposta_bytes IS NULL) OR
  (codigo_http IS NOT NULL AND resposta IS NOT NULL AND resposta_bytes IS NOT NULL)
 )
);
COMMIT;