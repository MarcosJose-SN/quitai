
BEGIN;

-- Confirma que existe um usuário para receber os dados atuais.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM usuarios WHERE id = 1) THEN
        RAISE EXCEPTION 'Usuário de ID 1 não encontrado. Migração cancelada.';
    END IF;
END $$;

-- Adiciona as colunas sem apagar registros.
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS usuario_id INTEGER;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS usuario_id INTEGER;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS usuario_id INTEGER;

-- Associa os registros antigos à conta existente.
UPDATE produtos SET usuario_id = 1 WHERE usuario_id IS NULL;
UPDATE clientes SET usuario_id = 1 WHERE usuario_id IS NULL;
UPDATE vendas SET usuario_id = 1 WHERE usuario_id IS NULL;

-- Exige proprietário em todos os registros.
ALTER TABLE produtos ALTER COLUMN usuario_id SET NOT NULL;
ALTER TABLE clientes ALTER COLUMN usuario_id SET NOT NULL;
ALTER TABLE vendas ALTER COLUMN usuario_id SET NOT NULL;

-- Cria as chaves estrangeiras apenas se ainda não existirem.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'produtos_usuario_id_fkey'
          AND conrelid = 'produtos'::regclass
    ) THEN
        ALTER TABLE produtos
            ADD CONSTRAINT produtos_usuario_id_fkey
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'clientes_usuario_id_fkey'
          AND conrelid = 'clientes'::regclass
    ) THEN
        ALTER TABLE clientes
            ADD CONSTRAINT clientes_usuario_id_fkey
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'vendas_usuario_id_fkey'
          AND conrelid = 'vendas'::regclass
    ) THEN
        ALTER TABLE vendas
            ADD CONSTRAINT vendas_usuario_id_fkey
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
    END IF;
END $$;

-- Substitui a unicidade global pela unicidade por proprietário.
ALTER TABLE produtos DROP CONSTRAINT IF EXISTS produtos_codigo_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_produtos_usuario_codigo
    ON produtos (usuario_id, codigo);

COMMIT;
