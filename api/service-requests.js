import { currentPrincipal } from './_lib/identity.js';
import { connection, inTransaction } from './_lib/db.js';
import { SERVICE_FORMS } from './_lib/service-catalog.js';
import { createServiceRequest, listServiceRequests, getServiceRequest, changeServiceRequest, assignDepartmentRequest } from './_lib/service-service.js';
import { validWriteOrigin, validateJsonBody, sendError } from './_lib/http.js';

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
