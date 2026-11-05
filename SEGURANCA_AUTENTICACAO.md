# Segurança de autenticação — QuitaAí

Data: 05/11/2026. Branch: `feat/login-google-recuperacao`. HEAD preservado: `fe87038`.

## A. Problemas corrigidos

1. Sessões existentes não eram revogadas pela troca ou recuperação da senha. Agora ambas incrementam a versão persistente do usuário, na mesma transação da mudança da senha. A verificação é feita nas rotas protegidas e no SSE.
2. Logout apagava somente o navegador. Agora `POST /auth/logout` grava a revogação do token específico no PostgreSQL antes de o frontend declarar sucesso. Falha operacional conserva o token no navegador e informa que é preciso tentar novamente. JWT já expirado permite a limpeza local, pois o servidor já o rejeita.
3. Um token isolado permitia substituir o endereço de recuperação. Alterar e-mail agora exige senha atual e código enviado ao novo endereço; o endereço anterior permanece até a confirmação. Confirmar também revoga as sessões e invalida recuperações anteriores.
4. Login, recuperação e verificação de códigos não tinham orçamento compartilhado. Foram adicionados limites transacionais persistentes por conta e origem, independentes da instância do backend. Reenvio não reinicia o orçamento de verificação.
5. Falha de SMTP diferenciava contas existentes. A resposta pública de solicitação é uniforme para conta ausente, bloqueada ou existente, inclusive quando não há entrega. Envio é assíncrono e limitado; respostas não incluem diagnóstico SMTP.
6. Recuperações concorrentes podiam criar mais de um código aberto. Solicitação e consumo serializam pelo registro do usuário. Incremento de tentativa incorreta, linhas afetadas e commit são verificados; erro de banco retorna falha segura.
7. Recuperação aceitava senha mais fraca que a troca autenticada. Uma única política no backend agora exige 8 a 72 bytes para toda senha nova. Login das contas existentes não força alteração nem reprocessa seus hashes.
8. Páginas administrativas tratavam 401/403 isoladamente. Todas as chamadas administrativas passaram pelo cliente compartilhado. Rejeição de autenticação limpa sessão, desmonta o painel e volta à entrada; SSE encerra reconexões. Senha atual incorreta é identificada como erro do formulário, inclusive na confirmação de e-mail.
9. Foram adicionados limites de JSON, trabalho bcrypt, fila SMTP, prazos de banco/SMTP, timeouts de leitura HTTP e `Cache-Control: no-store` nas respostas protegidas. Nenhum log novo inclui senha, token, código ou corpo do pedido.

## B. Arquivos desta etapa

| Arquivos | Finalidade |
|---|---|
| `backend/auth/auth.go` | Claims com versão, emissão com identificador aleatório, login limitado, consulta da versão, validação persistente e proteção de cache |
| `backend/auth/seguranca.go` — novo | JSON estrito, política compartilhada, limites PostgreSQL, origem/proxy confiável, revogação individual, validação de sessão e esquema |
| `backend/auth/perfil_seguro.go` — novo | Troca de senha e alteração confirmada de e-mail, com transações e reautenticação |
| `backend/auth/external_auth.go` | Recuperação serializada, orçamento de tentativas, erros verificados, envio assíncrono limitado e SMTP com TLS obrigatório/prazo |
| `backend/handlers/admin_minha_conta_handler.go` | Delega os quatro handlers de perfil/senha à implementação segura compartilhada |
| `backend/handlers/admin_handler.go` | Política de senha nova, validação de nome/e-mail e limite do corpo no cadastro autorizado; perfil criado continua fixo em revendedora |
| `backend/main.go` | Rota de logout, validação do esquema 010 e timeouts HTTP, mantendo SSE |
| `backend/suporte_tempo_real.go` | Revalidação persistente da sessão no fluxo SSE |
| `backend/database/migrations/010_seguranca_autenticacao.sql` — nova | Estruturas persistentes descritas na seção C |
| `backend/database/bootstrap/001_schema_inicial.sql` | Inclui as estruturas 010 para instalações novas; preserva 009 |
| `frontend/src/services/sessaoRevendedora.js` | Cliente autenticado compartilhado, erro de senha distinto de JWT, logout confirmado e pedido de novo login |
| `frontend/src/services/suporteEventos.js` | Cliente autenticado no SSE e interrupção após rejeição da sessão |
| `frontend/src/App.jsx`, `frontend/src/Login.jsx` | Logout no servidor, confirmação de e-mail, reautenticação após mudança de credencial e política de senha nova |
| `frontend/src/admin/AdminApp.jsx` | Encerramento central, sincronização entre abas, campos de confirmação de e-mail e integração dos formulários |
| `frontend/src/admin/pages/{CentralSuporteAdmin,Configuracoes,Dashboard,GestaoAvisosAdmin,Relatorios}.jsx` | Importação do cliente autenticado; fluxos próprios e visual preservados |
| `backend/auth/seguranca_integracao_test.go` — novo | Testes de segurança com PostgreSQL descartável |
| `backend/auth/auth_test.go`, `backend/handlers/admin_perfil_handler_test.go`, `backend/sse_manutencao{,_desativada}_test.go` | Ajuste das expectativas dos controles persistentes |
| `backend/handlers/financeiro_integracao_test.go` | Instalação do esquema 010 nas fixtures e regressões de sessão/bloqueio financeiro |
| `frontend/tests/autenticacao.test.js`, `frontend/tests/admin-autenticacao.browser.mjs` — novos | Logout, sessão administrativa, SSE e recuperação de intenção financeira |
| `SEGURANCA_AUTENTICACAO.md` — novo | Este relatório |

