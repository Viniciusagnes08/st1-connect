// Teste de fluxo ponta a ponta em memoria. Nao cria usuarios ou chamados no Supabase.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
 createServiceRequest,listServiceRequests,getServiceRequest,
 assignDepartmentRequest,changeServiceRequest,
} from './service-service.js';
import {saveDepartmentGrant} from './department-grants.js';

const master={id:'qa-master',email:'master@example.invalid',role:'Administrador',isMaster:true,active:true};
const owner={id:'qa-requester',email:'requester@example.invalid',role:'Solicitante',isMaster:false,active:true};
const manager={id:'qa-manager',email:'manager@example.invalid',role:'Supervisor',isMaster:false,active:true};
const worker={id:'qa-worker',email:'worker@example.invalid',role:'Técnico',isMaster:false,active:true};
const outsider={id:'qa-outsider',email:'outsider@example.invalid',role:'Administrador',isMaster:false,active:true};
const principalTarget=user=>({id:user.id,active:true,role:user.role});
function qaDb(){
 const records=new Map(),memberships=new Map(),submissions=new Map(),events=[],audit=[];
 let seq=0;
 const membershipKey=(id,area)=>id+':'+area;
 const asResult=rows=>({rows,rowCount:rows.length});
 const query=async(sql,params=[])=>{
  if(sql.includes('pg_advisory_xact_lock'))return asResult([{}]);
  if(sql.includes("nextval('st1_services.protocol_seq')"))return asResult([{n:++seq}]);
  if(sql.includes('FROM st1_services.submission_keys k')){
   const key=params.join(':');
   return asResult(submissions.has(key)?[submissions.get(key)]:[]);
  }
  if(sql.includes('INSERT INTO st1_services.requests')){
   const [protocol,requester_user_id,requester_email,area,category,title,description,confidential]=params;
   const id='00000000-0000-4000-8000-'+String(seq).padStart(12,'0');
   const record={id,protocol,requester_user_id,requester_email,area,category,title,description,
    confidential,state:'Novo',assigned_to_user_id:null,created_at:new Date().toISOString()};
   records.set(id,record);
   return asResult([record]);
  }
  if(sql.includes('INSERT INTO st1_services.request_events')){
   const [request_id,actor_user_id,payload]=params;
   events.push({request_id,actor_user_id,payload:JSON.parse(payload)});
   return asResult([{}]);
  }
  if(sql.includes('INSERT INTO st1_services.submission_keys')){
   const [actor,idempotency_key,request_id,payload_hash]=params;
   const record=records.get(request_id);
   submissions.set(actor+':'+idempotency_key,{
    request_id,protocol:record.protocol,area:record.area,title:record.title,payload_hash});
   return asResult([{}]);
  }
  if(sql.includes('FROM st1_services.department_memberships')){
   const [id,area]=params;
   const member=memberships.get(membershipKey(id,area));
   return asResult(member&&(!sql.includes('active=true')||member.active)?[member]:[]);
  }
  if(sql.includes('INSERT INTO st1_services.department_memberships')){
   const [user_id,area,department_role,active]=params;
   const row={user_id,area,department_role,role:department_role,active};
   memberships.set(membershipKey(user_id,area),row);
   return asResult([row]);
  }
  if(sql.includes('INSERT INTO st1_services.department_access_audit')){
   audit.push({actor:params[0],target:params[1],area:params[2],type:params[3]});
   return asResult([{}]);
  }
  if(sql.includes('SELECT')&&sql.includes('FROM st1_services.requests')){
   let rows=[...records.values()];
   if(sql.includes('WHERE id=$1'))rows=rows.filter(r=>r.id===params[0]);
   else if(sql.includes('WHERE requester_user_id=$1'))rows=rows.filter(r=>r.requester_user_id===params[0]);
   else if(sql.includes('WHERE area=$1')){
    rows=rows.filter(r=>r.area===params[0]&&!r.confidential);
    if(params.length===3&&!['gestor','supervisor'].includes(params[1]))
      rows=rows.filter(r=>r.assigned_to_user_id===params[2]);
   }
   return asResult(rows);
  }
  if(sql.includes('FROM st1_services.request_events')){
   return asResult(events.filter(e=>e.request_id===params[0]));
  }
  if(sql.includes('UPDATE st1_services.requests SET state=$2')){
   const row=records.get(params[0]);
   row.state=params[1];return asResult([row]);
  }
  if(sql.includes('UPDATE st1_services.requests SET assigned_to_user_id=$2')){
   const row=records.get(params[0]);
   row.assigned_to_user_id=params[1];return asResult([row]);
  }
  throw Error('SQL nao implementado no fixture: '+sql.slice(0,75));
 };
 return {query,records,memberships,events,audit};
}

