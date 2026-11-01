import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { requireDatabaseUrl, databaseOptions } from './db.js';

test('banco indisponível falha fechado, sem conexão silenciosa', () => {
  assert.throws(() => requireDatabaseUrl({}), /DATABASE_URL indisponível/);
  assert.throws(() => requireDatabaseUrl({DATABASE_URL:'sqlite:memory:'}), /DATABASE_URL indisponível/);
});
test('aceita apenas uma URL de Postgres', () => {
  assert.equal(requireDatabaseUrl({DATABASE_URL:'postgresql://example.invalid/db'}), 'postgresql://example.invalid/db');
});

test('TLS verifica o certificado e usa a CA configurada sem permitir downgrade', () => {
  const standard = databaseOptions({});
  assert.equal(standard.ssl.rejectUnauthorized, true);
  assert.equal(standard.ssl.ca, undefined);
  assert.equal(standard.prepare, false);
  const custom = databaseOptions({DATABASE_SSL_CA:'fixture-public-ca'});
  assert.equal(custom.ssl.rejectUnauthorized, true);
  assert.equal(custom.ssl.ca, 'fixture-public-ca');
});


test('converte apenas a credencial restrita do projeto Connect para pooler IPv4', () => {
  const secret = 'test-secret-not-real';
  const base = 'postgresql://st1_connect_runtime:' + secret +
    '@db.cxqoypwsqokkwcirugrg.supabase.co:5432/postgres';
  const result = requireDatabaseUrl({
    DATABASE_URL: base,
    ST1_DB_POOLER_HOST: 'aws-1-sa-east-1.pooler.supabase.com',
    VERCEL_ENV: 'preview',
  });
  const url = new URL(result);
  assert.equal(url.hostname, 'aws-1-sa-east-1.pooler.supabase.com');
  assert.equal(url.port, '6543');
  assert.equal(url.username, 'st1_connect_runtime.cxqoypwsqokkwcirugrg');
  assert.equal(url.password, secret);
  assert.equal(url.pathname, '/postgres');
  assert.equal(result.includes('st1-connect.vercel.app'), false);
});

test('recusa pooler suspeito, outro banco e uso fora do Preview', () => {
  const direct = 'postgresql://st1_connect_runtime:fake@db.cxqoypwsqokkwcirugrg.supabase.co:5432/postgres';
  const valid = 'aws-1-sa-east-1.pooler.supabase.com';
  assert.throws(() => requireDatabaseUrl({DATABASE_URL:direct,ST1_DB_POOLER_HOST:'evil.example',VERCEL_ENV:'preview'}), /Host de Pooler invalido/);
  assert.throws(() => requireDatabaseUrl({DATABASE_URL:direct,ST1_DB_POOLER_HOST:valid,VERCEL_ENV:'production'}), /Pooler somente autorizado/);
  assert.throws(() => requireDatabaseUrl({DATABASE_URL:direct.replace('cxqoypwsqokkwcirugrg','lzcnnrsqiuqwnplwxnfy'),ST1_DB_POOLER_HOST:valid,VERCEL_ENV:'preview'}), /URL nao corresponde/);
  assert.throws(() => requireDatabaseUrl({DATABASE_URL:direct.replace('st1_connect_runtime','postgres'),ST1_DB_POOLER_HOST:valid,VERCEL_ENV:'preview'}), /URL nao corresponde/);
});
