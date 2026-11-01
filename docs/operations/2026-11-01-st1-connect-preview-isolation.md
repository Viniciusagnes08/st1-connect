# ST1 Connect — Procedimento 05: Isolamento de Preview e Produção

**Estado em 2026-11-01:** etapa de proteção preventiva ativa, cutover ainda não habilitado. Não tratar a criação do Blob como migração concluída.

## Inventário e escopo

- Vercel `st1-connect`, projeto `prj_ncTHqiOIOPSESh2vuEcKKUBt5Jmi`, branch `feature/st1-connect-bi-foundation`.
- GitHub `Viniciusagnes08/st1-connect`; `main` e Vercel Production não devem ser alteradas.
- O Blob legado está disponível a Production, Preview e Development; o diretório `st1-connect/contas-v1.json` continua compartilhado até a migração.
- Banco original: Supabase `cxqoypwsqokkwcirugrg` (ST1 Connect), com dados reais; não gravar nele em testes de Preview.
- Banco novo de homologação: Supabase `qnyjndtccseqcktqfije`, região `sa-east-1`, criado em 01/11/2026 na organização previamente aprovada; cotação da criação: **0 por mês**. Contém somente esquemas/tabelas vazios e roles sem login.
- Blob privado **novo** `st1-connect-preview-isolated`: região `gru1`, `store_hVzSogKch4EgtVZE`, vazio e ainda não conectado a um projeto.
- Vercel Preview: `ST1_PREVIEW_WRITE_GUARD=true` e `ST1_PREVIEW_BLOB_STORE_ID` cadastrados **somente** para a branch de homologação.
- `ST1_PREVIEW_ISOLATION_ENABLED` permanece ausente/inativo enquanto não houver ambas as fontes independentes e teste de autenticação.

## Proteção implantada

1. `api/_lib/preview-isolation.js`: valida configuração independente e fornece bloqueio `503` antes de qualquer gravação enquanto o cutover não tiver sido confirmado.
2. `api/auth.js`: consulta o diretório existente, mas `save()` é bloqueado por `ST1_PREVIEW_WRITE_GUARD=true` até ativação do armazenamento independente. Login Google de usuário já vinculado pode continuar sem escrita.
3. `api/_lib/identity.js`: autenticação usa configuração selecionada por ambiente (atual ou isolada), nunca um diretório de fallback durante o cutover.
4. `api/_lib/db.js`: transações de gravação são bloqueadas no período de transição. Após o cutover, conexão aponta exclusivamente ao novo projeto Supabase verificado; o pooler deve usar o usuário `st1_connect_runtime.<new-ref>`.
5. Todas as novas credenciais devem ser exclusivas da Preview, jamais do ambiente Production. A proteção SSO da Vercel permanece habilitada.

**Efeito conhecido:** durante o bloqueio, ações de criar/alterar contas, convidar Gmail, recuperar senha, criar/atualizar solicitações e atribuir permissões devem falhar com `503`. Leituras e login Google de conta já vinculada permanecem disponíveis. Não interpretar esse bloqueio como erro na conta Master.

## Contrato de variáveis do cutover

As variáveis abaixo são exclusivas da branch de Preview. Os valores de chaves e tokens jamais entram em GitHub, documentação, mensagens, logs ou frontend.

| Variável | Contrato |
|---|---|
| `ST1_PREVIEW_WRITE_GUARD` | `true` desde a fase preventiva |
| `ST1_PREVIEW_BLOB_STORE_ID` | ID do Blob privado novo, diferente do legado |
| `ST1_PREVIEW_BLOB_READ_WRITE_TOKEN` | Token do novo Blob, diferente do legado, armazenamento seguro Vercel |
| `ST1_PREVIEW_AUTH_SECRET` | Chave nova, aleatória, ao menos 32 caracteres, não reutilizar a chave anterior |
| `ST1_PREVIEW_SUPABASE_PROJECT_REF` | Referência do projeto Supabase novo, nunca `cxqoypwsqokkwcirugrg` |
| `ST1_PREVIEW_DATABASE_URL` | URL direta com `st1_connect_runtime` no novo projeto, porta 5432, senha nova |
| `ST1_PREVIEW_DB_POOLER_HOST` | Opcional; selecionar pooler `sa-east-1` adequado |
| `ST1_PREVIEW_ISOLATION_ENABLED` | Habilitar `true` **somente depois** de todos os pré-requisitos abaixo |

Vercel Blob: ao conectar o armazenamento ao projeto, selecionar **somente Preview / branch**, sem sobrescrever `BLOB_READ_WRITE_TOKEN` global da Production. Os conectores existentes não expõem uma ação segura para conectar um Blob Team-level ao projeto com escopo de branch; concluir pelo painel Vercel e configurar o token sob o nome acima. É proibido publicar o token em texto.

