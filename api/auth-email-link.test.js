import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, scryptSync } from 'node:crypto';
import handler from './auth.js';

const token='b'.repeat(64); // Dados sintéticos, nunca credencial real.
const tokenHash=createHash('sha256').update(token).digest('hex');
const email='admin@example.invalid';
const password='TestNewPassword1234';
const tracked=[
  'ST1_AUTH_SECRET','BLOB_READ_WRITE_TOKEN','ST1_BLOB_STORE_ID',
  'ST1_SETUP_TOKEN','ST1_BOOTSTRAP_EMAIL','ST1_BOOTSTRAP_INVITE_HASH',
  'ST1_EMAIL_RECOVERY_HASH','ST1_EMAIL_RECOVERY_EXPIRES_AT','VERCEL_ENV',
];
function response(){
  return {
    statusCode:200,headers:{},body:null,
    setHeader(k,v){this.headers[k.toLowerCase()]=v;},
    status(code){this.statusCode=code;return this;},
    json(body){this.body=body;return this;},
  };
}
function fixtureUser(){
  const salt='fixture-only-salt';
  return {
    id:'test-user-001',name:'QA Admin',email,role:'Administrador',
    active:true,version:1,attempts:3,blockedUntil:Date.now()+20000,
    passwordHash:salt+':'+scryptSync('PreviousPassword123',salt,64).toString('hex'),
  };
}
async function fixture(initialUsers,callback){
  const before=Object.fromEntries(tracked.map(k=>[k,process.env[k]]));
  const fetchOriginal=globalThis.fetch;
  let users=structuredClone(initialUsers),revision=1;
  try{
    Object.assign(process.env,{
      ST1_AUTH_SECRET:'test-secret-not-for-production',
      BLOB_READ_WRITE_TOKEN:'test-blob-token-only',
      ST1_BLOB_STORE_ID:'test-blobstore',
      ST1_SETUP_TOKEN:'test-setup-code-with-sufficient-length',
      ST1_BOOTSTRAP_EMAIL:email,
      ST1_EMAIL_RECOVERY_HASH:tokenHash,
      ST1_EMAIL_RECOVERY_EXPIRES_AT:String(Date.now()+40*60*1000),
      VERCEL_ENV:'preview',
    });
    delete process.env.ST1_BOOTSTRAP_INVITE_HASH;
    globalThis.fetch=async (_url,opts={})=>{
      if(opts.method==='PUT'){
        if(opts.headers['x-if-match']!==String(revision))return new Response('{}',{status:412});
        users=JSON.parse(opts.body).users;
        revision++;
        return new Response('{}',{status:200});
      }
      return new Response(JSON.stringify({users}),{
        status:200,headers:{'content-type':'application/json',etag:String(revision)},
      });
    };
    async function invoke(action,{method='POST',body={},origin='https://test-preview.invalid',cookie}={}){
      const res=response();
      await handler({method,query:{action},headers:{
        host:'test-preview.invalid',origin,'content-type':'application/json',
        ...(cookie?{cookie}:{}),
      },body},res);
      return res;
    }
    await callback({invoke,users:()=>structuredClone(users)});
  }finally{
    globalThis.fetch=fetchOriginal;
    for(const k of tracked){if(before[k]===undefined)delete process.env[k];else process.env[k]=before[k];}
  }
}
test('token de e-mail concede apenas uma redefinição ao administrador inicial e revoga a sessão antiga',async()=>{
  await fixture([fixtureUser()],async({invoke,users})=>{
    const previousUser=users()[0];
    // A conta inicialmente bloqueada não pode entrar com a senha antiga.
    const recovery=await invoke('recover-admin-link',{
      body:{recoveryToken:token,password},
    });
    assert.equal(recovery.statusCode,200);
    assert.equal(recovery.body.user.role,'Administrador');
    assert.equal(recovery.body.user.passwordHash,undefined);
    assert.match(recovery.headers['set-cookie'],/HttpOnly; Secure; SameSite=Strict/);
    const modified=users()[0];
    assert.equal(modified.version,previousUser.version+1);
    assert.equal(modified.lastEmailRecoveryHash,tokenHash);
    assert.equal(modified.attempts,0);
    assert.equal(modified.blockedUntil,0);
    assert.equal(modified.passwordHash.includes(password),false);
    assert.equal(JSON.stringify(modified).includes(token),false);
    const second=await invoke('recover-admin-link',{body:{recoveryToken:token,password:'OtherPassword4567'}});
    assert.equal(second.statusCode,403);
    const login=await invoke('login',{body:{email,password}});
    assert.equal(login.statusCode,200);
    const cookie=login.headers['set-cookie'].split(';')[0];
    assert.equal((await invoke('me',{method:'GET',cookie})).statusCode,200);
  });
});

test('recuperação funciona com convite expirado, sem usar senha antiga',async()=>{
  const seed={...fixtureUser(),passwordHash:'',inviteExpiresAt:'2020-01-01T00:00:00Z',invitationHash:'old-hash'};
  await fixture([seed],async({invoke,users})=>{
    assert.equal((await invoke('recover-admin-link',{body:{recoveryToken:token,password}})).statusCode,200);
    assert.equal(users()[0].invitationHash,undefined);
    assert.equal(users()[0].inviteExpiresAt,undefined);
    assert.equal((await invoke('login',{body:{email,password}})).statusCode,200);
  });
});

test('recuperação recusa produção, token inválido, vencido e origem externa',async()=>{
  await fixture([fixtureUser()],async({invoke,users})=>{
    assert.equal((await invoke('recover-admin-link',{body:{recoveryToken:'c'.repeat(64),password}})).statusCode,403);
    assert.equal((await invoke('recover-admin-link',{body:{recoveryToken:token,password},origin:'https://other.invalid'})).statusCode,403);
    process.env.ST1_EMAIL_RECOVERY_EXPIRES_AT=String(Date.now()-10);
    assert.equal((await invoke('recover-admin-link',{body:{recoveryToken:token,password}})).statusCode,403);
    process.env.ST1_EMAIL_RECOVERY_EXPIRES_AT=String(Date.now()+40*60*1000);
    process.env.VERCEL_ENV='production';
    assert.equal((await invoke('recover-admin-link',{body:{recoveryToken:token,password}})).statusCode,403);
    assert.equal(users()[0].version,1);
  });
});

test('recuperação não promove conta comum ou email diferente a administrador',async()=>{
  await fixture([{...fixtureUser(),role:'Solicitante'}],async({invoke,users})=>{
    assert.equal((await invoke('recover-admin-link',{body:{recoveryToken:token,password}})).statusCode,403);
    assert.equal(users()[0].role,'Solicitante');
  });
  await fixture([{...fixtureUser(),email:'another@example.invalid'}],async({invoke,users})=>{
    assert.equal((await invoke('recover-admin-link',{body:{recoveryToken:token,password}})).statusCode,403);
    assert.equal(users()[0].version,1);
  });
});
