import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import handler from '../auth.js';

const clientId='123456789001-st1-qa.apps.googleusercontent.com';
const inviteToken='fixture-master-invitation-only-for-tests';
const secret='fixture-session-secret-not-production';
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...publicKey.export({format:'jwk'}),kid:'test-google-signing-key',use:'sig',alg:'RS256'};
const now=()=>Math.floor(Date.now()/1000);
const base=(nonce,email,sub,hd)=>({
 iss:'https://accounts.google.com',aud:clientId,sub,email,email_verified:true,
 name:'QA ST1 Colaborador',iat:now()-20,exp:now()+3600,nonce,
 ...(hd?{hd}:{}),
});
function signJwt(claims){
 const head=Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT',kid:jwk.kid})).toString('base64url');
 const body=Buffer.from(JSON.stringify(claims)).toString('base64url');
 const content=head+'.'+body;
 return content+'.'+sign('RSA-SHA256',Buffer.from(content),privateKey).toString('base64url');
}
function mockResponse(){
 return {
  statusCode:200,body:null,headers:{},
  setHeader(name,value){this.headers[name.toLowerCase()]=value;},
  status(value){this.statusCode=value;return this;},
  json(value){this.body=value;return this;},
 };
}
const cookieHeader=(res,prefix)=>{
 const cookies=res.headers['set-cookie'];
 const found=(Array.isArray(cookies)?cookies:[cookies]).find(v=>typeof v==='string'&&v.startsWith(prefix+'='));
 assert.ok(found,'Cookie '+prefix+' esperado');
 return found.split(';')[0];
}

