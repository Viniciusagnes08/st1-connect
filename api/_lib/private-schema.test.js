import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

test('migração isola todas as tabelas ST1 Connect em schema privado', async () => {
  const migration=await readFile('db/migrations/001_core.sql','utf8');
  assert.match(migration,/CREATE SCHEMA IF NOT EXISTS st1_bi;/);
  assert.match(migration,/REVOKE ALL ON SCHEMA st1_bi FROM PUBLIC;/);
  for(const table of ['request_records','bi_memberships','bi_tickets','request_events','submission_keys','audit_log']){
    assert.match(migration,new RegExp('CREATE TABLE IF NOT EXISTS st1_bi\\.'+table+'\\b'));
    assert.doesNotMatch(migration,new RegExp('CREATE TABLE IF NOT EXISTS public\\.'+table+'\\b'));
  }
  assert.match(migration,/CREATE SEQUENCE IF NOT EXISTS st1_bi\.request_protocol_seq;/);
});

test('migrações mantêm versionamento no mesmo schema sem acesso público', async () => {
  const migrationRunner=await readFile('db/migrate.mjs','utf8');
  assert.match(migrationRunner,/st1_bi\.schema_migrations/);
  assert.match(migrationRunner,/pg_advisory_xact_lock/);
  assert.match(migrationRunner,/REVOKE ALL ON SCHEMA st1_bi FROM PUBLIC/);
});

test('serviços de BI consultam tabelas privadas explicitamente', async () => {
  for(const name of ['api/_lib/bi-service.js','api/_lib/bi-membership.js','api/bi-members.js']){
    const sql=await readFile(name,'utf8');
    assert.doesNotMatch(sql,/\b(?:FROM|JOIN|UPDATE|INSERT INTO) (?:request_records|bi_memberships|bi_tickets|request_events|submission_keys|audit_log)\b/);
  }
});
