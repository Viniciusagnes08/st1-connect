import { currentPrincipal, loadDirectory } from './_lib/identity.js';
import { connection, inTransaction } from './_lib/db.js';
import { allowedDepartment, DEPARTMENT_AREAS, DEPARTMENT_ROLES } from './_lib/department-access.js';
import { validWriteOrigin, validateJsonBody, sendError } from './_lib/http.js';

export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 try{
  if(process.env.ST1_SERVICES_ENABLED!=='true')throw Object.assign(new Error('Módulo não habilitado.'),{status:503});
  const actor=await currentPrincipal(req);
  if(req.method==='GET'){
   const db=await connection();
   if(req.query?.action==='mine'){
    const data=await db.query('SELECT area,department_role AS role,active FROM st1_services.department_memberships WHERE user_id=$1 AND active=true ORDER BY area',[actor.id]);
    return res.status(200).json({items:data.rows,areas:DEPARTMENT_AREAS});
   }
   if(req.query?.action==='members'){
    if(!actor.isMaster) return res.status(403).json({error:'Somente Admin Master.'});
    const data=await db.query('SELECT user_id,area,department_role AS role,active,updated_at FROM st1_services.department_memberships ORDER BY area,user_id');
    const accounts=await loadDirectory();
    return res.status(200).json({items:data.rows,users:accounts.map(u=>({id:u.id,name:u.name,role:u.role,active:u.active}))});
   }
   return res.status(400).json({error:'Consulta inválida.'});
  }
  if(req.method==='POST'){
   if(!actor.isMaster)return res.status(403).json({error:'Somente Admin Master.'});
   if(!validWriteOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
   const body=validateJsonBody(req,2000);
   if(!body||typeof body.userId!=='string'||!allowedDepartment(body.area)||!DEPARTMENT_ROLES.includes(body.role)||typeof body.active!=='boolean')
    return res.status(400).json({error:'Associação inválida.'});
   const directory=await loadDirectory();
   const target=directory.find(u=>u.id===body.userId);
   if(!target||!target.active&&body.active)return res.status(404).json({error:'Conta ativa não encontrada.'});
   if(target.id===actor.id)return res.status(400).json({error:'O Master não necessita de vínculo departamental.'});
   const result=await inTransaction(async db=>{
    const changed=await db.query(`INSERT INTO st1_services.department_memberships(user_id,area,department_role,active,granted_by)
      VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,area) DO UPDATE
      SET department_role=EXCLUDED.department_role,active=EXCLUDED.active,granted_by=EXCLUDED.granted_by,updated_at=now()
      RETURNING user_id,area,department_role AS role,active`,[target.id,body.area,body.role,body.active,actor.id]);
    return changed.rows[0];
   });
   return res.status(200).json({membership:result});
  }
  res.setHeader('Allow','GET, POST');return res.status(405).json({error:'Método não permitido.'});
 }catch(e){return sendError(res,e);}
}
