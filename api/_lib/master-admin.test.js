import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMasterAdmin } from './master-admin.js';
const env = { ST1_BOOTSTRAP_EMAIL: 'admin@example.invalid' };
test('somente o principal administrador inicial ativo e verificado é master',()=>{
  assert.equal(isMasterAdmin({email:'admin@example.invalid',role:'Administrador',active:true},env),true);
  assert.equal(isMasterAdmin({email:'ADMIN@EXAMPLE.INVALID',role:'Administrador',active:true},env),true);
  assert.equal(isMasterAdmin({email:'admin@example.invalid',role:'Solicitante',active:true},env),false);
  assert.equal(isMasterAdmin({email:'admin@example.invalid',role:'Administrador',active:false},env),false);
  assert.equal(isMasterAdmin({email:'other@example.invalid',role:'Administrador',active:true},env),false);
  assert.equal(isMasterAdmin({email:'admin@example.invalid',role:'Administrador',active:true},{}),false);
  assert.equal(isMasterAdmin(null,env),false);
});
