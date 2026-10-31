import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { decodeSession } from './_lib/auth-session.js';
import { isMasterAdmin, canCreateAccount, canUpdateAccount } from './_lib/master-admin.js';
import { verifyGoogleCredential, googleIdentityAllowed, googleReturningIdentityAllowed } from './_lib/google-oidc.js';
import { createGoogleChallenge, readGoogleChallenge, clearGoogleChallengeCookie } from './_lib/google-challenge.js';

const STORE_FILE = 'st1-connect/contas-v1.json';
const COOKIE = 'st1_connect_session';
const INVITATION_MS = 7 * 24 * 60 * 60 * 1000;
const ROLES = ['Administrador', 'Supervisor', 'Técnico', 'Solicitante'];
const secret = () => process.env.ST1_AUTH_SECRET;
const token = () => process.env.BLOB_READ_WRITE_TOKEN;
const storeId = () => process.env.ST1_BLOB_STORE_ID;
// Somente Preview. Requer codigo administrativo guardado no Vercel.
function adminRecoveryEnabled() {
  return process.env.VERCEL_ENV === 'preview' &&
    process.env.ST1_ADMIN_RECOVERY_ENABLED === 'true' &&
    typeof process.env.ST1_SETUP_TOKEN === 'string' &&
    process.env.ST1_SETUP_TOKEN.length >= 24 &&
    typeof process.env.ST1_BOOTSTRAP_EMAIL === 'string' &&
    process.env.ST1_BOOTSTRAP_EMAIL.includes('@');
}

