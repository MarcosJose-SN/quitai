# Segurança financeira — QuitaAí

Data: 05/11/2026. Branch: `feat/login-google-recuperacao`. Referência preservada: `fe87038`.

## A. Diagnóstico

O frontend criava primeiro o cabeçalho e depois os itens em requisições independentes. As transações individuais não protegiam a venda inteira: falha intermediária podia deixar cabeçalho, estoque, itens e parcelas divergentes. Pagamentos tinham transação, mas uma resposta perdida após commit permitia registrar outra operação na repetição. Detalhes e relatórios consultavam múltiplas vezes sem um único snapshot. O status podia continuar considerando o primeiro vencimento já pago.

## B. Implementação e arquivos

- `backend/handlers/venda_completa_handler.go`: novo `POST /vendas/completa`, autenticado. Cliente/produtos pertencem à conta; preços vêm do banco; produtos são bloqueados em ordem de ID. Cabeçalho, itens, estoque, parcelas, conferência de totais e resposta idempotente são confirmados numa única transação READ COMMITTED. Valores são calculados em centavos, respeitando NUMERIC(10,2), até três parcelas, distribuição de resto e ajuste mensal ao fim do mês. Qualquer falha desfaz toda a operação.
- `backend/handlers/financeiro_operacoes.go`: validação de JSON/chave, hash normalizado, reserva persistente, reprodução exata dos bytes e status originais, tratamento seguro de erro. Logs financeiros não incluem corpo, chave, senha nem conexão. Falhas de banco/commit retornam resultado incerto e preservam a repetição segura.
- `backend/handlers/pagamento_handler.go`: idempotência na mesma transação do pagamento, reconhecida antes da validação de saldo atual; mantém distribuição pelas parcelas e confere totais antes do commit. Não deduplica por valor/data.
- `backend/database/migrations/009_operacoes_financeiras.sql` e `backend/database/bootstrap/001_schema_inicial.sql`: tabela aditiva `operacoes_financeiras`, hash, JSONB, bytes da resposta, status, data e unicidade `(usuario_id,tipo,chave)`, com restrições de formato/consistência. Nenhuma tabela histórica foi reescrita.
- `backend/database/financeiro_schema.go` e `backend/main.go`: validação somente de leitura do esquema na inicialização, nova rota, bloqueio autorizado das duas escritas antigas e CORS incluindo `Idempotency-Key`. Migração ausente impede inicialização; não há migração financeira automática.
- `backend/handlers/venda_handler.go`, `backend/handlers/admin_relatorios_handler.go` e `backend/models/venda.go`: detalhes/relatórios usam transação de leitura REPEATABLE READ; próximo vencimento aberto é exposto separadamente e usado no status. Datas originais são preservadas; relatórios não juntam registros de idempotência aos recebimentos.
- `frontend/src/services/operacoesFinanceiras.js` e `frontend/src/App.jsx`: uma requisição por venda, uma chave por intenção; pedido/chave persistidos antes do envio e separados por conta/API/tipo. Timeout, desconexão ou resultado incerto não criam outra chave. Pedido diferente fica bloqueado enquanto houver pendência. Pagamento quitado com resposta perdida continua recuperável. Confirmação seguida de falha na atualização visual informa que a operação já ocorreu.
- Testes criados/ajustados: `backend/handlers/financeiro_integracao_test.go`, `backend/handlers/pagamento_handler_test.go`, `backend/handlers/venda_handler_test.go`, `frontend/tests/financeiro.test.js`, `frontend/tests/revendedora.browser.mjs` e `frontend/tests/responsividade.browser.mjs`.

## C. Banco e preservação

Backup anterior às alterações: `backup_seguranca_financeira_20261104_234007/`, contendo cópias do código/configuração e `quitai_local.dump`. Catálogo do dump conferido: 121 entradas. O diretório é ignorado pelo Git e pode conter dados/configuração privados: não publicar.

Foi conferido o esquema efetivo, inclusive diferenças históricas de FKs (CASCADE no banco versus RESTRICT no bootstrap); essas diferenças não foram alteradas. A migração 009 foi testada em PostgreSQL 16 descartável, inclusive duas execuções e sobre clone somente do esquema local. Depois disso foi aplicada exclusivamente no PostgreSQL local `quitai-postgres`, porta 5434.

Conferência final: todas as linhas e colunas das 12 tabelas anteriores são iguais às do backup. Única tabela adicional: `operacoes_financeiras`, com zero linhas. Verificações de integridade financeira e propriedade retornaram zero divergências. Nenhuma venda, pagamento ou histórico real foi criado/corrigido. Sequências/volumes existentes não foram apagados ou recriados. Não foi realizada restauração completa dos dados privados em outro banco; foi validado o catálogo, o esquema e a igualdade dos registros.

