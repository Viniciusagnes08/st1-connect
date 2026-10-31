import type { BiState, Scope, RequestState } from './types';

export const stateLabel = (state: BiState) => state;
export const scopeLabel = (scope: Scope) =>
  scope === 'BI' ? 'Atendimento BI' :
  scope === 'OUVIDORIA' ? 'Ouvidoria' :
  scope === 'GERAL' ? 'Solicitação geral' :
  scope === 'REVIEW' ? 'Aguardando triagem' : 'Encaminhamento externo';

export const stateTone = (state: RequestState) =>
  state === 'Fechado' || state === 'Resolvido' ? 'done' :
  state === 'Pendente' ? 'warning' :
  state === 'Em atendimento' ? 'active' : 'new';

export const canDisplayQueue = (isBiStaff: boolean) => isBiStaff === true;
