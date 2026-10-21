import { currentPrincipal } from './_lib/identity.js';
import { connection } from './_lib/db.js';
import { listMyRequests } from './_lib/bi-service.js';
import { assertBiEnabled, sendError } from './_lib/http.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control','no-store');
  try {
    assertBiEnabled();
    const person=await currentPrincipal(req);
    if(req.method!=='GET') {
      res.setHeader('Allow','GET');
      return res.status(405).json({error:'Método não permitido.'});
    }
    // O ID do dono nunca vem de req.query nem de body.
    const db=await connection();
    const rows=await listMyRequests(db,person);
    return res.status(200).json({items:rows});
  } catch(error) { return sendError(res,error); }
}
