# ST1 Connect — Procedimento 02: acesso por departamento

> **For agentic workers:** Execute and validate incrementally using isolated tests.

**Goal:** Access control by department, without broadening Ouvidoria, BI or Master privileges.

**Architecture:** Explicit active memberships in private Supabase table st1_services.department_memberships; backend authorization before reading or mutating service requests; React department queue and Master permission manager.

**Tech Stack:** Vercel Functions, React/TypeScript, Supabase Postgres.

## Implemented in Preview
- [x] Add private st1_services.department_memberships with RLS, constrained area/role, restricted backend grants.
- [x] Add department-access.js pure policy and associated tests.
- [x] Add department membership management to existing service-requests API (Hobby function cap).
- [x] Add department-specific queue and assignment enforcement.
- [x] Restrict detail and status changes to requester, Master or scoped department membership.
- [x] Exclude confidential and Ouvidoria requests from department queues and assignment.
- [x] Build Equipes e departamentos interface with Master-managed grants and scoped assignee discovery.
- [x] Preserve production branch, users, passwords, existing tickets and BI module.

## Verification gates
- [x] Private membership table exists in Supabase; migration registered.
- [x] Security advisors report no new notices.
- [x] Preview Vite/TypeScript build confirmed READY for department UI.
- [x] Full `npm test` suite: **107 aprovados, 0 falhas**, comprovados em GitHub Actions após corrigir os contratos de atendimento e navegação; TypeScript e build Vite aprovados.
- [ ] Browser E2E: Master grants and revokes manager, manager assigns to active executor, executor handles assigned request.
- [ ] Negative E2E: unauthorized ID, wrong department, inactive membership, Ouvidoria confidentiality, no cross-area bleed.
- [ ] Confirm Master dashboard and normal login still work.
- [ ] Only after gates pass, consider production promotion.

## Technical references
- api/_lib/department-access.js
- api/_lib/service-service.js
- api/service-requests.js
- src/features/services/DepartmentWorkspace.tsx
- src/features/services/service-api.ts
- src/OperationalApp.tsx

**Important:** Department user IDs map to the existing private account directory. Never infer grants from the global account role or email domain. Operational routing, SLA and notification automation are Procedure 05, not part of this phase.

## Evidências de QA — 31/10/2026

- Correções dos contratos: `api/_lib/service-create.test.js` e `src/operational-shell.test.ts`.
- Cobertura adicional: `api/_lib/department-operations.test.js` (filas, atribuição, revogação, Ouvidoria e controle Master).
- GitHub Actions (mesmo commit de validação `ed90cbb09eeacd1a5b0d285d7915a07e496fe6fe`): [CI de aplicação](https://github.com/Viniciusagnes08/st1-connect/actions/runs/41251372953), [CI de segurança](https://github.com/Viniciusagnes08/st1-connect/actions/runs/41251372712) e [segundo job de validação](https://github.com/Viniciusagnes08/st1-connect/actions/runs/41251372728) concluídos com sucesso.
- Vercel Preview: deployment `dpl_6tJE9jgJJXz86PRevL4i3r9kbc2d` em estado `READY`.
- Supabase: RLS em `st1_services.requests` e `st1_services.department_memberships`; advisor sem alertas; 0 chamados e 0 memberships; nenhum registro real alterado durante o QA.
- **Limite da evidência:** testes com fixtures isoladas e build aprovados. O login real em navegador e o fluxo de concessão de papéis com contas de teste permanecem pendentes; publicação geral segue bloqueada.
