import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const operational = readFileSync('src/OperationalApp.tsx', 'utf8');
const auth = readFileSync('src/AuthGate.tsx', 'utf8');
const backup = readFileSync('src/legacy-backup.ts', 'utf8');
const bi = readFileSync('src/features/bi/BIWorkspace.tsx', 'utf8');
const api = readFileSync('src/features/bi/api.ts', 'utf8');

test('nenhum seed ou demonstracao entra na aplicacao ativa autenticada', () => {
  assert.match(auth, /import OperationalApp from '\.\/OperationalApp'/);
  assert.doesNotMatch(auth, /import App from '\.\/App'/);
  assert.doesNotMatch(operational, /createSeedData|SEED_TEMPLATES|SEED_ASSETS|AGENTS|DEFAULT_SETTINGS/);
  assert.doesNotMatch(operational, /localStorage\.setItem|localStorage\.removeItem|localStorage\.clear/);
  assert.doesNotMatch(operational, /from ['"]\.\/App['"]/);
});

test('modulo BI real segue importado, sem copiar autorizacao da fila para as demais areas', () => {
  assert.match(operational, /import BIWorkspace from '\.\/features\/bi\/BIWorkspace'/);
  assert.match(operational, /page === 'bi' && <BIWorkspace user=\{user\}\/>/);
  assert.match(bi, /getBiSelf\(\)/);
  assert.match(api, /'\/api\/requests'/);
  assert.match(api, /'\/api\/bi-tickets'/);
});

test('resumo pessoal nao e anunciado como volume corporativo e erro nunca vira KPI zero', () => {
  assert.match(operational, /suas próprias solicitações no Supabase/);
  assert.match(operational, /Não representam o total de chamados da ST1/);
  assert.match(operational, /if \(requests\.kind !== 'ready'\) return null/);
  assert.match(operational, /summary \? summary\.total : '—'/);
  assert.match(operational, /Não foi possível consultar o banco/);
  assert.match(operational, /Não exibimos números fictícios/);
});

test('todos os caminhos antigos retornam ao portal sem executar modulos de demonstracao', () => {
  assert.match(operational, /new Set<Page>\(\['overview', 'requests', 'bi', 'areas', 'legacy'\]\)/);
  assert.match(operational, /return ROUTES\.has\(requested\) \? requested : 'overview'/);
  assert.match(operational, /window\.history\.replaceState/);
  assert.doesNotMatch(operational, /(['"])tickets\1\s*:\s*\{/);
  assert.doesNotMatch(operational, /<Dashboard tickets=/);
  assert.doesNotMatch(operational, /<AssetsPage|<ReportsPage|<TeamsPage|<SettingsPage/);
});

test('novas areas sao placeholders inequivocos, sem abrir chamado para BI', () => {
  assert.match(operational, /Sistemas e CRM/);
  assert.match(operational, /Infraestrutura e TI/);
  assert.match(operational, /Marketing e Comunicação/);
  assert.match(operational, /Financeiro e Administrativo/);
  assert.match(operational, /não são enviados automaticamente/);
  assert.match(operational, /Abertura ainda não habilitada/);
});

test('exportacao do acervo antigo nao altera dados locais nem toca em contas', () => {
  assert.match(operational, /readLegacyBackup\(window\.localStorage, window\.location\.origin\)/);
  assert.match(operational, /downloadLegacyBackup\(backup\)/);
  assert.match(backup, /st1-connect:v1/);
  assert.match(backup, /st1-connect:v1:recovery/);
  assert.doesNotMatch(backup, /localStorage\.setItem|localStorage\.clear|localStorage\.removeItem/);
  assert.doesNotMatch(operational, /fetch\([^)]*localStorage/);
});
