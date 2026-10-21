import { createHash } from 'node:crypto';
import { requireBiStaff, isBiStaff, findMembership } from './bi-membership.js';

const STATES=['Novo','Em atendimento','Pendente','Resolvido','Fechado'];
const NEXT_STATE={
  'Novo':['Em atendimento','Pendente'],
  'Em atendimento':['Pendente','Resolvido'],
  'Pendente':['Em atendimento','Resolvido'],
  'Resolvido':['Fechado','Em atendimento'],
  'Fechado':[],
};

export function parseBiInput(input) {
  if (!input || typeof input!=='object' || Array.isArray(input))
    throw Object.assign(new Error('Dados inválidos.'),{status:400});
  if (Object.keys(input).some(key=>!['title','description'].includes(key)))
    throw Object.assign(new Error('Há campos não permitidos.'),{status:400});
  const title=typeof input.title==='string' ? input.title.trim() : '';
  const description=typeof input.description==='string' ? input.description.trim() : '';
  if (title.length<6 || title.length>160)
    throw Object.assign(new Error('Assunto deve ter de 6 a 160 caracteres.'),{status:400});
  if (description.length<12 || description.length>5000)
    throw Object.assign(new Error('Descrição deve ter de 12 a 5000 caracteres.'),{status:400});
  return {title,description,topicKey:'bi-inicial'};
}

export function validateIdempotencyKey(value) {
  if (typeof value!=='string' || !/^[a-zA-Z0-9_-]{16,100}$/.test(value))
    throw Object.assign(new Error('Identificação da tentativa inválida.'),{status:400});
  return value;
}

export function canReadRequest(user, record, member=false) {
  if (!user || !record) return false;
  if (record.requester_user_id===user.id) return true;
  return record.scope==='BI' && isBiStaff(user, member ? {active:true} : null);
}

export function validateTransition(current, next, reason='') {
  if (!STATES.includes(next) || !NEXT_STATE[current]?.includes(next))
    throw Object.assign(new Error('Mudança de situação não permitida.'),{status:409});
  const needsReason=next==='Pendente'||next==='Resolvido'||(current==='Resolvido'&&next==='Em atendimento');
  if (needsReason && (typeof reason!=='string'||reason.trim().length<10))
    throw Object.assign(new Error('Explique a alteração com pelo menos 10 caracteres.'),{status:400});
  if (typeof reason!=='string'||reason.length>2000)
    throw Object.assign(new Error('Justificativa muito extensa.'),{status:400});
  return {state:next,reason:reason.trim()};
}

