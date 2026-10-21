# Fase A — Base segura e fila compartilhada do BI: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implantar persistência transacional de solicitações do BI, autorização no servidor e primeira fila multiusuário, mantendo o painel demonstrativo anterior intacto e claramente identificado.

**Architecture:** Manter React/Vite e Vercel Functions. PostgreSQL gerenciado como base transacional, identidades do login atual em Blob privado (fonte de verdade), APIs server-side com sessão assinada e isolamento por solicitante. O portal real opera sob flag, separado do localStorage demonstrativo até validar a migração.

**Tech Stack:** React 19, TypeScript, Vite, Node 24 no Vercel, JavaScript ESM em `api/`, `pg` 8.x, PostgreSQL 16+, Node Test Runner com `tsx` e Vercel Preview.

**Spec:** `docs/superpowers/specs/2026-10-20-formularios-inteligentes-design.md`

---

## Premissas de execução

1. Clone `https://github.com/Viniciusagnes08/st1-connect` e trabalhe numa branch `feature/st1-connect-bi-foundation`. Este plano é **para execução posterior**; sua presença no repositório não autoriza alterar o ambiente produtivo.
2. Não ligar o novo portal real em produção enquanto não houver banco, testes de isolamento de dados e aceite. O projeto é público: não registrar segredos ou e-mails de colaboradores nos commits.
3. **Gate financeiro e operacional:** usar PostgreSQL gerenciado via Vercel Marketplace (Neon é candidato, não contrato existente). Validar termos/cotas/custo, criar ambiente de teste isolado, guardar connection string exclusivamente em variável protegida. Sem aprovação da infraestrutura, executar testes locais com Postgres controlado e deixar deploy bloqueado.
4. Não importar automaticamente os 48 chamados de demonstração. Nenhuma API nova deve ler ou confiar no `localStorage`.
5. Cada task fecha um incremento testado e com commit, sempre em branch de feature. Fazer PR e validar Preview antes de merge.

## Mapa de arquivos

| Caminho | Responsabilidade |
| --- | --- |
| `package.json`, `package-lock.json` | dependência pg e runner de testes |
| `scripts/run-tests.mjs` | descoberta estável de testes TS/JS |
| `db/migrations/001_core.sql` | requests, tickets BI, eventos e idempotência |
| `db/migrate.mjs` | aplicador transacional e reexecutável das migrações |
| `api/_lib/db.js` | pool PostgreSQL e transação |
| `api/_lib/auth-session.js`, `api/_lib/identity.js` | sessão e consulta somente server-side às contas |
| `api/auth.js` | utilizar os helpers anteriores sem alterar contrato do login |
| `api/_lib/bi-service.js` | regras de criação, acesso e idempotência |
| `api/_lib/bi-service.test.js` | testes determinísticos do serviço |
| `api/bi-tickets.js` | GET/POST dos chamados reais |
| `api/requests.js` | GET de solicitações do próprio usuário |
| `src/features/bi/types.ts`, `src/features/bi/api.ts` | contrato do cliente sem segredos |
| `src/features/bi/QueuePage.tsx`, `src/features/bi/MyRequestsPage.tsx` | primeiras telas reais |
| `src/App.tsx` | pontos de montagem e menu segregados dos exemplos |
| `docs/operations/bi-foundation-runbook.md` | deploy, logs, restauração, flags e teste manual |

## Task 1: Preparar branch, testes e dependência do banco

**Files:** Modify: `package.json` e `package-lock.json`. Create: `scripts/run-tests.mjs` e `api/_lib/smoke.test.js`.

- [ ] **Step 1: registrar teste vermelho de descoberta.**

~~~js
// api/_lib/smoke.test.js
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
test('runner executa testes server-side', () => assert.equal(2 + 2, 4));
~~~

Execute o comando atual `npm test`. Resultado esperado: os oito testes antigos executam, mas o teste acima **não aparece**, demonstrando que o runner está limitado a `src/domain.test.ts`.

- [ ] **Step 2: criar o runner explícito de testes.**

~~~js
// scripts/run-tests.mjs
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
async function collect(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await collect(full));
    else if (/\.test\.(ts|js)$/.test(entry.name)) files.push(full);
  }
  return files;
}
const files = [...await collect('src'), ...await collect('api')].sort();
const child = spawnSync(process.execPath, ['--import', 'tsx', '--test', '--test-isolation=none', ...files], { stdio: 'inherit' });
process.exit(child.status ?? 1);
~~~

