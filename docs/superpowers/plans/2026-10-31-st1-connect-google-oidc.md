# ST1 Connect — Procedimento 04: login Google OIDC

> **For agentic workers:** Validate each small change with automated tests and CI, maintaining production and the Admin Master account intact.

**Goal:** Allow verified ST1 Workspace users and individually invited Gmail users to sign in safely through Google Identity Services (GIS).
**Architecture:** Reuse the existing GIS popup + signed ID token + Vercel private Blob account directory. Add a short-lived, signed HttpOnly login challenge and verify its nonce against Google's signed JWT; recheck corporate hosted domain and invited Gmail authorization on each login. Preserve custom session cookies, role memberships and password login.
**Tech Stack:** Vercel Node Functions, Node.js Crypto, React/TypeScript, GitHub Actions, Vercel Preview.

## Task 1 — Baseline and Google Cloud boundary
- [x] Review `api/_lib/google-oidc.js`, `api/auth.js`, `src/GoogleSignIn.tsx` and existing tests.
- [x] Confirm Preview env `ST1_GOOGLE_CLIENT_ID` exists and matches Web Client ID syntax without printing it.
- [x] Confirm Vercel SSO protection is enabled; do not disable it for preview.
- [ ] Verify Google Cloud OAuth app type **Web application**, exact authorized origin and consent/audience state via authenticated Google Cloud console. Current connector cannot access that console.

## Task 2 — Challenge and token validation
- [ ] Create `api/_lib/google-challenge.js` with short-lived signed nonce stored in `HttpOnly;Secure;SameSite=Strict` cookie.
- [ ] Test valid challenge, tamper, expiry, missing cookie, incorrect secret.
- [ ] Add `GET /api/auth?action=google-challenge` and verify challenge `nonce` signed into the Google JWT during `POST /api/auth?action=google`.
- [ ] Clear challenge cookie after successful login; preserve password-session behavior.

## Task 3 — Server-side identity policy
- [ ] Corporate accounts must have matching Google-signed `hd` plus `@st1.net.br`, verified email and Google `sub`.
- [ ] Invited Gmail may activate only when there is a Master-approved pending invitation; returning Gmail remains `Solicitante`.
- [ ] Previously password-authenticated accounts and the Admin Master are never linked automatically.
- [ ] Revalidate policy on returning Google login; deactivated users remain blocked.
- [ ] Add signed JWT regression tests (wrong `aud`, `iss`, `hd`, `nonce`, exp, false `email_verified`, tampered signature).

## Task 4 — Frontend GIS
- [ ] Request login challenge before initializing the GIS button and pass the returned nonce to GIS.
- [ ] Preserve existing login UI and password fallback.
- [ ] Show actionable errors for failed challenge/Google script load and avoid misleading success.

## Task 5 — Verification and release gate
- [ ] `npm test`, TypeScript and Vite pass; three GitHub Actions suites green.
- [ ] Preview deployment READY, `main` untouched.
- [ ] Manual E2E in authorized browser after Google Cloud origin registration: corporate, invited Gmail, noninvited Gmail, deactivated account, logout and Master protection.
- [ ] Retain Preview SSO; no general production release without Google Cloud and real-account E2E confirmation.

## OAuth console configuration

Google Cloud project: `st1-connect`. GIS callback mode needs **Authorized JavaScript origins**, not a login redirect URI:

```
https://st1-connect-git-feature-st1-connect-bi-fo-ebfb78-vinicius-agnes.vercel.app
```

Do not append `/?utm_source=...`, `#/overview`, `/api/auth`, or a trailing path. Match the exact Client ID configured in `ST1_GOOGLE_CLIENT_ID`. If personal Gmail invitations must work, use an OAuth audience compatible with external test users or public external sign-in; an Internal-only audience would exclude personal Gmail accounts.

## Rollback

Revert code changes on the Preview branch if CI fails; don't rotate secrets, disable Vercel SSO, change account credentials or promote to production.
