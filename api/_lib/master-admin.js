// A identidade Master vem do cadastro privado e da configuracao inicial do servidor.
// Nunca confiar em e-mail, papel ou isMaster enviados no corpo da requisicao.
const normalizedEmail = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
const ROLES = new Set(['Administrador', 'Supervisor', 'Técnico', 'Solicitante']);

export function isMasterIdentity(account, env = process.env) {
  const bootstrapEmail = normalizedEmail(env.ST1_BOOTSTRAP_EMAIL);
  return Boolean(account && bootstrapEmail && normalizedEmail(account.email) === bootstrapEmail);
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
  const targetIsMaster = isMasterIdentity(target, env);
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
