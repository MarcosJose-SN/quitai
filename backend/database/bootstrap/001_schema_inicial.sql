-- QuitaAi | Instalacao inicial do PostgreSQL
-- Destinado exclusivamente a bancos novos e vazios.
-- NAO executar no banco local existente.
-- NAO executar em producao antes da validacao em banco de testes.
-- Este arquivo ainda esta em preparacao e nao deve ser executado.

-- 1. Usuarios e permissoes
CREATE TABLE usuarios (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(150) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    senha_hash TEXT NOT NULL,
    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    perfil VARCHAR(20) NOT NULL DEFAULT 'revendedora'
        CONSTRAINT usuarios_perfil_check
        CHECK (perfil IN ('admin', 'revendedora')),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    foto_perfil_url TEXT
);

CREATE UNIQUE INDEX idx_usuarios_email_lower
    ON usuarios (LOWER(email));

COMMENT ON COLUMN usuarios.foto_perfil_url IS
    'Caminho relativo da foto de perfil armazenada no servidor; NULL quando nao cadastrada.';

-- 2. Produtos vinculados a cada revendedora
CREATE TABLE produtos (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(150) NOT NULL,
    codigo VARCHAR(50) NOT NULL,
    categoria VARCHAR(100),
    preco_custo NUMERIC(10,2) NOT NULL CHECK (preco_custo >= 0),
    preco_venda NUMERIC(10,2) NOT NULL CHECK (preco_venda >= 0),
    estoque INTEGER NOT NULL DEFAULT 0 CHECK (estoque >= 0),
    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    usuario_id INTEGER NOT NULL
        CONSTRAINT produtos_usuario_id_fkey REFERENCES usuarios(id)
);

CREATE UNIQUE INDEX idx_produtos_usuario_codigo
    ON produtos (usuario_id, codigo);

-- 3. Clientes vinculados a cada revendedora
CREATE TABLE clientes (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(150) NOT NULL,
    telefone VARCHAR(30),
    observacoes TEXT,
    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    usuario_id INTEGER NOT NULL
        CONSTRAINT clientes_usuario_id_fkey REFERENCES usuarios(id),
    CONSTRAINT clientes_id_usuario_id_unique UNIQUE (id, usuario_id)
);

-- 4. Vendas vinculadas a clientes e revendedoras
CREATE TABLE vendas (
    id SERIAL PRIMARY KEY,
    cliente_id INTEGER NOT NULL,
    data_compra DATE NOT NULL,
    prazo_pagamento INTEGER NOT NULL CHECK (prazo_pagamento >= 0),
    vencimento DATE NOT NULL,
    total NUMERIC(10,2) NOT NULL CHECK (total >= 0),
    valor_pago NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (valor_pago >= 0),
    saldo NUMERIC(10,2) NOT NULL CHECK (saldo >= 0),
    status VARCHAR(30) NOT NULL DEFAULT 'EM_DIA',
    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    total_parcelas INTEGER NOT NULL DEFAULT 1,
    usuario_id INTEGER NOT NULL
        CONSTRAINT vendas_usuario_id_fkey REFERENCES usuarios(id),
    CONSTRAINT vendas_cliente_usuario_fkey
        FOREIGN KEY (cliente_id, usuario_id)
        REFERENCES clientes(id, usuario_id)
);

-- 5. Itens vinculados a vendas e produtos
CREATE TABLE venda_itens (
    id SERIAL PRIMARY KEY,
    venda_id INTEGER NOT NULL
        CONSTRAINT venda_itens_venda_id_fkey
        REFERENCES vendas(id) ON DELETE CASCADE,
    produto_id INTEGER NOT NULL
        CONSTRAINT venda_itens_produto_id_fkey
        REFERENCES produtos(id),
    quantidade INTEGER NOT NULL CHECK (quantidade > 0),
    preco_unitario NUMERIC(10,2) NOT NULL CHECK (preco_unitario >= 0),
    subtotal NUMERIC(10,2) NOT NULL CHECK (subtotal >= 0)
);

