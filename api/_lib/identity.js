import { decodeSession } from './auth-session.js';
import { isMasterAdmin, effectiveAccessAccount } from './master-admin.js';
import {previewAuthConfig} from './preview-isolation.js';

const ROLES = new Set(['Administrador','Supervisor','Técnico','Solicitante']);

function unavailable(message) {
  const error=new Error(message);
  error.status=503;
  return error;
}

export async function loadDirectory(env = process.env, fetcher = fetch) {
  const config=previewAuthConfig(env);
  if (!config.secret || !config.blobToken ||
      !/^[a-zA-Z0-9_-]{8,80}$/.test(config.blobStoreId || ''))
    throw unavailable('Autenticação não configurada.');
  const url='https://'+config.blobStoreId+
    '.private.blob.vercel-storage.com/st1-connect/contas-v1.json?cache=0';
  let response;
  try {
    response = await fetcher(url, {
      headers: { Authorization: 'Bearer ' + config.blobToken },
      cache: 'no-store',
      signal: AbortSignal.timeout(7000),
    });
  } catch {
    throw unavailable('Cadastro temporariamente indisponível.');
  }
  if (!response.ok) throw unavailable('Cadastro temporariamente indisponível.');
  let directory;
  try { directory=await response.json(); }
  catch { throw unavailable('Cadastro indisponível.'); }
  if (!Array.isArray(directory?.users)) throw unavailable('Cadastro indisponível.');
  return directory.users;
}

export async function currentPrincipal(req, env = process.env, fetcher = fetch) {
  const users=await loadDirectory(env, fetcher);
  const person=decodeSession(req.headers?.cookie,previewAuthConfig(env).secret,users,Date.now(),env);
  if (!person || !ROLES.has(person.role)) {
    const error=new Error('Sessão inválida ou expirada. Entre novamente.');
    error.status=401;
    throw error;
  }
  return {id:person.id,name:person.name,email:person.email,role:person.role,active:true,isMaster:isMasterAdmin(person,env)};
}

export function publicDirectory(users, env = process.env) {
  return users.map(user => {
    const effective=effectiveAccessAccount(user,env);
    return {id:user.id,name:user.name,email:user.email,role:effective.role,active:user.active===true};
  });
}
