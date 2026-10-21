import { currentPrincipal, loadDirectory, publicDirectory } from './_lib/identity.js';
import { connection, inTransaction } from './_lib/db.js';
import { findMembership } from './_lib/bi-membership.js';
import { assertBiEnabled, validWriteOrigin, validateJsonBody, sendError } from './_lib/http.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control','no-store');
  try {
    assertBiEnabled();
    const user=await currentPrincipal(req);
    const db=await connection();
    if (req.method==='GET') {
      if (req.query?.mode==='self') {
        const membership=await findMembership(db,user.id);
        return res.status(200).json({
          membership:membership?.active ? {biRole:membership.bi_role,active:true} : null,
          canManageMembers:user.role==='Administrador',
          isBiStaff:Boolean(membership?.active && ['Administrador','Supervisor','Técnico'].includes(user.role)),
        });
      }
      if (user.role!=='Administrador')
        return res.status(403).json({error:'Apenas o administrador pode consultar membros do Squad.'});
      const accounts=publicDirectory(await loadDirectory());
      const rows=await db.query('SELECT user_id,bi_role,active FROM st1_bi.bi_memberships');
      const byId=new Map(rows.rows.map(x=>[x.user_id,x]));
      return res.status(200).json({users:accounts.map(person=>({
        ...person,
        membership:byId.has(person.id) ? {
          biRole:byId.get(person.id).bi_role,
          active:byId.get(person.id).active,
        } : null,
      }))});
    }
    if(req.method==='POST') {
      if(user.role!=='Administrador') return res.status(403).json({error:'Apenas o administrador pode gerenciar o Squad.'});
      if(!validWriteOrigin(req)) return res.status(403).json({error:'Origem não autorizada.'});
      const body=validateJsonBody(req,2000);
      if(body.action!=='set' || typeof body.userId!=='string' ||
         !['manager','analyst'].includes(body.biRole) || typeof body.active!=='boolean')
        return res.status(400).json({error:'Configuração de membro inválida.'});
      const account=(await loadDirectory()).find(p=>p.id===body.userId);
      if(!account || (body.active && !account.active))
        return res.status(404).json({error:'Conta ativa não encontrada.'});
      if(body.active && !['Administrador','Supervisor','Técnico'].includes(account.role))
        return res.status(400).json({error:'Altere o perfil para Técnico, Supervisor ou Administrador antes de autorizar no BI.'});
      const result=await inTransaction(async tx=>{
        const assigned=await tx.query(
          `INSERT INTO st1_bi.bi_memberships(user_id,bi_role,active,granted_by)
           VALUES($1,$2,$3,$4)
           ON CONFLICT(user_id) DO UPDATE
           SET bi_role=EXCLUDED.bi_role,active=EXCLUDED.active,
               granted_by=EXCLUDED.granted_by,granted_at=now()
           RETURNING user_id,bi_role,active`,
          [body.userId,body.biRole,body.active,user.id]
        );
        await tx.query(
          `INSERT INTO st1_bi.audit_log(actor_user_id,action,target_id,metadata)
           VALUES($1,'bi_membership_set',$2,$3::jsonb)`,
          [user.id,body.userId,JSON.stringify({biRole:body.biRole,active:body.active})]
        );
        return assigned.rows[0];
      });
      return res.status(200).json({membership:result});
    }
    res.setHeader('Allow','GET, POST');
    return res.status(405).json({error:'Método não permitido.'});
  } catch(error) { return sendError(res,error); }
}
