Auditoria local do QuitaAí — 04/11/2026 (America/Sao_Paulo)

**Conclusão: NÃO PRONTO PARA PUBLICAÇÃO.** O erro prioritário de foto foi corrigido localmente. A publicação depende da resolução/validação das pendências abaixo. Nenhuma configuração hospedada foi consultada ou alterada; somente a documentação pública dos provedores foi consultada.

**A. Diagnóstico e evidências**

1. Foto administrativa: `backend/handlers/admin_perfil_handler.go` consulta `usuarios.foto_perfil_dados`. O PostgreSQL local possuía somente `foto_perfil_url`; a migração 006 e o bootstrap também não criavam o BYTEA. Isso provoca erro SQL de coluna inexistente e HTTP 500, independentemente de haver foto cadastrada. Foi criada/aplicada somente localmente a migração 008. A API autenticada agora retorna 404, resposta prevista para foto ausente.
2. React: `frontend/src/main.jsx` envolve a aplicação em StrictMode. Dashboard usa AbortController nos efeitos de indicadores, nome e foto; suas limpezas abortam chamadas. Minha Conta também aborta a foto no cleanup. Esses cancelamentos de desenvolvimento não são HTTP 500. Não há polling de foto nesses componentes. Há duas consultas a `/auth/me` em montagens distintas (validação do AdminApp e nome no Dashboard); duplicação finita, sem evidência de loop infinito.
3. Uma referência antiga de foto permanece em `foto_perfil_url`, sem BYTEA. Nenhum arquivo foi encontrado em `backend/uploads`. A referência foi preservada; não foi buscada remotamente nem convertida sem verificar a origem. O administrador poderá cadastrar novamente a foto ou aprovar a recuperação do arquivo antigo.
4. A conta `admin@teste.local` pertence aos fixtures dos testes; não existe no banco local. Existe uma conta administrativa ativa. Nenhuma conta, senha, token persistido ou permissão foi alterada nesta auditoria.
5. Configuração local mantém o frontend em localhost:5174, API em localhost:8082 e Docker PostgreSQL em 127.0.0.1:5434. A porta 5173 continua pertencendo ao ProjectFlow; nenhum processo desse projeto foi alterado.
6. O banco local tem pagamentos com FKs ON DELETE CASCADE, enquanto o bootstrap prevê RESTRICT e vínculo composto venda/parcela. As consultas de integridade não encontraram divergências nos registros atuais. A sequência histórica de SQL não equivale ao bootstrap atual: existem dois arquivos 002 e a migração 007 possui proteção financeira inferior. Não executar todas as migrações indiscriminadamente. Não modifiquei essas restrições nem dados financeiros.
7. Clientes/produtos permitem campos opcionais NULL no esquema, mas há scans para strings sem COALESCE. Não existem esses NULLs nos registros locais atuais e as listagens retornaram 200; permanece risco de 500 com outros dados.
8. Os JWTs duram 24 horas, exigem expiração e assinatura HS256. Perfil e conta ativa são consultados no banco. Não há revogação por troca de senha nem limitador de tentativas nos handlers de login/recuperação. A recuperação limita a 5 tentativas por código e 15 minutos, mas uma nova solicitação cria outro código. O envio SMTP falho retorna 503 para conta existente, enquanto conta inexistente retorna 200, permitindo diferenciação nessa condição.
9. O arquivo local não configura SMTP; não afirmei que a recuperação por e-mail funciona. Não enviei e-mails e não executei redefinição.
10. Rascunhos do suporte da revendedora usam uma chave global de localStorage, sem usuário. Logout mantém parte dos estados da aplicação. Em dispositivo compartilhado, isso exige correção com estratégia para preservar rascunhos antigos cuja autoria não está identificada. O backend mantém o isolamento por proprietário nos fluxos verificados.
11. A sincronização do suporte oculta erros transitórios e mantém dados anteriores; a listagem limita 500 chamados sem paginação. O arquivo CentralSuporteAdmin já possuía correções recentes de concorrência, carregamento e resposta a resolvidos no início da auditoria; foi preservado byte a byte.
12. `http.ListenAndServe` não configura timeouts explícitos; há consultas sem Context e conexão inicial sem prazo específico. Avaliar limites de HTTP/SQL preservando conexões SSE. Os eventos SSE são locais ao processo, com polling de contingência; múltiplas instâncias exigem validação.

**B. Correções realizadas nesta auditoria**

