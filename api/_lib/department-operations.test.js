import {test} from 'node:test';
import assert from 'node:assert/strict';
import {listServiceRequests,getServiceRequest,changeServiceRequest,assignDepartmentRequest} from './service-service.js';

const id='11111111-1111-4111-8111-111111111111';
const requester={id:'req',role:'Solicitante',isMaster:false};
const master={id:'master',role:'Administrador',isMaster:true};
const manager={id:'manager',role:'Supervisor',isMaster:false};
const executor={id:'worker',role:'Técnico',isMaster:false};
const outsider={id:'outsider',role:'Administrador',isMaster:false};
const member=(user,area='crm',role='executor',active=true)=>({
  user_id:user.id,area,department_role:role,active
});
const baseRecord={id,protocol:'ST1-S-000001',state:'Novo',area:'crm',
  confidential:false,requester_user_id:requester.id,assigned_to_user_id:executor.id,
  description:'Solicitação sintética de teste',title:'Ajustar integração'};
function fixture(members=[],record=baseRecord){
  const calls=[];
  const query=async(sql,params=[])=>{
    calls.push({sql,params});
    if(sql.includes('FROM st1_services.department_memberships')){
      const [uid,area]=params;
      const rows=members.filter(x=>x.user_id===uid&&x.area===area&&x.active);
      return {rowCount:rows.length,rows};
    }
    if(sql.includes('FROM st1_services.requests')){
      if(sql.includes('FOR UPDATE')||sql.includes('WHERE id=$1')){
        return {rowCount:1,rows:[record]};
      }
      return {rowCount:0,rows:[]};
    }
    if(sql.includes('UPDATE st1_services.requests')){
      return {rowCount:1,rows:[{...record,state:params[1],assigned_to_user_id:params[1]}]};
    }
    if(sql.includes('INSERT INTO st1_services.request_events'))return {rowCount:1,rows:[]};
    if(sql.includes('FROM st1_services.request_events'))return {rowCount:0,rows:[]};
    throw new Error('Consulta inesperada no teste.');
  };
  return {query,calls};
}
test('gestor acessa somente departamento de que é membro ativo',async()=>{
  const db=fixture([member(manager,'crm','gestor')]);
  const list=await listServiceRequests(db,manager,'department:crm');
  assert.deepEqual(list,[]);
  const q=db.calls.find(x=>x.sql.includes('FROM st1_services.requests'));
  assert.match(q.sql,/WHERE area=\$1 AND confidential=false/);
  assert.deepEqual(q.params,['crm','gestor','manager']);
  await assert.rejects(()=>listServiceRequests(db,manager,'department:ti'),e=>e.status===403);
  await assert.rejects(()=>listServiceRequests(db,outsider,'department:crm'),e=>e.status===403);
  await assert.rejects(()=>listServiceRequests(db,manager,'all'),e=>e.status===403);
});
test('executor consulta apenas chamados atribuídos; revogação elimina permissão',async()=>{
  const assigned=fixture([member(executor)]);
  await listServiceRequests(assigned,executor,'department:crm');
  const q=assigned.calls.find(x=>x.sql.includes('FROM st1_services.requests'));
  assert.match(q.sql,/assigned_to_user_id=\$3/);
  assert.deepEqual(q.params,['crm','executor',executor.id]);
  assert.equal((await getServiceRequest(assigned,executor,id)).request.id,id);
  const unassigned=fixture([member(executor)],{...baseRecord,assigned_to_user_id:'other'});
  await assert.rejects(()=>getServiceRequest(unassigned,executor,id),e=>e.status===404);
  const revoked=fixture([member(executor,'crm','executor',false)]);
  await assert.rejects(()=>listServiceRequests(revoked,executor,'department:crm'),e=>e.status===403);
  await assert.rejects(()=>getServiceRequest(revoked,executor,id),e=>e.status===404);
});
test('somente dono e Master acessam Ouvidoria, mesmo quando existe membership da área',async()=>{
  const db=fixture([member(manager,'crm','gestor')],{...baseRecord,confidential:true});
  await assert.rejects(()=>getServiceRequest(db,manager,id),e=>e.status===404);
  assert.equal((await getServiceRequest(db,requester,id)).request.id,id);
  assert.equal((await getServiceRequest(db,master,id)).request.id,id);
  await assert.rejects(()=>changeServiceRequest(db,manager,id,'Em triagem'),e=>e.status===403);
  await assert.rejects(()=>assignDepartmentRequest(db,master,id,executor.id),e=>e.status===403);
  assert.equal(db.calls.some(x=>x.sql.includes('UPDATE st1_services.requests')),false);
});
test('gestor altera estado e atribui executor somente quando há membership ativo',async()=>{
  const db=fixture([member(manager,'crm','gestor'),member(executor)]);
  const result=await changeServiceRequest(db,manager,id,'Em triagem','Atendimento iniciado');
  assert.equal(result.id,id);
  const event=db.calls.find(x=>x.sql.includes('INSERT INTO st1_services.request_events'));
  assert.deepEqual(JSON.parse(event.params[2]),{from:'Novo',to:'Em triagem',reason:'Atendimento iniciado'});
  const assign=await assignDepartmentRequest(db,manager,id,executor.id);
  assert.equal(assign.id,id);
  assert.equal(db.calls.filter(x=>x.sql.includes('UPDATE st1_services.requests')).length,2);
  const blocked=fixture([member(manager,'crm','gestor'),member(executor,'crm','executor',false)]);
  await assert.rejects(()=>assignDepartmentRequest(blocked,manager,id,executor.id),e=>e.status===400);
  assert.equal(blocked.calls.some(x=>x.sql.includes('UPDATE st1_services.requests')),false);
});
test('executor não pode atribuir e não pode alterar chamado de outra pessoa',async()=>{
  const db=fixture([member(executor)],{...baseRecord,assigned_to_user_id:'other'});
  await assert.rejects(()=>assignDepartmentRequest(db,executor,id,manager.id),e=>e.status===403);
  await assert.rejects(()=>changeServiceRequest(db,executor,id,'Em triagem'),e=>e.status===403);
  assert.equal(db.calls.filter(x=>x.sql.includes('INSERT INTO st1_services.request_events')).length,0);
  assert.equal(db.calls.filter(x=>x.sql.includes('UPDATE st1_services.requests')).length,0);
});
test('Master conserva visão geral sem depender de membership departamental',async()=>{
  const db=fixture();
  assert.deepEqual(await listServiceRequests(db,master,'all'),[]);
  assert.equal((await getServiceRequest(db,master,id)).request.id,id);
});
