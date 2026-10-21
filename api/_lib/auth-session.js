import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'st1_connect_session';

function signature(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function equal(a, b) {
  const first = Buffer.from(String(a || ''));
  const second = Buffer.from(String(b || ''));
  return first.length === second.length && timingSafeEqual(first, second);
}

export function decodeSession(cookieHeader, secret, users, now = Date.now()) {
  if (!secret || !Array.isArray(users)) return null;
  const cookie = String(cookieHeader || '').split(';').map(s => s.trim())
    .find(s => s.startsWith(SESSION_COOKIE + '='));
  if (!cookie) return null;
  const segments = cookie.slice(SESSION_COOKIE.length + 1).split('.');
  if (segments.length !== 2) return null;
  const [payload, mac] = segments;
  if (!payload || !mac || !equal(mac, signature(payload, secret))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!Number.isSafeInteger(data.exp) || data.exp <= now / 1000 ||
      typeof data.uid !== 'string' || !Number.isSafeInteger(data.ver)) return null;
    return users.find(user => user.id === data.uid && user.version === data.ver &&
      user.active === true && typeof user.passwordHash === 'string' &&
      user.passwordHash.length > 0) || null;
  } catch {
    return null;
  }
}