- `backend/database/migrations/008_admin_foto_dados.sql` (novo): adiciona BYTEA nullable, sem atualizar/remover registros. Transação com lock_timeout de 5 segundos. Foi aplicada exclusivamente no banco local confirmado.
- `backend/database/bootstrap/001_schema_inicial.sql`: novas instalações também criam a coluna exigida pelo handler. O bootstrap NÃO foi executado sobre o banco existente.
- `backend/handlers/admin_perfil_handler.go`: logs de falhas reais de consulta/atualização, com ID e erro técnico, sem imagem, senha ou token. Cancelamentos de contexto não são convertidos em erro interno. Ausência de foto continua 404; falhas reais continuam 500.
- `backend/handlers/admin_perfil_handler_test.go`: regressões para foto NULL/vazia, usuário ausente, falha de banco sem vazamento da mensagem interna e cancelamento. Os testes anteriores de PNG 512x512, upload, ausência de token e revendedora continuam disponíveis.
- `frontend/src/Login.jsx`: removeu a impressão do objeto retornado pelo login em resposta incompleta, que poderia conter token. Sem mudanças visuais.
- Este relatório e procedimento de hospedagem foram acrescentados em `AUDITORIA_HOSPEDAGEM.md`.
- Ferramenta de diagnóstico local em `backend/tmp/auditoria/main.go`, ignorada pelo Git, mantém JWTs somente em memória e não imprime credenciais. Não integra o binário principal.

Backup prévio: `backup_auditoria_20261104_223210/`, com arquivos anteriores e `quitai_local.dump`. O catálogo do dump foi lido com sucesso (120 entradas). Uma comparação em memória dos dados extraídos do backup com o pg_dump atual confirmou todos os registros e colunas anteriores idênticos em 12 tabelas. A nova coluna de foto foi excluída dessa comparação. O SHA-256 da CentralSuporteAdmin permanece igual ao início desta auditoria. Uma restauração completa em banco isolado ainda não foi executada.

O binário local foi compilado e a API local reiniciada. Logs em `backend/tmp/auditoria-server.stdout.log` e `.stderr.log`; não são versionados. A chave JWT já configurada no ambiente Windows foi preservada. Os diffs preexistentes de `CentralSuporteAdmin.jsx` e `vite.config.js` não são correções novas desta auditoria.

**C. Testes e limites**

- `go test ./...`: aprovado, incluindo autenticação, autorização, isolamento, pagamentos, vendas, SSE e foto (mocks).
- `go build -o tmp/quitai-auditoria.exe .`: aprovado.
- `npm.cmd run build`: aprovado; aviso de chunk JS acima de 500 kB, sem tratar isso como falha funcional.
- `npm.cmd run lint`: saída 0 com avisos em código atual e cópias antigas. Não foi considerado lint limpo. Nenhuma alteração ampla automática foi aplicada.
- `git diff --check`: aprovado.
- PostgreSQL real local: conexão aprovada; nenhuma divergência encontrada nas verificações de venda/cliente/proprietário, item/produto/proprietário, pagamento/parcela/venda, valores de parcelas, e-mails duplicados ou FKs não validadas.
- 69 verificações HTTP locais finais: todas com status e, onde aplicável, CORS/isolamento esperados. Evidências em `backup_auditoria_20261104_223210/verificacao_http.txt`.
- `/healthz` e `/sistema/publico`: 200. O healthz é de disponibilidade HTTP; não revalida o banco a cada chamada.
- Sem token, token inválido ou expirado: 401. Revendedoras em rotas administrativas: 403. Administrador: 200 em me, dashboard, contas, relatórios, suporte e avisos.
- Foto autenticada sem bytes: 404. Upload sem arquivo: 400. Upload válido e leitura PNG foram testados com mocks; nenhum upload real sobrescreveu a foto da conta.
- CORS: preflight da origem localhost:5174 recebeu 204 e origem permitida; origem não autorizada recebeu 403.
- Duas contas reais locais: listagens 200, venda de outra conta 404, pagamentos de venda alheia vazios, chamado alheio 404. Não foram criados registros para os testes.
- Login sem credenciais: 401. Fluxos de recuperação/redefinição com corpo inválido: 400 sem mutações/envios. Testes autenticados HTTP usaram JWTs temporários assinados em memória; não equivalem a um novo login com senha. O login com senha foi validado com 200 em etapa anterior desta conversa; nesta auditoria não foi repetido.
- A primeira execução do diagnóstico usou uma chave de origem incorreta e depois caminhos de listagem incorretos; o utilitário foi corrigido. O resultado final é o registrado acima; esses erros de preparação não foram classificados como defeitos do produto.
- Não executados: navegador real, matriz visual celular/tablet/desktop, novo login interativo, SMTP, upload real, fluxo completo de pagamentos/escrita, carga, restauração completa e testes em hospedagem. Não há automação de navegador disponível nesta sessão e não foram acessados ambientes hospedados.
- Varredura limitada: 92 arquivos rastreados foram verificados por alguns padrões de credenciais e UTF-8. Nenhum padrão pesquisado foi encontrado; não equivale a auditoria completa de todo o histórico Git, dependências ou garantia de ausência de segredos. Arquivos .env não aparecem no histórico consultado desses caminhos. Backups privados permanecem ignorados.

**D. Preparação para hospedagem (plano, não executado)**

| Componente | Situação |
| --- | --- |
| Backend Render | Compila localmente; pendente de validar toolchain, TLS/banco, SMTP, esquema, limites e testes remotos autorizados |
| Frontend Cloudflare Pages | Build local aprovado; pendente de URL de API de produção no build e validação visual/HTTPS |
| PostgreSQL Neon | SQL/driver compatíveis em princípio; instância remota, permissões, restrições, backup e restauração não verificados |
| Railway/testes | Nenhum acesso ou alteração; manter API, banco e variáveis independentes |

