import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { decodeSession } from './_lib/auth-session.js';

const STORE_FILE = 'st1-connect/contas-v1.json';
const COOKIE = 'st1_connect_session';
const INVITATION_MS = 7 * 24 * 60 * 60 * 1000;
const ROLES = ['Administrador', 'Supervisor', 'Técnico', 'Solicitante'];
const secret = () => process.env.ST1_AUTH_SECRET;
const token = () => process.env.BLOB_READ_WRITE_TOKEN;
const storeId = () => process.env.ST1_BLOB_STORE_ID;
const originHost = () => `${storeId()}.private.blob.vercel-storage.com`;
const sign = value => createHmac('sha256', secret()).update(value).digest('base64url');
const equal = (a, b) => {
  const aa = Buffer.from(String(a)), bb = Buffer.from(String(b));
  return aa.length === bb.length && timingSafeEqual(aa, bb);
};
const hash = password => {
  const salt = randomBytes(20).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
};
const check = (password, stored) => {
  if (!stored || !stored.includes(':')) return false;
  const [salt, digest] = stored.split(':');
  const got = scryptSync(password, salt, 64);
  return equal(got.toString('hex'), digest);
};
const identity = user => ({ id: user.id, name: user.name, email: user.email, role: user.role, active: user.active });
const error = (res, status, message) => res.status(status).json({ error: message });
const noCache = res => { res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); };
const apiHeaders = () => ({
  Authorization: `Bearer ${token()}`,
  'x-vercel-blob-store-id': storeId(),
  'x-api-version': '13',
});
async function load() {
  const url = `https://${originHost()}/${STORE_FILE}?cache=0`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token()}` }, cache: 'no-store' });
  if (response.status === 404) return { users: [], etag: null };
  if (!response.ok) throw new Error(`Não foi possível ler o cadastro (${response.status}).`);
  const data = await response.json();
  if (!Array.isArray(data.users)) throw new Error('Cadastro inválido.');
  return { users: data.users, etag: response.headers.get('etag') };
}
async function save(users, etag) {
  const params = new URLSearchParams({ pathname: STORE_FILE });
  const response = await fetch(`https://vercel.com/api/blob/?${params}`, {
    method: 'PUT',
    headers: {
      ...apiHeaders(),
      'x-vercel-blob-access': 'private',
      'x-content-type': 'application/json',
      'x-add-random-suffix': '0',
      ...(etag ? { 'x-if-match': etag, 'x-allow-overwrite': '1' } : { 'x-allow-overwrite': '0' }),
    },
    body: JSON.stringify({ version: 1, users }),
  });
  if (!response.ok) {
    if ([409, 412].includes(response.status)) {
      const conflict = new Error('Os registros foram alterados por outra pessoa. Atualize e tente novamente.');
      conflict.status = 409;
      throw conflict;
    }
    throw new Error(`Não foi possível salvar os usuários (${response.status}).`);
  }
}
function setSession(res, user) {
  const expires = Math.floor(Date.now() / 1000) + 8 * 3600;
  const payload = Buffer.from(JSON.stringify({ uid: user.id, ver: user.version, exp: expires })).toString('base64url');
  const session = `${payload}.${sign(payload)}`;
  res.setHeader('Set-Cookie', `${COOKIE}=${session}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${8 * 3600}`);
}
function removeSession(res) { res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`); }
function current(req, users) { return decodeSession(req.headers.cookie, secret(), users); }
function validPassword(password) {
  return typeof password === 'string' && password.length >= 12 && password.length <= 128 && /[A-Za-z]/.test(password) && /[0-9]/.test(password);
}
function validName(name) { return typeof name === 'string' && name.trim().length >= 3 && name.trim().length <= 80; }
function validEmail(email) { return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 180; }
function initialAdministrator() {
  const email = String(process.env.ST1_BOOTSTRAP_EMAIL || '').trim().toLowerCase();
  const invitationHash = String(process.env.ST1_BOOTSTRAP_INVITE_HASH || '').trim().toLowerCase();
  if (!validEmail(email) || !/^[a-f0-9]{64}$/.test(invitationHash)) return null;
  const name = String(process.env.ST1_BOOTSTRAP_NAME || 'Administrador ST1').trim();
  return {
    id: randomBytes(12).toString('hex'), name: validName(name) ? name : 'Administrador ST1',
    email, passwordHash: '', role: 'Administrador', active: true,
    version: 1, attempts: 0, blockedUntil: 0,
    createdAt: new Date().toISOString(),
    invitationHash, inviteExpiresAt: new Date(Date.now() + INVITATION_MS).toISOString(),
  };
}
function makeUser(name, email, password, role) {
  return { id: randomBytes(12).toString('hex'), name: name.trim(), email: email.trim().toLowerCase(), passwordHash: hash(password), role, active: true, version: 1, attempts: 0, blockedUntil: 0, createdAt: new Date().toISOString() };
}
export default async function handler(req, res) {
  noCache(res);
  if (!secret() || !token() || !storeId() || !process.env.ST1_SETUP_TOKEN) return error(res, 503, 'Autenticação indisponível. Consulte o administrador.');
  const action = String(req.query.action || '');
  if (req.method !== 'GET' && req.method !== 'POST') return error(res, 405, 'Método não permitido.');
  if (req.method === 'POST') {
    const origin = req.headers.origin;
    const host = req.headers.host;
    if (!origin || !host || new URL(origin).host !== host || !origin.startsWith('https://')) return error(res, 403, 'Origem não autorizada.');
    if (Number(req.headers['content-length'] || 0) > 16000) return error(res, 413, 'Requisição muito grande.');
  }
  try {
    let state = await load();
    if (state.users.length === 0) {
      const bootstrap = initialAdministrator();
      if (bootstrap) {
        try {
          await save([bootstrap], null);
          state = await load();
        } catch (error) {
          if (error.status !== 409) throw error;
          state = await load();
        }
      }
    }
    const me = current(req, state.users);
    const b = typeof req.body === 'object' && req.body ? req.body : {};
    if (action === 'status' && req.method === 'GET') return res.json({ configured: state.users.length > 0, user: me ? identity(me) : null });
    if (action === 'setup' && req.method === 'POST') {
      if (state.users.length || process.env.ST1_BOOTSTRAP_EMAIL) return error(res, 409, 'A primeira conta está reservada para ativação pelo e-mail corporativo.');
      if (!equal(b.setupToken, process.env.ST1_SETUP_TOKEN)) return error(res, 403, 'Código de ativação inválido.');
      if (!validName(b.name) || !validEmail(b.email) || !validPassword(b.password)) return error(res, 400, 'Informe nome, e-mail e senha de 12 a 128 caracteres, com letras e números.');
      const admin = makeUser(b.name, b.email, b.password, 'Administrador');
      await save([admin], null);
      setSession(res, admin);
      return res.status(201).json({ user: identity(admin) });
    }
    if (action === 'activate' && req.method === 'POST') {
      const activationToken = typeof b.inviteToken === 'string' ? b.inviteToken : '';
      const hashedToken = createHash('sha256').update(activationToken).digest('hex');
      const invitedUser = state.users.find(u => u.invitationHash && equal(u.invitationHash, hashedToken));
      if (!invitedUser || !invitedUser.active || !invitedUser.inviteExpiresAt || Date.parse(invitedUser.inviteExpiresAt) < Date.now()) {
        return error(res, 403, 'O convite é inválido ou expirou. Solicite um novo acesso ao administrador.');
      }
      if (!validPassword(b.password)) return error(res, 400, 'Use uma senha entre 12 e 128 caracteres, com letras e números.');
      invitedUser.passwordHash = hash(b.password);
      delete invitedUser.invitationHash;
      delete invitedUser.inviteExpiresAt;
      invitedUser.version += 1;
      await save(state.users, state.etag);
      setSession(res, invitedUser);
      return res.json({ user: identity(invitedUser) });
    }
    if (action === 'login' && req.method === 'POST') {
      const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
      const user = state.users.find(u => u.email === email);
      if (!user || !user.active || !user.passwordHash) return error(res, 401, 'E-mail ou senha incorretos.');
      if (user.blockedUntil > Date.now()) return error(res, 429, 'Muitas tentativas. Aguarde alguns minutos.');
      if (!check(String(b.password || ''), user.passwordHash)) {
        user.attempts = (user.attempts || 0) + 1;
        if (user.attempts >= 5) { user.blockedUntil = Date.now() + 15 * 60 * 1000; user.attempts = 0; }
        await save(state.users, state.etag);
        return error(res, 401, 'E-mail ou senha incorretos.');
      }
      user.attempts = 0; user.blockedUntil = 0;
      await save(state.users, state.etag);
      setSession(res, user);
      return res.json({ user: identity(user) });
    }
    if (action === 'logout' && req.method === 'POST') { removeSession(res); return res.json({ ok: true }); }
    if (!me) return error(res, 401, 'Sessão expirada. Entre novamente.');
    if (action === 'me' && req.method === 'GET') return res.json({ user: identity(me) });
    if (action === 'password' && req.method === 'POST') {
      if (!check(String(b.currentPassword || ''), me.passwordHash)) return error(res, 400, 'Senha atual incorreta.');
      if (!validPassword(b.newPassword)) return error(res, 400, 'Use pelo menos 12 caracteres, com letras e números.');
      me.passwordHash = hash(b.newPassword); me.version += 1;
      await save(state.users, state.etag);
      setSession(res, me);
      return res.json({ user: identity(me) });
    }
    if (me.role !== 'Administrador') return error(res, 403, 'Acesso exclusivo do administrador.');
    if (action === 'users' && req.method === 'GET') return res.json({ users: state.users.map(identity) });
    if (action === 'users' && req.method === 'POST') {
      if (!validName(b.name) || !validEmail(b.email) || !validPassword(b.password) || !ROLES.includes(b.role)) return error(res, 400, 'Preencha os dados, perfil e senha com pelo menos 12 caracteres, letras e números.');
      if (state.users.some(u => u.email === b.email.trim().toLowerCase())) return error(res, 409, 'Este e-mail já está cadastrado.');
      const user = makeUser(b.name, b.email, b.password, b.role);
      await save([...state.users, user], state.etag);
      return res.status(201).json({ user: identity(user) });
    }
    if (action === 'user-update' && req.method === 'POST') {
      const user = state.users.find(u => u.id === b.id);
      if (!user) return error(res, 404, 'Usuário não encontrado.');
      if (typeof b.role !== 'string' || !ROLES.includes(b.role) || typeof b.active !== 'boolean') return error(res, 400, 'Informe um perfil e situação válidos.');
      if (user.id === me.id && (!b.active || b.role !== 'Administrador')) return error(res, 400, 'Não é possível remover o próprio acesso de administrador.');
      if (user.role === 'Administrador' && (b.role !== 'Administrador' || !b.active) && !state.users.some(u => u.id !== user.id && u.role === 'Administrador' && u.active)) return error(res, 400, 'É necessário manter pelo menos um administrador ativo.');
      user.role = b.role; user.active = b.active; user.version += 1;
      if (b.password) {
        if (!validPassword(b.password)) return error(res, 400, 'A nova senha precisa ter 12 caracteres, letras e números.');
        user.passwordHash = hash(b.password);
      }
      await save(state.users, state.etag);
      return res.json({ user: identity(user) });
    }
    return error(res, 404, 'Rota não encontrada.');
  } catch (e) {
    console.error('ST1 Connect auth:', e instanceof Error ? e.message : 'erro');
    return error(res, e.status || 503, e.status === 409 ? e.message : 'Não foi possível concluir a operação. Tente novamente.');
  }
}
