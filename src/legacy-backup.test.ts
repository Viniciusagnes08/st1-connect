import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEGACY_STORAGE_KEYS, readLegacyBackup } from './legacy-backup';

test('backup inclui apenas as duas chaves do acervo local e preserva o texto exato', () => {
  const calls: string[] = [];
  const source = '{"version":1,"tickets":[{"title":"revisar"}]}';
  const storage = {
    getItem(key: string) {
      calls.push(key);
      if (key === 'st1-connect:v1') return source;
      if (key === 'st1-connect:v1:recovery') return 'raw-previous-invalid-state';
      return 'secret-should-not-appear';
    },
  };
  const backup = readLegacyBackup(storage, 'https://preview.example.invalid', new Date('2026-10-31T12:00:00.000Z'));
  assert.deepEqual(calls, [...LEGACY_STORAGE_KEYS]);
  assert.deepEqual(backup, {
    format: 'st1-connect-local-backup/v1',
    origin: 'https://preview.example.invalid',
    exportedAt: '2026-10-31T12:00:00.000Z',
    entries: {
      'st1-connect:v1': source,
      'st1-connect:v1:recovery': 'raw-previous-invalid-state',
    },
  });
});

test('navegador sem dados locais nao gera backup ficticio', () => {
  const backup = readLegacyBackup({ getItem: () => null }, 'https://preview.example.invalid');
  assert.equal(backup, null);
});

test('valor vazio ainda e preservado; erro de leitura nao e tratado como zero registros', () => {
  const backup = readLegacyBackup({ getItem: (key: string) => key === 'st1-connect:v1' ? '' : null }, 'https://preview.example.invalid');
  assert.equal(backup?.entries['st1-connect:v1'], '');
  assert.throws(
    () => readLegacyBackup({ getItem: () => { throw new Error('blocked'); } }, 'https://preview.example.invalid'),
    /impediu a leitura/,
  );
});

test('backup nao implementa mutacoes nem le segredos de sessao', () => {
  const storage = {
    getItem: (key: string) => key === 'st1-connect:v1' ? '{"tickets":[]}' : null,
    setItem: () => { throw new Error('proibido gravar'); },
    removeItem: () => { throw new Error('proibido excluir'); },
    clear: () => { throw new Error('proibido limpar'); },
  };
  const backup = readLegacyBackup(storage, 'https://preview.example.invalid');
  assert.ok(backup);
  assert.deepEqual(Object.keys(backup.entries), ['st1-connect:v1']);
  assert.equal(JSON.stringify(backup).includes('session'), false);
});
