// Server-side role policy for the ST1 Connect departments.
// BI has a separate membership system; confidential reports remain Master/requester only.
export const DEPARTMENT_AREAS=Object.freeze(['comercial','crm','ti','marketing','financeiro','administrativo']);
export const DEPARTMENT_ROLES=Object.freeze(['gestor','supervisor','executor']);
export const allowedDepartment=(area)=>DEPARTMENT_AREAS.includes(area);
export function canSeeDepartmentRequest(principal,record,membership){
 if(!principal||!record)return false;
 if(principal.isMaster===true)return true;
 if(record.requester_user_id===principal.id)return true;
 if(record.confidential===true||record.area==='ouvidoria')return false;
 if(!membership||membership.active!==true||membership.area!==record.area||membership.user_id!==principal.id)return false;
 if(['gestor','supervisor'].includes(membership.department_role))return true;
 return membership.department_role==='executor'&&record.assigned_to_user_id===principal.id;
}
export function canManageDepartment(principal,record,membership){
 if(!record||record.confidential===true||record.area==='ouvidoria')return principal?.isMaster===true;
 if(principal?.isMaster===true)return true;
 if(!membership||membership.active!==true||membership.area!==record.area||membership.user_id!==principal?.id)return false;
 return ['gestor','supervisor'].includes(membership.department_role)||
   (membership.department_role==='executor'&&record.assigned_to_user_id===principal.id);
}
export function canAssignDepartment(principal,record,membership){
 if(record?.confidential===true||record?.area==='ouvidoria')return false;
 if(principal?.isMaster===true)return true;
 return !!(membership&&membership.active===true&&membership.user_id===principal?.id&&membership.area===record?.area&&['gestor','supervisor'].includes(membership.department_role));
}
