import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scryptSync } from 'node:crypto';
import handler from './auth.js';

const primary = 'admincenter@example.invalid';
const alternate = 'admin.center@example.invalid';
const syntheticPassword = 'TestOnlyPassword74291';
const fixtureKeys = [
  'ST1_AUTH_SECRET', 'BLOB_READ_WRITE_TOKEN', 'ST1_BLOB_STORE_ID',
  'ST1_SETUP_TOKEN', 'ST1_BOOTSTRAP_EMAIL',
  'ST1_BOOTSTRAP_LOGIN_ALIAS', 'ST1_BOOTSTRAP_INVITE_HASH', 'VERCEL_ENV',
];

function responseStub() {
  return {
    statusCode: 200, headers: {}, body: null,
    setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
    status(n) { this.statusCode = n; return this; },
    json(body) { this.body = body; return this; },
  };
}

function adminFixture() {
  const salt = 'synthetic-test-salt';
  return {
    id: 'admin-fixture-001', name: 'QA Administrator', email: primary,
    passwordHash: salt + ':' + scryptSync(syntheticPassword, salt, 64).toString('hex'),
    role: 'Administrador', active: true, version: 3,
    attempts: 0, blockedUntil: 0,
  };
}

async function withFixture(fn) {
  const before = Object.fromEntries(fixtureKeys.map(key => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  let users = [adminFixture()];
  let etag = 3;
  try {
    Object.assign(process.env, {
      ST1_AUTH_SECRET: 'test-session-secret',
      BLOB_READ_WRITE_TOKEN: 'synthetic-only-blob-token',
      ST1_BLOB_STORE_ID: 'synthetic-blob-store',
      ST1_SETUP_TOKEN: 'synthetic-only-setup-secret',
      ST1_BOOTSTRAP_EMAIL: primary,
      ST1_BOOTSTRAP_LOGIN_ALIAS: alternate,
      VERCEL_ENV: 'preview',
    });
    delete process.env.ST1_BOOTSTRAP_INVITE_HASH;
    globalThis.fetch = async (_url, options = {}) => {
      if (options.method === 'PUT') {
        if (options.headers['x-if-match'] !== String(etag))
          return new Response('{}', { status: 412 });
        users = JSON.parse(options.body).users;
        etag++;
        return new Response('{}', { status: 200 });
      }
      return new Response(JSON.stringify({ users }), {
        status: 200,
        headers: { 'content-type': 'application/json', etag: String(etag) },
      });
    };
    async function login(email, password = syntheticPassword) {
      const res = responseStub();
      await handler({
        method: 'POST', query: { action: 'login' },
        headers: { host: 'preview.example.invalid', origin: 'https://preview.example.invalid' },
        body: { email, password },
      }, res);
      return res;
    }
    await fn({ login, getUsers: () => structuredClone(users) });
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of fixtureKeys) {
      if (before[key] === undefined) delete process.env[key];
      else process.env[key] = before[key];
    }
  }
}

test('admin bootstrap aceita email com pontuação diferente apenas no Preview e mantém a mesma conta', async () => {
  await withFixture(async ({ login, getUsers }) => {
    const originalAccount = getUsers()[0];
    const result = await login(alternate);
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.user.id, originalAccount.id);
    assert.equal(result.body.user.email, primary);
    assert.equal(result.body.user.role, 'Administrador');
    assert.equal(getUsers().length, 1);
    assert.equal(getUsers()[0].passwordHash, originalAccount.passwordHash);
    assert.equal(getUsers()[0].version, originalAccount.version);
    assert.match(result.headers['set-cookie'], /HttpOnly; Secure; SameSite=Strict/);
    assert.equal((await login(primary)).statusCode, 200);
  });
});

test('alias não contorna a senha; origem e domínio distintos continuam rejeitados', async () => {
  await withFixture(async ({ login, getUsers }) => {
    assert.equal((await login(alternate, 'WrongSyntheticPassword444')).statusCode, 401);
    assert.equal((await login('other.example@example.invalid')).statusCode, 401);
    process.env.ST1_BOOTSTRAP_LOGIN_ALIAS = 'admin.center@other.invalid';
    assert.equal((await login('admin.center@other.invalid')).statusCode, 401);
    process.env.ST1_BOOTSTRAP_LOGIN_ALIAS = 'different@example.invalid';
    assert.equal((await login('different@example.invalid')).statusCode, 401);
    assert.equal(getUsers().length, 1);
  });
});

test('alias administrativo é desativado automaticamente fora do ambiente Preview', async () => {
  await withFixture(async ({ login }) => {
    process.env.VERCEL_ENV = 'production';
    assert.equal((await login(alternate)).statusCode, 401);
    assert.equal((await login(primary)).statusCode, 200);
  });
});

test('login direto de usuário existente prevalece sobre alias e não converte perfis', async () => {
  await withFixture(async ({ login, getUsers }) => {
    const result = await login(alternate);
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.user.role, 'Administrador');
    assert.equal(getUsers()[0].active, true);
  });
});