Trocar o script `test` em `package.json` por `node scripts/run-tests.mjs`; instalar com `npm install pg@8` e `npm ci` (lock gerado, commitado).

- [ ] **Step 3: validar e commitar.** Rodar `npm test && npm run build`; esperado: oito testes legados + novo teste verde e build TypeScript/Vite concluído. Commit: `chore: discover frontend and server tests`.

## Task 2: Criar banco transacional e migração versionada

**Files:** Create: `db/migrations/001_core.sql`, `db/migrate.mjs`, `api/_lib/db.js`, `api/_lib/db.test.js`.

- [ ] **Step 1: escrever teste de ausência de configuração.**

~~~js
// api/_lib/db.test.js
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { requireDatabaseUrl } from './db.js';
test('banco sem configuração falha fechado', () => {
  assert.throws(() => requireDatabaseUrl({}), /DATABASE_URL indisponível/);
});
~~~

Executar `npm test` antes de criar `db.js`; esperado: falha por export inexistente.

- [ ] **Step 2: criar pool e transação sem transações aninhadas.**

~~~js
// api/_lib/db.js
import pg from 'pg';
const { Pool } = pg;
let pool;
export function requireDatabaseUrl(env = process.env) {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL indisponível');
  return env.DATABASE_URL;
}
export function connection() {
  if (!pool) pool = new Pool({
    connectionString: requireDatabaseUrl(),
    max: 3,
    connectionTimeoutMillis: 4000,
    idleTimeoutMillis: 10000,
  });
  return pool;
}
export async function inTransaction(fn) {
  const client = await connection().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
~~~

Usar URL **pooled e TLS validado** fornecida pela integração; não usar `rejectUnauthorized: false`. Em funções serverless, limitar pool para evitar exceder conexões.

- [ ] **Step 3: criar esquema SQL inicial com chaves, auditoria e separação BI/encaminhamento.**

~~~sql
-- db/migrations/001_core.sql
CREATE SEQUENCE IF NOT EXISTS request_protocol_seq;
CREATE TABLE IF NOT EXISTS request_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol text NOT NULL UNIQUE,
  requester_user_id text,
  requester_email text,
  guest_invite_id uuid,
  scope text NOT NULL CHECK (scope IN ('BI','REVIEW','EXTERNAL')),
  topic_key text NOT NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 6 AND 160),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (requester_user_id IS NOT NULL OR guest_invite_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_requests_owner ON request_records(requester_user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS bi_tickets (
  request_id uuid PRIMARY KEY REFERENCES request_records(id),
  state text NOT NULL DEFAULT 'Novo'
    CHECK (state IN ('Novo','Em atendimento','Pendente','Resolvido','Fechado')),
  assignee_user_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES request_records(id),
  event_type text NOT NULL,
  actor_user_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS submission_keys (
  actor_key text NOT NULL,
  key text NOT NULL,
  request_id uuid NOT NULL REFERENCES request_records(id),
  payload_hash text NOT NULL,
  PRIMARY KEY(actor_key,key)
);
CREATE TABLE IF NOT EXISTS audit_log (
  id bigserial PRIMARY KEY,
  actor_user_id text,
  action text NOT NULL,
  target_id text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
~~~

- [ ] **Step 4: migrador transacional com lock e registro de versões.**

~~~js
// db/migrate.mjs
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL indisponível');
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
try {
  await db.query('BEGIN');
  await db.query('SELECT pg_advisory_xact_lock(2026, 101)');
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  for (const file of (await readdir('db/migrations')).filter(f => f.endsWith('.sql')).sort()) {
    const found = await db.query('SELECT 1 FROM schema_migrations WHERE name=$1', [file]);
    if (found.rowCount) continue;
    await db.query(await readFile(join('db/migrations', file), 'utf8'));
    await db.query('INSERT INTO schema_migrations(name) VALUES($1)', [file]);
  }
  await db.query('COMMIT');
} catch (error) {
  await db.query('ROLLBACK');
  throw error;
} finally {
  await db.end();
}
~~~

- [ ] **Step 5: provar reexecução e rollback.** Com `DATABASE_URL_TEST` reservado para teste, executar `DATABASE_URL="$DATABASE_URL_TEST" node db/migrate.mjs` duas vezes. Esperado: ambas concluem sem duplicar schema_migrations. Simular migração inválida em ambiente descartável e verificar rollback sem migração parcial. Sem banco autorizado, marcar este teste como **bloqueante para release**; os testes de unidade ainda devem passar. Commit: `feat(db): transactional BI request schema and migrations`.

## Task 3: Reutilizar a sessão existente em todas as APIs

**Files:** Create: `api/_lib/auth-session.js`, `api/_lib/identity.js`, `api/_lib/auth-session.test.js`. Modify: `api/auth.js`.

- [ ] **Step 1: registrar testes de sessão válida, adulterada, expirada e usuário desativado.**

~~~js
// api/_lib/auth-session.test.js
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { decodeSession } from './auth-session.js';
test('não aceita cookie adulterado ou expirado', () => {
  assert.equal(decodeSession('st1_connect_session=abc.xyz', 'secret', [], Date.now()), null);
  assert.equal(decodeSession('', 'secret', [], Date.now()), null);
});
~~~

Rode `npm test`; falha esperada por função inexistente.

- [ ] **Step 2: extrair validação de assinatura e versão do usuário.**

~~~js
// api/_lib/auth-session.js
import { createHmac, timingSafeEqual } from 'node:crypto';
const name = 'st1_connect_session';
const signature = (payload, secret) =>
  createHmac('sha256', secret).update(payload).digest('base64url');
function same(a, b) {
  const x = Buffer.from(a || ''), y = Buffer.from(b || '');
  return x.length === y.length && timingSafeEqual(x, y);
}
export function decodeSession(cookieHeader, secret, users, now = Date.now()) {
  if (!secret) return null;
  const raw = String(cookieHeader || '').split(';').map(x => x.trim())
    .find(x => x.startsWith(name + '='));
  if (!raw) return null;
  const [payload, mac] = raw.slice(name.length + 1).split('.');
  if (!payload || !same(mac, signature(payload, secret))) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!Number.isSafeInteger(value.exp) || value.exp <= now / 1000) return null;
    return users.find(u => u.id === value.uid && u.version === value.ver && u.active && u.passwordHash) || null;
  } catch { return null; }
}
~~~

- [ ] **Step 3: centralizar leitura das contas em armazenamento privado.**

~~~js
// api/_lib/identity.js
import { decodeSession } from './auth-session.js';
export async function currentPrincipal(req, env = process.env) {
  if (!env.ST1_AUTH_SECRET || !env.BLOB_READ_WRITE_TOKEN || !env.ST1_BLOB_STORE_ID)
    throw Object.assign(new Error('Login indisponível'), { status: 503 });
  const url = 'https://' + env.ST1_BLOB_STORE_ID
    + '.private.blob.vercel-storage.com/st1-connect/contas-v1.json?cache=0';
  const response = await fetch(url, {
    headers: { Authorization: 'Bearer ' + env.BLOB_READ_WRITE_TOKEN },
    cache: 'no-store',
  });
  if (!response.ok) throw Object.assign(new Error('Identidade indisponível'), { status: 503 });
  const { users } = await response.json();
  const person = decodeSession(req.headers.cookie, env.ST1_AUTH_SECRET, users);
  if (!person) throw Object.assign(new Error('Autenticação necessária'), { status: 401 });
  return { id: person.id, name: person.name, email: person.email, role: person.role };
}
~~~

Refatorar `api/auth.js` para importar `decodeSession` na validação de cookie já existente, **sem alterar o formato de sessão nem invalidar usuários já ativos**. Não copiar hash/senha ao cliente. Adicionar testes de status 401/403 e usuários inativos.

- [ ] **Step 4: validar login regressivo.** `npm test && npm run build`; validar em Preview login, troca de senha, logout e ativação da primeira conta; não executar teste destrutivo contra conta de produção. Commit: `refactor(auth): share server-only identity guard`.

## Task 4: Criar serviço transacional de chamado BI com deduplicação

**Files:** Create: `api/_lib/bi-service.js`, `api/_lib/bi-service.test.js`.

- [ ] **Step 1: teste de contrato e proteção de payload.**

~~~js
// api/_lib/bi-service.test.js
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseBiInput, canReadRequest } from './bi-service.js';
test('rejeita título vazio e dados extensos', () => {
  assert.throws(() => parseBiInput({ title:' ', detail:'texto curto' }), /Assunto inválido/);
  assert.throws(() => parseBiInput({ title:'Ajustar painel', detail:'a'.repeat(6000) }), /Descrição inválida/);
});
test('solicitante não lê registro alheio', () => {
  assert.equal(canReadRequest({ id:'u1', role:'Solicitante' }, { requester_user_id:'u2' }), false);
});
~~~

- [ ] **Step 2: implementar validação pura e política de leitura.**

~~~js
// api/_lib/bi-service.js
import { createHash } from 'node:crypto';
export function parseBiInput(input) {
  const title = typeof input?.title === 'string' ? input.title.trim() : '';
  const detail = typeof input?.detail === 'string' ? input.detail.trim() : '';
  if (title.length < 6 || title.length > 160) throw new Error('Assunto inválido');
  if (detail.length < 12 || detail.length > 5000) throw new Error('Descrição inválida');
  return { title, detail, topicKey: 'bi-inicial' };
}
export function canReadRequest(user, record) {
  return user.role === 'Administrador' || user.role === 'Supervisor'
    || (user.role === 'Técnico' && record.scope === 'BI')
    || record.requester_user_id === user.id;
}
export const fingerprint = input =>
  createHash('sha256').update(JSON.stringify(input)).digest('hex');
~~~

- [ ] **Step 3: inserir solicitação, chamado, evento e idempotência numa única transação.**

~~~js
// Acrescentar em api/_lib/bi-service.js
export async function createBiRequest(db, actor, input, key) {
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(key)) throw new Error('Chave idempotente inválida');
  const body = parseBiInput(input);
  const actorKey = 'user:' + actor.id;
  const payloadHash = fingerprint(body);
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [actorKey + ':' + key]);
  const existing = await db.query(
    'SELECT r.* ,k.payload_hash FROM submission_keys k JOIN request_records r ON r.id=k.request_id WHERE k.actor_key=$1 AND k.key=$2',
    [actorKey, key],
  );
  if (existing.rowCount) {
    if (existing.rows[0].payload_hash !== payloadHash)
      throw Object.assign(new Error('Chave reutilizada com outros dados'), { status: 409 });
    return { ...existing.rows[0], repeated: true };
  }
  const seq = await db.query("SELECT nextval('request_protocol_seq') AS n");
  const protocol = 'ST1-' + String(seq.rows[0].n).padStart(6, '0');
  const record = await db.query(
    "INSERT INTO request_records(protocol,requester_user_id,requester_email,scope,topic_key,title,details) VALUES($1,$2,$3,'BI',$4,$5,$6::jsonb) RETURNING *",
    [protocol, actor.id, actor.email, body.topicKey, body.title, JSON.stringify({ detail: body.detail })],
  );
  const request = record.rows[0];
  await db.query('INSERT INTO bi_tickets(request_id) VALUES($1)', [request.id]);
  await db.query("INSERT INTO request_events(request_id,event_type,actor_user_id) VALUES($1,'created',$2)", [request.id, actor.id]);
  await db.query('INSERT INTO submission_keys(actor_key,key,request_id,payload_hash) VALUES($1,$2,$3,$4)',
    [actorKey, key, request.id, payloadHash]);
  return { ...request, repeated: false };
}
~~~