test('fluxo completo simulado: solicitante -> gestor -> executor -> revogação -> Ouvidoria',async()=>{
 const db=qaDb();
 const request=await createServiceRequest(db,owner,{
  formKey:'solicitacao-geral',area:'crm',title:'Ajustar integração',
  description:'Solicitar revisão de uma integração em homologação.',
 },'qa-flow-request-00001');
 assert.equal(request.area,'crm');
 assert.equal((await listServiceRequests(db,owner,'mine')).length,1);
 assert.equal((await listServiceRequests(db,master,'all')).length,1);
 assert.equal(db.events.length,1);

 for(const [person,role] of [[manager,'gestor'],[worker,'executor']]){
  const created=await saveDepartmentGrant(db,master,principalTarget(person),{
   userId:person.id,area:'crm',role,active:true,
  });
  assert.equal(created.changed,true);
 }
 assert.deepEqual(db.audit.map(x=>x.type),['granted','granted']);
 assert.equal((await listServiceRequests(db,manager,'department:crm')).length,1);
 assert.equal((await listServiceRequests(db,worker,'department:crm')).length,0);
 await assert.rejects(()=>listServiceRequests(db,outsider,'department:crm'),e=>e.status===403);
 await assert.rejects(()=>listServiceRequests(db,manager,'department:ti'),e=>e.status===403);

 const assigned=await assignDepartmentRequest(db,manager,request.id,worker.id);
 assert.equal(assigned.assigned_to_user_id,worker.id);
 assert.equal((await listServiceRequests(db,worker,'department:crm')).length,1);
 assert.equal((await getServiceRequest(db,worker,request.id)).request.id,request.id);
 const updated=await changeServiceRequest(db,worker,request.id,'Em triagem','Triagem do chamado');
 assert.equal(updated.state,'Em triagem');
 assert.equal((await getServiceRequest(db,owner,request.id)).request.state,'Em triagem');

 const revoked=await saveDepartmentGrant(db,master,principalTarget(worker),{
  userId:worker.id,area:'crm',role:'executor',active:false,
 });
 assert.equal(revoked.membership.active,false);
 assert.equal(db.audit.at(-1).type,'revoked');
 await assert.rejects(()=>getServiceRequest(db,worker,request.id),e=>e.status===404);
 await assert.rejects(()=>listServiceRequests(db,worker,'department:crm'),e=>e.status===403);
 await assert.rejects(()=>changeServiceRequest(db,worker,request.id,'Em atendimento'),e=>e.status===403);
 assert.equal((await getServiceRequest(db,manager,request.id)).request.state,'Em triagem');

 const privateRequest=await createServiceRequest(db,owner,{
  formKey:'ouvidoria',category:'reclamacao',title:'Relato reservado',
  description:'Relato reservado de homologação para a Ouvidoria.',
 },'qa-private-request-0002');
 assert.equal((await getServiceRequest(db,owner,privateRequest.id)).request.area,'ouvidoria');
 assert.equal((await getServiceRequest(db,master,privateRequest.id)).request.confidential,true);
 await assert.rejects(()=>getServiceRequest(db,manager,privateRequest.id),e=>e.status===404);
 await assert.rejects(()=>getServiceRequest(db,outsider,privateRequest.id),e=>e.status===404);
 await assert.rejects(()=>assignDepartmentRequest(db,master,privateRequest.id,manager.id),e=>e.status===403);
 assert.equal((await listServiceRequests(db,manager,'department:crm')).length,1);
 assert.equal((await listServiceRequests(db,owner,'mine')).length,2);
 assert.equal((await listServiceRequests(db,master,'all')).length,2);
 assert.equal(db.audit.length,3,'Auditoria departamental inclui somente concessoes/revogacao');
});
