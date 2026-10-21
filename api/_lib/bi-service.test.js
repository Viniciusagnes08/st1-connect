import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createBiRequest, parseBiInput, canReadRequest,
  validateTransition, validateIdempotencyKey, listMyRequests, getBiTicket } from './bi-service.js';

const actor={id:'user-one',email:'one@example.invalid',role:'Solicitante'};
const input={title:'Corrigir painel de vendas',description:'O indicador de vendas mudou na última atualização.'};
const uuid='00000000-0000-4000-8000-000000000001';

function fakeDatabase() {
  const data={requests:[],tickets:[],events:[],keys:[],locks:[],seq:0};
  const db={query:async (q,values=[])=>{
    if(q.includes('pg_advisory_xact_lock')) {data.locks.push(values[0]);return {rows:[],rowCount:0};}
    if(q.includes('FROM st1_bi.submission_keys k')) {
      const key=data.keys.find(x=>x.actorKey===values[0]&&x.key===values[1]);
      return key ? {rows:[{...key.request,payload_hash:key.hash}],rowCount:1} : {rows:[],rowCount:0};
    }
    if(q.includes('nextval(')) return {rows:[{n:++data.seq}],rowCount:1};
    if(q.includes('INSERT INTO st1_bi.request_records')) {
      const row={id:uuid,protocol:values[0],title:values[4],scope:'BI',created_at:'2026-10-20T18:00:00Z',requester_user_id:values[1],requester_email:values[2]};
      data.requests.push(row);return {rows:[row],rowCount:1};
    }
    if(q.includes('INSERT INTO st1_bi.bi_tickets')) {data.tickets.push(values[0]);return {rows:[],rowCount:1};}
    if(q.includes('INSERT INTO st1_bi.request_events')) {data.events.push(values[0]);return {rows:[],rowCount:1};}
    if(q.includes('INSERT INTO st1_bi.submission_keys')) {
      data.keys.push({actorKey:values[0],key:values[1],request:data.requests[0],hash:values[3]});
      return {rows:[],rowCount:1};
    }
    if(q.includes('FROM st1_bi.request_records r')&&q.includes('requester_user_id=$1')) {
      const rows=data.requests.filter(x=>x.requester_user_id===values[0]);
      return {rows,rowCount:rows.length};
    }
    throw Error('SQL não simulado: '+q.slice(0,60));
  }};
  return {db,data};
}

test('entrada rejeita título curto, descrição insuficiente e usuário falsificado',()=>{
  assert.throws(()=>parseBiInput({...input,title:'x'}),e=>e.status===400);
  assert.throws(()=>parseBiInput({...input,description:'curto'}),e=>e.status===400);
  assert.throws(()=>parseBiInput({...input,requester_user_id:'admin'}),e=>e.status===400);
  assert.throws(()=>validateIdempotencyKey('curta'),e=>e.status===400);
});

test('uma submissão cria um ticket e retry retorna mesmo protocolo', async ()=>{
  const {db,data}=fakeDatabase();
  const key='create-request-0001';
  const first=await createBiRequest(db,actor,input,key);
  const second=await createBiRequest(db,actor,input,key);
  assert.equal(first.protocol,'ST1-000001');
  assert.equal(first.repeated,false);
  assert.equal(second.repeated,true);
  assert.equal(second.protocol,first.protocol);
  assert.equal(data.requests.length,1);
  assert.equal(data.tickets.length,1);
  assert.equal(data.events.length,1);
  assert.equal(data.keys.length,1);
  assert.equal(data.requests[0].requester_email,actor.email);
  await assert.rejects(createBiRequest(db,actor,{...input,title:'Outro painel BI'},key),e=>e.status===409);
});

test('filtro de solicitações pessoais não usa user id do browser',async ()=>{
  const {db,data}=fakeDatabase();
  await createBiRequest(db,actor,input,'request-idempotent-22');
  data.requests.push({...data.requests[0],id:'other',requester_user_id:'other-user'});
  const list=await listMyRequests(db,actor);
  assert.equal(list.length,1);
  assert.equal(list[0].requester_user_id,actor.id);
});

test('leitura de tickets de outra pessoa exige pertencimento ativo ao BI',()=>{
  const record={requester_user_id:'person-two',scope:'BI'};
  assert.equal(canReadRequest(actor,record,false),false);
  assert.equal(canReadRequest({...actor,role:'Técnico'},record,false),false);
  assert.equal(canReadRequest({...actor,role:'Técnico'},record,true),true);
  assert.equal(canReadRequest(actor,{...record,requester_user_id:actor.id},false),true);
  assert.equal(canReadRequest({...actor,role:'Técnico'},{...record,scope:'EXTERNAL'},true),false);
});

test('situações só avançam por transição permitida e motivo obrigatório',()=>{
  assert.equal(validateTransition('Novo','Em atendimento','').state,'Em atendimento');
  assert.throws(()=>validateTransition('Novo','Fechado',''),e=>e.status===409);
  assert.throws(()=>validateTransition('Em atendimento','Resolvido',''),e=>e.status===400);
  assert.equal(validateTransition('Em atendimento','Resolvido','Corrigimos a origem da métrica.').state,'Resolvido');
});


test('detalhe alheio retorna 404 sem revelar a existência do chamado', async () => {
  const other={id:'person-two',role:'Solicitante'};
  const db={query:async (sql) => {
    if(sql.includes('FROM st1_bi.request_records r JOIN st1_bi.bi_tickets'))
      return {rows:[{id:uuid,scope:'BI',requester_user_id:'person-one'}],rowCount:1};
    if(sql.includes('FROM st1_bi.bi_memberships')) return {rows:[],rowCount:0};
    throw Error('Consulta não esperada: '+sql);
  }};
  await assert.rejects(getBiTicket(db,other,uuid),error=>error.status===404);
});

test('membro BI autorizado consegue ler histórico de solicitação de outra conta', async () => {
  const admin={id:'bi-admin',role:'Administrador'};
  const db={query:async(sql) => {
    if(sql.includes('FROM st1_bi.request_records r JOIN st1_bi.bi_tickets'))
      return {rows:[{id:uuid,scope:'BI',requester_user_id:'person-one'}],rowCount:1};
    if(sql.includes('FROM st1_bi.bi_memberships'))
      return {rows:[{user_id:'bi-admin',active:true,bi_role:'manager'}],rowCount:1};
    if(sql.includes('FROM st1_bi.request_events')) return {rows:[{event_type:'created'}],rowCount:1};
    throw Error('Consulta não esperada: '+sql);
  }};
  const result=await getBiTicket(db,admin,uuid);
  assert.equal(result.events[0].event_type,'created');
});