A função acima **é chamada exclusivamente dentro de `inTransaction`**; a constraint única e o advisory lock impedem criação duplicada sob duas requisições concorrentes do mesmo usuário/chave. A API deve retornar 409 quando uma chave for reutilizada com payload diferente.

- [ ] **Step 4: testar com banco isolado** criação, repetição com a mesma chave, repetição com alteração de payload e rollback após erro induzido. Com `DATABASE_URL_TEST` o teste de integração deve afirmar exatamente um registro em `request_records`, um em `bi_tickets` e um em `submission_keys`. Sem base de teste, execução bloqueada para release, não "aprovada por mock".

- [ ] **Step 5: commit.** `npm test` e `npm run build` verdes; `git commit -m "feat(bi): atomic and idempotent BI requests"`.

## Task 5: Publicar endpoints com autorização server-side

**Files:** Create: `api/bi-tickets.js`, `api/requests.js`, `api/_lib/http.js`, `api/_lib/http.test.js`.

- [ ] **Step 1: teste negativo do guard de método/origem.**

~~~js
// api/_lib/http.test.js
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { validWriteOrigin } from './http.js';
test('recusa POST de outra origem', () => {
  assert.equal(validWriteOrigin({ headers: { host: 'st1-connect.vercel.app', origin: 'https://outra.example' } }), false);
  assert.equal(validWriteOrigin({ headers: { host: 'st1-connect.vercel.app', origin: 'https://st1-connect.vercel.app' } }), true);
});
~~~

