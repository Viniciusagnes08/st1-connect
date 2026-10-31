import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import handler from '../auth.js';

function response() {
  return {
    statusCode: 200, headers: {}, body: null,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
  };
}

// Simulacao em memoria: nao consulta contas reais, Supabase ou Vercel Blob.
test('somente o Admin Master pode criar, alterar e recuperar contas administrativas', async () => {
  const keys = [
    'ST1_AUTH_SECRET', 'BLOB_READ_WRITE_TOKEN', 'ST1_BLOB_STORE_ID',
    'ST1_SETUP_TOKEN', 'ST1_BOOTSTRAP_EMAIL', 'ST1_BOOTSTRAP_NAME',
    'ST1_BOOTSTRAP_INVITE_HASH', 'ST1_BOOTSTRAP_LOGIN_ALIAS', 'VERCEL_ENV',
  ];
  const before = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  const invitation = 'fixture-invitation-token-for-tests';
  let directory = { users: [], auditTrail: [] }, revision = 0;
  try {
    for (const key of keys) delete process.env[key];
    Object.assign(process.env, {
      ST1_AUTH_SECRET: 'fixture-secret-not-production',
      BLOB_READ_WRITE_TOKEN: 'fixture-blob-token',
      ST1_BLOB_STORE_ID: 'fixture-only',
      ST1_SETUP_TOKEN: 'fixture-bootstrap-token',
      ST1_BOOTSTRAP_EMAIL: 'master@example.invalid',
      ST1_BOOTSTRAP_NAME: 'QA Master',
      ST1_BOOTSTRAP_INVITE_HASH: createHash('sha256').update(invitation).digest('hex'),
      VERCEL_ENV: 'preview',
    });
    globalThis.fetch = async (_url, init = {}) => {
      if (init.method === 'PUT') {
        const previous = init.headers['x-if-match'];
        if (previous && previous !== String(revision)) return new Response('{}', { status: 412 });
        directory = JSON.parse(init.body); revision += 1;
        return new Response('{}', { status: 200 });
      }
      if (directory.users.length === 0) return new Response('{}', { status: 404 });
      return new Response(JSON.stringify(directory), {
        status: 200, headers: { etag: String(revision), 'content-type': 'application/json' },
      });
    };
    async function call(action, { method = 'POST', body = {}, cookie } = {}) {
      const res = response();
      await handler({
        method, query: { action }, body,
        headers: {
          host: 'qa-preview.example.invalid', origin: 'https://qa-preview.example.invalid',
          ...(cookie ? { cookie } : {}),
        },
      }, res);
      return res;
    }
    const status = await call('status', { method: 'GET' });
    assert.equal(status.statusCode, 200);
    const activated = await call('activate', {
      body: { inviteToken: invitation, password: 'FixtureMaster123456' },
    });
    assert.equal(activated.statusCode, 200);
    assert.equal(activated.body.user.isMaster, true);
    const masterCookie = activated.headers['set-cookie'].split(';')[0];

    const adminCreated = await call('users', { cookie: masterCookie, body: {
      name: 'Delegated Administrator', email: 'delegate@example.invalid',
      password: 'FixtureDelegate12345', role: 'Administrador',
    }});
    assert.equal(adminCreated.statusCode, 201);
    const techCreated = await call('users', { cookie: masterCookie, body: {
      name: 'Staff Technician', email: 'tech@example.invalid',
      password: 'FixtureTech123456', role: 'Técnico',
    }});
    assert.equal(techCreated.statusCode, 201);

    const adminLoggedIn = await call('login', {
      body: { email: 'delegate@example.invalid', password: 'FixtureDelegate12345' },
    });
    assert.equal(adminLoggedIn.statusCode, 200);
    assert.equal(adminLoggedIn.body.user.isMaster, false);
    const delegatedCookie = adminLoggedIn.headers['set-cookie'].split(';')[0];

    const forbidden = [
      ['create administrator', 'users', { name: 'Another Admin', email: 'other@example.invalid', password: 'FixtureAnother12345', role: 'Administrador' }],
      ['promote technician', 'user-update', { id: techCreated.body.user.id, role: 'Administrador', active: true }],
      ['disable Master', 'user-update', { id: activated.body.user.id, role: 'Administrador', active: false }],
      ['demote Master', 'user-update', { id: activated.body.user.id, role: 'Técnico', active: true }],
      ['reset Master password', 'user-update', { id: activated.body.user.id, role: 'Administrador', active: true, password: 'ForbiddenReset123456' }],
      ['change administrator role', 'user-update', { id: adminCreated.body.user.id, role: 'Técnico', active: true }],
    ];
    const auditBefore = directory.auditTrail.length;
    for (const [label, action, body] of forbidden) {
      const result = await call(action, { cookie: delegatedCookie, body });
      assert.equal(result.statusCode, 403, label);
    }
    assert.equal(directory.auditTrail.length, auditBefore, 'Tentativas negadas nao alteram auditoria');
    assert.equal(directory.users.find(u => u.id === activated.body.user.id).active, true);
    assert.equal(directory.users.find(u => u.id === activated.body.user.id).role, 'Administrador');

    assert.equal((await call('audit', { method: 'GET', cookie: delegatedCookie })).statusCode, 403);
    const permitted = await call('user-update', { cookie: delegatedCookie, body: {
      id: techCreated.body.user.id, role: 'Supervisor', active: true,
    }});
    assert.equal(permitted.statusCode, 200);
    const requester = await call('users', { cookie: delegatedCookie, body: {
      name: 'New Requester', email: 'requester@example.invalid',
      password: 'FixtureRequester1234', role: 'Solicitante',
    }});
    assert.equal(requester.statusCode, 201);
    const deactivated = await call('user-update', { cookie: delegatedCookie, body: {
      id: requester.body.user.id, role: 'Solicitante', active: false,
    }});
    assert.equal(deactivated.statusCode, 200);

    const selfDemotion = await call('user-update', { cookie: masterCookie, body: {
      id: activated.body.user.id, role: 'Técnico', active: true,
    }});
    assert.equal(selfDemotion.statusCode, 400);
    const changeAdmin = await call('user-update', { cookie: masterCookie, body: {
      id: adminCreated.body.user.id, role: 'Administrador', active: true,
      password: 'MasterApprovedReset123456',
    }});
    assert.equal(changeAdmin.statusCode, 200);
    const ownReset = await call('user-update', { cookie: masterCookie, body: {
      id: activated.body.user.id, role: 'Administrador', active: true,
      password: 'ShouldUseCurrentPassword123',
    }});
    assert.equal(ownReset.statusCode, 400);

    // Trocar a senha do delegado invalida sua sessao anterior.
    assert.equal((await call('audit', { method: 'GET', cookie: delegatedCookie })).statusCode, 401);
    const masterAudit = await call('audit', { method: 'GET', cookie: masterCookie });
    assert.equal(masterAudit.statusCode, 200);
    assert.ok(masterAudit.body.events.some(e => e.action === 'account_created'));
    assert.ok(masterAudit.body.events.some(e => e.action === 'account_updated'));
    const serialized = JSON.stringify(masterAudit.body);
    for (const forbiddenValue of [
      'FixtureMaster123456', 'MasterApprovedReset123456', 'master@example.invalid',
    ]) assert.equal(serialized.includes(forbiddenValue), false);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of keys) {
      if (before[key] === undefined) delete process.env[key];
      else process.env[key] = before[key];
    }
  }
});
