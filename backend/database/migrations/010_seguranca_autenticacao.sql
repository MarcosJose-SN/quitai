BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS versao_sessao BIGINT NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS sessoes_revogadas (
 token_hash CHAR(64) PRIMARY KEY, usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
 expira_em TIMESTAMPTZ NOT NULL, criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS sessoes_revogadas_expira ON sessoes_revogadas(expira_em);
CREATE TABLE IF NOT EXISTS limites_autenticacao (
 escopo CHAR(64) NOT NULL, janela BIGINT NOT NULL, tentativas INTEGER NOT NULL CHECK(tentativas>0),
 expira_em TIMESTAMPTZ NOT NULL, PRIMARY KEY(escopo,janela)
);
CREATE INDEX IF NOT EXISTS limites_autenticacao_expira ON limites_autenticacao(expira_em);
CREATE TABLE IF NOT EXISTS alteracoes_email (
 usuario_id INTEGER PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
 novo_email VARCHAR(254) NOT NULL, codigo_hash CHAR(64) NOT NULL,
 versao_sessao BIGINT NOT NULL, expira_em TIMESTAMPTZ NOT NULL,
 tentativas INTEGER NOT NULL DEFAULT 0 CHECK(tentativas>=0),
 enviado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 confirmado_em TIMESTAMPTZ
);
COMMIT;
