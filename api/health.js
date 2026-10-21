import { connection } from './_lib/db.js';
import { assertBiEnabled } from './_lib/http.js';

export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET') return res.status(405).json({error:'Método não permitido.'});
  try {
    assertBiEnabled();
    const db=await connection();
    await db.query('SELECT 1');
    return res.status(200).json({service:'bi-foundation',database:'ready'});
  } catch {
    // Nunca expor connection string, nomes internos ou stack de erro.
    return res.status(503).json({service:'bi-foundation',database:'unavailable'});
  }
}
