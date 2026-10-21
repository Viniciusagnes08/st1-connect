import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createHmac } from 'node:crypto';
import { decodeSession, SESSION_COOKIE } from './auth-session.js';

const now = Date.parse('2026-10-20T18:00:00Z');
const user = {id:'user-1',version:2,active:true,role:'Solicitante',passwordHash:'salt:hashed'};
function makeCookie(data, secret = 'test-secret') {
  const payload=Buffer.from(JSON.stringify(data)).toString('base64url');
  const mac=createHmac('sha256',secret).update(payload).digest('base64url');
  return SESSION_COOKIE+'='+payload+'.'+mac;
}

test('sessão assinada e ativa identifica pessoa e perfil do cadastro', () => {
  const cookie=makeCookie({uid:'user-1',ver:2,exp:now/1000+60});
  assert.equal(decodeSession(cookie,'test-secret',[user],now)?.role,'Solicitante');
});
test('sessão recusada quando adulterada, expirada ou revogada', () => {
  const valid=makeCookie({uid:'user-1',ver:2,exp:now/1000+60});
  assert.equal(decodeSession(valid+'x','test-secret',[user],now),null);
  assert.equal(decodeSession(makeCookie({uid:'user-1',ver:2,exp:now/1000-1}),'test-secret',[user],now),null);
  assert.equal(decodeSession(valid,'test-secret',[{...user,version:3}],now),null);
  assert.equal(decodeSession(valid,'test-secret',[{...user,active:false}],now),null);
  assert.equal(decodeSession(valid,'test-secret',[{...user,passwordHash:''}],now),null);
  assert.equal(decodeSession('', 'test-secret',[user],now),null);
});
