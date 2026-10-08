CREATE TABLE vendas (
    id SERIAL PRIMARY KEY,
    cliente_id INTEGER NOT NULL REFERENCES clientes(id),
    data_compra DATE NOT NULL,
    prazo_pagamento INTEGER NOT NULL CHECK (prazo_pagamento >= 0),
    vencimento DATE NOT NULL,
    total NUMERIC(10, 2) NOT NULL CHECK (total >= 0),
    valor_pago NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (valor_pago >= 0),
    saldo NUMERIC(10, 2) NOT NULL CHECK (saldo >= 0),
    status VARCHAR(30) NOT NULL DEFAULT 'EM_DIA',
    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE venda_itens (
    id SERIAL PRIMARY KEY,
    venda_id INTEGER NOT NULL REFERENCES vendas(id) ON DELETE CASCADE,
    produto_id INTEGER NOT NULL REFERENCES produtos(id),
    quantidade INTEGER NOT NULL CHECK (quantidade > 0),
    preco_unitario NUMERIC(10, 2) NOT NULL CHECK (preco_unitario >= 0),
    subtotal NUMERIC(10, 2) NOT NULL CHECK (subtotal >= 0)
);