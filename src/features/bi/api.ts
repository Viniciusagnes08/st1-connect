import type { BiQueueItem, BiMembership, BiSelf, BiState, OwnRequest, SquadMember, TicketDetail } from './types';

export class BiApiError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = 'BiApiError'; }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...init,
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
  });
  const result: unknown = await response.json().catch(() => ({}));
  const data = result as { error?: string };
  if (!response.ok) throw new BiApiError(response.status, data.error || 'Não foi possível completar a operação.');
  return result as T;
}

export const getBiSelf = () => request<BiSelf>('/api/bi-members?mode=self');
export const getMyRequests = async () => (await request<{items:OwnRequest[]}>('/api/requests')).items;
export const getBiQueue = async () => (await request<{items:BiQueueItem[]}>('/api/bi-tickets')).items;
export const getBiTicket = (id: string) =>
  request<TicketDetail>('/api/bi-tickets?id=' + encodeURIComponent(id));
export const getSquadMembers = async () =>
  (await request<{users:SquadMember[]}>('/api/bi-members')).users;

export const createBiTicket = (
  form: { title: string; description: string }, idempotencyKey: string,
) => request<{id:string;protocol:string;title:string;scope:'BI';repeated:boolean}>(
  '/api/bi-tickets', {
    method:'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(form),
  },
);

export const setBiMember = (userId: string, biRole: 'manager' | 'analyst', active: boolean) =>
  request<{membership:BiMembership}>('/api/bi-members', {
    method:'POST',body:JSON.stringify({action:'set',userId,biRole,active}),
  });

export const updateBiState = (id: string, state: BiState, reason: string) =>
  request<{ticket:BiQueueItem}>('/api/bi-tickets', {
    method:'PATCH',body:JSON.stringify({id,state,reason}),
  });