Não houve edição de CSS, cores, imagens ou organização das telas. Os campos de senha/código acrescentados são necessários para a segurança da troca de e-mail. Central de Suporte conserva sua implementação; sua página recebeu a importação do cliente autenticado. O handler da foto, a migração 009 e os handlers centrais financeiros permanecem iguais ao backup desta etapa. Mudanças de etapas anteriores continuam no workspace e não foram revertidas.

## C. Migração, backup e integridade

Backup anterior às alterações: `backup_autenticacao_20261105/`, com cópia do backend, frontend, testes e relatório financeiro, além de `quitai_local.dump`. O catálogo do dump foi verificado, com 115 entradas. Diretório privado e ignorado pelo Git; não publicar seu conteúdo.

A migração 010 foi executada duas vezes nas fixtures e duas vezes sobre um clone somente do esquema efetivo local, no PostgreSQL 16 descartável, sem copiar registros reais. Depois de aprovada, foi aplicada exclusivamente ao `quitai-postgres`, loopback 5434.

Estruturas aditivas:

- `usuarios.versao_sessao BIGINT NOT NULL DEFAULT 0`.
- `sessoes_revogadas`, com hash do token como chave primária, proprietário e expiração.
- `limites_autenticacao`, com chave composta de escopo HMAC e janela, contador e expiração.
- `alteracoes_email`, uma pendência por usuário, novo endereço, hash do código, versão, tentativas e datas.
- Índices de expiração para manutenção futura dos registros de segurança.

Comparação dos dados com o dump, projetando as colunas anteriores: registros das 13 tabelas anteriores preservados. Todos os usuários reais continuam na versão inicial zero. Nenhum hash de senha, e-mail, token persistido anteriormente ou histórico financeiro real foi alterado. As verificações locais de propriedade/integridade retornaram zero divergências. A tabela financeira de idempotência continua vazia: não foram criadas vendas ou pagamentos reais.

O smoke de login inválido grava apenas contadores nas novas estruturas de segurança. Testes de mudança de senha, recuperação, confirmação de e-mail, revogação e concorrência usaram exclusivamente usuários sintéticos no PostgreSQL descartável, porta 5547. Não houve limpeza, recriação ou alteração de volumes existentes.

## D. Testes executados

| Verificação final | Resultado |
|---|---|
| `go test ./... -count=1 -json`, com PostgreSQL descartável configurado | 97 testes/subtestes aprovados, 0 falhas e 0 ignorados |
| Cenários `TestSeguranca*` incluídos nesse total | 16 testes/subtestes aprovados |
| Cenários `TestFinanceiro*` incluídos nesse total | 37 testes/subtestes aprovados |
| Compilação do backend | Aprovada |
| `node --test tests/*.test.js` | 27 aprovados, 0 falhas/ignorados |
| `npm.cmd run build` | Aprovado; permanece aviso de chunk JavaScript acima de 500 kB |
| Navegador: regressões da revendedora/financeiro | 33 verificações aprovadas |
| Navegador: autenticação administrativa/confirmar e-mail/suporte | 8 verificações aprovadas |
| Responsividade | 98 capturas; sem overflow horizontal, exceções ou ações inacessíveis |
| Smoke HTTP na API local atualizada | 69 verificações aprovadas; foto 200, suporte e permissões preservados |
| Contrato financeiro local sem gravações | Escritas antigas 410; entradas inválidas 400; preflight aceita Idempotency-Key; nenhuma operação financeira real gravada |
| `git diff --check` | Aprovado; avisos LF/CRLF não representam erro de whitespace |

