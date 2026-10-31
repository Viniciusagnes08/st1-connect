// Permissão derivada exclusivamente de sessão autenticada do administrador inicial.
// Nunca conferir o e-mail recebido em body/query para conceder privilégios.
export function isMasterAdmin(principal, env = process.env) {
  if (!principal || principal.role !== 'Administrador' || principal.active !== true) return false;
  const bootstrap = String(env.ST1_BOOTSTRAP_EMAIL || '').trim().toLowerCase();
  const verifiedEmail = typeof principal.email === 'string' ? principal.email.trim().toLowerCase() : '';
  return Boolean(bootstrap && verifiedEmail && verifiedEmail === bootstrap);
}