## Passos restantes — gates

- [x] Confirmar origem e impacto de credenciais compartilhadas
- [x] Criar Blob privado independente (vazio)
- [x] Registrar ID e guarda de escrita exclusivos na branch
- [x] Desenvolver código de fail-closed + testes automatizados
- [x] Confirmar organização Supabase de destino; custo adicional cotado: 0 por mês
- [x] Criar projeto Supabase novo em `sa-east-1`, sem copiar tabelas com dados ou registros reais
- [x] Instalar esquemas e migrações em banco novo; role `st1_connect_runtime` criada com permissões mínimas e **NOLOGIN** até provisionamento seguro de credencial
- [x] Executar RLS/advisors e validar tabelas e scripts, com contagens zero em solicitações, auditorias e memberships
- [ ] Ligar novo Blob privado com token restrito à branch Preview, independente de Production
- [ ] Provisionar chave Preview e conexão Postgres privadas, validar envs sem exibir seus valores
- [ ] Preparar login Google Master no diretório novo SEM copiar usuário, senha nem identidade privada da produção
- [ ] Habilitar `ST1_PREVIEW_ISOLATION_ENABLED=true` somente após validar todos os gates
- [ ] Novo deploy `READY`; Master Google, Gmail convidado, logout, isolamento de sessão, grupos, BI e Ouvidoria
- [ ] Validar produção inalterada, ausência de mutações em diretório e DB legados

## Evidências do Supabase recém-criado

- Projeto: `qnyjndtccseqcktqfije`, `ACTIVE_HEALTHY`.
- Migrações registradas: `st1_preview_bi_core_20261101`, `st1_preview_runtime_roles_20261101`, `st1_preview_services_core_20261101`, `st1_preview_department_memberships_20261101`, `st1_preview_department_audit_20261101`.
- 12 tabelas: 7 em `st1_bi` (incluindo `schema_migrations`) e 5 em `st1_services`. 11 tabelas operacionais com RLS habilitado; as cinco tabelas operacionais `st1_services` também possuem `FORCE ROW LEVEL SECURITY`.
- Nenhuma tabela ou esquema da aplicação concede acesso direto a `anon`/`authenticated`; sem `USAGE` público nos dois esquemas privados.
- Contagens verificadas: zero solicitações BI/Serviços, zero vínculos BI/departamentos e zero eventos de auditoria de domínio. Nenhum registro de produção foi copiado.
- Security Advisors do Supabase: zero avisos no momento da validação.
- `st1_connect_preview` e `st1_connect_runtime`: roles `NOLOGIN` e `NOBYPASSRLS`; a permissão da runtime vem da role de backend limitada.
- Vercel `ST1_PREVIEW_SUPABASE_PROJECT_REF` configurado somente na Preview da branch. **Ainda não** existem credenciais runtime/Blob exclusivo e `ST1_PREVIEW_ISOLATION_ENABLED` continua desligado.
- O armazenamento privado criado anteriormente continua vazio e sem conexão ao projeto Vercel. `ST1_PREVIEW_WRITE_GUARD=true` deve permanecer ligado.

## Migração e continuidade do Master

**Não copiar** o diretório da produção para Preview. Ao habilitar o novo Blob vazio, o Google irá cadastrar a conta corporativa verificada como Solicitante. A conta recém-criada receberá um ID interno **novo**; a antiga configuração `ST1_PREVIEW_MASTER_GOOGLE_USER_ID` deixará de corresponder.

Antes de permitir testes administrativos de escrita, atualizar `ST1_PREVIEW_MASTER_GOOGLE_USER_ID` exclusivamente com o ID da conta **nova**, validar e publicar novamente. A sessão Google real deve ser renovada e verificada; não promover contas com base apenas no e-mail ou em dados de formulário.

**Não ativar o cutover sem uma janela controlada para esse repin**, porque o Master poderia aparecer momentaneamente como Solicitante. O fluxo por senha atual pode permanecer indisponível durante a transição. A autenticação por Google deve ser o canal primário.

## Reversão

Se ocorrer falha no cutover, desabilitar `ST1_PREVIEW_ISOLATION_ENABLED` somente na branch Preview, manter `ST1_PREVIEW_WRITE_GUARD=true`, reconstruir a Preview e usar login Google no diretório anterior **sem autorizar escritas**. Não alterar `main`, produção, tokens, senhas ou conteúdo do Blob legado.

## Referências

- https://vercel.com/docs/vercel-blob/private-storage
- https://vercel.com/docs/environment-variables
- https://supabase.com/docs/guides/database/postgres/row-level-security
