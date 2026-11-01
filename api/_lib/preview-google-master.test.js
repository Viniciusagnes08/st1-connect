import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  isPinnedPreviewGoogleIdentity, effectiveAccessAccount,
  isMasterAdmin, isMasterIdentity, canCreateAccount, canUpdateAccount,
} from './master-admin.js';
import { decodeSession } from './auth-session.js';
import { currentPrincipal, publicDirectory } from './identity.js';
import authHandler from '../auth.js';

const pinnedId='a'.repeat(24);
const previewBranch='feature/st1-connect-bi-foundation';
const owner={
  id:pinnedId,email:'owner@st1.net.br',name:'Proprietário de QA',
  role:'Solicitante',active:true,googleAuthOnly:true,
  googleSub:'12345678901234567890',googlePending:false,
  passwordHash:'',version:2,attempts:0,blockedUntil:0,
};
const admin={
  id:'b'.repeat(24),email:'bootstrap@st1.net.br',name:'Master inicial',
  role:'Administrador',active:true,passwordHash:'synthetic-salt:synthetic-digest',
  version:3,attempts:0,blockedUntil:0,
};
const env={
  VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:previewBranch,
  ST1_PREVIEW_MASTER_GOOGLE_USER_ID:pinnedId,
  ST1_PREVIEW_MASTER_GOOGLE_EMAIL:'owner@st1.net.br',
  ST1_BOOTSTRAP_EMAIL:admin.email,
  ST1_AUTH_SECRET:'fixture-preview-secret',BLOB_READ_WRITE_TOKEN:'fixture-blob-token',
  ST1_BLOB_STORE_ID:'fixtureStore123',ST1_SETUP_TOKEN:'fixture-setup-token',
};
function signedCookie(account=owner,secret=env.ST1_AUTH_SECRET,seconds=600){
  const payload=Buffer.from(JSON.stringify({
    uid:account.id,ver:account.version,exp:Math.floor(Date.now()/1000)+seconds,
  })).toString('base64url');
  const mac=createHmac('sha256',secret).update(payload).digest('base64url');
  return 'st1_connect_session='+payload+'.'+mac;
}
function res(){
  return {statusCode:200,body:null,headers:{},
    setHeader(name,value){this.headers[name.toLowerCase()]=value;},
    status(value){this.statusCode=value;return this;},
    json(value){this.body=value;return this;},
  };
}

test('Master Google so existe para ID, email e Google sub autenticados na Preview exata',()=>{
  const original=structuredClone(owner);
  assert.equal(isPinnedPreviewGoogleIdentity(owner,env),true);
  const effective=effectiveAccessAccount(owner,env);
  assert.notEqual(effective,owner);
  assert.equal(effective.role,'Administrador');
  assert.equal(isMasterIdentity(effective,env),true);
  assert.equal(isMasterAdmin(effective,env),true);
  assert.equal(canCreateAccount(effective,'Administrador',env),true);
  assert.equal(owner.role,'Solicitante');
  assert.deepEqual(owner,original,'Nunca modificar o objeto compartilhado');
  assert.equal(isMasterAdmin(admin,env),true,'Master inicial continua valido');
  assert.equal(isMasterIdentity(owner,env),true,'Identidade proprietaria permanece protegida');
  assert.equal(canUpdateAccount(effective,owner,'Administrador',true,env),false,
    'Master virtual nao pode regravar seu papel no diretorio compartilhado');
});

test('escopo fail-closed: outra conta, email, papel do token, ambiente ou branch',()=>{
  const variants=[
    [{...owner,id:'c'.repeat(24)},env],
    [{...owner,email:'outro@st1.net.br'},env],
    [{...owner,googleAuthOnly:false},env],
    [{...owner,googleSub:'incorrect'},env],
    [{...owner,googlePending:true},env],
    [{...owner,passwordHash:'salt:digest'},env],
    [{...owner,active:false},env],
    [owner,{...env,VERCEL_ENV:'production'}],
    [owner,{...env,VERCEL_ENV:'development'}],
    [owner,{...env,VERCEL_GIT_COMMIT_REF:'main'}],
    [owner,{...env,VERCEL_GIT_COMMIT_REF:undefined}],
    [owner,{...env,ST1_PREVIEW_MASTER_GOOGLE_USER_ID:undefined}],
    [owner,{...env,ST1_PREVIEW_MASTER_GOOGLE_EMAIL:'different@st1.net.br'}],
    [owner,{...env,ST1_PREVIEW_MASTER_GOOGLE_EMAIL:'owner@gmail.com'}],
  ];
  for(const [person,environment] of variants){
    assert.equal(isPinnedPreviewGoogleIdentity(person,environment),false);
    assert.equal(effectiveAccessAccount(person,environment).role,person.role);
  }
  assert.equal(isMasterAdmin(effectiveAccessAccount(owner,{...env,VERCEL_ENV:'production'}),
    {...env,VERCEL_ENV:'production'}),false);
});