// Acesso emergencial via link enviado apenas ao e-mail do administrador inicial.
// O backend guarda somente o hash do token; o token nunca fica em logs ou no banco.
function emailRecoveryEnabled() {
  const expectedHash = String(process.env.ST1_EMAIL_RECOVERY_HASH || '');
  const expiresAt = Number(process.env.ST1_EMAIL_RECOVERY_EXPIRES_AT);
  return process.env.VERCEL_ENV === 'preview' &&
    /^[a-f0-9]{64}$/i.test(expectedHash) &&
    Number.isSafeInteger(expiresAt) &&
    expiresAt > Date.now() &&
    expiresAt - Date.now() <= 2 * 60 * 60 * 1000;
}
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
const identity = user => ({ id: user.id, name: user.name, email: user.email, role: user.role, active: user.active, isMaster: isMasterAdmin(user), authMethod: user.googleAuthOnly === true ? 'google' : 'password', googlePending: user.googlePending === true });
const error = (res, status, message) => res.status(status).json({ error: message });
const noCache = res => { res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); };
// A auditoria administrativa acompanha o diretorio privado na mesma escrita ETag.
// Registro limitado a 1000 eventos; nao gravar senha, token ou e-mail no evento.
const MAX_ADMIN_AUDIT_EVENTS = 1000;
function auditEvent(state, actor, action, target, changes = {}) {
  const previous = Array.isArray(state.auditTrail) ? state.auditTrail : [];
  return [...previous.slice(-(MAX_ADMIN_AUDIT_EVENTS - 1)), {
    id: randomBytes(12).toString('hex'), at: new Date().toISOString(),
    actorUserId: actor?.id || null, targetUserId: target?.id || null, action, changes,
  }];
}
const apiHeaders = () => ({
  Authorization: `Bearer ${token()}`,
  'x-vercel-blob-store-id': storeId(),
  'x-api-version': '13',
});
async function load() {
  const url = `https://${originHost()}/${STORE_FILE}?cache=0`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token()}` }, cache: 'no-store' });
  if (response.status === 404) return { users: [], etag: null, auditTrail: [] };
  if (!response.ok) throw new Error(`Não foi possível ler o cadastro (${response.status}).`);
  const data = await response.json();
  if (!Array.isArray(data.users) || (data.auditTrail !== undefined && !Array.isArray(data.auditTrail))) throw new Error('Cadastro inválido.');
  return { users: data.users, etag: response.headers.get('etag'), auditTrail: data.auditTrail || [] };
}
async function save(users, etag, auditTrail) {
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
    body: JSON.stringify({ version: 2, users, auditTrail }),
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
function setSession(res, user, {clearGoogleNonce = false} = {}) {
  const expires = Math.floor(Date.now() / 1000) + 8 * 3600;
  const payload = Buffer.from(JSON.stringify({ uid: user.id, ver: user.version, exp: expires })).toString('base64url');
  const session = `${payload}.${sign(payload)}`;
  const sessionCookie=`${COOKIE}=${session}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${8 * 3600}`;
  res.setHeader('Set-Cookie',clearGoogleNonce ? [clearGoogleChallengeCookie(),sessionCookie] : sessionCookie);
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
/**
 * Transição de endereço de login do administrador inicial durante a homologação.
 * Não cria contas nem altera permissões/senhas. A senha original da conta continua
 * obrigatória. Apenas um alias explícito da mesma identidade corporativa é aceito.
 */
function resolveLoginUser(users, enteredEmail) {
  const direct = users.find(user => user.email === enteredEmail);
  if (direct) return direct;
  if (process.env.VERCEL_ENV !== 'preview') return null;
  const alias = String(process.env.ST1_BOOTSTRAP_LOGIN_ALIAS || '').trim().toLowerCase();
  const primary = String(process.env.ST1_BOOTSTRAP_EMAIL || '').trim().toLowerCase();
  if (!validEmail(alias) || !validEmail(primary) || alias === primary || enteredEmail !== alias) return null;
  const [aliasLocal, aliasDomain] = alias.split('@');
  const [primaryLocal, primaryDomain] = primary.split('@');
  // Exclusivamente a pontuação local pode variar: nenhuma outra identidade.
  if (aliasDomain !== primaryDomain || aliasLocal.replace(/\./g, '') !== primaryLocal.replace(/\./g, '')) return null;
  return users.find(user => user.email === primary && user.role === 'Administrador' && user.active === true) || null;
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
    let authorizedOrigin = false;
    try {
      const parsed = new URL(origin);
      authorizedOrigin = typeof origin === 'string' && typeof host === 'string' &&
        parsed.protocol === 'https:' && parsed.host === host;
    } catch { /* Origem opaca ou inválida: recusar sem lançar erro interno. */ }
    if (!authorizedOrigin) return error(res, 403, 'Origem não autorizada.');
    if (Number(req.headers['content-length'] || 0) > 16000) return error(res, 413, 'Requisição muito grande.');
  }
  try {
    let state = await load();
    if (state.users.length === 0) {
      const bootstrap = initialAdministrator();
      if (bootstrap) {
        try {
          await save([bootstrap], null, []);
          state = await load();
        } catch (error) {
          if (error.status !== 409) throw error;
          state = await load();
        }
      }
    }
    const me = current(req, state.users);
    const b = typeof req.body === 'object' && req.body ? req.body : {};
    if (action === 'status' && req.method === 'GET') return res.json({
      configured:state.users.length > 0,user:me ? identity(me) : null,
      adminRecoveryAvailable:adminRecoveryEnabled(),
      googleClientId:/^\d+-[\w-]+\.apps\.googleusercontent\.com$/.test(String(process.env.ST1_GOOGLE_CLIENT_ID||''))
        ? process.env.ST1_GOOGLE_CLIENT_ID : null,
    });
    if (action === 'google-challenge' && req.method === 'GET') {
      if (!/^\d+-[\w-]+\.apps\.googleusercontent\.com$/.test(String(process.env.ST1_GOOGLE_CLIENT_ID||'')))
        return error(res,503,'Login Google ainda não configurado.');
      const challenge=createGoogleChallenge(secret());
      res.setHeader('Set-Cookie',challenge.cookie);
      return res.json({nonce:challenge.nonce,expiresIn:600});
    }
    if (action === 'setup' && req.method === 'POST') {
      if (state.users.length || process.env.ST1_BOOTSTRAP_EMAIL) return error(res, 409, 'A primeira conta está reservada para ativação pelo e-mail corporativo.');
      if (!equal(b.setupToken, process.env.ST1_SETUP_TOKEN)) return error(res, 403, 'Código de ativação inválido.');
      if (!validName(b.name) || !validEmail(b.email) || !validPassword(b.password)) return error(res, 400, 'Informe nome, e-mail e senha de 12 a 128 caracteres, com letras e números.');
      const admin = makeUser(b.name, b.email, b.password, 'Administrador');
      await save([admin], null, []);
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
      await save(state.users, state.etag, auditEvent(state,invitedUser,'account_activated',invitedUser));
      setSession(res, invitedUser);
      return res.json({ user: identity(invitedUser) });
    }
    if (action === 'recover-admin-link' && req.method === 'POST') {
      // Em nenhuma hipótese habilitar fora da Preview ou através do Supabase público.
      if (!emailRecoveryEnabled())
        return error(res, 403, 'O link de recuperação expirou ou não está mais disponível.');
      const code = typeof b.recoveryToken === 'string' ? b.recoveryToken : '';
      if (!/^[a-f0-9]{64}$/i.test(code))
        return error(res, 403, 'O link de recuperação é inválido ou expirou.');
      const providedHash = createHash('sha256').update(code).digest('hex');
      const expectedHash = String(process.env.ST1_EMAIL_RECOVERY_HASH);
      if (!equal(providedHash, expectedHash))
        return error(res, 403, 'O link de recuperação é inválido ou expirou.');
      const initialEmail = String(process.env.ST1_BOOTSTRAP_EMAIL || '').trim().toLowerCase();
      const admin = state.users.find(u =>
        u.email === initialEmail && u.role === 'Administrador' && u.active === true);
      // Marcador persistente e bloqueio por ETag evitam reutilização em funções concorrentes.
      if (!admin || admin.lastEmailRecoveryHash === expectedHash)
        return error(res, 403, 'O link de recuperação é inválido ou já foi usado.');
      if (!validPassword(b.password))
        return error(res, 400, 'Use uma senha entre 12 e 128 caracteres, com letras e números.');
      admin.passwordHash = hash(b.password);
      admin.version += 1;
      admin.attempts = 0;
      admin.blockedUntil = 0;
      admin.lastEmailRecoveryHash = expectedHash;
      delete admin.invitationHash;
      delete admin.inviteExpiresAt;
      await save(state.users, state.etag, auditEvent(state,null,'master_recovered_via_link',admin));
      setSession(res, admin);
      return res.json({ user: identity(admin) });
    }
    if (action === 'recover-admin' && req.method === 'POST') {
      if (!adminRecoveryEnabled()) return error(res, 404, 'Recuperação indisponível neste ambiente.');
      const requestedEmail = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
      const expectedEmail = String(process.env.ST1_BOOTSTRAP_EMAIL).trim().toLowerCase();
      const submittedCode = typeof b.setupToken === 'string' ? b.setupToken : '';
      const masterCode = process.env.ST1_SETUP_TOKEN;
      const password = typeof b.password === 'string' ? b.password : '';
      // Não revela se o cadastro/email existe. Só a conta de administrador
      // inicialmente aprovisionada pode usar o codigo administrativo.
      const admin = state.users.find(u => u.email === expectedEmail && u.email === requestedEmail &&
        u.role === 'Administrador' && u.active === true);
      const secretHash = createHash('sha256').update(masterCode).digest('hex');
      if (!admin || !equal(submittedCode, masterCode) || admin.adminRecoveryUsedHash === secretHash)
        return error(res, 403, 'Não foi possível confirmar o acesso. Verifique e solicite um novo código administrativo.');
      if (!validPassword(password))
        return error(res, 400, 'A senha precisa ter de 12 a 128 caracteres, com letras e números.');
      admin.passwordHash = hash(password);
      admin.version += 1; // Invalida todas as sessões anteriores.
      admin.attempts = 0;
      admin.blockedUntil = 0;
      admin.adminRecoveryUsedHash = secretHash; // A mesma credencial só pode ser usada uma vez.
      delete admin.invitationHash;
      delete admin.inviteExpiresAt;
      await save(state.users, state.etag, auditEvent(state,null,'master_recovered_via_code',admin));
      setSession(res, admin);
      return res.json({ user: identity(admin) });
    }
    if (action === 'google' && req.method === 'POST') {
      const credential=typeof b.credential === 'string' ? b.credential : '';
      const challengeNonce=readGoogleChallenge(req.headers.cookie,secret());
      const verified=await verifyGoogleCredential(credential,process.env.ST1_GOOGLE_CLIENT_ID,fetch,Math.floor(Date.now()/1000),challengeNonce);
      const subjectAccount=state.users.find(u=>u.googleSub===verified.sub && u.googleAuthOnly===true);
      if (subjectAccount) {
        if (!googleReturningIdentityAllowed(verified,subjectAccount,process.env))
          return error(res,403,'Esta conta Google precisa de validação administrativa.');
        setSession(res,subjectAccount,{clearGoogleNonce:true});
        return res.json({user:identity(subjectAccount)});
      }
      const existing=state.users.find(u=>u.email===verified.email);
      if (!googleIdentityAllowed(verified,existing,process.env))
        return error(res,403,'O acesso Google está restrito à equipe ST1 autorizada.');
      if (existing && (existing.googleAuthOnly || existing.passwordHash || existing.role!=='Solicitante' || !existing.googlePending))
        return error(res,403,'Este e-mail já tem uma conta. Solicite o vínculo ao administrador.');
      let account;
      if (existing) {
        // Apenas convites pendentes de Solicitante: nunca vincular contas administrativas automaticamente.
        existing.googleSub=verified.sub;
        existing.googleAuthOnly=true;
        existing.googlePending=false;
        existing.name=validName(verified.name) ? verified.name : existing.name;
        existing.version+=1;
        account=existing;
        await save(state.users,state.etag,auditEvent(state,account,'google_account_linked',account,{role:account.role}));
      } else {
        account={
          id:randomBytes(12).toString('hex'),
          name:validName(verified.name) ? verified.name : 'Colaborador ST1',
          email:verified.email,passwordHash:'',role:'Solicitante',active:true,
          googleSub:verified.sub,googleAuthOnly:true,version:1,attempts:0,blockedUntil:0,
          createdAt:new Date().toISOString(),
        };
        await save([...state.users,account],state.etag,auditEvent(state,account,'google_account_created',account,{role:account.role}));
      }
      setSession(res,account,{clearGoogleNonce:true});
      return res.status(200).json({user:identity(account)});
    }
    if (action === 'login' && req.method === 'POST') {
      const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
      const user = resolveLoginUser(state.users, email);
      if (!user || !user.active || !user.passwordHash) return error(res, 401, 'E-mail ou senha incorretos.');
      if (user.blockedUntil > Date.now()) return error(res, 429, 'Muitas tentativas. Aguarde alguns minutos.');
      if (!check(String(b.password || ''), user.passwordHash)) {
        user.attempts = (user.attempts || 0) + 1;
        if (user.attempts >= 5) { user.blockedUntil = Date.now() + 15 * 60 * 1000; user.attempts = 0; }
        await save(state.users, state.etag, state.auditTrail);
        return error(res, 401, 'E-mail ou senha incorretos.');
      }
      user.attempts = 0; user.blockedUntil = 0;
      await save(state.users, state.etag, state.auditTrail);
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
      await save(state.users, state.etag, me.role === 'Administrador' ? auditEvent(state,me,'admin_password_changed',me) : state.auditTrail);
      setSession(res, me);
      return res.json({ user: identity(me) });
    }
    if (me.role !== 'Administrador') return error(res, 403, 'Acesso exclusivo do administrador.');
    if (action === 'google-invite' && req.method === 'POST') {
      if (!isMasterAdmin(me)) return error(res,403,'Somente o Admin Master pode autorizar acessos Google pessoais.');
      const email=typeof b.email==='string' ? b.email.trim().toLowerCase() : '';
      if (!validEmail(email) || !email.endsWith('@gmail.com'))
        return error(res,400,'Informe um endereço Gmail válido para o convite individual.');
      if (state.users.some(u=>u.email===email))
        return error(res,409,'Este e-mail já possui um cadastro ou convite.');
      const invitation={
        id:randomBytes(12).toString('hex'),name:'Convite Google pendente',email,
        passwordHash:'',role:'Solicitante',active:true,googlePending:true,
        googleAuthOnly:false,version:1,attempts:0,blockedUntil:0,createdAt:new Date().toISOString(),
      };
      await save([...state.users,invitation],state.etag,auditEvent(state,me,'google_invite_created',invitation,{role:invitation.role}));
      return res.status(201).json({user:identity(invitation)});
    }
    if (action === 'audit' && req.method === 'GET') {
      if (!isMasterAdmin(me)) return error(res,403,'Auditoria reservada ao Admin Master.');
      return res.json({events:state.auditTrail.slice(-100)});
    }
    if (action === 'users' && req.method === 'GET') return res.json({ users: state.users.map(identity) });
    if (action === 'users' && req.method === 'POST') {
      if (!validName(b.name) || !validEmail(b.email) || !validPassword(b.password) || !ROLES.includes(b.role)) return error(res, 400, 'Preencha os dados, perfil e senha com pelo menos 12 caracteres, letras e números.');
      if (!canCreateAccount(me,b.role)) return error(res,403,'Apenas o Admin Master pode criar contas administrativas.');
      if (state.users.some(u => u.email === b.email.trim().toLowerCase())) return error(res, 409, 'Este e-mail já está cadastrado.');
      const user = makeUser(b.name, b.email, b.password, b.role);
      await save([...state.users, user], state.etag, auditEvent(state,me,'account_created',user,{role:user.role,active:true}));
      return res.status(201).json({ user: identity(user) });
    }
    if (action === 'user-update' && req.method === 'POST') {
      const user = state.users.find(u => u.id === b.id);
      if (!user) return error(res, 404, 'Usuário não encontrado.');
      if (typeof b.role !== 'string' || !ROLES.includes(b.role) || typeof b.active !== 'boolean')
        return error(res, 400, 'Informe um perfil e situação válidos.');
      if (user.id === me.id && (!b.active || b.role !== 'Administrador'))
        return error(res, 400, 'Não é possível remover o próprio acesso de administrador.');
      if (!canUpdateAccount(me,user,b.role,b.active))
        return error(res, 403, 'Conta administrativa protegida. Somente o Admin Master pode modificar privilégios administrativos.');
      if (user.email?.endsWith('@gmail.com') && (user.googleAuthOnly===true || user.googlePending===true) &&
          b.role!=='Solicitante')
        return error(res,403,'Contas Google pessoais permanecem com perfil Solicitante.');
      if (b.password && user.id === me.id)
        return error(res, 400, 'Para alterar sua senha, use Minha conta e informe a senha atual.');
      if (b.password && user.googleAuthOnly === true)
        return error(res, 400, 'A senha de uma conta Google não pode ser redefinida pelo ST1 Connect.');
      if (b.password && !validPassword(b.password))
        return error(res, 400, 'A nova senha precisa ter 12 caracteres, letras e números.');
      if (user.role === 'Administrador' && (b.role !== 'Administrador' || !b.active) &&
          !state.users.some(u => u.id !== user.id && u.role === 'Administrador' && u.active))
        return error(res, 400, 'É necessário manter pelo menos um administrador ativo.');
      const audited = auditEvent(state,me,'account_updated',user,{
        previousRole:user.role,nextRole:b.role,
        previousActive:user.active,nextActive:b.active,passwordReset:Boolean(b.password),
      });
      user.role = b.role; user.active = b.active; user.version += 1;
      if (b.password) user.passwordHash = hash(b.password);
      await save(state.users, state.etag, audited);
      return res.json({ user: identity(user) });
    }
    return error(res, 404, 'Rota não encontrada.');
  } catch (e) {
    console.error('ST1 Connect auth:', e instanceof Error ? e.message : 'erro');
    return error(res, e.status || 503, e.status === 409 ? e.message : 'Não foi possível concluir a operação. Tente novamente.');
  }
}
