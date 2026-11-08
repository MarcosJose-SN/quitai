# Corte de sessoes antes da limpeza de uma conta

Implementacao local; nao indica publicacao nem autoriza limpeza.

Os POSTs de clientes e produtos agora revalidam conta ativa, versao da sessao
e revogacao dentro da transacao do INSERT. `FOR SHARE` em `usuarios` permanece
ate COMMIT/Rollback. Erros de banco bloqueiam o cadastro. Os payloads e respostas
de sucesso continuam os mesmos. Nao existe deduplicacao geral de novos pedidos.

Para uma futura limpeza autorizada, a transacao deve primeiro bloquear a linha
do usuario alvo com `FOR UPDATE`, validar sua identidade e incrementar somente
sua `versao_sessao`, junto com a limpeza. Cadastros antigos ja em voo terminam
antes desse corte; cadastros posteriores com a versao antiga recebem 401.
Nao incrementar a versao separadamente nem confiar apenas no middleware anterior
ao handler. Se a transacao reverter, a mudanca de versao tambem deve reverter.

A conta e sua senha permanecem; todas as sessoes anteriores dessa conta deixam
de valer. E necessario novo login. Sessoes de outras contas nao sao invalidadas.
Um pedido deliberadamente reenviado sob uma NOVA sessao nao e distinguivel de
um novo cadastro legitimo por esta protecao. O frontend atual nao reenvia
automaticamente criacoes de clientes/produtos apos login.

Antes de executar: publicar esta protecao com autorizacao especifica, conferir
o SHA efetivamente ativo e todas as instancias escritoras, validar backup atual,
interromper operacoes concorrentes e revalidar IDs/contagens/dependencias.
Ainda nao foi executado incremento de versao nem limpeza em producao.

Preservar os registros de idempotencia existentes e suas respostas historicas.
Nunca reutilizar IDs nem reiniciar sequencias. Pedidos financeiros antigos com
chave ja confirmada continuam apenas reproduzindo a resposta historica; pedidos
nao confirmados referentes a clientes/produtos/vendas removidos nao podem criar
efeitos se os IDs nao forem reutilizados. Preservar pendencias nos navegadores;
nao converter pedidos, trocar chaves ou limpar armazenamento automaticamente.
Resolver eventuais respostas historicas/pendencias individualmente, sem prometer
que um ID historico ainda identifica um cadastro existente.

Esta barreira depende da versao assinada no JWT e da identidade autenticada,
nao de um campo usuario_id enviado no payload nem de um segredo novo.