## D. Testes e evidências

Resultados da execução final:

| Verificação | Resultado |
|---|---|
| `go test ./... -count=1 -json` com PostgreSQL isolado configurado | 77 testes/subtestes aprovados; 0 falhas; 0 ignorados |
| Cenários financeiros incluídos nesse total | 33 testes/subtestes |
| Compilação Go | Aprovada; binário final em execução local |
| `node --test tests/*.test.js` | 20 aprovados; 0 falhas/ignorados |
| `npm.cmd run build` | Aprovado; aviso de chunk JavaScript acima de 500 kB |
| Navegador Chrome, API interceptada com fixtures | 33 verificações aprovadas |
| Responsividade, larguras 320/375/390/430/768/1024/1440 | 98 capturas; sem overflow horizontal ou exceções; 28 verificações de botões de modal acessíveis |
| API local final, leituras/autorização/entradas inválidas | 69 verificações HTTP aprovadas, incluindo foto 200 e suporte |
| Contrato financeiro local sem gravações | Dois POST antigos 410; novo POST inválido 400; preflight 204 aceita a chave; tabela de operações permanece vazia |
| `git diff --check` | Aprovado; apenas avisos de conversão LF/CRLF do Git |

O teste HTTP com PostgreSQL real descartável cobre falhas após cabeçalho, item, estoque, parcela, registro idempotente e no commit; rollback integral e repetição; perda de resposta após commit de venda/pagamento; mesma chave e corpo diferente; 16 requisições simultâneas com mesma chave; disputa de estoque; concorrência de pagamentos; isolamento entre contas; centavos e fim de mês; relatórios sem duplicação e snapshots durante pagamentos. Os HTTP 503 deliberadamente injetados nesses testes são esperados, não falhas da suíte.

Evidências locais: `backup_seguranca_financeira_20261104_234007/go-test-final.jsonl` e subdiretório `evidencias/` (`regressoes-browser.json`, `baseline.json` e capturas). Artefatos são ignorados pelo Git.

Para repetir a integração, iniciar um PostgreSQL 16 descartável em loopback 5547, banco `quitai_financeiro_test`, e configurar somente no processo de teste `QUITAIA_FINANCEIRO_TEST_DSN` para esse destino. Executar `go test ./... -count=1` em `backend`. A suíte recusa outro host/porta/banco e usa schemas independentes com dados sintéticos. Sem essa variável, os testes de integração são ignorados: execução padrão isoladamente não comprova segurança transacional. Não usar dados/credenciais reais no fixture nem autenticação trust fora de loopback/ambiente descartável.

Não executados: navegador conectado de ponta a ponta ao backend real para criar/pagar vendas, login com senha real, escrita financeira no banco principal, dispositivos físicos/outros navegadores, SMTP, carga prolongada, TLS real e homologação hospedada. Navegador usa fixtures; a integração Go usa HTTP e PostgreSQL reais, mas não substitui a homologação completa da aplicação hospedada. Não confundir as duas evidências.

## E. Frontend e visual

Preservados os mecanismos anteriores de sessão, logout, respostas de sessão antiga, rascunhos por conta, validações e datas locais. Não houve edição de CSS, cores ou organização de telas. Foi necessário acrescentar aviso de confirmação quando o refresh falha, para evitar uma nova venda por engano. Responsividade retestada. Central de Suporte, correção da foto e auditorias anteriores preservadas.

## F. Compatibilidade

O único consumidor das escritas antigas encontrado neste workspace era o frontend, agora atualizado. O usuário autorizou explicitamente o bloqueio incompatível: `POST /vendas` e `POST /vendas/itens` respondem 410 indicando `/vendas/completa`. Leituras existentes continuam disponíveis. Não é possível garantir ausência de consumidores externos ou versões antigas em cache.

`POST /pagamentos` agora exige `Idempotency-Key`; clientes externos precisam adaptar-se. A idempotência vale por conta, tipo e chave, não por conteúdo global. Não existe fallback para o fluxo antigo. Atualização de frontend/backend deve ser coordenada: versões antigas não devem continuar escrevendo durante a transição.

## G. Segurança e limites restantes

Corrigidos os riscos locais de criação parcial e repetição com a mesma chave, incluindo resposta perdida e concorrência. Pedido congelado é preservado em localStorage; armazenamento indisponível/corrompido impede envio seguro. Apagar manualmente os dados do navegador, mudar de dispositivo ou enviar outra chave representa outra intenção e não garante deduplicação do mesmo negócio. Não remover registros idempotentes sem política revisada.

A revisão de padrões nos arquivos rastreados/novos não encontrou URL PostgreSQL com senha, chave privada ou arquivo sensível candidato ao commit. Nenhum `.env`, dump ou backup está preparado/rastreado para esta entrega. Essa revisão automatizada não substitui revisão humana do diff antes do commit.

