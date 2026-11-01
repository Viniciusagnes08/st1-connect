export function validWriteOrigin(req, env=process.env) {
  try {
    const header=req.headers?.origin;
    const host=req.headers?.host;
    if (typeof header !== 'string' || typeof host !== 'string') return false;
    const url=new URL(header);
    const local=env.NODE_ENV!=='production' &&
      (url.hostname==='localhost'||url.hostname==='127.0.0.1');
    return url.host===host && (url.protocol==='https:' || (local && url.protocol==='http:'));
  } catch { return false; }
}

export function validateJsonBody(req, maxBytes=12000) {
  if (req.headers?.['content-type']?.split(';')[0]?.trim()!=='application/json')
    throw Object.assign(new Error('É necessário enviar JSON.'),{status:415});
  const body=req.body;
  if (!body || typeof body!=='object' || Array.isArray(body))
    throw Object.assign(new Error('Dados inválidos.'),{status:400});
  if (Buffer.byteLength(JSON.stringify(body),'utf8')>maxBytes)
    throw Object.assign(new Error('Solicitação muito grande.'),{status:413});
  return body;
}

export function sendError(res, error) {
  const status=Number(error?.status);
  const allowed=new Set([400,401,403,404,405,409,413,415,429,503]);
  res.setHeader('Cache-Control','no-store');
  if (!allowed.has(status)) {
    console.error('ST1 BI API:',error?.code||error?.name||'Erro inesperado');
    return res.status(500).json({error:'Não foi possível atender à solicitação.'});
  }
  return res.status(status).json({error:error.message});
}

export function assertBiEnabled(env=process.env) {
  if (env.BI_CONNECT_ENABLED!=='true' || !env.DATABASE_URL)
    throw Object.assign(new Error('Fila compartilhada ainda não habilitada.'),{status:503});
}
