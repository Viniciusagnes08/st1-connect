# Supabase para ST1 Connect | Preparação segura da Fase A

**Situação:** a estrutura de código está preparada para Supabase Postgres, mas **ainda não existe projeto Supabase dedicado ao ST1 Connect, nem conexão configurada no Vercel**.

## Descoberta no Supabase (20/10/2026)

A organização conectada ao Supabase está no **plano Free**. Já existe **ST1 Academy** ativo, que **não deve ser utilizado ou modificado para o Connect**, e outro projeto genérico inativo. Pela regra documentada do Supabase, o Free Plan permite até **2 projetos ativos** e projetos pausados não contam no limite. Em princípio, há uma vaga para um projeto novo dedicado ao Connect.

**Pré-condição para criar:** autorização explícita da organização e confirmação de que a criação ficará no nível gratuito. Região recomendada para o Connect: `sa-east-1` (São Paulo). Nenhum projeto deve ser reutilizado ou reativado sem inspecionar seus dados e obter autorização.

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

Esquema de permissão esperado, a aplicar com nome real da role criada e aprovada:

```sql
-- Apenas referência: nome da role deve existir e senha deve ser configurada
-- fora do repositório. Não execute se a role não tiver sido criada.
GRANT USAGE ON SCHEMA st1_bi TO st1_bi_api;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA st1_bi TO st1_bi_api;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA st1_bi TO st1_bi_api;
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

## Estado de conclusão

A Fase A permanece na branch `feature/st1-connect-bi-foundation`. `npm test` e `npm run build` verificam o código, mas **não comprovam integração com um banco real**. A aprovação de conexão, criação de tabelas e migrações, credenciais e teste entre pessoas só ocorre após o projeto dedicado ser escolhido e configurado.
