import { currentPrincipal } from './_lib/identity.js';
import { connection, inTransaction } from './_lib/db.js';
import { createBiRequest, getBiTicket, listBiTickets, changeBiTicketState } from './_lib/bi-service.js';
import { assertBiEnabled, validWriteOrigin, validateJsonBody, sendError } from './_lib/http.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  try {
    assertBiEnabled();
    const user=await currentPrincipal(req);
    if(req.method==='GET') {
      const db=await connection();
      if(req.query?.id) return res.status(200).json(await getBiTicket(db,user,req.query.id));
      return res.status(200).json({items:await listBiTickets(db,user)});
    }
    if(req.method==='POST') {
      if(!validWriteOrigin(req)) return res.status(403).json({error:'Origem não autorizada.'});
      const input=validateJsonBody(req);
      const created=await inTransaction(tx=>createBiRequest(tx,user,input,req.headers['idempotency-key']));
      return res.status(created.repeated?200:201).json({
        id:created.id,protocol:created.protocol,title:created.title,scope:created.scope,
        created_at:created.createdAt,repeated:created.repeated,
      });
    }
    if(req.method==='PATCH') {
      if(!validWriteOrigin(req)) return res.status(403).json({error:'Origem não autorizada.'});
      const input=validateJsonBody(req,4000);
      if(Object.keys(input).some(key=>!['id','state','reason'].includes(key)))
        return res.status(400).json({error:'Campos não permitidos.'});
      const ticket=await inTransaction(tx=>changeBiTicketState(tx,user,input.id,input.state,input.reason||''));
      return res.status(200).json({ticket});
    }
    res.setHeader('Allow','GET, POST, PATCH');
    return res.status(405).json({error:'Método não permitido.'});
  } catch (error) {
    return sendError(res,error);
  }
}
