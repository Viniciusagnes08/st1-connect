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

import { isMasterIdentity, canCreateAccount, canUpdateAccount, canUpdateBiMembership } from './master-admin.js';

const master = {id:'owner',email:'admin@example.invalid',role:'Administrador',active:true};
const delegated = {id:'delegate',email:'delegate@example.invalid',role:'Administrador',active:true};
const agent = {id:'agent',email:'agent@example.invalid',role:'Técnico',active:true};

test('administrador delegado cria apenas perfis nao administrativos',()=>{
  assert.equal(canCreateAccount(master,'Administrador',env),true);
  assert.equal(canCreateAccount(delegated,'Administrador',env),false);
  assert.equal(canCreateAccount(delegated,'Técnico',env),true);
  assert.equal(canCreateAccount(agent,'Técnico',env),false);
});

test('Master nao pode ser desativado ou demovido, inclusive pelo proprio Master',()=>{
  assert.equal(isMasterIdentity(master,env),true);
  assert.equal(canUpdateAccount(delegated,master,'Administrador',true,env),false);
  assert.equal(canUpdateAccount(delegated,master,'Administrador',false,env),false);
  assert.equal(canUpdateAccount(master,master,'Técnico',true,env),false);
  assert.equal(canUpdateAccount(master,master,'Administrador',false,env),false);
  assert.equal(canUpdateAccount(master,master,'Administrador',true,env),true);
});

test('apenas Master altera outra conta Administrador ou eleva perfil para Administrador',()=>{
  assert.equal(canUpdateAccount(delegated,delegated,'Administrador',true,env),false);
  assert.equal(canUpdateAccount(delegated,agent,'Administrador',true,env),false);
  assert.equal(canUpdateAccount(delegated,agent,'Supervisor',true,env),true);
  assert.equal(canUpdateAccount(master,delegated,'Técnico',true,env),true);
  assert.equal(canUpdateAccount(master,agent,'Administrador',true,env),true);
});

test('associacao BI da conta Master nao pode ser editada por Administrador delegado',()=>{
  assert.equal(canUpdateBiMembership(delegated,master,env),false);
  assert.equal(canUpdateBiMembership(master,master,env),true);
  assert.equal(canUpdateBiMembership(delegated,agent,env),true);
});
