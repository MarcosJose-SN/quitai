-- Executar uma vez no banco quitai. Não apaga tabelas existentes.
CREATE TABLE IF NOT EXISTS suporte_solicitacoes (
 id BIGSERIAL PRIMARY KEY,
 revendedora_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
 assunto VARCHAR(160) NOT NULL,
 categoria VARCHAR(80) NOT NULL DEFAULT 'Geral',
 status VARCHAR(20) NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','em_andamento','resolvido')),
 criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS suporte_mensagens (
 id BIGSERIAL PRIMARY KEY,
 solicitacao_id BIGINT NOT NULL REFERENCES suporte_solicitacoes(id) ON DELETE CASCADE,
 autor_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
 autor_perfil VARCHAR(20) NOT NULL CHECK (autor_perfil IN ('admin','revendedora')),
 mensagem TEXT NOT NULL CHECK (char_length(mensagem) BETWEEN 1 AND 5000),
 criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_suporte_solicitacoes_revendedora ON suporte_solicitacoes(revendedora_id,atualizado_em DESC);
CREATE INDEX IF NOT EXISTS idx_suporte_solicitacoes_atualizacao ON suporte_solicitacoes(atualizado_em DESC);
CREATE INDEX IF NOT EXISTS idx_suporte_mensagens_solicitacao ON suporte_mensagens(solicitacao_id,id);
