// Isolamento em etapas. O gate de escrita entra em vigor antes do cutover.
// Nenhuma credencial de produção deve servir à homologação isolada.
export const ST1_PREVIEW_BRANCH = 'feature/st1-connect-bi-foundation';
const ACTIVE_PROJECT_REF='cxqoypwsqokkwcirugrg';
const fail = () => Object.assign(new Error('Homologação em isolamento: gravações temporariamente bloqueadas.'),{status:503});
const validStoreId = value => typeof value === 'string' &&
  /^(?:store_)?[A-Za-z0-9_-]{12,80}$/.test(value);
const normalizedStoreId = value => value?.startsWith('store_') ? value.slice(6) : value;

export function isTargetPreview(env=process.env) {
  return env.VERCEL_ENV === 'preview' &&
    env.VERCEL_GIT_COMMIT_REF === ST1_PREVIEW_BRANCH;
}

export function isolationEnabled(env=process.env) {
  return isTargetPreview(env) && env.ST1_PREVIEW_ISOLATION_ENABLED === 'true';
}

export function previewWriteGuardActive(env=process.env) {
  return isTargetPreview(env) && env.ST1_PREVIEW_WRITE_GUARD === 'true';
}

export function previewAuthConfig(env=process.env) {
  if(!isolationEnabled(env)) return {
    secret:env.ST1_AUTH_SECRET,
    blobToken:env.BLOB_READ_WRITE_TOKEN,
    blobStoreId:env.ST1_BLOB_STORE_ID,
  };

  const newId=normalizedStoreId(env.ST1_PREVIEW_BLOB_STORE_ID);
  const originalId=normalizedStoreId(env.ST1_BLOB_STORE_ID);
  const secret=env.ST1_PREVIEW_AUTH_SECRET;
  const token=env.ST1_PREVIEW_BLOB_READ_WRITE_TOKEN;
  if(!validStoreId(env.ST1_PREVIEW_BLOB_STORE_ID)||
     newId===originalId||
     typeof secret!=='string'||secret.length<32||secret===env.ST1_AUTH_SECRET||
     typeof token!=='string'||token.length<36||token===env.BLOB_READ_WRITE_TOKEN||
     !/^vercel_blob_rw_/i.test(token)) throw fail();
  return {secret,blobToken:token,blobStoreId:newId};
}

export function previewDatabaseConfig(env=process.env) {
  if(!isolationEnabled(env)) return null;
  const ref=String(env.ST1_PREVIEW_SUPABASE_PROJECT_REF||'');
  const raw=env.ST1_PREVIEW_DATABASE_URL;
  if(!/^[a-z]{20}$/.test(ref)||ref===ACTIVE_PROJECT_REF||
     typeof raw!=='string'||raw===env.DATABASE_URL) throw fail();
  let parsed;
  try{parsed=new URL(raw);}catch{throw fail();}
  if(!['postgres:','postgresql:'].includes(parsed.protocol)||
     parsed.hostname!==`db.${ref}.supabase.co`||
     parsed.port!=='5432'||parsed.pathname!=='/postgres'||
     decodeURIComponent(parsed.username)!=='st1_connect_runtime'||
     !parsed.password||parsed.hash||parsed.search) throw fail();
  return {ref,url:raw};
}

// A proteção é intrínseca a esta branch: remover uma env var não reabre o banco legado.
export function assertPreviewWriteSafe(env=process.env) {
  if(!isTargetPreview(env)) return;
  if(!isolationEnabled(env)) throw fail();
  previewAuthConfig(env);
  previewDatabaseConfig(env);
}

// Defesa em profundidade: connections ad hoc só podem executar consultas de leitura
// durante a fase anterior ao cutover. Operações de escrita exigem inTransaction,
// que por sua vez é interrompida por assertPreviewWriteSafe.
export function assertPreviewSqlReadOnly(statement, env=process.env) {
  if(!isTargetPreview(env) || isolationEnabled(env)) return;
  if(typeof statement!=='string' ||
     !/^\\s*SELECT\\b/i.test(statement) ||
     /\\b(?:nextval|setval|pg_notify|lo_import|pg_advisory_(?:lock|xact_lock))\\s*\\(/i.test(statement) ||
     /\\bFOR\\s+(?:UPDATE|NO\\s+KEY\\s+UPDATE|SHARE|KEY\\s+SHARE)\\b/i.test(statement))
    throw fail();
}
