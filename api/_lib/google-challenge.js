import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const COOKIE_NAME='st1_google_challenge';
const MAX_AGE_SECONDS=600;
const unauthorized=()=>Object.assign(new Error('Validação Google expirada. Atualize a página e tente novamente.'),{status:401});
const unavailable=()=>Object.assign(new Error('Autenticação Google indisponível.'),{status:503});
const mac=(secret,payload)=>createHmac('sha256',secret).update('st1-connect-google-v1:'+payload).digest('base64url');

export function createGoogleChallenge(secret,nowSec=Math.floor(Date.now()/1000),random=randomBytes){
 if(typeof secret!=='string'||!secret)throw unavailable();
 if(!Number.isSafeInteger(nowSec)||nowSec<1)throw unavailable();
 const nonce=random(24).toString('base64url');
 if(!/^[A-Za-z0-9_-]{32}$/.test(nonce))throw unavailable();
 const payload=nonce+'.'+nowSec.toString(36);
 const signed=payload+'.'+mac(secret,payload);
 return {nonce,cookie:COOKIE_NAME+'='+signed+'; Path=/api/auth; HttpOnly; Secure; SameSite=Strict; Max-Age='+MAX_AGE_SECONDS};
}

export function readGoogleChallenge(cookieHeader,secret,nowSec=Math.floor(Date.now()/1000)){
 if(typeof secret!=='string'||!secret)throw unavailable();
 if(typeof cookieHeader!=='string'||cookieHeader.length>8192)throw unauthorized();
 const cookie=cookieHeader.split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE_NAME+'='));
 const value=cookie?.slice(COOKIE_NAME.length+1);
 const matched=/^([A-Za-z0-9_-]{32})\.([0-9a-z]+)\.([A-Za-z0-9_-]{43})$/.exec(value||'');
 if(!matched)throw unauthorized();
 const [,nonce,issuedText,signature]=matched;
 const issued=parseInt(issuedText,36);
 if(!Number.isSafeInteger(issued)||issued<1||nowSec<issued-30||nowSec-issued>MAX_AGE_SECONDS)
   throw unauthorized();
 const expected=mac(secret,nonce+'.'+issuedText);
 const left=Buffer.from(signature),right=Buffer.from(expected);
 if(left.length!==right.length||!timingSafeEqual(left,right))throw unauthorized();
 return nonce;
}

export const clearGoogleChallengeCookie=()=>COOKIE_NAME+'=; Path=/api/auth; HttpOnly; Secure; SameSite=Strict; Max-Age=0';
