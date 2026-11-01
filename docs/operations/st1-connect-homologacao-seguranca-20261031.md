# ST1 Connect — evidências de homologação departamental e segurança

**Data:** 2026-10-31. **Escopo do código:** Preview `feature/st1-connect-bi-foundation`. Sem merge para `main`, sem mudança de credenciais ou cadastros reais.

## Entregas verificadas

- Fluxo de concessão/revogação centralizado em `api/_lib/department-grants.js`, com checagem de autoridade Master, conta ativa e vínculos válidos.
- Concessões idempotentes; criação, mudança de função, revogação e reativação gravam evento na mesma transação da associação.
- `GET /api/service-requests?action=department-audit` retorna os últimos 100 eventos somente para Admin Master.
- A interface `Equipes e departamentos` exibe histórico por área e preenche função/status do membro selecionado para evitar alterações acidentais.
- Nova tabela privada `st1_services.department_access_audit` com SELECT/INSERT para backend, sem UPDATE/DELETE para conta operacional.
- `FORCE ROW LEVEL SECURITY` nas tabelas privadas `requests`, `request_events` e `submission_keys`; `department_memberships` e `department_access_audit` também possuem FORCE RLS.
- Restrição SQL `service_assignment_only_nonconfidential_department` impede atribuir pedidos confidenciais ou de Ouvidoria.

## Evidências automatizadas

- `npm test`: **113 testes aprovados, 0 falhas** no commit `ae86d0695878c5a6dc847d4580d0c46261104f46`.
- Fluxo simulado sem dados operacionais: solicitante abre pedido CRM; Master concede Gestor/Executor; Gestor atribui; Executor lê e atualiza; Master revoga; acesso do Executor deixa de existir; Ouvidoria continua restrita.
- CI de aplicação, CI alternativo e CI de segurança aprovados:
  - https://github.com/Viniciusagnes08/st1-connect/actions/runs/41252082957
  - https://github.com/Viniciusagnes08/st1-connect/actions/runs/41252082952
  - https://github.com/Viniciusagnes08/st1-connect/actions/runs/41252083010
- Vercel Preview `READY` no commit `ae86d0695878c5a6dc847d4580d0c46261104f46`.

## Verificações do banco

- Migration aplicada: `st1_services_department_audit_and_rls_guards_20261031`.
- Auditoria: 0 registros antes dos primeiros usos; permissões `anon`/`authenticated` de leitura = false.
- Backend `st1_connect_runtime`: INSERT = true, UPDATE = false, DELETE = false em `department_access_audit`.
- RLS e FORCE RLS ativos nas cinco tabelas relevantes.
- Restrição de atribuição confidencial presente no catálogo de constraints.
- Supabase Security Advisors: sem alertas registrados.
- 0 solicitações e 0 associações departamentais; testes não criaram dados persistentes.

## Escopo não homologado (bloqueia liberação geral)

1. **Login e fluxo real no navegador**: conector do navegador não disponibilizou contexto autenticado. Não foi possível iniciar sessão como Gestor/Executor, conceder permissões reais e verificar a UI com duas contas autorizadas.
2. **RLS por usuário no banco**: as políticas do backend ainda são amplas (`USING(true)`) porque o login ST1 Connect utiliza sessão externa ao Supabase Auth. O isolamento por usuário/área é implementado principalmente nas APIs. É necessária arquitetura posterior de contexto autenticado no PostgreSQL (ou integração Supabase Auth) antes de afirmar segregação por linha independente da aplicação.
3. **Imutabilidade absoluta do log**: a conta operacional não possui UPDATE/DELETE, mas o administrador do PostgreSQL pode alterar o armazenamento. Isso não é WORM regulatório.

## Próximo gate operacional

Com duas contas de teste previamente autorizadas, confirmar: Master concede Gestor e Executor; Gestor enxerga somente seu departamento e atribui; Executor recebe o pedido; revogação corta acesso; Ouvidoria é invisível aos perfis de área; consulta direta por ID externo devolve 404. Registrar capturas e logs sem informações pessoais.

**Política de publicação:** não promover o branch para produção enquanto o gate funcional real não estiver aprovado.
