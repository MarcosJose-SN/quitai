-- QuitaAí: estrutura de pagamentos para novas instalações.
-- Não executar diretamente no banco local existente.

CREATE TABLE IF NOT EXISTS pagamentos (
    id SERIAL PRIMARY KEY,
    venda_id INTEGER NOT NULL REFERENCES vendas(id) ON DELETE CASCADE,
    valor NUMERIC(10,2) NOT NULL CHECK (valor > 0),
    data_pagamento DATE NOT NULL DEFAULT CURRENT_DATE,
    forma_pagamento VARCHAR(20) NOT NULL DEFAULT 'PIX'
        CHECK (forma_pagamento IN ('PIX', 'ESPECIE')),
    parcela_id INTEGER REFERENCES parcelas(id) ON DELETE CASCADE
);