import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scryptSync } from 'node:crypto';
import handler from './auth.js';

const SECRET='fixture-administrator-recovery-token-123456789';
const EMAIL='bootstrap-admin@example.invalid';
const ENV_KEYS=[
  'ST1_AUTH_SECRET','BLOB_READ_WRITE_TOKEN','ST1_BLOB_STORE_ID',
  'ST1_SETUP_TOKEN','ST1_BOOTSTRAP_EMAIL','ST1_BOOTSTRAP_INVITE_HASH',
  'ST1_ADMIN_RECOVERY_ENABLED','VERCEL_ENV',
];

function resStub() {
  return {
    statusCode: 200, headers:{}, body:null,
    setHeader(key,value){this.headers[key.toLowerCase()]=value;},
    status(n){this.statusCode=n;return this;},
    json(data){this.body=data;return this;},
  };
}
function storedPassword(password){
  const salt='fixture-rescue-salt';
  return salt+':'+scryptSync(password,salt,64).toString('hex');
}
async function harness(seed,callback){
  const before=Object.fromEntries(ENV_KEYS.map(k=>[k,process.env[k]]));
  const originalFetch=globalThis.fetch;
  let users=structuredClone(seed);
  let revision=1;
  try {
    Object.assign(process.env,{
      ST1_AUTH_SECRET:'fixture-secret-only',
      BLOB_READ_WRITE_TOKEN:'fixture-blob-only',
      ST1_BLOB_STORE_ID:'fixture-blob',
      ST1_SETUP_TOKEN:SECRET,
      ST1_BOOTSTRAP_EMAIL:EMAIL,
      ST1_ADMIN_RECOVERY_ENABLED:'true',
      VERCEL_ENV:'preview',
    });
    delete process.env.ST1_BOOTSTRAP_INVITE_HASH;
    globalThis.fetch=async (_url,init={})=>{
      if(init.method==='PUT'){
        const currentEtag=init.headers?.['x-if-match'];
        if(currentEtag!==String(revision))return new Response('{}',{status:412});
        users=JSON.parse(init.body).users;
        revision++;
        return new Response('{}',{status:200});
      }
      return new Response(JSON.stringify({users}),{
        status:200,headers:{'content-type':'application/json',etag:String(revision)},
      });
    };
    async function call(action,opts={}){
      const {method='POST',body={},cookie,origin='https://preview.example.invalid'}=opts;
      const req={method,query:{action},headers:{
        host:'preview.example.invalid',origin,...(cookie?{cookie}:{}),
        'content-type':'application/json',
      },body};
      const res=resStub();
      await handler(req,res);
      return res;
    }
    return await callback({call,getUsers:()=>structuredClone(users)});
  }finally{
    globalThis.fetch=originalFetch;
    for(const key of ENV_KEYS){
      if(before[key]===undefined)delete process.env[key];
      else process.env[key]=before[key];
    }
  }
}

const admin=()=>({
  id:'fixture-admin-id',name:'Fixture Admin',email:EMAIL,role:'Administrador',
  active:true,version:1,attempts:1,blockedUntil:0,
  passwordHash:storedPassword('OldPassword123456'),
  createdAt:'2026-10-21T01:00:00Z',
});
const newPassword='NewSecurePassword987654';

