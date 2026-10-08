CREATE TABLE parcelas (
    id SERIAL PRIMARY KEY,
    venda_id INTEGER NOT NULL REFERENCES vendas(id) ON DELETE CASCADE,
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