Incluídos: login válido/inválido, expiração, revogação individual e de todas as sessões por troca/recuperação, bloqueio de conta, isolamento, limites de conta/origem, orçamento após reenvio, cooldown, recuperação simultânea com um código aberto e um único consumo, falha de banco ao contar tentativas, confirmação de e-mail, senha/código incorretos e código expirado, proteção administrativa e cabeçalho de origem forjado.

O navegador usou fixtures, bloqueando acessos externos; não representa envio real de e-mail ou login com senha real. As transações e concorrência foram exercitadas contra PostgreSQL real descartável. O harness CDP recebeu cancelamentos esperados de interceptações durante redirecionamentos (`Invalid InterceptionId`), separados de exceções React; a execução final não apresentou exceções React. Falhas intermediárias de expectativas/seletores durante a implementação foram corrigidas e não são contadas como aprovações; os números acima correspondem à rodada final.

Evidências privadas: `backup_autenticacao_20261105/go-test-final.jsonl`, `frontend-test.txt`, `smoke-http-local.txt`, `integridade.json` e `evidencias/{admin-autenticacao,regressoes-browser,baseline}.json`.

Para repetir os testes reais: iniciar PostgreSQL descartável somente em `127.0.0.1:5547`, banco `quitai_financeiro_test`, configurar `QUITAIA_FINANCEIRO_TEST_DSN` somente no processo de teste e executar `go test ./... -count=1` em `backend`. As suítes recusam outro host/porta/banco. Sem essa variável, integrações são ignoradas: esse resultado não substitui a execução completa descrita aqui. Os dados são sintéticos, por schema. Nunca apontar essa variável para o banco principal ou hospedado.

Não executados: autenticação com senha real de usuário, recuperação/alteração de e-mail com entrega real, navegador conectado ao backend real para mudar credenciais, múltiplos processos hospedados, dispositivos físicos, carga prolongada, TLS/SMTP e testes nos provedores. Nenhuma dessas verificações foi declarada aprovada.

## E. JWT e revogação

Mantidos HS256, expiração obrigatória e duração atual de 24 horas. Tokens novos contêm identificador aleatório e versão da sessão. Perfil não é aceito como autorização a partir do frontend: conta ativa e perfil administrativo continuam consultados no PostgreSQL.

Troca e recuperação incrementam `versao_sessao` na mesma transação da senha. Hashes de tokens revogados são consultados no banco, sem guardar bearer tokens em texto puro. Reinicializar a aplicação não recria a versão nem apaga revogações. Novas instâncias usam a mesma fonte de verdade PostgreSQL.

Compatibilidade: JWTs anteriores, sem versão explícita, equivalem a zero, respeitando a expiração existente. Também podem ser revogados individualmente pelo hash; a primeira troca/recuperação invalida todos os tokens anteriores. Não houve encerramento forçado das sessões reais como parte da migração.

SSE revalida expiração/revogação antes de eventos e a cada pulso de 25 segundos. O frontend interrompe a reconexão quando recebe rejeição. Logout de conta bloqueada também pode revogar seu próprio token: a rota exige JWT válido e revoga somente a identidade assinada. Se uma conta voltar a ser habilitada sem troca de versão, tokens não revogados ainda dentro da validade seguem a política anterior; essa regra não foi alterada silenciosamente.

## F. Recuperação, e-mail e limites

Toda senha nova usa a validação de 8 a 72 bytes, inclusive cadastro administrativo autorizado, revendedora e recuperação de administrador. Senhas existentes não são enfraquecidas nem substituídas automaticamente.

Recuperação: código de seis dígitos, 15 minutos e cinco erros por código, com comparação em tempo constante. Solicitação trava o usuário antes de invalidar/criar código; consumo também trava o usuário antes do código. Senha e inutilização dos códigos são confirmadas juntas. Trabalho bcrypt só ocorre após validação do código na redefinição; no login há trabalho sintético também para e-mail inexistente, reduzindo a diferença óbvia de custo.

