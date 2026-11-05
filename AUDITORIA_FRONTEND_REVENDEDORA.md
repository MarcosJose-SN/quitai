Auditoria do frontend da revendedora — QuitaAí — 04/11/2026

Branch: `feat/login-google-recuperacao`. Base preservada: `fe87038`.
Conclusão: **NÃO PRONTO PARA PUBLICAÇÃO** até tratar o risco de criação parcial de vendas e validar escritas financeiras em homologação autorizada.

**A. Problemas encontrados, gravidade e evidências**

| Problema comprovado | Gravidade | Evidência e tratamento |
| --- | --- | --- |
| Rascunhos e notificações usavam chaves únicas para todas as contas | Alta, privacidade em dispositivo compartilhado | App.jsx inicializava/escrevia `quitai_suporte_rascunhos` sem proprietário. Agora chaves incluem API e ID; testes de duas contas e de duas APIs. |
| Logout removia token mas mantinha os estados do App montado; 401/403 de operações eram tratados como erros genéricos | Alta | `confirmarSaidaDaConta`, fetch autenticado e validação inicial. Agora sessão é removida e a aplicação recarregada; respostas de uma sessão anterior são descartadas. Falha inicial de validação não libera painel. |
| Console imprimia clientes, produtos, vendas, detalhes e pagamentos | Média, exposição desnecessária | Dez console.log de payloads removidos. Navegador confirmou ausência desses logs nos cenários. |
| Datas padrão usavam toISOString, que pode avançar o dia à noite em São Paulo | Média, datas financeiras | Sete usos financeiros substituídos por calendário local; criado teste próximo da meia-noite. Instantes de mensagens/rascunhos continuam ISO completo. |
| Botão Adicionar aceitava quantidade fracionária sem usar a validação nativa do formulário | Média | Validação explícita de inteiro positivo compatível com PostgreSQL; navegador confirmou rejeição antes de POST. |
| Pagamento/estoque permitiam valores inadequados em submissões que escapassem à validação HTML | Média | Centavos válidos, valores finitos, estoque inteiro e limite do int PostgreSQL. Testes rejeitam 1.001, infinito, NaN e estoque fracionário. |
| Ausência de trava síncrona permitia submissões concorrentes antes da próxima renderização | Alta em pagamentos | Trava por operação envolvendo oito formulários e confirmações de exclusão. Testes duplicam eventos de submit e contam um POST. Login/recuperação também usam trava. Isso não é idempotência de backend. |
| Venda VENCIDO aparecia EM ABERTO no início | Média | Captura inicial 320-inicio.png e condição binária no JSX. Passou a usar o mesmo mapeamento da lista de vendas. |
| Troca rápida de chamados podia aplicar a resposta tardia da conversa anterior | Média | Identificação de pedido e chamado selecionado; cenário A lento/B rápido confirmou B mantido. Respostas bloqueiam a troca temporariamente. |
| Suporte continuava sincronizando após navegar a outra aba, pois subTelaMais permanecia suporte | Baixa, requisições extras | Efeitos agora também dependem de tela === mais; teste de foco fora da tela não faz consulta de suporte. |
| Erro ao abrir detalhe de venda podia ficar fora da tela visível e respostas antigas podiam prevalecer | Média | Tela de detalhes abre com carregamento; pedidos recebem versão e são invalidados ao sair. Falha simulada mostra erro, sem carregamento infinito. |
| Erros 409 de cadastro eram substituídos por mensagens genéricas | Baixa | Erro devolvido pelo backend preservado. Conflito de cliente foi reproduzido e validado no formulário. |
| Falha de atualização após pagamento confirmado era escrita dentro de modal já fechado | Alta, risco de reenviar pagamento | Aviso passa a aparecer na tela visível; dados antigos são retirados para exigir nova consulta antes de outra operação. POST e refresh são simulados separadamente no teste. |
| Falha em um detalhe fazia o resumo de parcelas exibir uma soma parcial como completa | Média | Resumo incompleto passa a indisponível (—), sem inventar zero. Regra de soma de parcelas não foi alterada. |
| Respostas de listagem fora do formato esperado podiam derrubar filtros/renderização | Média | Coleções são validadas antes do setState; teste com objeto em vez de lista não causou tela branca. |
| Limite de senha do frontend divergia dos 72 bytes aceitos pelo bcrypt/backend | Baixa | Recuperação 6–72 bytes; alteração autenticada 8–72 bytes; sem alterar senhas existentes. |

A resposta 401 de senha atual incorreta é um erro de formulário e preserva a sessão. JWT expirado na mesma rota encerra a sessão. Essa diferença possui testes próprios. Respostas 404/500 preservam a sessão para tratamento funcional.

**B. Correções e preservação**

Arquivos existentes modificados:

