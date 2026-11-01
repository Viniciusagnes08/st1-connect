import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGoogleChallenge,readGoogleChallenge,clearGoogleChallengeCookie} from './google-challenge.js';

const key='fixture-signing-secret-used-only-in-automated-tests';
const now=1793490000;
const rng=()=>Buffer.alloc(24,7);

test('nonce Google e emitido com cookie seguro, sem expor HMAC no payload publico',()=>{
 const {nonce,cookie}=createGoogleChallenge(key,now,rng);
 assert.match(nonce,/^[A-Za-z0-9_-]{32}$/);
 assert.match(cookie,/HttpOnly; Secure; SameSite=Strict; Max-Age=600/);
 assert.match(cookie,/Path=\/api\/auth/);
 assert.equal(readGoogleChallenge(cookie,key,now),nonce);
 assert.equal(readGoogleChallenge('other=abc; '+cookie.split(';')[0],key,now+599),nonce);
 assert.match(clearGoogleChallengeCookie(),/Max-Age=0/);
});

test('assinatura adulterada, ausencia ou cookie expirado nunca autenticam',()=>{
 const {cookie}=createGoogleChallenge(key,now,rng);
 const raw=cookie.split(';')[0];
 const changed=raw.replace(/.$/,raw.endsWith('A')?'B':'A');
 for (const bad of [
   '',undefined,'st1_google_challenge=not-a-token',
   changed,'st1_google_challenge='+raw.split('=')[1].slice(0,-7)+'abcdefg',
 ])assert.throws(()=>readGoogleChallenge(bad,key,now),e=>e.status===401);
 assert.throws(()=>readGoogleChallenge(raw,'wrong-secret',now),e=>e.status===401);
 assert.throws(()=>readGoogleChallenge(raw,key,now+601),e=>e.status===401);
 assert.throws(()=>readGoogleChallenge(raw,key,now-31),e=>e.status===401);
});

test('cada desafio possui a propria nonce e nao admite chave vazia',()=>{
 const first=createGoogleChallenge(key,now,()=>Buffer.alloc(24,4));
 const second=createGoogleChallenge(key,now,()=>Buffer.alloc(24,5));
 assert.notEqual(first.nonce,second.nonce);
 assert.notEqual(first.cookie,second.cookie);
 assert.throws(()=>readGoogleChallenge(first.cookie,'',now),e=>e.status===503);
 assert.throws(()=>createGoogleChallenge('',now,rng),e=>e.status===503);
});