-- 6. Parcelas vinculadas às vendas
CREATE TABLE parcelas (
    id SERIAL PRIMARY KEY,
    venda_id INTEGER NOT NULL
        CONSTRAINT parcelas_venda_id_fkey
        REFERENCES vendas(id) ON DELETE CASCADE,
    numero_parcela INTEGER NOT NULL,
    total_parcelas INTEGER NOT NULL,
    valor NUMERIC(10,2) NOT NULL CHECK (valor > 0),
    vencimento DATE NOT NULL,
    valor_pago NUMERIC(10,2) NOT NULL DEFAULT 0,
    status VARCHAR(30) NOT NULL DEFAULT 'EM_ABERTO',
    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT parcelas_numero_valido
        CHECK (numero_parcela > 0),

    CONSTRAINT parcelas_total_valido
        CHECK (total_parcelas > 0),

    CONSTRAINT parcelas_numero_total_valido
        CHECK (numero_parcela <= total_parcelas),

    CONSTRAINT parcelas_valor_pago_valido
        CHECK (valor_pago >= 0 AND valor_pago <= valor)
);

CREATE INDEX idx_parcelas_venda_id
    ON parcelas(venda_id);

CREATE INDEX idx_parcelas_vencimento
    ON parcelas(vencimento);

-- 7. Pagamentos vinculados a vendas e parcelas
CREATE TABLE pagamentos (
    id SERIAL PRIMARY KEY,
    venda_id INTEGER NOT NULL
        CONSTRAINT pagamentos_venda_id_fkey
        REFERENCES vendas(id) ON DELETE CASCADE,
    valor NUMERIC(10,2) NOT NULL CHECK (valor > 0),
    data_pagamento DATE NOT NULL DEFAULT CURRENT_DATE,
    forma_pagamento VARCHAR(20) NOT NULL DEFAULT 'PIX'
        CHECK (forma_pagamento IN ('PIX', 'ESPECIE')),
    parcela_id INTEGER
        CONSTRAINT pagamentos_parcela_id_fkey
        REFERENCES parcelas(id) ON DELETE CASCADE
);

-- 8. Solicitacoes da Central de Suporte
CREATE TABLE suporte_solicitacoes (
    id BIGSERIAL PRIMARY KEY,
    revendedora_id INTEGER NOT NULL
        REFERENCES usuarios(id) ON DELETE RESTRICT,
    assunto VARCHAR(160) NOT NULL,
    categoria VARCHAR(80) NOT NULL DEFAULT 'Geral',
    status VARCHAR(20) NOT NULL DEFAULT 'aberto'
        CHECK (status IN ('aberto', 'em_andamento', 'resolvido')),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_suporte_solicitacoes_revendedora
    ON suporte_solicitacoes(revendedora_id, atualizado_em DESC);

CREATE INDEX idx_suporte_solicitacoes_atualizacao
    ON suporte_solicitacoes(atualizado_em DESC);

-- 9. Mensagens da Central de Suporte
CREATE TABLE suporte_mensagens (
    id BIGSERIAL PRIMARY KEY,
    solicitacao_id BIGINT NOT NULL
        REFERENCES suporte_solicitacoes(id) ON DELETE CASCADE,
    autor_id INTEGER NOT NULL
        REFERENCES usuarios(id) ON DELETE RESTRICT,
    autor_perfil VARCHAR(20) NOT NULL
        CHECK (autor_perfil IN ('admin', 'revendedora')),
    mensagem TEXT NOT NULL
        CHECK (char_length(mensagem) BETWEEN 1 AND 5000),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_suporte_mensagens_solicitacao
    ON suporte_mensagens(solicitacao_id, id);

-- 10. Codigos de recuperacao de senha
CREATE TABLE codigos_recuperacao_senha (
    id BIGSERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL
        REFERENCES usuarios(id) ON DELETE CASCADE,
    codigo_hash CHAR(64) NOT NULL,
    expira_em TIMESTAMPTZ NOT NULL,
    usado_em TIMESTAMPTZ,
    tentativas INTEGER NOT NULL DEFAULT 0,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_codigos_recuperacao_usuario
    ON codigos_recuperacao_senha(usuario_id);

CREATE INDEX idx_codigos_recuperacao_expira
    ON codigos_recuperacao_senha(expira_em);

-- 11. Configuracao de manutencao
CREATE TABLE sistema_configuracao (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    manutencao BOOLEAN NOT NULL DEFAULT FALSE,
    mensagem TEXT NOT NULL DEFAULT 'Estamos realizando melhorias. Volte em instantes.'
);

INSERT INTO sistema_configuracao (id)
VALUES (1);

-- 12. Comunicados do sistema
CREATE TABLE sistema_avisos (
    id BIGSERIAL PRIMARY KEY,
    titulo VARCHAR(160) NOT NULL,
    mensagem TEXT NOT NULL,
    tipo VARCHAR(20) NOT NULL DEFAULT 'informacao',
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
