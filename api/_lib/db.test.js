import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { requireDatabaseUrl } from './db.js';

test('banco indisponível falha fechado, sem conexão silenciosa', () => {
  assert.throws(() => requireDatabaseUrl({}), /DATABASE_URL indisponível/);
  assert.throws(() => requireDatabaseUrl({DATABASE_URL:'sqlite:memory:'}), /DATABASE_URL indisponível/);
});
test('aceita apenas uma URL de Postgres', () => {
  assert.equal(requireDatabaseUrl({DATABASE_URL:'postgresql://example.invalid/db'}), 'postgresql://example.invalid/db');
});