- [ ] **Step 2: guard de origem, sem CORS e sem confiar no corpo do usuário.**

~~~js
// api/_lib/http.js
export function validWriteOrigin(req) {
  try {
    const origin = new URL(String(req.headers.origin || ''));
    return origin.protocol === 'https:' && origin.host === req.headers.host;
  } catch { return false; }
}
export function sendError(res, error) {
  const status = [400, 401, 403, 404, 409, 413, 503].includes(error.status) ? error.status : 500;
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json({ error: status === 500 ? 'Não foi possível atender à solicitação.' : error.message });
}
~~~

- [ ] **Step 3: POST/GET por papel e vínculo de usuário.**

~~~js
// api/bi-tickets.js
import { currentPrincipal } from './_lib/identity.js';
import { connection, inTransaction } from './_lib/db.js';
import { createBiRequest } from './_lib/bi-service.js';
import { validWriteOrigin, sendError } from './_lib/http.js';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const user = await currentPrincipal(req);
    if (req.method === 'POST') {
      if (!validWriteOrigin(req)) return res.status(403).json({ error: 'Origem não autorizada' });
      const key = String(req.headers['idempotency-key'] || '');
      const result = await inTransaction(db => createBiRequest(db, user, req.body, key));
      return res.status(result.repeated ? 200 : 201).json({
        id: result.id, protocol: result.protocol, title: result.title, scope: result.scope,
      });
    }
    if (req.method === 'GET') {
      if (!['Administrador','Supervisor','Técnico'].includes(user.role))
        return res.status(403).json({ error: 'Acesso exclusivo do BI' });
      const list = await connection().query(
        "SELECT r.id,r.protocol,r.title,r.created_at,b.state FROM request_records r JOIN bi_tickets b ON b.request_id=r.id WHERE r.scope='BI' ORDER BY r.created_at DESC LIMIT 100"
      );
      return res.status(200).json({ items: list.rows });
    }
    return res.status(405).json({ error: 'Método não permitido' });
  } catch (error) { return sendError(res, error); }
}
~~~