Continuam fora desta correção os riscos registrados na auditoria anterior: ausência de limitação contra abuso de login/recuperação, política de revogação de JWT após troca de senha e diferenciação de conta quando o SMTP falha. SMTP local não configurado. A política de fuso horário de status já existente não foi redefinida. Históricos suspeitos não são reparados automaticamente; inconsistências financeiras encontradas por uma nova operação causam rollback para revisão.

## H. Hospedagem e sequência futura segura

Compatibilidade avaliada somente por código local: frontend gera arquivos estáticos Vite; API lê `PORT`; PostgreSQL usa lib/pq e SQL transacional padrão, JSONB e BYTEA. CORS aceita chave e origem exata. Nenhum Render, Railway, Cloudflare Pages ou Neon foi acessado nesta etapa.

1. Revisar diff e resolver pendências de segurança/autenticação; autorizar homologação separadamente. Confirmar consumidores, versões em cache e toolchain Go exigida pelo módulo.
2. Fazer backup verificável do destino e testar restauração, esquema efetivo e migração em cópia isolada. Aplicar as migrações anteriores ausentes em sua ordem, sem assumir que o banco remoto corresponde ao local.
3. Planejar janela sem escritas financeiras e desativar TODOS os escritores antigos antes da troca. Instâncias antigas de pagamentos ignoram chaves; mistura de versões pode duplicar recebimentos.
4. Aplicar `backend/database/migrations/009_operacoes_financeiras.sql` com cliente SQL e interrupção em erro, no banco autorizado. É aditiva, mas exige permissão DDL e obtém locks; revisar disponibilidade e lock_timeout. A aplicação precisa SELECT/INSERT/UPDATE na nova tabela e uso da sequência. Não conceder acesso público nem apagar chaves.
5. Configurar no backend, sem expor valores: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SSLMODE`, `QUITAIA_JWT_SECRET`, `FRONTEND_URL` e `PORT` fornecida pela plataforma. O código usa variáveis DB_*; não presumir suporte direto a DATABASE_URL. No Neon exigir TLS conforme configuração aprovada, nunca copiar `sslmode=disable` local para hospedagem. Testar conexão/TLS real antes da liberação.
6. Configurar `VITE_API_URL` com a origem HTTPS da API antes do build do frontend; `FRONTEND_URL` deve corresponder exatamente à origem HTTPS do site, incluindo eventuais previews autorizados. Segredos nunca entram em variáveis VITE_*.
7. Subir backend atualizado em todas as instâncias, validar inicialização/esquema e preflight, publicar frontend correspondente, testar criação/pagamento/retry/perda de resposta/relatórios com contas sintéticas em homologação. Só liberar escritas após aprovação. Não foi feito deploy.
8. Rollback: bloquear escritas financeiras antes de retornar a binário antigo; manter tabela e registros idempotentes. Não executar DROP, restaurar dump sobre dados novos ou reabrir escritores antigos sem plano aprovado. Correção progressiva é preferível a perder a proteção de pagamentos.

A migração altera a estrutura, não converte registros financeiros históricos. Um esquema diferente, permissões insuficientes ou migrações anteriores ausentes ainda podem impedir a inicialização remota.

## I. Git e situação local

HEAD permanece `fe87038`, branch `feat/login-google-recuperacao`. Nenhum commit, push, merge, staging ou deploy nesta implementação. As mudanças anteriores pendentes em `Login.jsx`, serviços/utilitários de sessão e `AUDITORIA_FRONTEND_REVENDEDORA.md` continuam preservadas; não foram revertidas nem atribuídas integralmente à etapa financeira. O inventário desta etapa está na seção B, além deste relatório `SEGURANCA_FINANCEIRA.md`.

Serviços locais: QuitaAí frontend em 5174, API final em 8082, PostgreSQL original em 5434. Porta 5173 permanece com ProjectFlow e não foi alterada. O PostgreSQL de teste 5547 e o Chrome com perfil descartável são encerrados após a validação; o banco de teste usa tmpfs, sem volumes existentes. O frontend/API/banco originais permanecem disponíveis.

## J. Conclusão

**NÃO PRONTO PARA PUBLICAÇÃO.** A correção financeira foi implementada e validada localmente com PostgreSQL real isolado, HTTP e testes de navegador complementares. O QuitaAí pode continuar os testes locais. A liberação profissional ainda depende das pendências de segurança de autenticação, configuração/TLS/SMTP, homologação completa e transição coordenada descritas acima. Build aprovado, sozinho, não libera produção.

Nenhum ambiente hospedado, credencial, histórico financeiro, volume existente, ProjectFlow ou commit de referência foi alterado. Aguardar revisão do usuário antes de commit, push ou deploy.
