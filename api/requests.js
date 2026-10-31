import { currentPrincipal } from './_lib/identity.js';
import { connection } from './_lib/db.js';
import { listMyRequests } from './_lib/bi-service.js';
import { listServiceRequests } from './_lib/service-service.js';
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
    const biRows=await listMyRequests(db,person);
    if(process.env.ST1_SERVICES_ENABLED!=='true')
      return res.status(200).json({items:biRows});
    const services=await listServiceRequests(db,person,'mine');
    const normalized=services.map(item=>({
      id:item.id,protocol:item.protocol,title:item.title,
      scope:item.area==='ouvidoria'?'OUVIDORIA':'GERAL',
      topic_key:item.category,created_at:item.created_at,state:item.state,
    }));
    const items=[...biRows,...normalized]
      .sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at))
      .slice(0,100);
    return res.status(200).json({items});
  } catch(error) { return sendError(res,error); }
}
