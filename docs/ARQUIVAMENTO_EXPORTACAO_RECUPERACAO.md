# Arquivamento, exportação e recuperação — preparação local

## Auditoria das exclusões atuais

- Clientes: DELETE físico filtrado por `id` e `usuario_id`. Uma venda vinculada provoca 409 antes do DELETE; FKs permanecem como segunda barreira.
- Produtos: mesma política, verificando `venda_itens`/`vendas`. Código único por revendedora; nenhuma FK foi removida.
- Vendas: confirmação explícita no React e validação do ambiente financeiro no servidor. Transação bloqueia a venda da revendedora com `FOR UPDATE`, rejeita histórico de pagamentos, devolve estoque e então apaga parcelas, itens e venda. Essa é a política existente, não uma nova autorização para apagar históricos.
- Pagamentos: o bootstrap usa RESTRICT para venda e para a combinação venda/parcela. Itens e parcelas possuem CASCADE preexistente para a venda. Nenhum CASCADE foi acrescentado.
- Preços unitários/subtotais são gravados nos itens. Nome de produto/cliente exibido nos detalhes depende do cadastro atual, não de um snapshot textual histórico.
- A inspeção é local: as definições do bootstrap/migrations não comprovam o estado de production. Não foram consultados bancos hospedados.

## Proposta de arquivamento — NÃO IMPLEMENTADA

Depende de aprovação para criar/revisar migration e regras:

1. Coluna `arquivado_em TIMESTAMPTZ NULL` em clientes e produtos, sem mudar IDs/FKs nem apagar linhas.
2. Operação explícita de arquivar, restrita ao proprietário; manter a semântica do DELETE atual até aprovar a transição dos clientes antigos.
3. Listagens e seletores ativos excluem arquivados. Detalhes, exportações, relatórios e recuperação de pedidos confirmados mantêm vínculos e valores.
4. Nova venda rejeita cadastro arquivado com leitura/bloqueio transacional adequado; retries idempotentes de operações já confirmadas conservam o resultado anterior.
5. Manter exclusividade dos códigos dos produtos arquivados inicialmente; não reutilizar silenciosamente código ou identidade.
6. Produto arquivado ainda pode receber devolução de estoque de cancelamento permitido, mantendo rastreabilidade. Definir a política operacional antes da implementação.
7. Arquivar cliente não é anonimizar ou apagar dados pessoais. Definir acesso, retenção e eventual anonimização autorizada separadamente, sem apagar dívidas ou pagamentos.
8. Não ampliar a exclusão física de vendas. Uma futura política de cancelamento/arquivamento com trilha de auditoria exige validação expressa; não implementar remoção automática de históricos.

Não foi criado nem executado arquivo de migration nesta etapa.

## Exportação implementada sem migration

`GET /admin/relatorios/exportar`, protegido internamente pelo AdminMiddleware existente, com conta ativa e sessão persistente válidas antes da autorização administrativa. A opção **Exportar dados** fica em Relatórios e exige confirmação sobre sensibilidade e escopo.

Escopo: todas as revendedoras (inclusive bloqueadas), seus clientes, produtos, vendas, itens, parcelas e pagamentos; não usa os filtros visuais de relatórios. Não exporta contas admin, senhas, hashes, sessões, revogações, códigos de recuperação, limites de autenticação, fotos, credenciais nem registros internos de idempotência. Nunca usa SELECT *.

O snapshot usa uma única transação REPEATABLE READ READ ONLY, terminada com ROLLBACK. Todos os relacionamentos exportados preservam os IDs existentes; valores NUMERIC são strings decimais, sem float intermediário. Alterações posteriores à criação do snapshot não entram parcialmente no arquivo.

Formato externo JSON:

```
{"formato":"quitai-exportacao-dados","versao":1,"sha256":"...","conteudo_json":"..."}
```

`conteudo_json` é uma string contendo JSON UTF-8 com `ambiente_financeiro`, instante UTC de geração (não um identificador de snapshot PostgreSQL), escopo e sete arrays em `dados`. O SHA-256 é calculado sobre os bytes UTF-8 EXATOS dessa string, incluindo a quebra de linha final; não sobre uma reserialização dos objetos. O frontend verifica hash e versão antes de disponibilizar o download. O hash detecta corrupção, não comprova autoria nem protege contra adulteração deliberada.

