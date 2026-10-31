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
- [ ] Full npm test suite: initial isolated verification returned failure, root cause not yet confirmed. Do not describe as passed.
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