test('cookie HMAC valida sessao e projeta autoridade sem modificar usuario armazenado',()=>{
  const c=signedCookie();
  assert.equal(decodeSession(c,env.ST1_AUTH_SECRET,[owner],Date.now(),env)?.role,'Administrador');
  assert.equal(decodeSession(c,env.ST1_AUTH_SECRET,[owner],Date.now(),env)?.id,owner.id);
  assert.equal(decodeSession(c,env.ST1_AUTH_SECRET,[owner],Date.now(),{...env,VERCEL_ENV:'production'})?.role,'Solicitante');
  assert.equal(decodeSession(c+'a',env.ST1_AUTH_SECRET,[owner],Date.now(),env),null);
  assert.equal(decodeSession(signedCookie(owner,env.ST1_AUTH_SECRET,-5),env.ST1_AUTH_SECRET,[owner],Date.now(),env),null);
  assert.equal(decodeSession(c,env.ST1_AUTH_SECRET,[{...owner,version:3}],Date.now(),env),null);
  assert.equal(decodeSession(c,env.ST1_AUTH_SECRET,[{...owner,active:false}],Date.now(),env),null);
  assert.equal(owner.role,'Solicitante');
});

test('todas APIs recebem o mesmo principal do cookie, nunca o papel do body',async()=>{
  const fetchDirectory=async()=>new Response(JSON.stringify({users:[owner,admin]}),{
    status:200,headers:{'content-type':'application/json'},
  });
  const req={headers:{cookie:signedCookie()},body:{role:'Administrador',isMaster:true}};
  const preview=await currentPrincipal(req,env,fetchDirectory);
  assert.equal(preview.role,'Administrador');
  assert.equal(preview.isMaster,true);
  const production=await currentPrincipal(req,{...env,VERCEL_ENV:'production'},fetchDirectory);
  assert.equal(production.role,'Solicitante');
  assert.equal(production.isMaster,false);
  const member=publicDirectory([owner,admin],env).find(x=>x.id===owner.id);
  assert.equal(member.role,'Administrador');
  assert.equal(member.passwordHash,undefined);
  assert.equal(publicDirectory([owner],{...env,VERCEL_ENV:'production'})[0].role,'Solicitante');
  assert.equal(owner.role,'Solicitante');
});

test('rotas reais: Preview ve Master, producao ve Solicitante e conta compartilhada nao muda',async()=>{
  const keys=Object.keys(env);
  const before=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  const originalFetch=globalThis.fetch;
  const directory={users:[structuredClone(owner),structuredClone(admin)],auditTrail:[]};
  let writes=0;
  try{
    Object.assign(process.env,env);
    globalThis.fetch=async(_url,init={})=>{
      if(init.method==='PUT'){writes++;return new Response('{}',{status:500});}
      return new Response(JSON.stringify(directory),{
        status:200,headers:{etag:'1','content-type':'application/json'},
      });
    };
    const call=async(action,options={})=>{
      const response=res();
      await authHandler({
        method:options.method||'GET',query:{action},body:options.body||{},
        headers:{
          host:'preview.example.invalid',origin:'https://preview.example.invalid',
          cookie:signedCookie(),
        },
      },response);
      return response;
    };
    const status=await call('status');
    assert.equal(status.statusCode,200);
    assert.equal(status.body.user.role,'Administrador');
    assert.equal(status.body.user.isMaster,true);
    assert.equal(status.body.user.authMethod,'google');
    const current=await call('me');
    assert.equal(current.body.user.isMaster,true);
    const list=await call('users');
    assert.equal(list.statusCode,200);
    assert.equal(list.body.users.find(x=>x.id===owner.id).role,'Administrador');
    const audit=await call('audit');
    assert.equal(audit.statusCode,200);
    const selfUpdate=await call('user-update',{
      method:'POST',body:{id:owner.id,role:'Administrador',active:true},
    });
    assert.equal(selfUpdate.statusCode,403,'Nenhuma alteracao pode promover o cadastro compartilhado');
    assert.equal(writes,0);
    assert.equal(directory.users[0].role,'Solicitante');
    process.env.VERCEL_ENV='production';
    const production=await call('status');
    assert.equal(production.statusCode,200);
    assert.equal(production.body.user.role,'Solicitante');
    assert.equal(production.body.user.isMaster,false);
    assert.equal((await call('audit')).statusCode,403);
    assert.equal(writes,0);
    assert.equal(directory.users[0].role,'Solicitante');
  }finally{
    globalThis.fetch=originalFetch;
    for(const key of keys){
      if(before[key]===undefined)delete process.env[key];
      else process.env[key]=before[key];
    }
  }
});
