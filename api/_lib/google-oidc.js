import { createPublicKey, verify as verifySignature, constants } from 'node:crypto';

const GOOGLE_JWKS = 'https://www.googleapis.com/oauth2/v3/certs';
let keyCache = { keys: [], expiresAt: 0 };

function authError(message = 'Não foi possível validar o acesso Google.') {
  return Object.assign(new Error(message), { status: 401 });
}
function validEmail(email) {
  return typeof email === 'string' &&
    email.length <= 180 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function parseJsonBase64(segment) {
  if (typeof segment !== 'string' || !/^[A-Za-z0-9_-]+$/.test(segment))
    throw authError();
  let data;
  try { data = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')); }
  catch { throw authError(); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw authError();
  return data;
}
async function getKeys(fetcher, nowSec) {
  if (fetcher === fetch && keyCache.expiresAt > nowSec && keyCache.keys.length)
    return keyCache.keys;
  const response = await fetcher(GOOGLE_JWKS, { signal: AbortSignal.timeout(6500) });
  if (!response.ok) throw authError('O Google não respondeu. Tente novamente.');
  const body = await response.json();
  if (!Array.isArray(body.keys) || body.keys.length > 25) throw authError();
  const keys = body.keys.filter(key =>
    key && key.kty === 'RSA' && typeof key.kid === 'string' &&
    typeof key.n === 'string' && typeof key.e === 'string' &&
    (!key.use || key.use === 'sig') && (!key.alg || key.alg === 'RS256')
  );
  if (!keys.length) throw authError();
  if (fetcher === fetch) {
    const match = /max-age=(\d+)/.exec(response.headers.get('cache-control') || '');
    const seconds = Math.min(3600, Math.max(60, Number(match?.[1]) || 300));
    keyCache = { keys, expiresAt: nowSec + seconds };
  }
  return keys;
}

/**
 * Verifica assinatura, issuer, audience, expiração e identidade Google.
 * Nunca confiar em nome, e-mail ou papel fornecidos diretamente pelo cliente.
 */
export async function verifyGoogleCredential(idToken, clientId, fetcher = fetch, nowSec = Math.floor(Date.now()/1000), expectedNonce = null) {
  if (typeof clientId !== 'string' || !/^\d+-[\w-]+\.apps\.googleusercontent\.com$/.test(clientId))
    throw Object.assign(new Error('Login com Google ainda não configurado.'),{status:503});
  if (typeof idToken !== 'string' || idToken.length > 8192)
    throw authError();
  const parts = idToken.split('.');
  if (parts.length !== 3 || !parts[2] || !/^[A-Za-z0-9_-]+$/.test(parts[2]))
    throw authError();
  const header = parseJsonBase64(parts[0]);
  const claims = parseJsonBase64(parts[1]);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || header.kid.length > 256)
    throw authError();
  const keys = await getKeys(fetcher, nowSec);
  const key = keys.find(item => item.kid === header.kid);
  if (!key) throw authError();
  let verified = false;
  try {
    verified = verifySignature(
      'RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1], 'utf8'),
      { key: createPublicKey({key,format:'jwk'}), padding:constants.RSA_PKCS1_PADDING },
      Buffer.from(parts[2],'base64url')
    );
  } catch { throw authError(); }
  if (!verified || !['accounts.google.com','https://accounts.google.com'].includes(claims.iss) ||
      claims.aud !== clientId ||
      (expectedNonce !== null && (typeof expectedNonce !== 'string' || !expectedNonce || claims.nonce !== expectedNonce)) ||
      !Number.isSafeInteger(claims.exp) || claims.exp <= nowSec ||
      !Number.isSafeInteger(claims.iat) || claims.iat > nowSec + 60 ||
      (claims.nbf !== undefined && claims.nbf > nowSec + 60) ||
      typeof claims.sub !== 'string' || !/^[0-9]{8,40}$/.test(claims.sub) ||
      claims.email_verified !== true || !validEmail(claims.email))
    throw authError();
  return {
    sub:claims.sub,
    email:claims.email.trim().toLowerCase(),
    name:typeof claims.name === 'string' ? claims.name.slice(0,80).trim() : '',
    hostedDomain:typeof claims.hd === 'string' ? claims.hd.toLowerCase().trim() : null,
  };
}

/**
 * Corporações: exigimos hosted domain assinado pelo Google.
 * Gmail pessoal: somente contas explicitamente pré-autorizadas pelo Admin.
 * Não usar user_metadata/editáveis do cliente para autorização.
 */
export function googleIdentityAllowed(identity, invited, env = process.env) {
  const email=identity?.email;
  if (!validEmail(email)) return false;
  const corporateDomain=String(env.ST1_GOOGLE_WORKSPACE_DOMAIN || 'st1.net.br').trim().toLowerCase();
  const suffix = '@' + corporateDomain;
  if (corporateDomain && identity.hostedDomain === corporateDomain && email.endsWith(suffix))
    return true;
  return Boolean(invited && invited.role === 'Solicitante' && invited.googlePending === true &&
    invited.email === email && invited.active === true && email.endsWith('@gmail.com'));
}

/**
 * A cada novo login revalida a identidade assinada pelo Google.
 * Corporate: o hosted domain deve continuar sendo o dominio ST1 permitido.
 * Gmail pessoal: a conta vinculada deve continuar ativa e Solicitante.
 * Nunca promover papeis a partir das claims do Google.
 */
export function googleReturningIdentityAllowed(identity, linked, env = process.env) {
  const email=identity?.email;
  if(!validEmail(email) || !linked || linked.active!==true ||
    linked.googleAuthOnly!==true || linked.googleSub!==identity?.sub ||
    linked.email!==email) return false;
  const corporateDomain=String(env.ST1_GOOGLE_WORKSPACE_DOMAIN||'st1.net.br').trim().toLowerCase();
  if(corporateDomain && identity.hostedDomain===corporateDomain &&
    email.endsWith('@'+corporateDomain)) return true;
  return email.endsWith('@gmail.com') &&
    (identity.hostedDomain===null || identity.hostedDomain===undefined) &&
    linked.role==='Solicitante';
}