test('administrador principal recupera acesso na Preview sem sessão, código é de uso único e sessões antigas são invalidadas',async()=>{
  await harness([admin()],async({call,getUsers})=>{
    const status=await call('status',{method:'GET'});
    assert.equal(status.statusCode,200);
    assert.equal(status.body.adminRecoveryAvailable,true);
    const oldLogin=await call('login',{body:{email:EMAIL,password:'OldPassword123456'}});
    assert.equal(oldLogin.statusCode,200);
    const oldCookie=oldLogin.headers['set-cookie'].split(';')[0];
    const wrong=await call('recover-admin',{body:{email:EMAIL,password:newPassword,setupToken:'wrong-secret'}});
    assert.equal(wrong.statusCode,403);
    assert.equal(getUsers()[0].version,1);
    const recovered=await call('recover-admin',{body:{
      email:EMAIL.toUpperCase(),setupToken:SECRET,password:newPassword,
    }});
    assert.equal(recovered.statusCode,200);
    assert.equal(recovered.body.user.role,'Administrador');
    assert.equal(recovered.body.user.passwordHash,undefined);
    assert.match(recovered.headers['set-cookie'],/HttpOnly; Secure; SameSite=Strict/);
    const updated=getUsers()[0];
    assert.equal(updated.version,2);
    assert.equal(updated.attempts,0);
    assert.equal(updated.blockedUntil,0);
    assert.notEqual(updated.passwordHash,storedPassword('OldPassword123456'));
    assert.ok(updated.adminRecoveryUsedHash);
    assert.equal(updated.passwordHash.includes(newPassword),false);
    assert.equal(JSON.stringify(getUsers()).includes(SECRET),false);
    assert.equal((await call('me',{method:'GET',cookie:oldCookie})).statusCode,401);
    assert.equal((await call('login',{body:{email:EMAIL,password:'OldPassword123456'}})).statusCode,401);
    assert.equal((await call('login',{body:{email:EMAIL,password:newPassword}})).statusCode,200);
    const repeated=await call('recover-admin',{body:{email:EMAIL,setupToken:SECRET,password:'YetAnotherPassword123'}});
    assert.equal(repeated.statusCode,403);
  });
});

test('convite inicial expirado não impede administrador legítimo de recuperar acesso',async()=>{
  const invited={...admin(),passwordHash:'',invitationHash:'obsolete-hash',
    inviteExpiresAt:'2020-01-01T00:00:00Z',attempts:5,blockedUntil:Date.now()+1000000};
  await harness([invited],async({call,getUsers})=>{
    assert.equal((await call('login',{body:{email:EMAIL,password:'NoPassword123'}})).statusCode,401);
    const result=await call('recover-admin',{body:{email:EMAIL,setupToken:SECRET,password:newPassword}});
    assert.equal(result.statusCode,200);
    const user=getUsers()[0];
    assert.equal(user.invitationHash,undefined);
    assert.equal(user.inviteExpiresAt,undefined);
    assert.equal(user.blockedUntil,0);
    assert.equal((await call('login',{body:{email:EMAIL,password:newPassword}})).statusCode,200);
  });
});

test('recuperação não fica habilitada em produção e nunca redefine conta solicitante',async()=>{
  await harness([admin()],async({call,getUsers})=>{
    process.env.VERCEL_ENV='production';
    assert.equal((await call('status',{method:'GET'})).body.adminRecoveryAvailable,false);
    const attempt=await call('recover-admin',{body:{email:EMAIL,setupToken:SECRET,password:newPassword}});
    assert.equal(attempt.statusCode,404);
    assert.equal(getUsers()[0].version,1);
  });
  await harness([{...admin(),role:'Solicitante'}],async({call,getUsers})=>{
    const attempt=await call('recover-admin',{body:{email:EMAIL,setupToken:SECRET,password:newPassword}});
    assert.equal(attempt.statusCode,403);
    assert.equal(getUsers()[0].version,1);
  });
});

test('recuperação bloqueia e-mail divergente, código curto e origem não autorizada',async()=>{
  await harness([admin()],async({call,getUsers})=>{
    assert.equal((await call('recover-admin',{body:{email:'other@example.invalid',setupToken:SECRET,password:newPassword}})).statusCode,403);
    assert.equal((await call('recover-admin',{body:{email:EMAIL,setupToken:'123',password:newPassword}})).statusCode,403);
    const crossOrigin=await call('recover-admin',{
      origin:'https://another-site.invalid',
      body:{email:EMAIL,setupToken:SECRET,password:newPassword},
    });
    assert.equal(crossOrigin.statusCode,403);
    assert.equal(getUsers()[0].version,1);
  });
});
