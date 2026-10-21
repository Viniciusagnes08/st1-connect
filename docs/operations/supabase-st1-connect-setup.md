# Supabase para ST1 Connect | Preparação segura da Fase A

**Situação em 21/10/2026:** projeto Supabase **ST1 Connect** criado com cobrança confirmada de **US$ 0/mês**, na região `sa-east-1`. Projeto ID `cxqoypwsqokkwcirugrg` ([abrir no Supabase](https://supabase.com/dashboard/project/cxqoypwsqokkwcirugrg)), status `ACTIVE_HEALTHY`. Migração `st1_connect_bi_foundation_private_schema` aplicada. **Ainda não foi configurada `DATABASE_URL` no Vercel**.

## Descoberta no Supabase (20/10/2026)

A organização conectada continua no **plano Free**. O projeto **ST1 Connect** foi criado como segundo projeto ativo gratuito. O **ST1 Academy** continua ativo e o projeto genérico inativo permanece preservado; nenhum dos dois foi utilizado pelo Connect. O limite do Free Plan é de dois projetos ativos.

A criação foi autorizada pelo usuário somente com custo zero. O Supabase retornou a cotação `{type:'project',recurrence:'monthly',amount:0}` antes da criação. A primeira leitura verificou seis tabelas vazias em `st1_bi` e nenhuma tabela operacional em `public`. A consulta de segurança confirmou `anon_schema_access=false`, `authenticated_schema_access=false` e nenhum GRANT direto a esses papéis. Em 21/10/2026, o índice da FK foi criado e o RLS foi habilitado após definir e testar a role exclusiva do backend. Os advisors de segurança retornaram sem lints.

Fontes oficiais:
- https://supabase.com/docs/guides/platform/billing-on-supabase
- https://supabase.com/docs/guides/platform/free-project-pausing
- https://supabase.com/docs/guides/database/connecting-to-postgres

## Desenho do banco e segurança

A aplicação **não usa Supabase Auth** nesta fase. Login, papel e sessão são conferidos pelo ST1 Connect no backend do Vercel. Portanto não há motivo para disponibilizar solicitações de BI na API pública do Supabase ou criar políticas simplistas de RLS para `authenticated`.

O arquivo `db/migrations/001_core.sql` cria apenas tabelas internas no schema **`st1_bi`**:
- `st1_bi.request_records`
- `st1_bi.bi_memberships`
- `st1_bi.bi_tickets`
- `st1_bi.request_events`
- `st1_bi.submission_keys`
- `st1_bi.audit_log`
- `st1_bi.request_protocol_seq`

O `st1_bi` não pertence aos schemas expostos na Data API do Supabase e tem `USAGE` revogado de `PUBLIC`. As APIs no Vercel acessam essas tabelas com consultas SQL explicitamente qualificadas, aplicando autorização por usuário + membership do BI antes de consultar os registros.

**Não cadastrar este schema nas configurações de exposição do Supabase REST/GraphQL.** Não colocar service-role key, token do Supabase, string de conexão ou senha em `VITE_*`, no bundle React ou no GitHub.

## Escolha das conexões

- **Migração administrativa:** conexão protegida de banco com permissão DDL, executada uma vez por ambiente; ou `Supabase apply_migration` dentro de projeto reservado para o Connect.
- **API serverless Vercel:** **Transaction pooler** Supabase (Supavisor), porta 6543, `prepare:false` no driver `postgres`. O pooler é adequado a funções curtas e pode ser alcançado via IPv4.
- **Preferível em produção:** um papel SQL exclusivo de execução do Connect com `USAGE` apenas no schema e `SELECT, INSERT, UPDATE` somente nas tabelas da aplicação e `USAGE` nas sequências necessárias. Credenciais desse papel não devem ser as do administrador do banco.
- `DATABASE_URL` é uma variável **server-side** exclusiva do Vercel, não um endereço público. Testar conexão TLS e `SELECT 1` depois de configurar.
- O driver valida o certificado com `rejectUnauthorized:true`. Se necessário, fornecer a CA pública via `DATABASE_SSL_CA`; não usar `ssl:'require'`, que no Postgres.js utilizado desativa a validação do certificado.

A role `st1_connect_preview` já está criada, sem login nem senha. Possui os privilégios de tabela e sequência necessários à API, sem DELETE, DDL ou BYPASSRLS. As seis tabelas têm RLS ativo e políticas restritas a essa role. O backend autentica e autoriza cada usuário antes das consultas. Essa proteção foi testada em transação, com rollback de todos os registros sintéticos. O login da role só deve ser habilitado ao configurar a conexão privada.

Esquema de permissão esperado, a aplicar com nome real da role criada e aprovada:

```sql
-- Apenas referência: nome da role deve existir e senha deve ser configurada
-- fora do repositório. Não execute se a role não tiver sido criada.
GRANT USAGE ON SCHEMA st1_bi TO st1_bi_api;
GRANT SELECT ON st1_bi.request_records, st1_bi.bi_memberships,
  st1_bi.bi_tickets, st1_bi.request_events, st1_bi.submission_keys TO st1_bi_api;
GRANT INSERT ON st1_bi.request_records, st1_bi.bi_tickets,
  st1_bi.request_events, st1_bi.submission_keys,
  st1_bi.bi_memberships, st1_bi.audit_log TO st1_bi_api;
GRANT UPDATE ON st1_bi.request_records, st1_bi.bi_tickets,
  st1_bi.bi_memberships TO st1_bi_api;
GRANT USAGE, SELECT ON st1_bi.request_protocol_seq,
  st1_bi.audit_log_id_seq TO st1_bi_api;
```

## Conexão Vercel Preview e homologação

1. Criar projeto próprio **ST1 Connect**, na organização indicada pela pessoa responsável, confirmando que o custo exibido é zero.
2. Nunca vincular o banco do ST1 Academy ao Connect. Projeto dedicado evita mistura de cadastros, chamados e rotinas da escola de treinamento.
3. Inspecionar as tabelas existentes e a lista de migrations no novo projeto antes de aplicar qualquer DDL.
4. Aplicar `db/migrations/001_core.sql` no projeto novo e verificar as seis tabelas sob `st1_bi`, a sequência e a ausência de schemas adicionais expostos. Se utilizar `apply_migration`, não misturar ferramentas de histórico de migration sem reconciliação.
5. Rodar advisors de segurança/performance no Supabase e tratar alertas relevantes.
6. Configurar **somente Preview**: `DATABASE_URL` pelo Vercel (segredo server-side) e `BI_CONNECT_ENABLED=true` após a migração. Nunca no branch principal antes da homologação.
7. Exercitar duas contas: criar pedido, visualizar próprio, negar leitura cruzada, fila permitida só a membros do BI e duplicação bloqueada por Idempotency-Key.
8. Inspecionar logs, orçamento, backups, recuperação e risco de pausa automática em plano gratuito antes da escolha de produção.

O Supabase Free pode pausar projetos com baixa atividade. Por isso o Free é conveniente para **homologação**, mas antes do uso produtivo do Squad o responsável deve aceitar explicitamente esse risco ou avaliar outro plano.

## Verificação realizada no projeto Supabase

- **Schema aplicado:** `st1_bi`
- **Tabelas:** `request_records`, `bi_memberships`, `bi_tickets`, `request_events`, `submission_keys`, `audit_log`
- **Linhas iniciais:** 0 registros em solicitações, tickets e membros.
- **Migração registrada no Supabase:** `20261021023801_st1_connect_bi_foundation_private_schema`
- **RLS e role preparados:** migração `20261021035541_restrict_bi_backend_role`; as seis tabelas possuem políticas para `st1_connect_preview`. Escrita/leitura/atualização e bloqueio de DELETE, DDL e leitura de auditoria foram testados; `anon`/`authenticated` continuam sem USAGE.
- **Preview preparada:** `BI_CONNECT_ENABLED=false` foi criada e relida somente na branch `feature/st1-connect-bi-foundation`.
- **Próximo passo:** obter o endpoint real do pooler atribuído ao projeto no painel autenticado, criar a credencial da role restrita e configurar a `DATABASE_URL` privada na Vercel Preview. Testar o driver antes de habilitar a flag. Não inferir o host do pooler apenas pela região.
- **Não reproduzir segredo em chat, documentação ou código.** Configurar a string diretamente na área protegida de variáveis do Vercel.

### Observação sobre migrações

A primeira migração foi executada pela integração Supabase e está registrada no histórico gerenciado dessa plataforma. O script local `db/migrate.mjs` mantém seu próprio registro em `st1_bi.schema_migrations`; **não executar a migração local sobre o mesmo projeto antes de reconciliar os dois históricos**, para evitar caminhos de gestão concorrentes.

## Estado de conclusão

A Fase A permanece na branch `feature/st1-connect-bi-foundation`. O **Supabase dedicado e a migração inicial já estão criados e verificados**, sem ligação ao ST1 Academy. Ainda falta conectar a credencial protegida ao Vercel Preview e realizar testes reais de dois usuários e de escrita/leitura entre dispositivos antes do merge.
