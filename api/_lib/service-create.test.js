import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServiceRequest,changeServiceRequest } from './service-service.js';

const principal={id:'actor-001',email:'member@example.invalid',role:'Solicitante',isMaster:false};
const title='Solicitação real de teste isolado';
const description='Descrição sintética para o teste da lógica transacional.';
const payload={formKey:'solicitacao-geral',area:'crm',title,description};
const id='11111111-1111-4111-8111-111111111111';
function stubDatabase() {
  const calls=[];
  let saved=null;
  const db={
    async query(sql,params=[]) {
      calls.push({sql,params});
      if(sql.includes('pg_advisory_xact_lock'))return {rows:[{}],rowCount:1};
      if(sql.includes('FROM st1_services.submission_keys k'))
        return {rows:saved?[{request_id:id,protocol:saved.protocol,area:saved.area,title:saved.title,payload_hash:saved.digest}]:[],rowCount:saved?1:0};
      if(sql.includes("nextval('st1_services.protocol_seq')"))return {rows:[{n:12}],rowCount:1};
      if(sql.includes('INSERT INTO st1_services.requests')){
        const [protocol,user,email,area,category,recordTitle,body,confidential]=params;
        assert.equal(user,principal.id);
        assert.equal(email,principal.email);
        assert.equal(confidential,false);
        assert.equal(category,'solicitacao-geral');
        assert.equal(body,description);
        saved={protocol,area,title:recordTitle};
        return {rows:[{id,protocol,area,title:recordTitle,state:'Novo',created_at:new Date().toISOString()}],rowCount:1};
      }
      if(sql.includes('INSERT INTO st1_services.request_events'))return {rows:[],rowCount:1};
      if(sql.includes('INSERT INTO st1_services.submission_keys')){
        saved.digest=params[3];
        return {rows:[],rowCount:1};
      }
      throw Error('Unexpected SQL '+sql.slice(0,90));
    },
  };
  return {db,calls,getSaved:()=>saved};
}

test('registro de solicitação mantém usuário de sessão, protocolo, área e histórico reais',async()=>{
  const {db,calls,getSaved}=stubDatabase();
  const result=await createServiceRequest(db,principal,payload,'unique_request_key_123456');
  assert.equal(result.id,id);
  assert.equal(result.protocol,'ST1-S-000012');
  assert.equal(result.area,'crm');
  assert.equal(result.repeated,false);
  assert.equal(getSaved().title,title);
  assert.equal(calls.filter(c=>c.sql.includes('INSERT INTO st1_services.requests')).length,1);
  assert.equal(calls.filter(c=>c.sql.includes('INSERT INTO st1_services.request_events')).length,1);
  assert.equal(calls.filter(c=>c.sql.includes('INSERT INTO st1_services.submission_keys')).length,1);
});

test('mesma chave de idempotência não duplica chamados e não aceita payload diferente',async()=>{
  const {db,calls}=stubDatabase();
  await createServiceRequest(db,principal,payload,'unique_request_key_123456');
  const second=await createServiceRequest(db,principal,payload,'unique_request_key_123456');
  assert.equal(second.repeated,true);
  assert.equal(second.protocol,'ST1-S-000012');
  assert.equal(calls.filter(c=>c.sql.includes('INSERT INTO st1_services.requests')).length,1);
  await assert.rejects(()=>createServiceRequest(db,principal,{...payload,title:'Assunto diferente de teste'},'unique_request_key_123456'),e=>e.status===409);
});

test('atualização de atendimento exige Master autenticado e registra a transição',async()=>{
  const master={...principal,role:'Administrador',isMaster:true};
  const calls=[];
  const db={query:async(sql,params=[])=>{
    calls.push({sql,params});
    if(sql.includes('FOR UPDATE'))return {rowCount:1,rows:[{state:'Novo'}]};
    if(sql.includes('UPDATE st1_services.requests'))return {rowCount:1,rows:[{id,protocol:'ST1-S-000012',area:'geral',state:'Em triagem'}]};
    if(sql.includes('INSERT INTO st1_services.request_events'))return {rowCount:1,rows:[]};
    throw Error('Unexpected SQL '+sql.slice(0,90));
  }};
  await assert.rejects(()=>changeServiceRequest(db,principal,id,'Em triagem'),e=>e.status===403);
  assert.equal(calls.length,0);
  const saved=await changeServiceRequest(db,master,id,'Em triagem','Iniciamos a análise');
  assert.equal(saved.state,'Em triagem');
  assert.equal(calls.filter(c=>c.sql.includes('UPDATE st1_services.requests')).length,1);
  assert.equal(calls.filter(c=>c.sql.includes('INSERT INTO st1_services.request_events')).length,1);
});