Limites atuais, por janela fixa de 15 minutos: 60 solicitações por origem e 10 por conta nas ações de login/verificação/perfil/senha; solicitação de recuperação usa 15 por origem e 3 por conta. Há intervalo mínimo de 60 segundos entre envios por usuário. As ações têm escopos separados; pedir outro código não zera as verificações. São respostas temporárias 429, sem modificar `usuarios.ativo` nem bloquear uma conta permanentemente. Ajustar os valores com evidências de homologação e monitorar negação temporária de serviço por tentativas dirigidas; limitação por conta tem esse trade-off e não elimina abuso distribuído.

O endereço de origem usa a conexão real. `X-Forwarded-For` só é considerado quando o peer pertence a `AUTH_TRUSTED_PROXY_CIDRS`, lista explícita de CIDRs confiáveis. A cadeia é lida da direita para a esquerda, parando no primeiro cliente não confiável; cabeçalhos forjados de conexões diretas não alteram a origem. Configuração inválida ou universal é rejeitada na inicialização. IPv6 é agrupado por /64. Nenhuma configuração real de proxy foi alterada. Sem CIDRs confiáveis, um proxy pode agrupar usuários no mesmo limite: validar a topologia antes de publicar, sem confiar indiscriminadamente no cabeçalho.

Alterar e-mail pelo PUT de perfil exige `senha_atual`. O primeiro envio retorna 202 e mantém o endereço anterior; informar `codigo_email` e repetir com senha atual confirma a troca. Código está vinculado a usuário, novo endereço e versão; códigos antigos deixam de servir após mudança de versão. Confirmação revoga sessões e recuperações antigas. Nome sem alteração de e-mail mantém o fluxo de atualização normal. Frontends antigos que tentem mudar e-mail sem confirmação não poderão realizar a substituição; o frontend deste workspace foi adaptado.

SMTP: quatro envios simultâneos por processo, prazo total de 10 segundos na conexão/operação e STARTTLS obrigatório com verificação de hostname e TLS mínimo 1.2. O worker não cria uma fila ilimitada. Falha de entrega gera somente log genérico; não devolve dados da conta nem muda o sucesso público da solicitação. Um código não entregue expira normalmente e pode ser solicitado novamente respeitando os limites. Não há promessa de entrega nem fila persistente de e-mail: validar disponibilidade/monitoramento SMTP antes da publicação.

## G. Contas e perfis

Revendedoras continuam sem acesso a rotas administrativas. Usuários bloqueados não leem nem repetem operações financeiras. Cliente, produto, venda, parcela, pagamento e chave de idempotência permanecem vinculados ao proprietário autenticado; trocar campos do JSON não troca a identidade assinada. Os testes cobrem tentativas entre contas e repetição com a mesma chave por usuários diferentes.

A regra existente de administrador ativo passar pelo middleware comercial foi preservada. O frontend o direciona ao painel gestor; isso não é uma barreira de autorização do backend. Nas rotas comerciais, o administrador continua restrito à própria identidade, enquanto relatórios administrativos têm acesso global deliberado. Proibir também o acesso comercial do administrador depende de decisão de produto; não foi feito um bloqueio incompatível sem aprovação.

`/auth/cadastro` e `/auth/google` continuam retornando 403 no servidor. Não foi reativado cadastro público nem login Google. O código Google existente permanece sem ligação com a rota ativa; configurar uma variável não o habilita automaticamente.

## H. Regressões financeiras

Preservados: atomicidade, idempotência persistente de vendas e pagamentos, bloqueios de estoque, parcelamento, histórico e migração 009. Os arquivos de criação completa, controle idempotente, pagamentos e a própria 009 foram comparados byte a byte com o backup desta etapa e permaneceram iguais.

Novos testes HTTP/PostgreSQL confirmam: commit seguido de resposta perdida, revogação da sessão, rejeição do token anterior e reprodução do resultado com nova sessão da mesma conta e a mesma chave, sem outra venda nem outro pagamento. Os testes frontend confirmam a preservação de pedido/chave em 401 e quando a sessão muda antes de a resposta de sucesso ser consumida.

