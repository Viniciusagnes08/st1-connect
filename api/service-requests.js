import { loadDirectory } from './_lib/identity.js';
import {allowedDepartment,DEPARTMENT_AREAS} from './_lib/department-access.js';
import {validateDepartmentGrant,saveDepartmentGrant} from './_lib/department-grants.js';
import { currentPrincipal } from './_lib/identity.js';
import { connection, inTransaction } from './_lib/db.js';
import { SERVICE_FORMS } from './_lib/service-catalog.js';
import { createServiceRequest, listServiceRequests, getServiceRequest, changeServiceRequest, assignDepartmentRequest } from './_lib/service-service.js';
import { validWriteOrigin, validateJsonBody, sendError } from './_lib/http.js';

async function departmentHandler(req,res,actor){
 if(req.method==='GET'){
  const db=await connection();
  if(req.query.action==='mine'){
   const data=await db.query('SELECT area,department_role AS role,active FROM st1_services.department_memberships WHERE user_id=$1 AND active=true ORDER BY area',[actor.id]);
   return res.status(200).json({items:data.rows,areas:DEPARTMENT_AREAS});
  }
  if(req.query.action==='assignees'){
   const area=String(req.query.area||'');
   if(!allowedDepartment(area))return res.status(400).json({error:'Departamento inválido.'});
   if(!actor.isMaster){
    const membership=await db.query('SELECT department_role FROM st1_services.department_memberships WHERE user_id=$1 AND area=$2 AND active=true',[actor.id,area]);
    if(!membership.rows.some(x=>['gestor','supervisor'].includes(x.department_role)))return res.status(403).json({error:'Acesso de gestão não autorizado.'});
   }
   const rows=await db.query('SELECT user_id,area,department_role AS role,active FROM st1_services.department_memberships WHERE area=$1 AND active=true',[area]);
   const directory=await loadDirectory();
   return res.status(200).json({items:rows.rows.filter(m=>directory.some(u=>u.id===m.user_id&&u.active)).map(m=>({user_id:m.user_id,area:m.area,role:m.role,active:m.active})),
    users:directory.filter(u=>u.active&&rows.rows.some(m=>m.user_id===u.id)).map(u=>({id:u.id,name:u.name,role:u.role,active:u.active}))});
  }
  if(req.query.action==='department-audit'){
   if(!actor.isMaster||actor.role!=='Administrador')return res.status(403).json({error:'Somente Admin Master.'});
   const logs=await db.query(`SELECT actor_user_id,target_user_id,area,event_type,
     previous_role,next_role,previous_active,next_active,occurred_at
     FROM st1_services.department_access_audit ORDER BY occurred_at DESC,id DESC LIMIT 100`);
   return res.status(200).json({events:logs.rows});
  }
  if(req.query.action==='members'){
   if(!actor.isMaster||actor.role!=='Administrador')return res.status(403).json({error:'Somente Admin Master.'});
   const data=await db.query('SELECT user_id,area,department_role AS role,active,updated_at FROM st1_services.department_memberships ORDER BY area,user_id');
   const accounts=await loadDirectory();
   return res.status(200).json({items:data.rows,users:accounts.map(u=>({id:u.id,name:u.name,role:u.role,active:u.active}))});
  }
  return res.status(400).json({error:'Consulta inválida.'});
 }
 if(req.method==='POST'){
  if(req.query.action!=='department-member')return res.status(405).json({error:'Operação não permitida.'});
  if(!actor.isMaster||actor.role!=='Administrador')return res.status(403).json({error:'Somente Admin Master.'});
  if(!validWriteOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
  const input=validateDepartmentGrant(validateJsonBody(req,2000));
  const directory=await loadDirectory();
  const target=directory.find(u=>u.id===input.userId);
  if(!target)return res.status(404).json({error:'Conta não encontrada.'});
  const saved=await inTransaction(db=>saveDepartmentGrant(db,actor,target,input));
  return res.status(200).json(saved);
 }
 res.setHeader('Allow','GET,POST');return res.status(405).json({error:'Método não permitido.'});
}

function ensureEnabled() {
  if(process.env.ST1_SERVICES_ENABLED!=='true' || !process.env.DATABASE_URL)
    throw Object.assign(new Error('Solicitações multiárea ainda não habilitadas.'),{status:503});
}
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  try {
    ensureEnabled();
    const principal=await currentPrincipal(req);
    if(req.query.action==='mine'||req.query.action==='members'||req.query.action==='assignees'||req.query.action==='department-member'||req.query.action==='department-audit')return departmentHandler(req,res,principal);
    if(req.method==='GET') {
      if(req.query.action==='catalog')return res.status(200).json({forms:SERVICE_FORMS});
      const db=await connection();
      if(req.query.id)return res.status(200).json(await getServiceRequest(db,principal,req.query.id));
      return res.status(200).json({items:await listServiceRequests(db,principal,req.query.view||'mine')});
    }
    if(req.method==='POST') {
      if(!validWriteOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
      const input=validateJsonBody(req,12000);
      const result=await inTransaction(tx=>createServiceRequest(tx,principal,input,req.headers['idempotency-key']));
      return res.status(result.repeated?200:201).json(result);
    }
    if(req.method==='PATCH') {
      if(!validWriteOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
      const input=validateJsonBody(req,3000);
      if(Object.keys(input).some(k=>!['id','state','reason','assignedTo','action'].includes(k)))
        return res.status(400).json({error:'Campos não permitidos.'});
      if(input.action==='assign'){
        if(typeof input.assignedTo!=='string')return res.status(400).json({error:'Responsável inválido.'});
        const activeDirectory=await loadDirectory();
        if(!activeDirectory.some(person=>person.id===input.assignedTo&&person.active===true))return res.status(400).json({error:'Responsável sem conta ativa.'});
        const assigned=await inTransaction(tx=>assignDepartmentRequest(tx,principal,input.id,input.assignedTo));
        return res.status(200).json({request:assigned});
      }
      if(input.action!==undefined)return res.status(400).json({error:'Ação inválida.'});
      const changed=await inTransaction(tx=>changeServiceRequest(tx,principal,input.id,input.state,input.reason||''));
      return res.status(200).json({request:changed});
    }
    res.setHeader('Allow','GET, POST, PATCH');
    return res.status(405).json({error:'Método não permitido.'});
  } catch(error) { return sendError(res,error); }
}
