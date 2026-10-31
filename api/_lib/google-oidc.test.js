import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { verifyGoogleCredential, googleIdentityAllowed, googleReturningIdentityAllowed } from './google-oidc.js';

const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const clientId='123456789000-test.apps.googleusercontent.com';
const jwk=publicKey.export({format:'jwk'});
const timestamp=Math.floor(Date.now()/1000);
const base={
  iss:'https://accounts.google.com',aud:clientId,sub:'12345678901234567890',
  email:'worker@st1.net.br',email_verified:true,hd:'st1.net.br',
  name:'Test Worker',iat:timestamp-30,exp:timestamp+3600,
};
const fetcher=async()=>new Response(JSON.stringify({keys:[{...jwk,kid:'test-key',alg:'RS256',use:'sig'}]}),{
  headers:{'cache-control':'public,max-age=300','content-type':'application/json'}
});
const jwt=(payload=base)=>{
  const head=Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT',kid:'test-key'})).toString('base64url');
  const body=Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signed=head+'.'+body;
  return signed+'.'+sign('RSA-SHA256',Buffer.from(signed),privateKey).toString('base64url');
};
test('assinatura e claims verificadas de um token Google sintético',async()=>{
  const parsed=await verifyGoogleCredential(jwt(),clientId,fetcher,timestamp);
  assert.equal(parsed.email,base.email);
  assert.equal(parsed.sub,base.sub);
  assert.equal(parsed.hostedDomain,'st1.net.br');
  assert.equal(googleIdentityAllowed(parsed,null,{}),true);
});
test('token com claims adulteradas sem nova assinatura não é aceito',async()=>{
  const original=jwt();
  const [head,body,sig]=original.split('.');
  const forged=Buffer.from(JSON.stringify({...base,email:'owner@st1.net.br'})).toString('base64url');
  await assert.rejects(()=>verifyGoogleCredential([head,forged,sig].join('.'),clientId,fetcher,timestamp));
  assert.equal(typeof body,'string');
});
test('wrong audience, issuer, email não verificado e validade vencida são recusados',async()=>{
  const wrong=[
    {...base,aud:'another-client.apps.googleusercontent.com'},
    {...base,iss:'https://evil.invalid'},
    {...base,email_verified:false},
    {...base,exp:timestamp-1},
    {...base,iat:timestamp+1000},
  ];
  for(const payload of wrong)
    await assert.rejects(()=>verifyGoogleCredential(jwt(payload),clientId,fetcher,timestamp));
});
test('domínios públicos e e-mails externos só entram mediante convite corporativo válido',()=>{
  const corporate={email:'worker@st1.net.br',hostedDomain:'st1.net.br'};
  assert.equal(googleIdentityAllowed(corporate,null,{}),true);
  assert.equal(googleIdentityAllowed({...corporate,hostedDomain:null},null,{}),false);
  const gmail={email:'worker@gmail.com',hostedDomain:null};
  assert.equal(googleIdentityAllowed(gmail,null,{}),false);
  assert.equal(googleIdentityAllowed(gmail,{email:'worker@gmail.com',role:'Solicitante',googlePending:true,active:true},{}),true);
  assert.equal(googleIdentityAllowed(gmail,{email:'worker@gmail.com',role:'Administrador',googlePending:true,active:true},{}),false);
  assert.equal(googleIdentityAllowed(gmail,{email:'worker@gmail.com',role:'Solicitante',googlePending:false,active:true},{}),false);
});

test('nonce assinada impede token valido de outra tentativa de login',async()=>{
 const nonce='mock-challenge-nonce-0123456789abcd';
 await assert.rejects(
  ()=>verifyGoogleCredential(jwt(base),clientId,fetcher,timestamp,nonce),
  e=>e.status===401
 );
 const allowed=await verifyGoogleCredential(jwt({...base,nonce}),clientId,fetcher,timestamp,nonce);
 assert.equal(allowed.email,'worker@st1.net.br');
 await assert.rejects(
  ()=>verifyGoogleCredential(jwt({...base,nonce:'wrong-nonce'}),clientId,fetcher,timestamp,nonce),
  e=>e.status===401
 );
});
test('conta Google ja vinculada exige dominio corporativo atual ou Gmail convidado',()=>{
 const linked={id:'abc',email:'worker@st1.net.br',googleSub:base.sub,googleAuthOnly:true,active:true,role:'Supervisor'};
 const identity={sub:base.sub,email:'worker@st1.net.br',hostedDomain:'st1.net.br'};
 assert.equal(googleReturningIdentityAllowed(identity,linked,{}),true);
 assert.equal(googleReturningIdentityAllowed({...identity,hostedDomain:null},linked,{}),false);
 assert.equal(googleReturningIdentityAllowed({...identity,hostedDomain:'outro.com'},linked,{}),false);
 assert.equal(googleReturningIdentityAllowed({...identity,sub:'9999999999'},linked,{}),false);
 assert.equal(googleReturningIdentityAllowed(identity,{...linked,active:false},{}),false);
 assert.equal(googleReturningIdentityAllowed(identity,{...linked,googleAuthOnly:false},{}),false);
 assert.equal(googleReturningIdentityAllowed(identity,linked,{ST1_GOOGLE_WORKSPACE_DOMAIN:'other.com'}),false);
 const gmail={sub:'44444444444',email:'testuser@gmail.com',hostedDomain:null};
 const invitation={id:'invited',email:'testuser@gmail.com',googleSub:gmail.sub,googleAuthOnly:true,active:true,role:'Solicitante'};
 assert.equal(googleReturningIdentityAllowed(gmail,invitation,{}),true);
 assert.equal(googleReturningIdentityAllowed(gmail,{...invitation,role:'Administrador'},{}),false);
 assert.equal(googleReturningIdentityAllowed({...gmail,hostedDomain:'some-company.com'},invitation,{}),false);
});
