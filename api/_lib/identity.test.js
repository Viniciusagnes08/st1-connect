import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createHmac } from 'node:crypto';
import { currentPrincipal, publicDirectory } from './identity.js';

const env={ST1_AUTH_SECRET:'key-test',BLOB_READ_WRITE_TOKEN:'token-test',ST1_BLOB_STORE_ID:'exampleStore12'};
const person={id:'a1',version:2,active:true,email:'pessoa@example.invalid',name:'Pessoa',role:'Solicitante',passwordHash:'private-salt:private-hash'};
function cookie() {
  const payload=Buffer.from(JSON.stringify({uid:'a1',ver:2,exp:Math.floor(Date.now()/1000)+600})).toString('base64url');
  return 'st1_connect_session='+payload+'.'+createHmac('sha256',env.ST1_AUTH_SECRET).update(payload).digest('base64url');
}
const fetchDirectory=async () => ({ok:true,json:async()=>({users:[person]})});

test('API lê identidade do cookie assinado, não do body', async () => {
  const req={headers:{cookie:cookie()},body:{id:'outro',role:'Administrador'}};
  assert.deepEqual(await currentPrincipal(req,env,fetchDirectory),{
    id:'a1',name:'Pessoa',email:'pessoa@example.invalid',role:'Solicitante',active:true,
  });
});
test('sem sessão retorna 401, sem configuração retorna 503', async () => {
  await assert.rejects(currentPrincipal({headers:{}},env,fetchDirectory),e=>e.status===401);
  await assert.rejects(currentPrincipal({headers:{}},{},fetchDirectory),e=>e.status===503);
});
test('listagem não expõe senha ou hash', () => {
  const view=publicDirectory([person])[0];
  assert.equal(view.passwordHash,undefined);
  assert.equal(view.email,'pessoa@example.invalid');
});
