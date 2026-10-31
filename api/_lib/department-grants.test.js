import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateDepartmentGrant,classifyGrantEvent,saveDepartmentGrant} from './department-grants.js';

const master={id:'master-test',role:'Administrador',isMaster:true};
const delegated={id:'delegated-test',role:'Administrador',isMaster:false};
const user={id:'user-test',name:'Usuário QA',active:true,role:'Solicitante'};
const grant={userId:user.id,area:'crm',role:'executor',active:true};
function fixture(){
 let membership=null;
 const events=[],statements=[];
 return {
   events,statements,
   get membership(){return membership;},
   async query(sql,params=[]){
     statements.push({sql,params});
     if(sql.includes('pg_advisory_xact_lock'))return {rowCount:1,rows:[{}]};
     if(sql.includes('SELECT user_id,area,department_role,active FROM st1_services.department_memberships')){
       return {rowCount:membership?1:0,rows:membership?[{...membership}]:[]};
     }
     if(sql.includes('INSERT INTO st1_services.department_memberships')){
       const [user_id,area,department_role,active]=params;
       membership={user_id,area,department_role,active};
       return {rowCount:1,rows:[{user_id,area,role:department_role,active}]};
     }
     if(sql.includes('INSERT INTO st1_services.department_access_audit')){
       events.push({
         actor:params[0],target:params[1],area:params[2],type:params[3],
         previousRole:params[4],nextRole:params[5],
         previousActive:params[6],nextActive:params[7],
       });
       return {rowCount:1,rows:[]};
     }
     throw new Error('SQL inesperado para concessão de acesso.');
   }
 };
}
test('validação rejeita elevação por campos extras ou valores inválidos',()=>{
 assert.deepEqual(validateDepartmentGrant(grant),grant);
 for(const invalid of [
   {...grant,isMaster:true},{...grant,userId:' '},
   {...grant,userId:'user '},{...grant,area:'ouvidoria'},
   {...grant,area:'outra'},{...grant,role:'Administrador'},
   {...grant,active:'true'},{...grant,role:'gestor',origin:'client'},
 ])assert.throws(()=>validateDepartmentGrant(invalid));
});
test('apenas Master cria ou revoga membros, sem modificar DB em tentativas negadas',async()=>{
 const db=fixture();
 await assert.rejects(()=>saveDepartmentGrant(db,delegated,user,grant),e=>e.status===403);
 await assert.rejects(()=>saveDepartmentGrant(db,{...master,isMaster:false},user,grant),e=>e.status===403);
 await assert.rejects(()=>saveDepartmentGrant(db,master,{...user,id:'other'},grant),e=>e.status===404);
 await assert.rejects(()=>saveDepartmentGrant(db,master,{...user,active:false},grant),e=>e.status===404);
 await assert.rejects(()=>saveDepartmentGrant(db,master,{...master,active:true},{...grant,userId:master.id}),e=>e.status===400);
 await assert.rejects(()=>saveDepartmentGrant(db,master,user,{...grant,active:false}),e=>e.status===400);
 assert.equal(db.statements.length,0);
 assert.equal(db.membership,null);
 assert.equal(db.events.length,0);
});
test('concessão, troca de função, revogação e reativação geram auditoria ordenada',async()=>{
 const db=fixture();
 let saved=await saveDepartmentGrant(db,master,user,grant);
 assert.equal(saved.changed,true);
 assert.deepEqual(saved.membership,{user_id:user.id,area:'crm',role:'executor',active:true});
 saved=await saveDepartmentGrant(db,master,user,grant);
 assert.equal(saved.changed,false);
 assert.equal(db.events.length,1,'Não gerar evento para atualização idempotente');
 saved=await saveDepartmentGrant(db,master,user,{...grant,role:'gestor'});
 assert.equal(saved.membership.role,'gestor');
 await saveDepartmentGrant(db,master,user,{...grant,role:'gestor',active:false});
 assert.equal(db.membership.active,false);
 await saveDepartmentGrant(db,master,user,{...grant,role:'supervisor'});
 assert.deepEqual(db.events.map(x=>x.type),['granted','role_changed','revoked','reactivated']);
 assert.deepEqual(db.events[0],{
   actor:master.id,target:user.id,area:'crm',type:'granted',
   previousRole:null,nextRole:'executor',previousActive:null,nextActive:true,
 });
 assert.equal(db.events[2].nextActive,false);
 assert.equal(db.events[3].previousActive,false);
 assert.equal(db.events[3].nextRole,'supervisor');
 for(const e of db.events)assert.equal(Object.hasOwn(e,'email'),false);
});
test('revogação é permitida mesmo com conta desativada, mas reativação é negada',async()=>{
 const db=fixture();
 await saveDepartmentGrant(db,master,user,grant);
 await saveDepartmentGrant(db,master,{...user,active:false},{...grant,active:false});
 assert.equal(db.membership.active,false);
 await assert.rejects(()=>saveDepartmentGrant(db,master,{...user,active:false},grant),e=>e.status===404);
});
test('classificação de eventos não registra escrita quando não houve alteração',()=>{
 assert.equal(classifyGrantEvent(null,{...grant,active:false}),null);
 assert.equal(classifyGrantEvent({department_role:'executor',active:true},grant),null);
 assert.equal(classifyGrantEvent({department_role:'gestor',active:true},grant),'role_changed');
 assert.equal(classifyGrantEvent({department_role:'gestor',active:false},grant),'reactivated');
 assert.equal(classifyGrantEvent({department_role:'executor',active:true},{...grant,active:false}),'revoked');
});