Limites por instância: uma exportação em andamento, sem fila; 20 segundos para geração; 50.000 registros por tabela; 256 KiB por registro; conteúdo JSON até 10 MiB; arquivo final até 20 MiB. Memória temporária é limitada pelo conteúdo e suas cópias/estruturas Go, não ao exato tamanho do arquivo. Erros/limites produzem 413/503 antes de enviar conteúdo; concorrência produz 429. O navegador limita download a 20 MiB e cancela em 30 segundos ou ao desmontar. Exportação não cria arquivos no servidor e não registra dados no log. Resposta no-store, nosniff, attachment. Tokens e cabeçalhos não são incorporados ao arquivo.

A transferência HTTP tem deadline de escrita de 10 segundos apenas nessa rota, restaurado após o envio. Servidor sem suporte a deadline rejeita o download antes de enviar dados. Isso não altera o timeout global nem o SSE.

A porta de autorização usa a permissão admin já existente; não existe permissão granular nova. Exportação só deve ser concedida a administradores que possam acessar todos os dados de revendedoras. Cada réplica tem seu próprio limite de concorrência; não há fila/limite global distribuído.

É uma exportação de dados de negócio, NÃO um backup completo/restaurável autonomamente do PostgreSQL. Não contém esquema, sequências, owners, ACLs, contas administrativas, anexos ou estado de autenticação/idempotência. Manter pg_dump/snapshots independentes e testados. CSV não foi acrescentado: não oferece relacionamentos/precisão equivalentes e é opcional no escopo.

## Armazenamento e recuperação futura — sem importação automática

1. Guardar o download em local privado e criptografado; restringir acesso e retenção. Não anexar ao Git, tickets públicos, logs ou chats. O arquivo não é criptografado pelo aplicativo.
2. Validar formato/versão, limites, UTF-8 e hash da string exata antes de analisar os dados. Validar origem e contexto do ambiente independentemente do nome do arquivo.
3. Provisionar banco isolado somente após autorização específica; aplicar esquema compatível auditado. Nenhum importador de produção foi implementado.
4. Validar unicidade de IDs, referências usuário/cliente/produto/venda/parcela e isolamento de proprietário. Verificar valores decimais exatos, somas, pagamentos parciais/excedentes, vencimentos e estoque sem recalcular ou corrigir históricos automaticamente.
5. Comparar contagens e relacionamentos antes/depois; ajustar sequências somente nesse banco autorizado após avaliar os IDs. Fazer testes de relatórios e leitura.
6. Definir separadamente provisionamento seguro de contas, bloqueio inicial, novo login/JWT e recuperação de senha; a exportação não permite reconstruir credenciais nem deve reativar contas automaticamente.
7. Dados internos de idempotência não estão neste arquivo: não liberar reenvios de pendências financeiras contra um banco recuperado sem plano explícito de conciliação. Um novo destino lógico precisa de identificação financeira e isolamento compatíveis.
8. Não mesclar em banco existente por ID/email/código automaticamente. Abortar em colisões, divergências de origem ou referências ausentes; nenhuma sobrescrita/UPSERT automática.
9. Só planejar recuperação real após aprovação administrativa expressa, backup completo do destino, manutenção, plano de reconciliação e testes isolados aprovados. Nunca apagar/recriar production como rollback automático.

## Publicação futura

Revisar diff e testes; validar SQL/snapshot com PostgreSQL descartável representativo e conferir compatibilidade de esquema por metadados autorizados. Testar clique/download no React com admin e a negativa de revendedora. Publicar backend antes do botão frontend, sem aplicar migrations de arquivamento. Preservar e revisar separadamente a instrumentação de desempenho ainda não publicada. Nenhum deploy/commit/push está autorizado por este documento.

## Auditoria local adicional

A ausencia ou invalidade de FINANCIAL_ENVIRONMENT_ID bloqueia a exportacao com HTTP 503, depois da autenticacao administrativa e antes do snapshot de negocio. Nao configurar fallback: usar um identificador estavel e distinto por banco logico, nunca gerar um novo a cada inicializacao. Configuracao local ausente nao comprova ausencia no Railway. Nenhum .env ou credencial foi alterado na auditoria.

O teste permanente admin_exportacao_postgres_test.go e opt-in por QUITAIA_EXPORTACAO_TEST_DSN, restrito ao banco/usuario quitai_exportacao_auditoria, PostgreSQL 18.6, localhost:5548. QUITAIA_EXPORTACAO_SOCKET_AUDITORIA=1 permite somente o socket /var/run/postgresql, para execucao dentro do conteiner descartavel identificado. QUITAIA_EXPORTACAO_CONCORRENCIA=1 permite atualizar somente as fixtures sinteticas desse banco e restaura seus valores. Nao usar nenhuma dessas configuracoes em producao. O teste Linux temporario anterior passou a exigir QUITAIA_EXPORTACAO_SOCKET_TEST=1, evitando conexao automatica a um socket fixo em execucoes comuns.
