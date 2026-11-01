// A identidade Master vem do cadastro privado e da configuracao inicial do servidor.
// Nunca confiar em e-mail, papel ou isMaster enviados no corpo da requisicao.
const normalizedEmail = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
const ROLES = new Set(['Administrador', 'Supervisor', 'Técnico', 'Solicitante']);

// Habilitacao temporaria e exclusiva da branch de homologacao.
// Os campos sao mantidos em env Preview da Vercel. O ID interno e o e-mail
// devem corresponder simultaneamente a uma identidade Google ja vinculada.
// Nenhum campo de permissao e salvo no diretorio compartilhado da producao.
const PREVIEW_BRANCH = 'feature/st1-connect-bi-foundation';
const googleSubValid = value => typeof value === 'string' && /^[0-9]{8,40}$/.test(value);

export function isPinnedPreviewGoogleIdentity(account, env = process.env) {
  const expectedId = String(env.ST1_PREVIEW_MASTER_GOOGLE_USER_ID || '').trim();
  const expectedEmail = normalizedEmail(env.ST1_PREVIEW_MASTER_GOOGLE_EMAIL);
  return Boolean(
    env.VERCEL_ENV === 'preview' &&
    env.VERCEL_GIT_COMMIT_REF === PREVIEW_BRANCH &&
    /^[a-f0-9]{24}$/.test(expectedId) &&
    expectedEmail.endsWith('@st1.net.br') &&
    account && account.id === expectedId &&
    normalizedEmail(account.email) === expectedEmail &&
    account.googleAuthOnly === true &&
    account.googlePending !== true &&
    googleSubValid(account.googleSub) &&
    (!account.passwordHash || account.passwordHash === '')
  );
}

export function effectiveAccessAccount(account, env = process.env) {
  if (!account || account.active !== true || !isPinnedPreviewGoogleIdentity(account, env))
    return account;
  // Somente projecao em memoria; nunca modificar o objeto do Blob compartilhado.
  return {...account, role: 'Administrador'};
}

export function isMasterIdentity(account, env = process.env) {
  const bootstrapEmail = normalizedEmail(env.ST1_BOOTSTRAP_EMAIL);
  return Boolean(account &&
    ((bootstrapEmail && normalizedEmail(account.email) === bootstrapEmail) ||
      isPinnedPreviewGoogleIdentity(account, env)));
}

export function isMasterAdmin(principal, env = process.env) {
  return Boolean(principal && principal.role === 'Administrador' && principal.active === true &&
    isMasterIdentity(principal, env));
}

export function canCreateAccount(actor, role, env = process.env) {
  return Boolean(actor && actor.role === 'Administrador' && actor.active === true &&
    ROLES.has(role) && (role !== 'Administrador' || isMasterAdmin(actor, env)));
}

export function canUpdateAccount(actor, target, nextRole, nextActive, env = process.env) {
  if (!actor || actor.role !== 'Administrador' || actor.active !== true ||
      !target || !ROLES.has(nextRole) || typeof nextActive !== 'boolean') return false;
  const master = isMasterAdmin(actor, env);
  // O Master virtual nao pode ter seu perfil compartilhado reescrito (mesmo pelo Master).
  if (isPinnedPreviewGoogleIdentity(target, env)) return false;
  const targetIsMaster = isMasterIdentity(target, env);
  // Nenhuma outra sessao Master pode sobrescrever a identidade do Master inicial.
  if (targetIsMaster && actor.id !== target.id) return false;
  // Nunca permitir a remocao da identidade administrativa reservada.
  if (targetIsMaster && (nextRole !== 'Administrador' || nextActive !== true)) return false;
  // Administradores delegados nao controlam nenhuma conta administrativa.
  if ((targetIsMaster || target.role === 'Administrador' || nextRole === 'Administrador') && !master)
    return false;
  return true;
}

export function canUpdateBiMembership(actor, target, env = process.env) {
  return Boolean(actor && actor.role === 'Administrador' && actor.active === true && target &&
    (!isMasterIdentity(target, env) || isMasterAdmin(actor, env)));
}
