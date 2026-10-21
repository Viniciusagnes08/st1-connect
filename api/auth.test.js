import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from './auth.js';

function response() {
  return {
    statusCode:200,headers:{},body:null,
    setHeader(name,value){this.headers[name.toLowerCase()]=value;},
    status(value){this.statusCode=value;return this;},
    json(value){this.body=value;return this;},
  };
}
test('autenticação recusa origens ausentes, inválidas e externas sem consultar o cadastro', async()=>{
  const keys=['ST1_AUTH_SECRET','BLOB_READ_WRITE_TOKEN','ST1_BLOB_STORE_ID','ST1_SETUP_TOKEN'];
  const before=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  const originalFetch=globalThis.fetch;
  let reads=0;
  try {
    for(const key of keys)process.env[key]='fixture-only';
    globalThis.fetch=async()=>{reads++;throw Error('Não deve consultar armazenamento');};
    for(const origin of [undefined,'null','invalid://[','https://example.invalid','http://st1-connect.vercel.app']){
      const res=response();
      await handler({method:'POST',query:{action:'login'},headers:{host:'st1-connect.vercel.app',...(origin?{origin}:{})},body:{}},res);
      assert.equal(res.statusCode,403,`Origin ${String(origin)} deve ser recusada`);
      assert.equal(res.body.error,'Origem não autorizada.');
    }
    assert.equal(reads,0);
  }finally{
    globalThis.fetch=originalFetch;
    for(const key of keys){if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key];}
  }
});

test('login e autorização preservam sessão, bloqueio, papéis e revogação em armazenamento isolado',async()=>{
  const keys=['ST1_AUTH_SECRET','BLOB_READ_WRITE_TOKEN','ST1_BLOB_STORE_ID','ST1_SETUP_TOKEN','ST1_BOOTSTRAP_EMAIL','ST1_BOOTSTRAP_INVITE_HASH'];
  const before=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  const originalFetch=globalThis.fetch;
  let users=[],revision=0;
  try{
    for(const key of keys)delete process.env[key];
    Object.assign(process.env,{ST1_AUTH_SECRET:'qa-secret-only',BLOB_READ_WRITE_TOKEN:'qa-token-only',ST1_BLOB_STORE_ID:'qa-fixture',ST1_SETUP_TOKEN:'qa-setup-only'});
    globalThis.fetch=async(_url,init={})=>{
      if(init.method==='PUT'){
        const incoming=init.headers['x-if-match'];
        if(incoming&&incoming!==String(revision))return new Response('{}',{status:412});
        users=JSON.parse(init.body).users;revision++;
        return new Response('{}',{status:200});
      }
      return new Response(JSON.stringify({users}),{status:users.length?200:404,headers:{etag:String(revision),'content-type':'application/json'}});
    };
    async function call(action,{method='POST',body={},cookie}={}){
      const res=response();
      await handler({method,query:{action},headers:{host:'st1-connect.vercel.app',origin:'https://st1-connect.vercel.app',...(cookie?{cookie}:{})},body},res);
      return res;
    }
    const setup=await call('setup',{body:{name:'QA Admin',email:'admin@example.invalid',password:'FixtureAdmin12345',setupToken:'qa-setup-only'}});
    assert.equal(setup.statusCode,201);
    const adminCookie=setup.headers['set-cookie'].split(';')[0];
    assert.match(setup.headers['set-cookie'],/HttpOnly; Secure; SameSite=Strict/);
    assert.equal(setup.body.user.passwordHash,undefined);
    assert.equal((await call('users',{method:'GET'})).statusCode,401);
    const newUser=await call('users',{cookie:adminCookie,body:{name:'QA Requester',email:'requester@example.invalid',password:'FixtureRequester123',role:'Solicitante'}});
    assert.equal(newUser.statusCode,201);
    const login=await call('login',{body:{email:'requester@example.invalid',password:'FixtureRequester123'}});
    assert.equal(login.statusCode,200);
    const personCookie=login.headers['set-cookie'].split(';')[0];
    assert.equal((await call('users',{method:'GET',cookie:personCookie})).statusCode,403);
    assert.equal((await call('me',{method:'GET',cookie:personCookie})).body.user.id,newUser.body.user.id);
    assert.equal((await call('user-update',{cookie:adminCookie,body:{id:setup.body.user.id,role:'Solicitante',active:true}})).statusCode,400);
    const disabled=await call('user-update',{cookie:adminCookie,body:{id:newUser.body.user.id,role:'Solicitante',active:false}});
    assert.equal(disabled.statusCode,200);
    assert.equal((await call('me',{method:'GET',cookie:personCookie})).statusCode,401);
    assert.equal((await call('login',{body:{email:'requester@example.invalid',password:'FixtureRequester123'}})).statusCode,401);
    for(let attempt=0;attempt<5;attempt++)assert.equal((await call('login',{body:{email:'admin@example.invalid',password:'wrong'}})).statusCode,401);
    assert.equal((await call('login',{body:{email:'admin@example.invalid',password:'FixtureAdmin12345'}})).statusCode,429);
  }finally{
    globalThis.fetch=originalFetch;
    for(const key of keys){if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key];}
  }
});
