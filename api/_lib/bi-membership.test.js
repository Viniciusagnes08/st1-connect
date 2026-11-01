import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {isBiStaff,requireBiStaff} from './bi-membership.js';

const membership={user_id:'bi-1',bi_role:'analyst',active:true};

test('cargo técnico sem membership BI não acessa a fila', () => {
  assert.equal(isBiStaff({role:'Técnico'},null),false);
  assert.equal(isBiStaff({role:'Supervisor'},null),false);
  assert.equal(isBiStaff({role:'Solicitante'},membership),false);
  assert.equal(isBiStaff({role:'Técnico'},membership),true);
  assert.equal(isBiStaff({role:'Administrador'}, {...membership,active:false}),false);
});
test('backend valida membership diretamente no banco', async () => {
  const db={query:async()=>({rows:[membership]})};
  assert.deepEqual(await requireBiStaff(db,{id:'bi-1',role:'Técnico'}),membership);
  await assert.rejects(requireBiStaff(db,{id:'bi-1',role:'Solicitante'}),e=>e.status===403);
  await assert.rejects(requireBiStaff({query:async()=>({rows:[]})},{id:'outsider',role:'Supervisor'}),e=>e.status===403);
});