`api/requests.js` deve usar `currentPrincipal` e consulta parametrizada `WHERE requester_user_id=$1`, retornando somente registros do ator. **Não aceitar `?userId=...` vindo do frontend como filtro de autorização.** Testar 401 (sem sessão), 403 (solicitante na fila BI) e 200 para dono do registro.

- [ ] **Step 4: teste de leitura cruzada e paginação.** Em banco de teste, criar solicitações de dois usuários; GET autenticado deve trazer somente as do próprio solicitante, e GET de BI apenas para equipe autorizada. Definir limite 100 por página com cursor seguro antes de subir acima de 1000 registros. Commit: `feat(api): enforce access to shared BI requests`.

## Task 6: Interface real desacoplada da demonstração

**Files:** Create: `src/features/bi/types.ts`, `src/features/bi/api.ts`, `src/features/bi/QueuePage.tsx`, `src/features/bi/MyRequestsPage.tsx`, `src/features/bi/queue.test.ts`. Modify: `src/App.tsx` e `src/styles.css`.

- [ ] **Step 1: declarar contrato cliente simples e teste do mapeamento.**

~~~ts
// src/features/bi/types.ts
export type BiRequestRow = {
  id: string;
  protocol: string;
  title: string;
  created_at: string;
  state: 'Novo' | 'Em atendimento' | 'Pendente' | 'Resolvido' | 'Fechado';
};
export type OwnRequestRow = {
  id: string;
  protocol: string;
  title: string;
  scope: 'BI' | 'REVIEW' | 'EXTERNAL';
  created_at: string;
};
~~~

~~~ts
// src/features/bi/queue.test.ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { presentScope } from './api';
test('revisão não é chamada de ticket executável', () => {
  assert.equal(presentScope('REVIEW'), 'Aguardando triagem');
});
~~~

