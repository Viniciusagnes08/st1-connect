export type ServiceState = 'Novo'|'Em triagem'|'Em atendimento'|'Pendente'|'Resolvido'|'Fechado';
export type ServiceField = {
  name:'area'|'category';label:string;type:'select';required:boolean;
  options:Array<{value:string;label:string}>;
};
export type ServiceForm = {
  key:string;title:string;description:string;confidential:boolean;fields:ServiceField[];
};
export type ServiceRequest = {
  id:string;protocol:string;area:string;category:string;title:string;
  state:ServiceState;confidential:boolean;created_at:string;updated_at:string;
  requester_email:string;requester_user_id:string;
};
export type ServiceDetail = {
  request: ServiceRequest & {description:string;assigned_to_user_id:string|null};
  events:Array<{event_type:string;created_at:string;actor_user_id:string;payload:{from?:string;to?:string;reason?:string;form?:string}}>;
};
async function request<T>(path:string,init:RequestInit={}):Promise<T> {
  const res=await fetch(path,{
    cache:'no-store',credentials:'same-origin',...init,
    headers:{...(init.body?{'Content-Type':'application/json'}:{}),...init.headers},
  });
  const value=await res.json().catch(()=>({})) as {error?:string};
  if(!res.ok)throw new Error(value.error || 'Não foi possível acessar a central de serviços.');
  return value as T;
}
export const fetchServiceForms=async()=>(await request<{forms:ServiceForm[]}>('/api/service-requests?action=catalog')).forms;
export const fetchServiceRequests=async(view:'mine'|'all'='mine')=>
  (await request<{items:ServiceRequest[]}>('/api/service-requests?view='+view)).items;
export const fetchServiceDetail=(id:string)=>
  request<ServiceDetail>('/api/service-requests?id='+encodeURIComponent(id));
export const submitServiceRequest=(form:{formKey:string;title:string;description:string;area?:string;category?:string},idempotencyKey:string)=>
  request<{id:string;protocol:string;area:string;title:string;repeated:boolean}>('/api/service-requests',{
    method:'POST',headers:{'Idempotency-Key':idempotencyKey},
    body:JSON.stringify(form),
  });
export const changeServiceState=(id:string,state:ServiceState,reason:string)=>
  request<{request:ServiceRequest}>('/api/service-requests',{
    method:'PATCH',body:JSON.stringify({id,state,reason}),
  });