- `frontend/src/App.jsx`: correções de sessão, suporte, validação financeira, status, feedback e travas, descritas acima.
- `frontend/src/Login.jsx`: trava de solicitações simultâneas e limite de senha em bytes.

Arquivos novos:

- `frontend/src/services/sessaoRevendedora.js`: transporte autenticado, encerramento de sessão, descarte de resposta antiga e armazenamento por conta/API.
- `frontend/src/utils/validacaoRevendedora.js`: calendário local, validação de centavos/quantidades e trava por operação.
- `frontend/tests/revendedora.test.js`: onze regressões unitárias, usando node:test sem dependência nova.
- `frontend/tests/revendedora.browser.mjs`: 25 verificações em Chrome via CDP, com fixtures e bloqueio de solicitações fora do frontend/API simulada.
- `frontend/tests/responsividade.browser.mjs`: matriz de 98 capturas e verificação de geometria/acesso aos botões.
- `AUDITORIA_FRONTEND_REVENDEDORA.md`: este relatório.

Backup anterior às alterações: `backup_frontend_revendedora_20261104_230447/frontend/`.
Nenhum CSS, identidade visual, regra de distribuição financeira do backend ou componente CentralSuporteAdmin foi alterado. O commit fe87038, a migração da foto e AUDITORIA_HOSPEDAGEM.md foram preservados. Nenhum arquivo foi adicionado ao índice Git nesta etapa.

Rascunhos antigos na chave global foram preservados, sem atribuí-los automaticamente à conta que entrar primeiro. Eles não aparecem nas listas isoladas novas porque sua autoria não pode ser determinada com segurança. Recuperação/atribuição deve ser aprovada após identificar o proprietário. Rascunhos novos continuam com salvar/consultar/excluir; não foi acrescentado botão opcional de envio direto. O texto do formulário é preservado se o armazenamento falhar.

**C. Testes e limites da aprovação**

- `npm.cmd run build`: aprovado; aviso existente de chunk >500 kB, atualmente aproximadamente 524,7 kB.
- `node --test tests/revendedora.test.js` (em frontend): 11 aprovados, zero falhas.
- `go test ./...`: aprovado. Nenhum backend de produção foi modificado.
- `git diff --check`: aprovado.
- Chrome headless real, perfil isolado, timezone America/Sao_Paulo: 25 verificações funcionais aprovadas. As respostas de API e as operações de escrita foram SIMULADAS; nenhum cliente/produto/venda/pagamento real foi criado ou excluído.
- Matriz visual: 98 capturas, zero overflow horizontal encontrado, zero exceções JavaScript e zero console.log de dados de negócio. Os 28 botões de confirmação dos quatro modais ficaram acessíveis por rolagem, sem sobreposição, na altura de 900 px usada no teste.
- `go run ./tmp/auditoria`: 69 verificações HTTP da API REAL LOCAL passaram. Incluem leituras de contas/vendas/parcelas/pagamentos/suporte, isolamento entre contas, 401/403, CORS e payloads inválidos sem mutação. JWTs de diagnóstico ficaram em memória; nenhum segredo foi exibido. A foto administrativa atual respondeu 200, conforme os dados existentes; não foi alterada.
- Lint somente de src: 31 diagnósticos na execução auxiliar. Permanecem avisos de hooks/refs e de código anterior; não é lint limpo e não houve correção automática ampla.
- Durante preparação dos testes, houve falhas do roteiro (CORS fictício, seletores, normalização de cabeçalhos e esperas), corrigidas antes dos resultados finais. Não foram atribuídas ao produto.

Não executados/aprovados: escrita financeira real de ponta a ponta, recuperação por SMTP, alteração real de senha, testes em dispositivos físicos, versões diferentes de navegador, redes móveis reais, carga e ambientes hospedados. Login no navegador foi simulado; não representa novo login com senha real no backend. As validações locais de backend e os mocks não substituem homologação financeira.

Evidências locais, ignoradas pelo Git:

- `backup_frontend_revendedora_20261104_230447/baseline.json`: primeira matriz com dados carregados.
- `backup_frontend_revendedora_20261104_230447/final/baseline.json`: resultados finais por tela/largura e acesso aos botões.
- `backup_frontend_revendedora_20261104_230447/final/regressoes-browser.json`: 25 verificações finais.
- PNGs em `backup_frontend_revendedora_20261104_230447/final/`, contendo apenas fixtures sintéticos.

Os scripts de navegador exigem Chrome de auditoria com perfil separado e CDP em 127.0.0.1:9223. Não conectar ao perfil pessoal. Com o Vite local em 5174 e esse navegador já iniciado, executar na raiz:

```
node frontend/tests/revendedora.browser.mjs <diretorio-de-evidencias-existente>
node frontend/tests/responsividade.browser.mjs <diretorio-de-evidencias-existente>
```

