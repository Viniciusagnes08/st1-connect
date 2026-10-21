export type BiState = 'Novo' | 'Em atendimento' | 'Pendente' | 'Resolvido' | 'Fechado';
export type Scope = 'BI' | 'REVIEW' | 'EXTERNAL';

export interface BiQueueItem {
  id: string;
  protocol: string;
  title: string;
  topic_key: string;
  requester_email: string;
  created_at: string;
  updated_at: string;
  state: BiState;
  priority: 'Crítica' | 'Alta' | 'Média' | 'Baixa' | null;
  assignee_user_id: string | null;
}
export interface OwnRequest {
  id: string;
  protocol: string;
  title: string;
  topic_key: string;
  scope: Scope;
  created_at: string;
  state: BiState | null;
}
export interface BiMembership {
  biRole: 'manager' | 'analyst';
  active: boolean;
}
export interface BiSelf {
  membership: BiMembership | null;
  isBiStaff: boolean;
  canManageMembers: boolean;
}
export interface SquadMember {
  id: string;
  name: string;
  email: string;
  role: 'Administrador' | 'Supervisor' | 'Técnico' | 'Solicitante';
  active: boolean;
  membership: BiMembership | null;
}
export interface TicketDetail {
  ticket: BiQueueItem & {
    details: { description?: string };
    requester_user_id: string;
  };
  events: Array<{
    event_type: string;
    actor_user_id: string | null;
    payload: { from?: string; to?: string; reason?: string };
    created_at: string;
  }>;
}
