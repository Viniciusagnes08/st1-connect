# ST1 Connect multiárea — Phase 00 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retirar dados demonstrativos da aplicação operacional em Preview sem perder dados locais legítimos, mantendo login e BI reais e preparando a estrutura corporativa multiárea.

**Architecture:** Criar novo shell `OperationalApp` e apontar o `AuthGate` para ele em vez do `App` antigo. O novo shell consome exclusivamente `GET /api/requests`, mantém `BIWorkspace` intacto, mostra áreas futuras como não habilitadas e permite exportação de storage local por ação explícita. O código de demonstração permanece no repositório, sem importação pela entrada de produção.

**Tech Stack:** React 19, TypeScript, Vite, Vercel Functions, Supabase Postgres privado, Node Test Runner/tsx.

**Spec:** `docs/superpowers/specs/2026-10-31-st1-connect-multiarea-phase-00-design.md`.

---

### Task 1 — Preservação dos dados locais do navegador

**Files:**
- Create: `src/legacy-backup.ts`
- Create: `src/legacy-backup.test.ts`

- [ ] Step 1: escrever testes unitários de leitura sem mutação: storage vazio = nenhum backup; duas chaves presentes = ambas preservadas; storage lança erro = falha explícita.
- [ ] Step 2: confirmar que os testes falham antes de implementar.
- [ ] Step 3: implementar `readLegacyBackup(storage, origin, date)` com leitura apenas de `st1-connect:v1` e `st1-connect:v1:recovery` e retorno de `{format,origin,exportedAt,entries}`.
- [ ] Step 4: implementar `downloadLegacyBackup(backup)` usando Blob/URL apenas no browser e revogação do object URL. Não gravar nada em localStorage.
- [ ] Step 5: `npm test` passa; commit isolado.

Teste representativo:
```ts
const calls:string[]=[];
const storage={getItem:(key:string)=>{calls.push(key);return key==='st1-connect:v1'?'{"version":1}':null;}};
const backup=readLegacyBackup(storage,'https://preview.example',new Date('2026-10-31T12:00:00Z'));
assert.deepEqual(calls,['st1-connect:v1','st1-connect:v1:recovery']);
assert.equal(backup.entries['st1-connect:v1'],'{"version":1}');
```

### Task 2 — Shell corporativo autêntico

**Files:**
- Create: `src/OperationalApp.tsx`
- Create: `src/operational.css`
- Modify: `src/AuthGate.tsx`
- Modify: `src/main.tsx`
- Modify: `src/sidebar-layout.test.ts` to inspect the active app
- Create: `src/operational-shell.test.ts`

- [ ] Step 1: testes de contrato do shell: import ativo `OperationalApp`, ausência de `createSeedData`, rotas legadas redirecionadas, todos os papéis autorizados a acessar home e BI.
- [ ] Step 2: criar navegação Visão geral, Minhas solicitações, Squad BI, Áreas futuras, Dados locais anteriores; mobile com menu acessível e perfil atual.
- [ ] Step 3: `GET /api/requests` sem filtro do cliente; usar apenas dados do usuário retornados pelo servidor, calcular resumo pessoal após sucesso.
- [ ] Step 4: estados carregando/erro/vazio implementados sem mistura com 0 falso. Mostrar área fora BI sem botão de criação/atribuição enquanto API correspondente não existir.
- [ ] Step 5: painel de dados antigos com export JSON local, aviso de isolamento por origem e proibição de apagar registros.
- [ ] Step 6: apontar `AuthGate` para `OperationalApp`; preservar `BIWorkspace` como conteúdo do módulo BI.
- [ ] Step 7: rodar `npm test` e `npm run build`; revisar UX mobile e contraste.

Contrato de atualização:
```tsx
// src/AuthGate.tsx (entrada autenticada)
import OperationalApp from './OperationalApp';
// ...
if (user) return <OperationalApp user={user} onLogout={exit}/>;
```

Contrato de leitura:
```ts
const rows=await getMyRequests(); // GET /api/requests, consulta autenticada
setLoadState({kind:'ready',items:rows});
```

### Task 3 — Proteção dos canais de recuperação emergencial

**Files:** Vercel Preview environment, `docs/operations/admin-access-recovery.md`.

- [ ] Step 1: alterar `ST1_ADMIN_RECOVERY_ENABLED=false` apenas na branch Preview.
- [ ] Step 2: expirar `ST1_EMAIL_RECOVERY_EXPIRES_AT` somente no Preview.
- [ ] Step 3: verificar API `/api/auth?action=status` sinalizando `adminRecoveryAvailable:false`.
- [ ] Step 4: login normal permanece operacional; não alterar senha, chave de assinatura ou armazenamento privado de contas.

### Task 4 — Validação e registro

**Files:**
- Modify: `README.md`, mantendo documentação histórica separada da experiência operacional.
- Modify: `docs/operations/bi-foundation-runbook.md` apenas se os caminhos mudarem.
- Create: `docs/operations/phase-00-multiarea-validation.md`.

- [ ] Step 1: confirmar schema `st1_bi` sem migrações nem escrita em dados.
- [ ] Step 2: CI + TypeScript + Vite aprovados, Preview READY.
- [ ] Step 3: verificar `GET /api/health` = `database:ready` no Preview.
- [ ] Step 4: inspecionar `/#/overview`, `/#/bi`, `/#/legacy` e URLs antigas no browser sem login; confirmar login e renderização pós-login na homologação por usuário.
- [ ] Step 5: documentar limites: outras áreas ainda não recebem pedidos; dados legados de outro domínio não são exportáveis nesta URL.
- [ ] Step 6: manter PR #1 em Draft e produção intacta; registrar evidências e critérios pendentes de homologação pessoal.
