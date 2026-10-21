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
