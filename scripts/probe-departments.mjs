import {readdir} from 'node:fs/promises';import {join} from 'node:path';import {spawnSync} from 'node:child_process';
async function find(dir){const out=[];for(const e of await readdir(dir,{withFileTypes:true})){const path=join(dir,e.name);if(e.isDirectory())out.push(...await find(path));else if(/\.test\.(js|ts)$/.test(e.name))out.push(path);}return out;}
const files=[...await find('api'),...await find('src')].sort();
for(let i=0;i<files.length;i++){const r=spawnSync(process.execPath,['--import','tsx','--test',files[i]],{encoding:'utf8',env:process.env});if(r.status!==0){console.error('Failed test index '+i+': '+files[i]);process.exit(20+i);}}
const built=spawnSync('npx',['tsc','-b'],{stdio:'inherit'});if(built.status!==0)process.exit(90);
const vite=spawnSync('npx',['vite','build'],{stdio:'inherit'});process.exit(vite.status??91);
