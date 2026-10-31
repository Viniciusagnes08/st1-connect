import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SERVICE_FORMS, parseServiceInput, validateServiceTransition } from './service-catalog.js';
import { visibleTo, listServiceRequests, getServiceRequest, changeServiceRequest } from './service-service.js';

const owner={id:'owner-1',email:'worker@example.invalid',role:'Solicitante',isMaster:false};
const stranger={id:'another',email:'someone@example.invalid',role:'Solicitante',isMaster:false};
const master={id:'master-1',email:'admin@example.invalid',role:'Administrador',isMaster:true};

test('formulários são definições reais sem dados de demonstração',()=>{
  assert.equal(SERVICE_FORMS.length,2);
  assert.deepEqual(SERVICE_FORMS.map(x=>x.key),['solicitacao-geral','ouvidoria']);
  assert.equal(SERVICE_FORMS[1].confidential,true);
  assert.equal(SERVICE_FORMS[0].confidential,false);
});
test('Ouvidoria sempre é sigilosa e exige categoria aprovada',()=>{
  const input=parseServiceInput({formKey:'ouvidoria',category:'sugestao',title:'Sugestão de processo',description:'Necessitamos de um novo procedimento.'});
  assert.equal(input.area,'ouvidoria');assert.equal(input.confidential,true);
  assert.throws(()=>parseServiceInput({formKey:'ouvidoria',category:'inventado',title:'Assunto completo',description:'Texto grande da solicitação.'}));
  assert.throws(()=>parseServiceInput({formKey:'ouvidoria',area:'ti',category:'sugestao',title:'Assunto completo',description:'Texto grande da solicitação.'}));
});
test('formulário geral valida as áreas de destino e não altera escopo para Ouvidoria',()=>{
  assert.equal(parseServiceInput({formKey:'solicitacao-geral',area:'crm',title:'Revisão do CRM',description:'Necessitamos validar a integração.'}).area,'crm');
  assert.throws(()=>parseServiceInput({formKey:'solicitacao-geral',area:'ouvidoria',title:'Assunto completo',description:'Texto grande da solicitação.'}));
});
test('somente o criador e Master leem solicitação de Ouvidoria',()=>{
  const record={requester_user_id:owner.id,area:'ouvidoria',confidential:true};
  assert.equal(visibleTo(owner,record),true);
  assert.equal(visibleTo(stranger,record),false);
  assert.equal(visibleTo(master,record),true);
  assert.equal(visibleTo({...master,isMaster:false},record),false);
});
test('listagem de toda a empresa exige Master verificado, independente do perfil textual',async()=>{
  const db={query:async()=>({rows:[],rowCount:0})};
  await assert.rejects(()=>listServiceRequests(db,stranger,'all'),e=>e.status===403);
  await assert.rejects(()=>listServiceRequests(db,{...master,isMaster:false},'all'),e=>e.status===403);
  assert.deepEqual(await listServiceRequests(db,master,'all'),[]);
});
test('detalhes ocultam existência de pedido de terceiros',async()=>{
  const uuid='11111111-1111-4111-8111-111111111111';
  const db={query:async()=>({rowCount:1,rows:[{
    id:uuid,requester_user_id:owner.id,area:'ouvidoria',confidential:true,
    title:'Assunto privado',description:'Texto reservado',
  }]})};
  await assert.rejects(()=>getServiceRequest(db,stranger,uuid),e=>e.status===404);
  assert.equal((await getServiceRequest(db,owner,uuid)).request.title,'Assunto privado');
});
test('alterar estado exige Master e transição válida com justificativa',async()=>{
  assert.deepEqual(validateServiceTransition('Novo','Em triagem',''),{state:'Em triagem',reason:''});
  assert.throws(()=>validateServiceTransition('Novo','Fechado',''));
  assert.throws(()=>validateServiceTransition('Em atendimento','Resolvido','curto'));
  const db={query:async(sql)=>sql.includes('FOR UPDATE')
    ? {rowCount:1,rows:[{state:'Novo',area:'crm',confidential:false,requester_user_id:owner.id,assigned_to_user_id:null}]}
    : {rowCount:0,rows:[]}};
  await assert.rejects(()=>changeServiceRequest(db,stranger,'11111111-1111-4111-8111-111111111111','Em triagem'),e=>e.status===403);
});
