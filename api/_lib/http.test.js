import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { validWriteOrigin, validateJsonBody, assertBiEnabled } from './http.js';
test('rejeita envio de outra origem e URL não HTTPS', () => {
  assert.equal(validWriteOrigin({headers:{host:'st1-connect.vercel.app',origin:'https://evil.example.invalid'}},{NODE_ENV:'production'}),false);
  assert.equal(validWriteOrigin({headers:{host:'st1-connect.vercel.app',origin:'https://st1-connect.vercel.app'}},{NODE_ENV:'production'}),true);
  assert.equal(validWriteOrigin({headers:{host:'st1-connect.vercel.app',origin:'http://st1-connect.vercel.app'}},{NODE_ENV:'production'}),false);
});
test('body JSON deve ser objeto limitado', () => {
  assert.deepEqual(validateJsonBody({headers:{'content-type':'application/json'},body:{title:'teste'}}),{title:'teste'});
  assert.throws(()=>validateJsonBody({headers:{'content-type':'text/plain'},body:{}}),e=>e.status===415);
  assert.throws(()=>validateJsonBody({headers:{'content-type':'application/json'},body:{x:'a'.repeat(13000)}}),e=>e.status===413);
});
test('fila não se ativa sem banco e flag explícita', () => {
  assert.throws(()=>assertBiEnabled({BI_CONNECT_ENABLED:'true'}),e=>e.status===503);
  assert.throws(()=>assertBiEnabled({DATABASE_URL:'postgresql://localhost/test'}),e=>e.status===503);
  assert.doesNotThrow(()=>assertBiEnabled({DATABASE_URL:'postgresql://localhost/test',BI_CONNECT_ENABLED:'true'}));
});
