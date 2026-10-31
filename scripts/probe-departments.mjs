import {readdir,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
async function find(dir){const out=[];for(const e of await readdir(dir,{withFileTypes:true})){const path=join(dir,e.name);if(e.isDirectory())out.push(...await find(path));else if(/\.test\.(js|ts)$/.test(e.name))out.push(path);}return out;}
const files=[...await find('api'),...await find('src')].sort();
const failing=[];
for(let i=0;i<files.length;i++){
 const r=spawnSync(process.execPath,['--import','tsx','--test',files[i]],{encoding:'utf8',env:process.env});
 if(r.status!==0){
 const lines=(r.stdout+'\n'+r.stderr).split('\n').filter(x=>/not ok|error:|ERR_|AssertionError|test\.js:\d+|expected:|actual:|stack:/.test(x)).slice(0,35);
 failing.push({index:i,file:files[i],lines:lines.map(x=>x.slice(0,250))});
 }
}
const built=spawnSync('npx',['tsc','-b'],{encoding:'utf8'});const vite=spawnSync('npx',['vite','build'],{encoding:'utf8'});
await mkdir('dist',{recursive:true});
await writeFile('dist/verification.json',JSON.stringify({failed:failing,tsc:built.status,vite:vite.status},null,2));
if(vite.status!==0)process.exit(vite.status??1);