Somente localhost:5174 é carregado; localhost:8082 é interceptado e recebe fixtures. Qualquer outra origem é bloqueada. Os scripts não contêm tokens válidos nem credenciais reais.

**D. Responsividade**

| Largura | Telas/estados | Overflow horizontal | Botões de confirmação dos modais |
| --- | --- | --- | --- |
| 320 px | 14 | Não detectado | 4 acessíveis por rolagem |
| 375 px | 14 | Não detectado | 4 acessíveis por rolagem |
| 390 px | 14 | Não detectado | 4 acessíveis por rolagem |
| 430 px | 14 | Não detectado | 4 acessíveis por rolagem |
| 768 px | 14 | Não detectado | 4 acessíveis por rolagem |
| 1024 px | 14 | Não detectado | 4 acessíveis por rolagem |
| 1440 px | 14 | Não detectado | 4 acessíveis por rolagem |

Estados cobertos: início, vendas, clientes, produtos, Mais, suporte, Minha Conta, modal de cliente, modal de produto, modal de nova venda, detalhes da venda, modal de pagamento, configurações e login. Foram usados nomes longos sintéticos e uma venda com pagamento parcial, parcela quitada e parcela aberta. A conversa de suporte foi exercitada nos cenários funcionais de 390 px. Modais usam rolagem vertical existente, necessária em celulares. Não foi necessária mudança de CSS ou redesign.

**E. Segurança, funcionalidades verificadas e pendências**

- Corrigidos: exposição de payloads no console, reaproveitamento de estado entre sessões, sessão expirada sem encerramento, rascunhos/notificações globais e troca de respostas antigas.
- Mantidos: JWT Bearer, verificação de perfil no backend, escopo de proprietário, armazenamento atual de sessão e identidade visual. A nova separação de chaves não criptografa dados e não protege contra alguém com acesso ao mesmo perfil do navegador/devtools.
- Dados de clientes/produtos: consulta, formulários, atualização e exclusões com confirmação existem. Regressões de cadastro simuladas e listagens reais locais foram verificadas. Exclusões reais não foram executadas.
- Vendas/parcelas/pagamentos: backend calcula preços, totais, parcelas e distribuição dos pagamentos; o frontend mantém essa autoridade. A validação em centavos não redistribui pagamentos nem recalcula o que foi persistido.
- O cartão Boletos em aberto soma saldos de parcelas. Não foi encontrada emissão bancária de boleto, código de barras, gateway de cobrança ou geração/upload de comprovante. Não considerar essas funções implementadas apenas pelo nome do cartão. Existe histórico de pagamentos PIX/ESPÉCIE.
- Minha Conta/configurações: consulta, edição de perfil, formulário de senha e preferências estão presentes. Nenhum dado real de perfil/senha foi alterado. Envio real por SMTP não foi aprovado.
- Requisições extras de StrictMode em desenvolvimento e consultas de detalhes por venda (N+1) não são, isoladamente, loops infinitos. A soma do resumo ainda faz uma consulta por venda e requer avaliação de escala.

**Risco alto pendente: criação parcial de venda.** `salvarVenda` cria a venda e depois faz um POST por item; cada chamada possui sua própria transação no backend. Se um item falha, a venda e itens anteriores podem já estar persistidos. Uma nova tentativa do fluxo pode criar outra venda. A trava adicionada impede concorrência no frontend, mas não garante atomicidade nem idempotência entre requisições ou após perda de resposta. Não apaguei registros nem implementei compensação automática. A correção adequada exige aprovação de um fluxo transacional no backend e testes de falha; é mudança de maior risco fora desta correção de frontend.

Também pendentes: idempotência de pagamento em falha de rede depois do commit do servidor, limites contra abuso de autenticação/recuperação, política de revogação de JWT e demais pendências de hospedagem/integridade do relatório anterior. Os cenários de UI não liberam publicação financeira automaticamente.

**F. Publicação**

Classificação: **NÃO PRONTO PARA PUBLICAÇÃO**. O frontend melhorou e os testes locais podem continuar em http://localhost:5174. Antes de produção: aprovar correção de atomicidade/idempotência, executar homologação financeira com dados descartáveis autorizados, validar recuperação por e-mail e revisar as pendências de hospedagem. Nenhum Render, Railway, Pages ou Neon foi acessado ou alterado.

**G. Git e preservação**

Os oito arquivos listados em B são o conjunto de alterações desta etapa. Nenhum commit, push, merge, deploy ou migração foi executado. Nenhum cliente, produto, venda, parcela, pagamento, senha ou credencial real foi modificado. ProjectFlow foi preservado. O commit fe87038 continua como HEAD; a alteração anterior da Central de Suporte permanece intacta.

Ao terminar a auditoria, aguardar aprovação para mudanças de maior risco ou publicação.