Configuração proposta para revisão posterior:

- Render: diretório raiz `backend`, build `go build -o quitai .`, início `./quitai`, health check `/healthz`. O código lê PORT dinamicamente e escuta em `:PORT`. Conferir compatibilidade do runtime com `go 1.27.1` exigido no go.mod; a versão Go nativa do provedor é atualizada automaticamente, sem pin de versão fora de Docker. [Render Web Services](https://render.com/docs/web-services), [linguagens](https://render.com/docs/language-support).
- Variáveis privadas do backend: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SSLMODE`, `QUITAIA_JWT_SECRET` (mínimo 32 bytes). `FRONTEND_URL` deve ser a origem HTTPS exata autorizada. `PORT` deve ser fornecida pelo provedor. Credenciais existentes devem ser preservadas; não copiar valores do banco local para Neon.
- Neon: configurar `DB_SSLMODE=verify-full` e validar certificado/hostname. `disable` pertence apenas ao PostgreSQL local. A aplicação não lê DATABASE_URL: preencher as variáveis separadas acima. [Conexão segura Neon](https://neon.com/docs/connect/connect-securely).
- Recuperação: `GMAIL_EMAIL` e `GMAIL_APP_PASSWORD` somente no backend, após aprovação da configuração e testes de envio. Login Google está desativado no main.go; não habilitá-lo apenas por existir variável de client ID.
- Cloudflare Pages: diretório raiz `frontend`, build `npm ci && npm run build`, saída `dist`; definir `VITE_API_URL` para a URL HTTPS do backend de PRODUÇÃO no ambiente de build. Preview/testes devem usar API/banco de TESTES. Valores VITE são públicos. O dist local atual aponta para localhost e NÃO deve ser publicado. O Pages trata SPA por padrão; validar acesso direto a `/admin` antes da aprovação. [Guia React Pages](https://developers.cloudflare.com/pages/framework-guides/deploy-a-react-site/).
- Ambiente local validado: Node v24.21.0, Go 1.27.1; frontend localhost:5174, backend localhost:8082, PostgreSQL 127.0.0.1:5434. ProjectFlow conserva 5173.
- Fotos novas ficam em BYTEA no PostgreSQL, sem depender do disco efêmero do backend. A referência antiga precisa de recuperação/reenvio; não presumir que o arquivo antigo existe no Neon ou no Render.
- O main.go executa DDL de avisos/recuperação na inicialização, mas NÃO aplica a migração 008 nem o bootstrap inteiro. Revisar permissões e sequência de migrações antes da hospedagem. Não fazer a aplicação ignorar um erro de esquema em produção.

Procedimento de banco/rollback para aprovação:

1. Identificar explicitamente host/banco/ambiente alvo, salvar backup privado e testar restauração em instância isolada. Não usar o dump local para substituir produção.
2. Comparar esquema efetivo do destino; para a foto, revisar a migração 008 isoladamente. Não executar bootstrap em banco existente nem aplicar a sequência histórica sem revisão.
3. Planejar as FKs financeiras com análise dos dados e impacto de locks. Não substituir restrições sem aprovação do plano e backup.
4. Aplicar somente a migração aditiva aprovada, publicar versões revisadas apenas após autorização e repetir smoke tests autenticados sem expor tokens.
5. Em rollback da aplicação, retornar ao artefato anterior e manter a coluna aditiva. Não remover a coluna para desfazer o deploy. Restauração de banco pode descartar escritas posteriores; exige aprovação e plano específico.

**E. Segurança e pendências antes da publicação**

- Corrigidos: esquema incompatível da foto, diagnóstico insuficiente dessa falha e log de resposta de login potencialmente sensível.
- Pendentes: limites contra abuso de login/recuperação, diferenciação de e-mail existente quando SMTP falha, política de revogação de sessão, isolamento de rascunhos/cache por usuário e aviso de sessão expirada no painel já aberto. Reavaliar após correções e testes específicos; não esconder erros de autorização.
- Pendentes de integridade: harmonizar o caminho de instalação e as FKs de pagamentos com o esquema aprovado. Não houve corrupção comprovada nos dados atuais.
- Pendentes de validação: fotos antigas, responsividade, upload real, SMTP, fronteiras financeiras, limites HTTP/SQL/SSE, configuração hospedada, TLS real e restauração de backup.
- Nenhuma mudança de credenciais ou administradores. Todos os registros anteriores foram comparados ao backup e preservados. Nenhum deploy, commit, push, alteração de ProjectFlow ou de ambientes Render/Railway/Pages/Neon.

**F. Próxima ação**

Revisar as pendências de segurança e integridade antes de autorizar uma rodada isolada em homologação. Os testes locais da Central de Suporte podem continuar em http://localhost:5174. Publicação permanece NÃO autorizada; este relatório não libera deploy automaticamente.