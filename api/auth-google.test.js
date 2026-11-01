import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync,sign,scryptSync } from 'node:crypto';
import handler from './auth.js';

const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk=publicKey.export({format:'jwk'});
const clientId='123456789000-st1test.apps.googleusercontent.com';
const NOW=Math.floor(Date.now()/1000);
const credentials=(email='worker@st1.net.br',hd='st1.net.br',sub='12345678901234567890',nonce)=>{
  const header=Buffer.from(JSON.stringify({alg:'RS256',kid:'synthetic-key'})).toString('base64url');
  const body=Buffer.from(JSON.stringify({
    iss:'https://accounts.google.com',aud:clientId,sub,email,
    email_verified:true,...(hd?{hd}:{}),name:'Colaborador ST1',iat:NOW-5,exp:NOW+1800,nonce,
  })).toString('base64url');
  const payload=header+'.'+body;
  return payload+'.'+sign('RSA-SHA256',Buffer.from(payload),privateKey).toString('base64url');
};
const fixtureAdmin=()=>{
  const salt='synthetic-admin-salt';
  return {id:'admin-id',email:'master@st1.net.br',name:'Master Test',
    role:'Administrador',active:true,passwordHash:salt+':'+scryptSync('SyntheticAdminPassword123',salt,64).toString('hex'),
    version:1,attempts:0,blockedUntil:0};
};
const keys=['ST1_AUTH_SECRET','BLOB_READ_WRITE_TOKEN','ST1_BLOB_STORE_ID','ST1_SETUP_TOKEN',
  'ST1_BOOTSTRAP_EMAIL','ST1_GOOGLE_CLIENT_ID','ST1_GOOGLE_WORKSPACE_DOMAIN','ST1_BOOTSTRAP_INVITE_HASH'];

async function fixture(fn){
  const original=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  const fetcher=globalThis.fetch;let users=[fixtureAdmin()],etag=1;
  try {
    Object.assign(process.env,{
      ST1_AUTH_SECRET:'fake-session-secret',BLOB_READ_WRITE_TOKEN:'fake-blob-secret',
      ST1_BLOB_STORE_ID:'mockBlobStore123',ST1_SETUP_TOKEN:'fake-setup-token',
      ST1_BOOTSTRAP_EMAIL:'master@st1.net.br',ST1_GOOGLE_CLIENT_ID:clientId,
      ST1_GOOGLE_WORKSPACE_DOMAIN:'st1.net.br',
    });
    delete process.env.ST1_BOOTSTRAP_INVITE_HASH;
    globalThis.fetch=async (url,opt={})=>{
      if(String(url).includes('googleapis.com/oauth2/v3/certs'))return new Response(
        JSON.stringify({keys:[{...jwk,kid:'synthetic-key',use:'sig',alg:'RS256'}]}),{status:200,headers:{'cache-control':'public,max-age=300'}});
      if(opt.method==='PUT'){
        if(opt.headers['x-if-match']!==String(etag))return new Response('{}',{status:412});
        users=JSON.parse(opt.body).users;etag++;
        return new Response('{}',{status:200});
      }
      return new Response(JSON.stringify({users}),{status:200,
        headers:{etag:String(etag),'content-type':'application/json'}});
    };
    async function call(action,{method='POST',body={},cookie}={}){
      const res={statusCode:200,body:null,headers:{},
        setHeader(k,v){this.headers[k.toLowerCase()]=v;},
        status(v){this.statusCode=v;return this;},
        json(v){this.body=v;return this;}};
      await handler({method,query:{action},body,headers:{
        host:'preview.example.invalid',origin:'https://preview.example.invalid',
        'content-type':'application/json',...(cookie?{cookie}:{}),
      }},res);
      return res;
    }
    async function googleLogin(email,hd,sub){
      const challenge=await call('google-challenge',{method:'GET'});
      assert.equal(challenge.statusCode,200);
      assert.match(challenge.body.nonce,/^[A-Za-z0-9_-]{32}$/);
      const nonceCookie=challenge.headers['set-cookie'].split(';')[0];
      return call('google',{body:{credential:credentials(email,hd,sub,challenge.body.nonce)},cookie:nonceCookie});
    }
    return await fn({call,googleLogin,users:()=>structuredClone(users)});
  }finally{
    globalThis.fetch=fetcher;
    for(const k of keys)if(original[k]===undefined)delete process.env[k];else process.env[k]=original[k];
  }
}

test('Google Workspace autenticado entra somente como Solicitante, com cookie validado',async()=>{
  await fixture(async({call,googleLogin,users})=>{
    const result=await googleLogin();
    assert.equal(result.statusCode,200);
    assert.equal(result.body.user.role,'Solicitante');
    assert.equal(result.body.user.isMaster,false);
    assert.equal(result.body.user.authMethod,'google');
    assert.equal(users().length,2);
    const created=users()[1];
    assert.equal(created.passwordHash,'');
    assert.equal(created.googleAuthOnly,true);
    assert.equal(created.googleSub,'12345678901234567890');
    const cookie=result.headers['set-cookie'].find(x=>x.startsWith('st1_connect_session=')).split(';')[0];
    assert.equal((await call('me',{method:'GET',cookie})).body.user.id,created.id);
    assert.equal((await call('login',{body:{email:created.email,password:'SyntheticAdminPassword123'}})).statusCode,401);
  });
});

test('Gmail pessoal não autorizado não se cadastra; convite do Master permite login seguro',async()=>{
  await fixture(async({call,googleLogin,users})=>{
    const gmail='commercial.worker@gmail.com';
    assert.equal((await googleLogin(gmail,null,'23456789012345678901')).statusCode,403);
    assert.equal(users().length,1);
    const admin=await call('login',{body:{email:'master@st1.net.br',password:'SyntheticAdminPassword123'}});
    assert.equal(admin.statusCode,200);
    assert.equal(admin.body.user.isMaster,true);
    const adminCookie=admin.headers['set-cookie'].split(';')[0];
    const invite=await call('google-invite',{body:{email:gmail},cookie:adminCookie});
    assert.equal(invite.statusCode,201);
    assert.equal(invite.body.user.googlePending,true);
    const accepted=await googleLogin(gmail,null,'23456789012345678901');
    assert.equal(accepted.statusCode,200);
    assert.equal(accepted.body.user.role,'Solicitante');
    assert.equal(accepted.body.user.isMaster,false);
    assert.equal(users()[1].googlePending,false);
  });
});

test('Google não se vincula sozinho ao Admin Master pelo e-mail',async()=>{
  await fixture(async({googleLogin,users})=>{
    const result=await googleLogin('master@st1.net.br','st1.net.br','34567890123456789012');
    assert.equal(result.statusCode,403);
    assert.equal(users().length,1);
    assert.equal(users()[0].googleSub,undefined);
  });
});