Limpar sessão remove somente token e usuário, não as intenções financeiras pendentes. Nada gera outra chave ou outra operação automaticamente ao entrar novamente. Continuidade entre dispositivos ou após apagar manualmente o armazenamento do navegador continua fora da garantia por chave.

## I. Pendências operacionais, hospedagem e Git

Nenhum Render, Railway, Neon ou Cloudflare foi acessado ou alterado. Nenhuma credencial foi configurada ou modificada. SMTP local permanece sem configuração e entrega real não foi testada.

Antes de publicação, com autorização separada:

1. Revisar diff completo, incluindo alterações anteriores ainda pendentes, e autorizar homologação.
2. Fazer backup do destino, testar restauração e conferir esquema/permissões reais. Aplicar migrações anteriores necessárias e 010 em ordem. A 010 é aditiva, mas ALTER TABLE obtém lock; há lock_timeout de cinco segundos. Não executar bootstrap sobre banco existente.
3. Dar à aplicação somente os privilégios necessários nas novas estruturas e na versão do usuário. Verificar proteção das credenciais no provedor e separação das chaves JWT entre ambientes; não compartilhar chaves para compensar falta de emissor/audiência.
4. Coordenar a substituição de todas as instâncias: binários antigos não consultam revogações. Misturar versões permitiria que tokens revogados continuassem aceitos pelas antigas. Fazer a transição em manutenção e publicar o frontend correspondente. Os JWTs de 24 horas e a aceitação transitória da versão zero estão documentados, não escondidos.
5. Validar `VITE_API_URL` HTTPS no build, `FRONTEND_URL` exata no backend, CORS e TLS real do PostgreSQL. Identificar os proxies e seus CIDRs oficiais da implantação antes de configurar `AUTH_TRUSTED_PROXY_CIDRS`. Não utilizar trust universal.
6. Configurar/verificar SMTP de forma autorizada, sem expor senha de aplicativo. Testar entrega, falha, expiração, confirmação de e-mail e abuso em homologação com contas sintéticas.
7. Testar revogação/logout entre instâncias e após restart, navegador completo com backend real, recuperação da intenção financeira e estabilidade do SSE no proxy. Ajustar orçamentos sem criar bloqueio permanente e acompanhar 429/503.
8. Planejar retenção e manutenção das tabelas de limites/revogações após expiração, sem apagar controles ainda válidos. Nenhuma limpeza de dados existentes foi implementada ou executada nesta etapa.

Limites restantes: bearer token continua acessível a JavaScript em armazenamento do navegador; não foi comprovada XSS, mas eventual XSS poderia roubá-lo. Não houve troca para cookies, pois isso também exige desenho de CSRF/CORS e revisão própria. Não há MFA nem garantia contra abuso distribuído. Emissor/audiência continuam sem exigência explícita; separar chaves entre ambientes permanece obrigatório. Nenhuma avaliação local substitui TLS, configuração e teste do ambiente hospedado.

Rollback: manter migração e tabelas, interromper escritas e sessões antes de qualquer retorno a binário antigo; esse retorno perde a proteção de revogação. Não zerar versões, remover registros válidos ou restaurar dump sobre dados posteriores sem plano aprovado. Nenhum rollback destrutivo foi executado.

Git permanece na branch `feat/login-google-recuperacao`, HEAD `fe87038`. Nenhum commit, staging, push, merge ou deploy nesta etapa. Backups e relatórios anteriores preservados. A revisão final de arquivos candidatos não encontrou credenciais reais, `.env`, dump ou chave privada a publicar; os diretórios de evidência são privados e ignorados.

Serviços para continuar os testes locais: frontend QuitaAí em 5174, backend atualizado em 8082 e PostgreSQL original em 5434. ProjectFlow continua na 5173, sem alteração. Chrome isolado e PostgreSQL de fixtures na 5547 são encerrados ao final; nenhum volume existente é removido.

## J. Classificação final

**NÃO PRONTO PARA PUBLICAÇÃO.** As correções de autenticação e sua compatibilidade financeira foram implementadas e testadas localmente. A publicação ainda depende de entrega SMTP real, TLS/configuração dos provedores, identificação segura do proxy, homologação completa e transição coordenada entre instâncias.

O projeto está disponível para continuar testes locais e revisão. Aguardar autorização antes de commit, push, merge, configuração hospedada ou deploy.
