# ST1 Connect — Admin Master Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement and validate this plan task-by-task. Checkboxes describe the state verifiable in source control, not proof of a successful production release.

**Goal:** Protect the original Admin Master identity from privilege escalation or takeover by delegated administrators.
**Architecture:** Server-side authorization in a small pure policy module called from the account and BI APIs, with corresponding UX restrictions. Administrative mutations and their bounded audit events persist in one private ETag-guarded Vercel Blob document.
**Tech Stack:** Node.js/Vercel Functions, React/TypeScript/Vite, private Vercel Blob, Supabase Postgres for BI memberships.

---

## Task 1 — Centralize server authorization
**Files:** `api/_lib/master-admin.js`, `api/_lib/master-admin.test.js`

- [x] Add `isMasterIdentity`, `canCreateAccount`, `canUpdateAccount`, `canUpdateBiMembership` with no trust in client roles/headers.
- [x] Confirm unit scenarios: only Master creates/promotes Admin, delegated admins manage ordinary users, Master cannot be demoted.
- [x] Confirm isolated policy tests with `node --test api/_lib/master-admin.test.js` on a matching local fixture.

## Task 2 — Protect user mutations and preserve login
**Files:** `api/auth.js`, `api/_lib/master-privileges.test.js`

- [x] Check `canCreateAccount(me, b.role)` before creating an account.
- [x] Check `canUpdateAccount(me, target, b.role, b.active)` before mutating the target.
- [x] Prevent Master demotion/deactivation, and reject self-service password reset through `user-update` without current password.
- [x] Block password resets for Google-only accounts through local password administration.
- [x] Add regression coverage with isolated mocked Vercel Blob and fake credentials, including 403, 400, session revocation, and allowed ordinary-user updates.

## Task 3 — BI membership protection
**Files:** `api/bi-members.js`, `api/_lib/master-admin.test.js`

- [x] Reject membership changes targeting the initial Master from delegated admins.
- [x] Preserve existing BI membership permission for delegated administrators on other users.

## Task 4 — Persist administrative audit events
**Files:** `api/auth.js`

- [x] Add `auditTrail` to the private user-directory document.
- [x] Persist role/status changes, account creation, Google invitations, admin password changes, recovery events.
- [x] Keep audit event payloads free of passwords, tokens, hashes and email addresses.
- [x] Restrict audit readback to Master via GET `/api/auth?action=audit`.
- [x] Bound the operational audit trail to the latest 1000 events, with only 100 events per read.
- [ ] Introduce an independent append-only audit store with longer retention during Procedure 03.

## Task 5 — UI and verification
**Files:** `src/AuthGate.tsx`, `.github/workflows/st1-connect-security.yml`

- [x] Remove the Administrador option for delegated account managers.
- [x] Disable delegated edits and toggles for existing admin accounts.
- [x] Add isolated CI workflow for `npm ci`, `npm test` and `tsc -b && vite build`.
- [x] Confirm Vite/TypeScript Preview build `READY` after security edits.
- [ ] Obtain successful full authorization test suite result and inspect workflow logs (connector currently cannot read build events).
- [ ] Run manual positive/negative tests with two non-production accounts in the Preview.
- [ ] Promote only after all tests pass; do not merge this branch into main until then.

**Verification commands:**

```bash
npm ci
npm test
npm run build
```

**Expected:** all tests pass; TypeScript/Vite build succeeds; delegated admin receives 403 on privileged mutations; authorized ordinary operations continue to work.

**Rollback:** restore the last known-good commit before this procedure in the Preview branch only; leave production main and database schema unchanged.