- [ ] **Step 2: criar cliente fetch com erro observável.**

~~~ts
// src/features/bi/api.ts
import type { BiRequestRow, OwnRequestRow } from './types';
export const presentScope = (scope: OwnRequestRow['scope']) =>
  scope === 'BI' ? 'Squad de BI' : scope === 'REVIEW' ? 'Aguardando triagem' : 'Encaminhamento externo';
export async function readBiQueue(): Promise<BiRequestRow[]> {
  const res = await fetch('/api/bi-tickets', { credentials: 'same-origin', cache: 'no-store' });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Falha na fila');
  return body.items;
}
export async function readOwnRequests(): Promise<OwnRequestRow[]> {
  const res = await fetch('/api/requests', { credentials: 'same-origin', cache: 'no-store' });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Falha nas solicitações');
  return body.items;
}
~~~

- [ ] **Step 3: montar duas telas com estados reais.** Em `QueuePage.tsx` e `MyRequestsPage.tsx`, usar `useEffect` + `useState` para buscar respectivamente `readBiQueue()` e `readOwnRequests()`; exibir `Carregando`, lista com protocolo e título, `Nenhum registro real` e erro com botão `Tentar novamente`. Não importar `createSeedData()` nessas telas.
- [ ] **Step 4: inserir navegação protegida.** Em `App.tsx` incluir `'bi-queue'` e `'my-requests'` em Page/PAGE_INFO; `permitted` permite `bi-queue` apenas a Admin, Supervisor e Técnico e `my-requests` a qualquer autenticado. Manter os itens demonstrativos separados e explicitamente rotulados **Dados demonstrativos** até concluir corte supervisionado.
- [ ] **Step 5: build e conferência.** `npm test && npm run build`; testar 390px e desktop, logout, rota manual proibida, 401/403, rede offline e atualização cruzada em outro navegador autorizado. Commit: `feat(ui): show real BI queue and own requests`.

## Task 7: Quality Gate, rollback e liberação controlada

**Files:** Create: `docs/operations/bi-foundation-runbook.md`, `api/health.js`. Modify: `README.md`.

- [ ] **Step 1: endpoint sem dados privados e teste de falha segura.**

~~~js
// api/health.js
import { connection } from './_lib/db.js';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).end();
  try {
    await connection().query('SELECT 1');
    return res.status(200).json({ database: 'ready' });
  } catch {
    return res.status(503).json({ database: 'unavailable' });
  }
}
~~~

Nunca retornar URL de conexão, esquema, dados, nomes de usuário nem stacktrace.

- [ ] **Step 2: especificar liberação e rollback em `bi-foundation-runbook.md`.** Descrever como confirmar a conexão em Preview, rodar migrações uma única vez por ambiente, validar origem e isolamento de usuários, observar errors 5xx e restaurar implantação anterior caso a nova fila falhe. Manter feature flag `BI_CONNECT_ENABLED` desligada em produção até sign-off. As migrações não devem ser revertidas apagando dados; rollback de UI/API deve preservar tabelas.
- [ ] **Step 3: critérios para sair da Fase A.** PostgreSQL de teste e produção separados, back-up/retention revisados, migration repetível, usuários A e B isolados server-side, idempotência comprovada, pelo menos um chamado criado em Preview e lido por dois navegadores autorizados, build READY e nenhuma exposição dos exemplos como registros reais.
- [ ] **Step 4: commit e PR.** `npm test && npm run build` e integração `DATABASE_URL_TEST` verde; `git commit -m "docs(ops): BI shared data release runbook"`. Solicitar aprovação de PR/release antes de produção.

## Definition of Done

- [ ] Integração PostgreSQL provisionada com custo/escopo aceitos, sem segredos no Git.
- [ ] O login existente continua funcionando, inclusive revogação de sessão e alterações de papel.
- [ ] O novo protocolo BI é persistido em uma transação com idempotência.
- [ ] Só a equipe BI vê a fila real; cada solicitante vê somente seus próprios pedidos.
- [ ] Nenhum ticket demonstrativo foi movido automaticamente para o banco.
- [ ] Testes de unidade, integração e dois navegadores; Vercel Preview pronto para aprovação.
- [ ] A Fase B inicia a partir desta base, sem duplicar identidade ou persistência.
