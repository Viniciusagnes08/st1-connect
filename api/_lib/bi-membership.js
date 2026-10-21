export const BI_STAFF_ROLES = Object.freeze(['Administrador', 'Supervisor', 'Técnico']);

export function isBiStaff(user, membership) {
  return Boolean(user && BI_STAFF_ROLES.includes(user.role) &&
    membership && membership.active === true);
}

export async function findMembership(db, userId) {
  const result=await db.query(
    'SELECT user_id,bi_role,active,granted_at FROM st1_bi.bi_memberships WHERE user_id=$1',
    [userId]
  );
  return result.rows[0] || null;
}

export async function requireBiStaff(db, principal) {
  const membership=await findMembership(db,principal.id);
  if (!isBiStaff(principal,membership)) {
    throw Object.assign(new Error('Acesso exclusivo de membros autorizados do Squad de BI.'),{status:403});
  }
  return membership;
}
