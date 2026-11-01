import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {isTargetPreview,isolationEnabled,previewAuthConfig,previewDatabaseConfig,
  assertPreviewWriteSafe,assertPreviewSqlReadOnly} from './preview-isolation.js';
import {requireDatabaseUrl,inTransaction} from './db.js';
import {loadDirectory,currentPrincipal} from './identity.js';
import authHandler from '../auth.js';

const ref='abcdefghijklmnopqrst';
const baseline={
 VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'feature/st1-connect-bi-foundation',
 ST1_PREVIEW_WRITE_GUARD:'true',
 ST1_BLOB_STORE_ID:'legacyTestStore123',
 BLOB_READ_WRITE_TOKEN:'fixture-legacy-blob-token',
 ST1_AUTH_SECRET:'fixture-legacy-session-secret-not-production',
 DATABASE_URL:'postgresql://st1_connect_runtime:legacy@db.cxqoypwsqokkwcirugrg.supabase.co:5432/postgres',
 ST1_SETUP_TOKEN:'fixture-setup-token',
 ST1_BOOTSTRAP_EMAIL:'master@st1.net.br',
};
const isolated={
 ...baseline,
 ST1_PREVIEW_ISOLATION_ENABLED:'true',
 ST1_PREVIEW_BLOB_STORE_ID:'store_hVzSogKch4EgtVZE',
 ST1_PREVIEW_BLOB_READ_WRITE_TOKEN:'vercel_blob_rw_fixture_private_preview_secret_does_not_work',
 ST1_PREVIEW_AUTH_SECRET:'fixture-independent-preview-session-signing-secret',
 ST1_PREVIEW_SUPABASE_PROJECT_REF:ref,
 ST1_PREVIEW_DATABASE_URL:'postgresql://st1_connect_runtime:preview@db.'+ref+'.supabase.co:5432/postgres',
};
const refused=fn=>assert.throws(fn,e=>e.status===503);

