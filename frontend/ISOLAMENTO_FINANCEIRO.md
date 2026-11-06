# Limitação conservadora das pendências financeiras

O protocolo financeiro identifica o banco lógico por `FINANCIAL_ENVIRONMENT_ID`.
Cada banco deve receber um identificador estável e diferente, definido pelo responsável.
O cabeçalho não substitui autenticação nem comprova sozinho o destino PostgreSQL.

Registros legados sem ambiente e registros de outro ambiente no mesmo contexto
de API, conta e operação permanecem preservados e bloqueiam novas intenções.
O bloqueio também se aplica a registros confirmados. Não existe conversão,
exclusão automática nem atribuição desses registros ao ambiente atual.

A resolução depende de análise e autorização específicas. Não limpar IndexedDB
ou localStorage, trocar chaves nem reenviar pedidos antigos para contornar o bloqueio.
Uma sessão nova não resolve a identidade de uma pendência antiga.

A exclusão de venda conserva conta, token, API, ambiente e ID capturados nos
detalhes e na confirmação. Trocas de contexto bloqueiam envio ou descarte de
respostas atrasadas. Uma resposta descartada ou falha de rede não prova ausência
de exclusão no servidor; conferir o resultado antes de qualquer nova tentativa.

Antes da publicação, validar o protocolo em PostgreSQL descartável e configurar
os identificadores dos ambientes. Manter a manutenção durante a transição;
instâncias antigas não passam a aplicar a nova proteção automaticamente.