test('GIS com token assinado permite login corporativo, convite Gmail, logout e rejeita vinculos indevidos',async()=>{
 const keys=[
  'ST1_AUTH_SECRET','BLOB_READ_WRITE_TOKEN','ST1_BLOB_STORE_ID',
  'ST1_SETUP_TOKEN','ST1_BOOTSTRAP_EMAIL','ST1_BOOTSTRAP_NAME','ST1_BOOTSTRAP_INVITE_HASH',
  'ST1_GOOGLE_CLIENT_ID','ST1_GOOGLE_WORKSPACE_DOMAIN','VERCEL_ENV',
 ];
 const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 const origFetch=globalThis.fetch;
 let state=null,revision=0;
 try{
  for(const key of keys)delete process.env[key];
  Object.assign(process.env,{
   ST1_AUTH_SECRET:secret,BLOB_READ_WRITE_TOKEN:'fixture-blob-token',
   ST1_BLOB_STORE_ID:'fixture-blob-store',ST1_SETUP_TOKEN:'fixture-setup-token',
   ST1_BOOTSTRAP_EMAIL:'master@example.invalid',ST1_BOOTSTRAP_NAME:'QA Master',
   ST1_BOOTSTRAP_INVITE_HASH:createHash('sha256').update(inviteToken).digest('hex'),
   ST1_GOOGLE_CLIENT_ID:clientId,ST1_GOOGLE_WORKSPACE_DOMAIN:'st1.net.br',
   VERCEL_ENV:'preview',
  });
  globalThis.fetch=async(url,init={})=>{
   const target=String(url);
   if(target.includes('www.googleapis.com/oauth2/v3/certs'))
    return new Response(JSON.stringify({keys:[jwk]}),{status:200,headers:{'cache-control':'public,max-age=60'}});
   if(init.method==='PUT'){
    if(state&&init.headers['x-if-match']!==String(revision))
      return new Response('{}',{status:412});
    state=JSON.parse(init.body);revision++;
    return new Response('{}',{status:200});
   }
   if(!state)return new Response('{}',{status:404});
   return new Response(JSON.stringify(state),{status:200,headers:{etag:String(revision)}});
  };
  async function call(action,{method='POST',body={},cookie='',origin='https://preview.example.invalid'}={}){
   const res=mockResponse();
   await handler({
    method,query:{action},body,
    headers:{host:'preview.example.invalid',origin,...(cookie?{cookie}:{})},
   },res);
   return res;
  }
  async function challenge(){
   const result=await call('google-challenge',{method:'GET'});
   assert.equal(result.statusCode,200);
   assert.match(result.body.nonce,/^[a-zA-Z0-9_-]{32}$/);
   assert.equal(result.body.expiresIn,600);
   return {nonce:result.body.nonce,cookie:cookieHeader(result,'st1_google_challenge')};
  }
  async function loginGoogle({email,sub,hd,claims,origin}){
   const c=await challenge();
   const token=signJwt({...base(c.nonce,email,sub,hd),...claims});
   return call('google',{body:{credential:token},cookie:c.cookie,origin});
  }

  const status=await call('status',{method:'GET'});
  assert.equal(status.statusCode,200);
  assert.equal(status.body.googleClientId,clientId);

  // Erro de origem e tentativas sem um desafio autenticado.
  const outside=await loginGoogle({email:'user@st1.net.br',sub:'123456789100',hd:'st1.net.br',
    origin:'https://outside.example.invalid'});
  assert.equal(outside.statusCode,403);
  const missing=await call('google',{body:{credential:signJwt(base('no-nonce','user@st1.net.br','123456789100','st1.net.br'))}});
  assert.equal(missing.statusCode,401);

  const corporate=await loginGoogle({email:'employee@st1.net.br',sub:'123456789101',hd:'st1.net.br'});
  assert.equal(corporate.statusCode,200);
  assert.equal(corporate.body.user.role,'Solicitante');
  assert.equal(corporate.body.user.isMaster,false);
  assert.equal(corporate.body.user.authMethod,'google');
  const corporateId=corporate.body.user.id;
  const corporateSession=cookieHeader(corporate,'st1_connect_session');
  assert.match(cookieHeader(corporate,'st1_google_challenge'),/st1_google_challenge=$/);
  assert.equal((await call('me',{method:'GET',cookie:corporateSession})).body.user.id,corporateId);

  const again=await loginGoogle({email:'employee@st1.net.br',sub:'123456789101',hd:'st1.net.br'});
  assert.equal(again.statusCode,200);
  assert.equal(again.body.user.id,corporateId);

  // Renomeacao/ausencia de hd ou expiracao da politica do Workspace barra retorno.
  for(const hd of [null,'outside.com']){
   const rejected=await loginGoogle({email:'employee@st1.net.br',sub:'123456789101',hd});
   assert.equal(rejected.statusCode,403);
  }
  const unauthCorporate=await loginGoogle({email:'outside@st1.net.br',sub:'123456789102',hd:null});
  assert.equal(unauthCorporate.statusCode,403);
  const rejectedGmail=await loginGoogle({email:'visitor@gmail.com',sub:'123456789103',hd:null});
  assert.equal(rejectedGmail.statusCode,403);

  // Mesmo e-mail com outro sub nao pode assumir conta existente.
  const swapped=await loginGoogle({email:'employee@st1.net.br',sub:'123456789999',hd:'st1.net.br'});
  assert.equal(swapped.statusCode,403);
  const wrongAud=await loginGoogle({email:'new@st1.net.br',sub:'123456789150',hd:'st1.net.br',
    claims:{aud:'999999999999-other.apps.googleusercontent.com'}});
  assert.equal(wrongAud.statusCode,401);
  const expired=await loginGoogle({email:'new@st1.net.br',sub:'123456789150',hd:'st1.net.br',
    claims:{exp:now()-5}});
  assert.equal(expired.statusCode,401);
  const unverified=await loginGoogle({email:'new@st1.net.br',sub:'123456789150',hd:'st1.net.br',
    claims:{email_verified:false}});
  assert.equal(unverified.statusCode,401);

  // Master permanece com login e senha separados. Convites Google so via Master.
  const activated=await call('activate',{body:{inviteToken,password:'FixtureMasterPassword1234'}});
  assert.equal(activated.statusCode,200);
  assert.equal(activated.body.user.isMaster,true);
  const masterCookie=cookieHeader(activated,'st1_connect_session');
  const delegatedInvite=await call('google-invite',{cookie:corporateSession,body:{email:'authorized@gmail.com'}});
  assert.equal(delegatedInvite.statusCode,403);
  const invite=await call('google-invite',{cookie:masterCookie,body:{email:'authorized@gmail.com'}});
  assert.equal(invite.statusCode,201);
  assert.equal(invite.body.user.googlePending,true);
  const invited=await loginGoogle({email:'authorized@gmail.com',sub:'123456789110',hd:null});
  assert.equal(invited.statusCode,200);
  assert.equal(invited.body.user.id,invite.body.user.id);
  assert.equal(invited.body.user.role,'Solicitante');
  const repeatInvitee=await loginGoogle({email:'authorized@gmail.com',sub:'123456789110',hd:null});
  assert.equal(repeatInvitee.statusCode,200);
  const promote=await call('user-update',{cookie:masterCookie,body:{
    id:invite.body.user.id,role:'Administrador',active:true,
  }});
  assert.equal(promote.statusCode,403);
  const forbiddenMaster=await loginGoogle({email:'master@example.invalid',sub:'123456789111',hd:null});
  assert.equal(forbiddenMaster.statusCode,403);

  // Desativacao invalida a sessao e impede novas entradas Google.
  const deactivated=await call('user-update',{cookie:masterCookie,body:{
    id:corporateId,role:'Solicitante',active:false,
  }});
  assert.equal(deactivated.statusCode,200);
  assert.equal((await call('me',{cookie:corporateSession,method:'GET'})).statusCode,401);
  const disabled=await loginGoogle({email:'employee@st1.net.br',sub:'123456789101',hd:'st1.net.br'});
  assert.equal(disabled.statusCode,403);

  const logout=await call('logout',{cookie:masterCookie});
  assert.equal(logout.statusCode,200);
  assert.match(cookieHeader(logout,'st1_connect_session'),/st1_connect_session=$/);

  const audit=JSON.stringify(state.auditTrail);
  assert.ok(state.auditTrail.some(e=>e.action==='google_account_created'));
  assert.ok(state.auditTrail.some(e=>e.action==='google_account_linked'));
  assert.equal(audit.includes('FixtureMasterPassword1234'),false);
  assert.equal(audit.includes('authorized@gmail.com'),false);
  assert.equal(audit.includes('employee@st1.net.br'),false);
  assert.equal(state.users.filter(u=>u.email==='employee@st1.net.br').length,1);
 }finally{
  globalThis.fetch=origFetch;
  for(const key of keys){
   if(previous[key]===undefined)delete process.env[key];
   else process.env[key]=previous[key];
  }
 }
});
