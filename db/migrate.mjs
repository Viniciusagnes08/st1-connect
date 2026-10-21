import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import postgres from 'postgres';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL indisponível: nenhuma alteração aplicada.');
const sql = postgres(process.env.DATABASE_URL, {
  max: 1, connect_timeout: 8, idle_timeout: 10, ssl: 'require', prepare: false,
});

try {
  await sql.begin(async tx => {
    await tx.unsafe('SELECT pg_advisory_xact_lock(2026, 101)');
    await tx.unsafe('CREATE SCHEMA IF NOT EXISTS st1_bi');
    await tx.unsafe('REVOKE ALL ON SCHEMA st1_bi FROM PUBLIC');
    await tx.unsafe(`CREATE TABLE IF NOT EXISTS st1_bi.schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const migrations = (await readdir('db/migrations')).filter(name => /^\d+_[a-z0-9_]+\.sql$/.test(name)).sort();
    for (const file of migrations) {
      const previous = await tx.unsafe('SELECT name FROM st1_bi.schema_migrations WHERE name=$1', [file]);
      if (previous.length) continue;
      const ddl = await readFile(join('db/migrations', file), 'utf8');
      await tx.unsafe(ddl);
      await tx.unsafe('INSERT INTO st1_bi.schema_migrations(name) VALUES($1)', [file]);
      process.stdout.write('Aplicada: ' + file + '\n');
    }
  });
  process.stdout.write('Migrações concluídas sem alterar dados demonstrativos.\n');
} finally {
  await sql.end();
}
