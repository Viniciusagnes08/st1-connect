import { spawnSync } from 'node:child_process';

const test = spawnSync(process.execPath, [
  '--test', '--test-reporter=tap', 'api/_lib/master-privileges.test.js',
], {encoding:'utf8',env:process.env});
const report = [test.stdout||'', test.stderr||''].join('\n');
if (test.status !== 0) {
  const match=report.match(/master-privileges\.test\.js:(\d+):\d+/);
  const line=match ? Number(match[1]) : 250;
  console.error('Security regression failed. Failure line:',line);
  process.exit(Math.min(250,Math.max(1,line)));
}
const build=spawnSync('npx',['tsc','-b'],{stdio:'inherit',env:process.env});
if(build.status!==0)process.exit(build.status??1);
const vite=spawnSync('npx',['vite','build'],{stdio:'inherit',env:process.env});
process.exit(vite.status??1);
