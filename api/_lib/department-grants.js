// Auditoria atomica dos acessos departamentais.
// Chamado somente apos validar sessao Master e conta ativa no backend.
import {allowedDepartment,DEPARTMENT_ROLES} from './department-access.js';

const fail=(message,status=400)=>Object.assign(new Error(message),{status});

export function validateDepartmentGrant(body){
 if(!body||typeof body!=='object'||Array.isArray(body)||
    Object.keys(body).some(key=>!['userId','area','role','active'].includes(key))||
    typeof body.userId!=='string'||body.userId.length<1||body.userId.length>128||
    body.userId.trim()!==body.userId||
    !allowedDepartment(body.area)||!DEPARTMENT_ROLES.includes(body.role)||
    typeof body.active!=='boolean')throw fail('Associação departamental inválida.');
 return {userId:body.userId,area:body.area,role:body.role,active:body.active};
}

export function classifyGrantEvent(previous,input){
 if(!previous)return input.active?'granted':null;
 if(previous.department_role===input.role&&previous.active===input.active)return null;
 if(previous.active&&!input.active)return 'revoked';
 if(!previous.active&&input.active)return 'reactivated';
 return 'role_changed';
}

export async function saveDepartmentGrant(db,actor,target,input){
 if(actor?.isMaster!==true||actor?.role!=='Administrador')throw fail('Somente Admin Master.',403);
 if(!target||target.id!==input.userId||typeof target.active!=='boolean')
   throw fail('Conta não encontrada.',404);
 if(!target.active&&input.active)throw fail('Conta ativa não encontrada.',404);
 if(target.id===actor.id)throw fail('A conta Master já possui autoridade geral.');
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
   ['st1:department:'+input.userId+':'+input.area]);
 const existing=await db.query(
   'SELECT user_id,area,department_role,active FROM st1_services.department_memberships WHERE user_id=$1 AND area=$2 FOR UPDATE',
   [input.userId,input.area]);
 const previous=existing.rows[0]||null;
 const event=classifyGrantEvent(previous,input);
 if(!event&&previous)return {membership:{
    user_id:previous.user_id,area:previous.area,role:previous.department_role,active:previous.active,
  },changed:false};
 if(!event)throw fail('Não é possível revogar um vínculo inexistente.');
 const changed=await db.query(`INSERT INTO st1_services.department_memberships(user_id,area,department_role,active,granted_by)
   VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,area) DO UPDATE
   SET department_role=EXCLUDED.department_role,active=EXCLUDED.active,
       granted_by=EXCLUDED.granted_by,updated_at=now()
   RETURNING user_id,area,department_role AS role,active`,
   [input.userId,input.area,input.role,input.active,actor.id]);
 await db.query(`INSERT INTO st1_services.department_access_audit
   (actor_user_id,target_user_id,area,event_type,previous_role,next_role,previous_active,next_active)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
   [actor.id,target.id,input.area,event,previous?.department_role??null,input.role,previous?.active??null,input.active]);
 return {membership:changed.rows[0],changed:true};
}
