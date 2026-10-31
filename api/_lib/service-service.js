import { createHash } from 'node:crypto';
import { parseServiceInput, validateServiceTransition } from './service-catalog.js';

const failure=(message,status=400)=>Object.assign(new Error(message),{status});
const uuid=value=>{
  if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))
    throw failure('Solicitação não encontrada.',404);
  return value;
};
const canRead=(principal,request)=>Boolean(principal&&request&&
  (principal.isMaster===true || request.requester_user_id===principal.id));
const master=principal=>{
  if(principal?.isMaster!==true || principal?.role!=='Administrador')
    throw failure('Apenas o Admin Master pode realizar esta operação.',403);
};
function idempotencyKey(value) {
  if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{16,100}$/.test(value))
    throw failure('Identificação de envio inválida.');
  return value;
}
export function visibleTo(principal,request) {
  return canRead(principal,request);
}

export async function createServiceRequest(db,principal,input,key) {
  const form=parseServiceInput(input),idKey=idempotencyKey(key);
  const actor='user:'+principal.id;
  const bodyHash=createHash('sha256').update(JSON.stringify(form)).digest('hex');
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[actor+':'+idKey]);
  const existing=await db.query(
    `SELECT k.request_id,r.protocol,r.area,r.title,k.payload_hash
       FROM st1_services.submission_keys k
       JOIN st1_services.requests r ON r.id=k.request_id
       WHERE k.actor_key=$1 AND k.idempotency_key=$2`,[actor,idKey]);
  if(existing.rowCount){
    const match=existing.rows[0];
    if(match.payload_hash!==bodyHash)throw failure('Este envio foi utilizado com dados diferentes.',409);
    return {id:match.request_id,protocol:match.protocol,area:match.area,title:match.title,repeated:true};
  }
  const seq=await db.query("SELECT nextval('st1_services.protocol_seq') AS n");
  const protocol='ST1-S-'+String(seq.rows[0].n).padStart(6,'0');
  const saved=await db.query(
    `INSERT INTO st1_services.requests
      (protocol,requester_user_id,requester_email,area,category,title,description,confidential)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING id,protocol,area,title,state,created_at`,
    [protocol,principal.id,principal.email,form.area,form.category,form.title,form.description,form.confidential]
  );
  const request=saved.rows[0];
  await db.query(
    `INSERT INTO st1_services.request_events(request_id,actor_user_id,event_type,payload)
      VALUES($1,$2,'created',$3::jsonb)`,
    [request.id,principal.id,JSON.stringify({form:form.formKey,confidential:form.confidential})]
  );
  await db.query(
    `INSERT INTO st1_services.submission_keys(actor_key,idempotency_key,request_id,payload_hash)
      VALUES($1,$2,$3,$4)`,
    [actor,idKey,request.id,bodyHash]
  );
  return {id:request.id,protocol,area:request.area,title:request.title,repeated:false,state:request.state,created_at:request.created_at};
}

export async function listServiceRequests(db,principal,view='mine') {
  const isAll=view==='all';
  if(isAll)master(principal);
  if(view!=='mine'&&!isAll)throw failure('Visualização não permitida.');
  const query=`SELECT id,protocol,area,category,title,state,confidential,created_at,updated_at,
      requester_email,requester_user_id
      FROM st1_services.requests ${isAll?'':'WHERE requester_user_id=$1'}
      ORDER BY created_at DESC,id DESC LIMIT 100`;
  const rows=await db.query(query,isAll?[]:[principal.id]);
  return rows.rows;
}

export async function getServiceRequest(db,principal,id) {
  const key=uuid(id);
  const rows=await db.query(
    `SELECT id,protocol,area,category,title,description,state,confidential,
      created_at,updated_at,requester_email,requester_user_id,assigned_to_user_id
      FROM st1_services.requests WHERE id=$1`,[key]);
  const record=rows.rows[0];
  if(!canRead(principal,record))throw failure('Solicitação não encontrada.',404);
  const events=await db.query(
    `SELECT event_type,created_at,actor_user_id,payload
      FROM st1_services.request_events WHERE request_id=$1 ORDER BY created_at,id LIMIT 200`,[key]);
  return {request:record,events:events.rows};
}
export async function changeServiceRequest(db,principal,id,state,reason='') {
  master(principal);
  const key=uuid(id);
  const current=await db.query(
    'SELECT state FROM st1_services.requests WHERE id=$1 FOR UPDATE',[key]);
  if(!current.rowCount)throw failure('Solicitação não encontrada.',404);
  const next=validateServiceTransition(current.rows[0].state,state,reason);
  const changed=await db.query(
    `UPDATE st1_services.requests SET state=$2,updated_at=now()
      WHERE id=$1 RETURNING id,protocol,area,state,updated_at`,[key,next.state]);
  await db.query(
    `INSERT INTO st1_services.request_events(request_id,actor_user_id,event_type,payload)
      VALUES($1,$2,'state_changed',$3::jsonb)`,[
      key,principal.id,
      JSON.stringify({from:current.rows[0].state,to:next.state,reason:next.reason})
    ]
  );
  return changed.rows[0];
}