test('Preview da branch alvo bloqueia todas as transacoes enquanto nao houver cutover',async()=>{
 assert.equal(isTargetPreview(baseline),true);
 assert.equal(isolationEnabled(baseline),false);
 refused(()=>assertPreviewWriteSafe(baseline));
 const old=Object.fromEntries(Object.keys(baseline).map(x=>[x,process.env[x]]));
 try{
  Object.assign(process.env,baseline);
  await assert.rejects(inTransaction(async()=>{throw new Error('não deveria executar');}),e=>e.status===503);
 }finally{
  for(const [key,value] of Object.entries(old)){
   if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
 }
});

test('nao altera comportamento de Production ou outra branch',()=>{
 const p={...baseline,VERCEL_ENV:'production'};
 const other={...baseline,VERCEL_GIT_COMMIT_REF:'fix/branch-experimental'};
 assert.equal(isTargetPreview(p),false);
 assert.equal(isTargetPreview(other),false);
 assert.doesNotThrow(()=>assertPreviewWriteSafe(p));
 assert.doesNotThrow(()=>assertPreviewWriteSafe(other));
 assert.deepEqual(previewAuthConfig(p),{
  secret:baseline.ST1_AUTH_SECRET,blobToken:baseline.BLOB_READ_WRITE_TOKEN,
  blobStoreId:baseline.ST1_BLOB_STORE_ID,
 });
 assert.equal(previewDatabaseConfig(p),null);
 assert.equal(requireDatabaseUrl(p),baseline.DATABASE_URL);
});

test('cutover exige segredo e armazenamento distintos e conexao em outro projeto',()=>{
 assert.equal(isolationEnabled(isolated),true);
 const cfg=previewAuthConfig(isolated);
 assert.equal(cfg.blobStoreId,'hVzSogKch4EgtVZE');
 assert.equal(cfg.blobToken,isolated.ST1_PREVIEW_BLOB_READ_WRITE_TOKEN);
 assert.equal(cfg.secret,isolated.ST1_PREVIEW_AUTH_SECRET);
 assert.equal(previewDatabaseConfig(isolated).ref,ref);
 assert.doesNotThrow(()=>assertPreviewWriteSafe(isolated));
 for(const bad of [
  {...isolated,ST1_PREVIEW_BLOB_STORE_ID:baseline.ST1_BLOB_STORE_ID},
  {...isolated,ST1_PREVIEW_BLOB_READ_WRITE_TOKEN:baseline.BLOB_READ_WRITE_TOKEN},
  {...isolated,ST1_PREVIEW_AUTH_SECRET:baseline.ST1_AUTH_SECRET},
  {...isolated,ST1_PREVIEW_AUTH_SECRET:''},
  {...isolated,ST1_PREVIEW_BLOB_READ_WRITE_TOKEN:''},
  {...isolated,ST1_PREVIEW_SUPABASE_PROJECT_REF:'cxqoypwsqokkwcirugrg'},
  {...isolated,ST1_PREVIEW_DATABASE_URL:baseline.DATABASE_URL},
  {...isolated,ST1_PREVIEW_DATABASE_URL:'postgresql://postgres:pw@db.'+ref+'.supabase.co:5432/postgres'},
  {...isolated,ST1_PREVIEW_DATABASE_URL:'postgresql://st1_connect_runtime:pw@db.'+ref+'.supabase.co:5432/other'},
  {...isolated,ST1_PREVIEW_DATABASE_URL:'postgresql://st1_connect_runtime:pw@attacker.example:5432/postgres'},
 ]){
  refused(()=>assertPreviewWriteSafe(bad));
 }
});

test('URL isolada do banco so usa role de runtime e pooler com sufixo do projeto correto',()=>{
 assert.equal(requireDatabaseUrl({...isolated,ST1_DB_POOLER_HOST:undefined}),
   isolated.ST1_PREVIEW_DATABASE_URL);
 const r=requireDatabaseUrl({...isolated,ST1_DB_POOLER_HOST:'aws-1-sa-east-1.pooler.supabase.com'});
 const u=new URL(r);
 assert.equal(u.username,'st1_connect_runtime.'+ref);
 assert.equal(u.hostname,'aws-1-sa-east-1.pooler.supabase.com');
 assert.equal(u.password,'preview');
 assert.equal(u.port,'6543');
 assert.equal(u.pathname,'/postgres');
 assert.throws(()=>requireDatabaseUrl({...isolated,ST1_PREVIEW_DB_POOLER_HOST:'other.example'}));
});

test('identidade e leitura de diretorio usam exclusivamente o novo Blob e nova chave',async()=>{
 const user={id:'isolate-user',name:'QA',email:'qa@st1.net.br',role:'Solicitante',
 active:true,version:1,passwordHash:'salt:hashed'};
 const payload=Buffer.from(JSON.stringify({uid:user.id,ver:1,exp:Math.floor(Date.now()/1000)+600})).toString('base64url');
 const sign=(key)=>'st1_connect_session='+payload+'.'+createHmac('sha256',key).update(payload).digest('base64url');
 const expectedHost='hVzSogKch4EgtVZE.private.blob.vercel-storage.com';
 let reads=0;
 const fetcher=async(url,options)=>{
  reads++;
  assert.equal(new URL(url).hostname,expectedHost.toLowerCase());
  assert.equal(options.headers.Authorization,'Bearer '+isolated.ST1_PREVIEW_BLOB_READ_WRITE_TOKEN);
  return new Response(JSON.stringify({users:[user]}),{status:200});
 };
 assert.equal((await loadDirectory(isolated,fetcher))[0].id,user.id);
 const request={headers:{cookie:sign(isolated.ST1_PREVIEW_AUTH_SECRET)}};
 assert.equal((await currentPrincipal(request,isolated,fetcher)).id,user.id);
 await assert.rejects(currentPrincipal({headers:{cookie:sign(baseline.ST1_AUTH_SECRET)}},isolated,fetcher),e=>e.status===401);
 assert.equal(reads,3);
});

test('HTTP real permite leitura e veda mutacoes Blob do Master legado durante transicao',async()=>{
 const env={...baseline};
 const tracked=[...Object.keys(env),'ST1_PREVIEW_ISOLATION_ENABLED','ST1_BOOTSTRAP_INVITE_HASH'];
 const original=Object.fromEntries(tracked.map(k=>[k,process.env[k]]));
 const originalFetch=globalThis.fetch;
 const admin={id:'master-fixture',name:'QA Master',email:env.ST1_BOOTSTRAP_EMAIL,
  role:'Administrador',active:true,passwordHash:'salt:hashed',version:1};
 let writes=0;
 try{
  Object.assign(process.env,env);
  delete process.env.ST1_PREVIEW_ISOLATION_ENABLED;
  delete process.env.ST1_BOOTSTRAP_INVITE_HASH;
  globalThis.fetch=async(_url,options={})=>{
   if(options.method==='PUT'){writes++;return new Response('{}',{status:500});}
   return new Response(JSON.stringify({users:[admin],auditTrail:[]}),{
    status:200,headers:{etag:'fixture-1'},
   });
  };
  const payload=Buffer.from(JSON.stringify({uid:admin.id,ver:1,exp:Math.floor(Date.now()/1000)+300})).toString('base64url');
  const mac=createHmac('sha256',env.ST1_AUTH_SECRET).update(payload).digest('base64url');
  const cookie='st1_connect_session='+payload+'.'+mac;
  async function call(action,{method='GET',body={}}={}){
   const response={statusCode:200,body:null,headers:{},
    setHeader(name,val){this.headers[name.toLowerCase()]=val;},
    status(v){this.statusCode=v;return this;},
    json(v){this.body=v;return this;}};
   await authHandler({method,query:{action},body,headers:{
    cookie,host:'preview.example.invalid',origin:'https://preview.example.invalid',
   }},response);
   return response;
  }
  const status=await call('status');
  assert.equal(status.statusCode,200);
  assert.equal(status.body.user.isMaster,true);
  const update=await call('users',{method:'POST',body:{
   name:'Solicitante de QA',email:'qa-user@example.invalid',password:'FixturePassword123',role:'Solicitante',
  }});
  assert.equal(update.statusCode,503);
  assert.equal(writes,0);
 }finally{
  globalThis.fetch=originalFetch;
  for(const [key,value] of Object.entries(original)){
   if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
 }
});

test('a Preview fecha escrita mesmo sem variavel de guard e rejeita SQL mutavel',()=>{
  for(const unguarded of [
    {...baseline,ST1_PREVIEW_WRITE_GUARD:undefined},
    {...baseline,ST1_PREVIEW_WRITE_GUARD:'false'},
  ]) {
    refused(()=>assertPreviewWriteSafe(unguarded));
    assert.doesNotThrow(()=>assertPreviewSqlReadOnly(
      'SELECT id FROM st1_services.requests LIMIT 0',unguarded));
    for(const statement of [
      "INSERT INTO st1_services.requests(id) VALUES('fake')",
      " UPDATE st1_services.requests SET state='Novo'",
      "DELETE FROM st1_services.requests",
      "WITH writes AS (DELETE FROM st1_services.requests RETURNING *) SELECT * FROM writes",
      "SELECT nextval('st1_bi.request_protocol_seq')",
      "SELECT pg_advisory_xact_lock(123)",
      "SELECT id FROM st1_services.requests FOR UPDATE",
      "SELECT 1; DROP SCHEMA st1_services CASCADE",
    ]) {
      refused(()=>assertPreviewSqlReadOnly(statement,unguarded));
    }
  }
  assert.doesNotThrow(()=>assertPreviewSqlReadOnly(
    'UPDATE st1_services.requests SET state=\'Novo\'',isolated));
  assert.doesNotThrow(()=>assertPreviewSqlReadOnly(
    'UPDATE st1_services.requests SET state=\'Novo\'',{...baseline,VERCEL_ENV:'production'}));
});
