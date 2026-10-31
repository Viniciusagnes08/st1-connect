import { connection } from './_lib/db.js';
import { assertBiEnabled } from './_lib/http.js';

// Temporario: somente Preview e sob flag diagnostica. Nunca expoe mensagens,
// segredos, SQL ou hostname; classifica em categorias de operacao.
export function classifyDatabaseError(error) {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  if (/tenant\/user|tenant or user|tenant not found|user not found/.test(message))
    return 'POOLER_TENANT';
  if (code === '28P01' || /password authentication failed/.test(message))
    return 'AUTHENTICATION';
  if (['ENOTFOUND','EAI_AGAIN','ENETUNREACH','EHOSTUNREACH','ECONNREFUSED'].includes(code))
    return 'NETWORK';
  if (code === 'ETIMEDOUT' || /timeout|timed out/.test(message))
    return 'TIMEOUT';
  if (/ssl|certificate|tls/.test(message))
    return 'TLS';
  if (/ST1 Connect|Pooler invalido|pooler somente|database_url/i.test(message))
    return 'CONFIGURATION';
  return 'UNCLASSIFIED';
}

export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET') return res.status(405).json({error:'Método não permitido.'});
  try {
    assertBiEnabled();
    const db=await connection();
    await db.query('SELECT 1');
    return res.status(200).json({service:'bi-foundation',database:'ready'});
  } catch (error) {
    const diagnostic = process.env.VERCEL_ENV==='preview' && req.query?.diagnose==='1';
    if (diagnostic) {
      return res.status(503).json({
        service:'bi-foundation',
        database:'unavailable',
        diagnostic:{
          connection: process.env.ST1_DB_POOLER_HOST ? 'pooler' : 'direct',
          category: classifyDatabaseError(error),
          code: ['ERR_TLS_CERT_ALTNAME_INVALID','UNABLE_TO_VERIFY_LEAF_SIGNATURE','UNABLE_TO_GET_ISSUER_CERT_LOCALLY','SELF_SIGNED_CERT_IN_CHAIN','ERR_SSL_WRONG_VERSION_NUMBER','ECONNRESET','ETIMEDOUT'].includes(error?.code) ? error.code : 'OTHER',
        },
      });
    }
    return res.status(503).json({service:'bi-foundation',database:'unavailable'});
  }
}
