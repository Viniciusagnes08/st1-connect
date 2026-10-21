import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

async function testFiles(dir) {
  const results = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) results.push(...await testFiles(file));
    else if (/\.test\.(js|ts)$/.test(entry.name)) results.push(file);
  }
  return results;
}

const files = [...await testFiles('src'), ...await testFiles('api')].sort();
if (!files.length) throw new Error('Nenhum teste encontrado.');
const child = spawnSync(process.execPath,
  ['--import', 'tsx', '--test', '--test-reporter=spec', ...files],
  { stdio: 'inherit', env: process.env });
process.exit(child.status ?? 1);