export function fingerprint(input) {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

function safeUuid(id) {
  if(typeof id!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    throw Object.assign(new Error('Chamado inexistente.'),{status:404});
  return id;
}

export async function createBiRequest(db, principal, input, providedKey) {
  const body=parseBiInput(input), key=validateIdempotencyKey(providedKey);
  const actorKey='user:'+principal.id;
  const payloadHash=fingerprint(body);

  // Chamado exclusivamente no escopo BI; advisory lock limita corridas
  // entre envios simultâneos do mesmo autor e chave idempotente.
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',[actorKey+':'+key]);
  const existing=await db.query(
    `SELECT r.id,r.protocol,r.title,r.scope,r.created_at,k.payload_hash
     FROM st1_bi.submission_keys k
     JOIN st1_bi.request_records r ON r.id=k.request_id
     WHERE k.actor_key=$1 AND k.idempotency_key=$2`,
    [actorKey,key]
  );
  if(existing.rowCount) {
    const row=existing.rows[0];
    if(row.payload_hash!==payloadHash)
      throw Object.assign(new Error('Este envio já foi usado com informações diferentes.'),{status:409});
    return {id:row.id,protocol:row.protocol,title:row.title,scope:row.scope,createdAt:row.created_at,repeated:true};
  }

  const next=await db.query("SELECT nextval('st1_bi.request_protocol_seq') AS n");
  const protocol='ST1-'+String(next.rows[0].n).padStart(6,'0');
  const inserted=await db.query(
    `INSERT INTO st1_bi.request_records(protocol,requester_user_id,requester_email,scope,topic_key,title,details)
     VALUES($1,$2,$3,'BI',$4,$5,$6::jsonb)
     RETURNING id,protocol,title,scope,created_at`,
    [protocol,principal.id,principal.email,body.topicKey,body.title,JSON.stringify({description:body.description})]
  );
  const request=inserted.rows[0];
  await db.query('INSERT INTO st1_bi.bi_tickets(request_id) VALUES($1)',[request.id]);
  await db.query(
    "INSERT INTO st1_bi.request_events(request_id,event_type,actor_user_id,payload) VALUES($1,'created',$2,$3::jsonb)",
    [request.id,principal.id,JSON.stringify({source:'bi-basic-intake'})]
  );
  await db.query(
    'INSERT INTO st1_bi.submission_keys(actor_key,idempotency_key,request_id,payload_hash) VALUES($1,$2,$3,$4)',
    [actorKey,key,request.id,payloadHash]
  );
  return {id:request.id,protocol:request.protocol,title:request.title,scope:request.scope,createdAt:request.created_at,repeated:false};
}

export async function listBiTickets(db, principal) {
  await requireBiStaff(db,principal);
  const result=await db.query(
    `SELECT r.id,r.protocol,r.title,r.topic_key,r.requester_email,r.created_at,
            r.updated_at,b.state,b.priority,b.assignee_user_id
     FROM st1_bi.request_records r JOIN st1_bi.bi_tickets b ON b.request_id=r.id
     WHERE r.scope='BI' ORDER BY r.created_at DESC,r.id DESC LIMIT 100`
  );
  return result.rows;
}

export async function listMyRequests(db, principal) {
  const result=await db.query(
    `SELECT r.id,r.protocol,r.title,r.scope,r.topic_key,r.created_at,
            b.state
     FROM st1_bi.request_records r
     LEFT JOIN st1_bi.bi_tickets b ON b.request_id=r.id
     WHERE r.requester_user_id=$1
     ORDER BY r.created_at DESC,r.id DESC LIMIT 100`,
    [principal.id]
  );
  return result.rows;
}

export async function getBiTicket(db, principal, id) {
  const uuid=safeUuid(id);
  const rows=await db.query(
    `SELECT r.id,r.protocol,r.title,r.scope,r.topic_key,r.requester_user_id,r.requester_email,
            r.details,r.created_at,r.updated_at,b.state,b.priority,b.assignee_user_id
     FROM st1_bi.request_records r JOIN st1_bi.bi_tickets b ON b.request_id=r.id
     WHERE r.id=$1 AND r.scope='BI'`,
    [uuid]
  );
  const record=rows.rows[0];
  if(!record) throw Object.assign(new Error('Chamado inexistente.'),{status:404});
  const membership=record.requester_user_id===principal.id
    ? null : await findMembership(db,principal.id);
  if(!canReadRequest(principal,record,isBiStaff(principal,membership)))
    throw Object.assign(new Error('Chamado inexistente.'),{status:404});
  const events=await db.query(
    `SELECT event_type,created_at,actor_user_id,payload
     FROM st1_bi.request_events WHERE request_id=$1 ORDER BY created_at,id LIMIT 150`,
    [uuid]
  );
  return {ticket:record,events:events.rows};
}

export async function changeBiTicketState(db, principal, id, nextState, reason) {
  await requireBiStaff(db,principal);
  const uuid=safeUuid(id);
  const current=await db.query(
    `SELECT b.state,r.scope FROM st1_bi.bi_tickets b
     JOIN st1_bi.request_records r ON r.id=b.request_id
     WHERE b.request_id=$1 FOR UPDATE OF b`,
    [uuid]
  );
  if(!current.rowCount || current.rows[0].scope!=='BI')
    throw Object.assign(new Error('Chamado inexistente.'),{status:404});
  const next=validateTransition(current.rows[0].state,nextState,reason);
  const updated=await db.query(
    `UPDATE st1_bi.bi_tickets
     SET state=$2,updated_at=now(),
         assignee_user_id=CASE WHEN $2='Em atendimento' AND assignee_user_id IS NULL THEN $3 ELSE assignee_user_id END
     WHERE request_id=$1 RETURNING request_id,state,updated_at,assignee_user_id`,
    [uuid,next.state,principal.id]
  );
  await db.query('UPDATE st1_bi.request_records SET updated_at=now() WHERE id=$1',[uuid]);
  await db.query(
    "INSERT INTO st1_bi.request_events(request_id,event_type,actor_user_id,payload) VALUES($1,'state_changed',$2,$3::jsonb)",
    [uuid,principal.id,JSON.stringify({from:current.rows[0].state,to:next.state,reason:next.reason})]
  );
  return updated.rows[0];
}
