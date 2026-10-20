export type Status = 'Novo' | 'Em atendimento' | 'Pendente' | 'Resolvido' | 'Fechado'
export type Priority = 'Crítica' | 'Alta' | 'Média' | 'Baixa'
export type Category = 'Sistemas e acessos' | 'Rede e conectividade' | 'Equipamentos' | 'Dados e indicadores' | 'Serviços internos'
export type Team = 'Sistemas' | 'Redes' | 'Suporte' | 'Administrativo'

export interface HistoryEntry {
  id: string
  at: string
  author: string
  text: string
  kind: 'comment' | 'event' | 'solution'
}

export interface Ticket {
  id: string
  title: string
  description: string
  type: 'Incidente' | 'Solicitação'
  category: Category
  priority: Priority
  status: Status
  requester: string
  team: Team
  assignee: string | null
  assetId: string | null
  createdAt: string
  updatedAt: string
  dueAt: string
  resolvedAt: string | null
  pausedAt: string | null
  pausedMs: number
  history: HistoryEntry[]
}

export interface Asset {
  id: string
  name: string
  type: string
  team: Team
  status: 'Em uso' | 'Disponível' | 'Em manutenção'
  model: string
  location: string
}

export interface Agent {
  id: string
  name: string
  initials: string
  team: Team
  color: string
}

export interface Article {
  id: string
  title: string
  category: Category
  summary: string
  body: string[]
  readingMinutes: number
  updatedAt: string
}

export interface Settings {
  workspace: string
  slaHours: Record<Priority, number>
}

export interface AppData {
  version: 1
  tickets: Ticket[]
  assets: Asset[]
  settings: Settings
}

export const STATUSES: Status[] = ['Novo', 'Em atendimento', 'Pendente', 'Resolvido', 'Fechado']
export const PRIORITIES: Priority[] = ['Crítica', 'Alta', 'Média', 'Baixa']
export const CATEGORIES: Category[] = ['Sistemas e acessos', 'Rede e conectividade', 'Equipamentos', 'Dados e indicadores', 'Serviços internos']
export const TEAMS: Team[] = ['Sistemas', 'Redes', 'Suporte', 'Administrativo']

/** Pessoas fictícias para demonstrar distribuição e atribuição de trabalho. */
export const AGENTS: Agent[] = [
  { id: 'ag-lucas', name: 'Lucas', initials: 'LU', team: 'Sistemas', color: '#4865c7' },
  { id: 'ag-marina', name: 'Marina', initials: 'MA', team: 'Sistemas', color: '#9a55aa' },
  { id: 'ag-rafael', name: 'Rafael', initials: 'RA', team: 'Redes', color: '#24877f' },
  { id: 'ag-bruna', name: 'Bruna', initials: 'BR', team: 'Redes', color: '#b16a36' },
  { id: 'ag-caio', name: 'Caio', initials: 'CA', team: 'Suporte', color: '#6479a1' },
  { id: 'ag-sofia', name: 'Sofia', initials: 'SO', team: 'Administrativo', color: '#a36283' },
]

/** Metas demonstrativas em horas corridas; não representam um acordo da ST1. */
export const DEFAULT_SETTINGS: Settings = {
  workspace: 'ST1 Connect',
  slaHours: { 'Crítica': 4, 'Alta': 8, 'Média': 24, 'Baixa': 48 },
}

export const ARTICLES: Article[] = [
  {
    id: 'kb-001', title: 'Como abrir um chamado que já chega pronto para atender', category: 'Serviços internos',
    summary: 'As informações essenciais para a equipe entender e encaminhar sua solicitação.', readingMinutes: 3, updatedAt: '2026-10-18T12:00:00.000Z',
    body: [
      'Comece pelo resultado esperado. No título, descreva a necessidade em uma frase, como “Solicitar acesso ao painel comercial” ou “Impressora não conclui a impressão”. Use um chamado para cada assunto.',
      'Escolha Incidente quando algo que funcionava apresentar uma falha. Escolha Solicitação para um novo acesso, equipamento, informação ou serviço. A categoria indica qual equipe poderá iniciar a análise.',
      'Na descrição, informe o que aconteceu, quando começou e como a situação afeta o trabalho. Explique os passos já tentados e se outras pessoas também foram afetadas.',
      'Associe o ativo quando souber qual equipamento ou sistema está envolvido. Não inclua senhas, códigos de autenticação, documentos pessoais ou dados de clientes.',
      'Após enviar, acompanhe o histórico do chamado. Responda às dúvidas no mesmo registro para manter a conversa reunida. Ao receber uma solução, confira o resultado antes de fechar.',
    ],
  },
  {
    id: 'kb-002', title: 'Acesso ao ST1 Sales: o que informar ao suporte', category: 'Sistemas e acessos',
    summary: 'Organize uma solicitação de acesso ou descreva um problema de permissão.', readingMinutes: 3, updatedAt: '2026-10-17T12:00:00.000Z',
    body: [
      'Para um novo acesso, abra uma Solicitação na categoria Sistemas e acessos. Informe sua área, a atividade que precisa realizar e quais telas serão necessárias. A liberação deve seguir a aprovação de acesso definida pela empresa.',
      'Se o acesso já existia e deixou de funcionar, registre um Incidente. Diferencie falha ao entrar no sistema de ausência de permissão em uma tela específica.',
      'Anote o texto da mensagem de erro, o horário aproximado e se o problema ocorre em uma única tela. Tente atualizar a página e confirme se sua conexão está funcionando.',
      'Nunca compartilhe sua senha ou código de autenticação. O chamado deve descrever o problema sem expor credenciais ou dados pessoais.',
      'Depois que a equipe informar o ajuste, valide a atividade solicitada. Registre no chamado se o acesso ficou correto ou qual etapa ainda precisa de atendimento.',
    ],
  },
  {
    id: 'kb-003', title: 'Wi-Fi interno: verificação inicial de conectividade', category: 'Rede e conectividade',
    summary: 'Uma checagem simples para identificar o alcance de uma falha de conexão.', readingMinutes: 4, updatedAt: '2026-10-16T12:00:00.000Z',
    body: [
      'Primeiro, verifique se a falha ocorre apenas em seu equipamento ou também em outros dispositivos no mesmo ambiente. Essa informação ajuda a diferenciar uma dificuldade local de uma indisponibilidade mais ampla.',
      'Confirme se o Wi-Fi do dispositivo está habilitado e conectado à rede corporativa autorizada. Observe se há sinal e se um segundo site ou sistema também apresenta falha.',
      'Se a dificuldade estiver limitada ao dispositivo, desative e reative sua conexão Wi-Fi. Salve seu trabalho antes de qualquer reinicialização do equipamento.',
      'Não reinicie equipamentos compartilhados, altere a configuração de roteadores ou desconecte cabos de rede sem orientação da equipe responsável. Isso pode ampliar o impacto.',
      'Se a falha continuar, abra um Incidente em Rede e conectividade. Informe o ambiente de trabalho, o horário de início, os sistemas afetados e quantas posições de trabalho parecem estar sem conexão.',
      'A equipe pode pedir uma validação após a intervenção. Registre se a navegação e os sistemas voltaram a funcionar para apoiar a confirmação da solução.',
    ],
  },
  {
    id: 'kb-004', title: 'Como reportar uma divergência nos indicadores', category: 'Dados e indicadores',
    summary: 'Registre período, filtro e comportamento observado para facilitar a análise do painel.', readingMinutes: 3, updatedAt: '2026-10-15T12:00:00.000Z',
    body: [
      'Antes de abrir um chamado, confira o período selecionado e todos os filtros do painel. Indicadores com recortes diferentes não representam necessariamente a mesma população.',
      'Verifique o horário de atualização exibido no relatório, quando disponível. Uma informação ainda não atualizada pode explicar a diferença observada.',
      'Abra um Incidente em Dados e indicadores quando houver uma possível inconsistência. Use Solicitação quando precisar de uma nova visão, filtro ou métrica.',
      'Informe o nome do relatório, a métrica, o período, os filtros aplicados e o valor que você observou. Descreva a fonte usada na comparação e o resultado esperado, sem copiar registros individuais de clientes.',
      'Depois do retorno da equipe, repita a comparação com os mesmos filtros. Registre a validação no chamado para que o histórico mantenha a causa e a correção aplicadas.',
    ],
  },
  {
    id: 'kb-005', title: 'Equipamento com problema: identificação e registro', category: 'Equipamentos',
    summary: 'Relacione o ativo correto e descreva os sintomas antes de solicitar atendimento.', readingMinutes: 3, updatedAt: '2026-10-14T12:00:00.000Z',
    body: [
      'Localize o identificador patrimonial do equipamento e procure o ativo no inventário. Associar o item ao chamado reúne as ocorrências e facilita o acompanhamento das intervenções.',
      'Descreva o sintoma de forma objetiva: não liga, reinicia, apresenta lentidão, não imprime ou perde a conexão. Informe se o problema é contínuo ou aparece em uma atividade específica.',
      'Verifique somente conexões externas acessíveis e condições básicas de uso. Não abra o equipamento nem altere sua configuração sem orientação.',
      'Informe o impacto no trabalho e se existe uma alternativa temporária disponível. Isso ajuda a equipe a definir a prioridade e avaliar uma substituição.',
      'Quando houver troca ou movimentação do equipamento, a equipe responsável deve atualizar sua situação e localização no inventário. Valide o funcionamento antes de encerrar o chamado.',
    ],
  },
  {
    id: 'kb-006', title: 'Situações do chamado e como acompanhar o prazo', category: 'Serviços internos',
    summary: 'Entenda a diferença entre novo, em atendimento, pendente, resolvido e fechado.', readingMinutes: 4, updatedAt: '2026-10-18T12:00:00.000Z',
    body: [
      'Novo significa que o chamado foi registrado e está aguardando o início do atendimento. Em atendimento indica que uma pessoa ou equipe está trabalhando na demanda.',
      'Pendente deve ser usado quando o andamento depende de uma informação ou ação externa ao atendimento. Registre o motivo para que todos saibam o que precisa acontecer.',
      'Nesta demonstração, a contagem do prazo de resolução pausa durante a pendência e retoma quando o chamado volta ao atendimento. O tempo pausado é acrescentado ao vencimento.',
      'Resolvido indica que uma solução foi registrada e precisa ser validada. Fechado confirma o encerramento após essa validação. Se a solução não funcionar, o chamado pode retornar ao atendimento.',
      'Os prazos desta demonstração usam horas corridas e metas configuráveis por prioridade. Eles são exemplos para construção do sistema e não representam um acordo de atendimento já aprovado pela ST1.',
      'Acompanhe os estados Dentro do prazo, Próximo do vencimento e Vencido. Depois da resolução, o resultado do prazo fica congelado para permitir uma avaliação consistente.',
    ],
  },
]

const HOUR = 3_600_000

export function makeId(prefix: string): string {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return `${prefix}-${suffix}`
}

export function categoryTeam(category: Category): Team {
  const teams: Record<Category, Team> = {
    'Sistemas e acessos': 'Sistemas',
    'Rede e conectividade': 'Redes',
    'Equipamentos': 'Suporte',
    'Dados e indicadores': 'Sistemas',
    'Serviços internos': 'Administrativo',
  }
  return teams[category]
}

export function isOpen(ticket: Ticket): boolean {
  return ticket.status !== 'Resolvido' && ticket.status !== 'Fechado'
}

/** Vencimento base acrescido das pausas já encerradas. */
export function effectiveDueAt(ticket: Ticket): Date {
  return new Date(new Date(ticket.dueAt).getTime() + ticket.pausedMs)
}

function durationLabel(milliseconds: number): string {
  const minutes = Math.max(1, Math.ceil(Math.abs(milliseconds) / 60_000))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  if (hours < 24) return remainder ? `${hours}h ${remainder}min` : `${hours}h`
  const days = Math.floor(hours / 24)
  const remainingHours = hours % 24
  return remainingHours ? `${days}d ${remainingHours}h` : `${days}d`
}

export interface SlaResult {
  label: string
  tone: 'green' | 'amber' | 'red' | 'gray'
  remainingMs: number
  state: 'ok' | 'warning' | 'overdue' | 'paused' | 'completed'
}

export function getSla(ticket: Ticket, now = new Date()): SlaResult {
  const completed = !isOpen(ticket)
  const reference = completed
    ? new Date(ticket.resolvedAt ?? ticket.updatedAt)
    : ticket.status === 'Pendente' && ticket.pausedAt
      ? new Date(ticket.pausedAt)
      : now
  const remainingMs = effectiveDueAt(ticket).getTime() - reference.getTime()
  if (completed) {
    const withinDeadline = remainingMs >= 0
    return { label: `${ticket.status} ${withinDeadline ? 'no prazo' : 'fora do prazo'}`, tone: withinDeadline ? 'green' : 'red', remainingMs, state: 'completed' }
  }
  if (ticket.status === 'Pendente') return { label: 'Prazo pausado', tone: 'gray', remainingMs, state: 'paused' }
  if (remainingMs < 0) return { label: `Vencido há ${durationLabel(remainingMs)}`, tone: 'red', remainingMs, state: 'overdue' }
  if (remainingMs <= 2 * HOUR) return { label: `Vence em ${durationLabel(remainingMs)}`, tone: 'amber', remainingMs, state: 'warning' }
  return { label: `${durationLabel(remainingMs)} restantes`, tone: 'green', remainingMs, state: 'ok' }
}

export function transitionTicket(ticket: Ticket, nextStatus: Status, note = '', now = new Date()): Ticket {
  if (!STATUSES.includes(nextStatus)) throw new Error('Situação de chamado inválida.')
  if (!Number.isFinite(now.getTime())) throw new Error('Data da alteração inválida.')
  if (now.getTime() < new Date(ticket.updatedAt).getTime()) throw new Error('A alteração não pode ser anterior à última atualização.')
  if (nextStatus === ticket.status) return ticket
  const text = note.trim()
  if (nextStatus === 'Pendente' && !text) throw new Error('Informe o motivo da pendência.')
  if (nextStatus === 'Resolvido' && !text) throw new Error('Descreva a solução antes de resolver o chamado.')
  if (nextStatus === 'Fechado' && ticket.status !== 'Resolvido') throw new Error('Somente um chamado resolvido pode ser fechado.')

  const at = now.toISOString()
  const pausedMs = ticket.pausedMs + (
    ticket.status === 'Pendente' && ticket.pausedAt
      ? Math.max(0, now.getTime() - new Date(ticket.pausedAt).getTime())
      : 0
  )
  const eventText = nextStatus === 'Pendente'
    ? `Chamado colocado em pendência. Motivo: ${text}`
    : nextStatus === 'Resolvido'
      ? `Solução registrada: ${text}`
      : `Situação alterada de ${ticket.status} para ${nextStatus}.${text ? ` ${text}` : ''}`

  return {
    ...ticket,
    status: nextStatus,
    updatedAt: at,
    pausedMs,
    pausedAt: nextStatus === 'Pendente' ? at : null,
    resolvedAt: nextStatus === 'Resolvido' ? at : nextStatus === 'Fechado' ? ticket.resolvedAt : null,
    history: [...ticket.history, { id: makeId('evt'), at, author: 'Você', text: eventText, kind: nextStatus === 'Resolvido' ? 'solution' : 'event' }],
  }
}

const SEED_ASSETS: Asset[] = [
  { id: 'ATV-001', name: 'Notebook Atendimento 01', type: 'Notebook', team: 'Suporte', status: 'Em uso', model: 'Latitude 3540', location: 'Central de atendimento' },
  { id: 'ATV-002', name: 'Notebook Operação 02', type: 'Notebook', team: 'Sistemas', status: 'Em uso', model: 'ThinkPad E14', location: 'Sala de operações' },
  { id: 'ATV-003', name: 'Notebook Reserva 01', type: 'Notebook', team: 'Suporte', status: 'Disponível', model: 'Latitude 3540', location: 'Estoque técnico' },
  { id: 'ATV-004', name: 'Roteador Administrativo', type: 'Roteador', team: 'Redes', status: 'Em uso', model: 'Archer AX53', location: 'Administrativo' },
  { id: 'ATV-005', name: 'Switch Sala Comercial', type: 'Switch', team: 'Redes', status: 'Em uso', model: 'TL-SG2210P', location: 'Sala comercial' },
  { id: 'ATV-006', name: 'Impressora Administrativo', type: 'Impressora', team: 'Suporte', status: 'Em manutenção', model: 'EcoTank L3250', location: 'Administrativo' },
  { id: 'ATV-007', name: 'ST1 Sales', type: 'Sistema', team: 'Sistemas', status: 'Em uso', model: 'Aplicação corporativa', location: 'Ambiente demonstrativo' },
  { id: 'ATV-008', name: 'Painel Comercial', type: 'Sistema', team: 'Sistemas', status: 'Em uso', model: 'Relatório de indicadores', location: 'Ambiente demonstrativo' },
  { id: 'ATV-009', name: 'Monitor Treinamento', type: 'Monitor', team: 'Administrativo', status: 'Disponível', model: 'Monitor 24 polegadas', location: 'Sala de treinamento' },
  { id: 'ATV-010', name: 'Access Point Treinamento', type: 'Access point', team: 'Redes', status: 'Em uso', model: 'EAP225', location: 'Sala de treinamento' },
]

type SeedTemplate = { title: string; category: Category; type: Ticket['type']; description: string; assetId: string | null }
const SEED_TEMPLATES: SeedTemplate[] = [
  { title: 'ST1 Sales não carrega a fila de atendimento', category: 'Sistemas e acessos', type: 'Incidente', description: 'A fila de atendimento não conclui o carregamento ao abrir o sistema. Verificar o comportamento e restabelecer a consulta para a operação.', assetId: 'ATV-007' },
  { title: 'Oscilação de conexão na sala comercial', category: 'Rede e conectividade', type: 'Incidente', description: 'A conexão apresenta interrupções em algumas posições da sala comercial. A equipe precisa identificar o alcance da falha e validar a estabilidade após a intervenção.', assetId: 'ATV-005' },
  { title: 'Impressora não conclui a fila de impressão', category: 'Equipamentos', type: 'Incidente', description: 'Os trabalhos permanecem na fila sem sair na impressora. Avaliar o equipamento e orientar uma alternativa enquanto o atendimento estiver em andamento.', assetId: 'ATV-006' },
  { title: 'Atualização do painel comercial interrompida', category: 'Dados e indicadores', type: 'Incidente', description: 'A última atualização exibida está anterior ao período esperado. Identificar a etapa interrompida e validar os totais após a atualização.', assetId: 'ATV-008' },
  { title: 'Ajustar permissão de consulta no ST1 Sales', category: 'Sistemas e acessos', type: 'Solicitação', description: 'A operação precisa consultar uma visão já existente no sistema. Validar o perfil necessário e registrar a liberação de acesso aprovada.', assetId: 'ATV-007' },
  { title: 'Wi-Fi indisponível na sala de treinamento', category: 'Rede e conectividade', type: 'Incidente', description: 'Os dispositivos da sala de treinamento não conseguem navegar na rede corporativa. Conferir conectividade e validar o funcionamento antes do próximo encontro.', assetId: 'ATV-010' },
  { title: 'Preparar notebook para novo posto de trabalho', category: 'Equipamentos', type: 'Solicitação', description: 'Separar um notebook disponível e preparar os recursos necessários para a nova posição. Atualizar o inventário após a entrega.', assetId: 'ATV-003' },
  { title: 'Incluir filtro por equipe no relatório operacional', category: 'Dados e indicadores', type: 'Solicitação', description: 'A consulta precisa permitir a seleção de uma equipe para facilitar o acompanhamento. Validar o filtro em conjunto com os demais recortes do relatório.', assetId: 'ATV-008' },
  { title: 'Organizar equipamentos da sala de treinamento', category: 'Serviços internos', type: 'Solicitação', description: 'Conferir os equipamentos disponíveis e organizar a sala para o próximo treinamento. Registrar qualquer item que precise de substituição ou apoio técnico.', assetId: 'ATV-009' },
  { title: 'Revisar integração de entrada de solicitações', category: 'Sistemas e acessos', type: 'Incidente', description: 'Algumas solicitações de teste não aparecem na fila esperada. Verificar o fluxo de entrada e registrar a etapa em que ocorre a divergência.', assetId: 'ATV-007' },
  { title: 'Verificar sinal Wi-Fi no administrativo', category: 'Rede e conectividade', type: 'Solicitação', description: 'Avaliar a cobertura do Wi-Fi nas posições do administrativo. Registrar os pontos de instabilidade e as recomendações de ajuste.', assetId: 'ATV-004' },
  { title: 'Notebook reinicia durante o atendimento', category: 'Equipamentos', type: 'Incidente', description: 'O notebook reinicia durante a utilização de sistemas de atendimento. Identificar a causa e avaliar o uso temporário de um equipamento reserva.', assetId: 'ATV-001' },
  { title: 'Conferir divergência de total por categoria', category: 'Dados e indicadores', type: 'Incidente', description: 'A soma por categoria está diferente do total exibido no mesmo período. Comparar filtros e regras de cálculo antes de aplicar uma correção.', assetId: 'ATV-008' },
  { title: 'Atualizar orientação de abertura de chamados', category: 'Serviços internos', type: 'Solicitação', description: 'Revisar o material de orientação para incluir tipo, categoria e descrição do impacto. Disponibilizar um exemplo simples para os solicitantes.', assetId: null },
  { title: 'Tela de consulta apresenta erro ao aplicar filtro', category: 'Sistemas e acessos', type: 'Incidente', description: 'A consulta apresenta uma mensagem de erro quando dois filtros são usados juntos. Reproduzir o comportamento com registros de teste e validar o ajuste.', assetId: 'ATV-007' },
  { title: 'Identificar portas do switch da sala comercial', category: 'Rede e conectividade', type: 'Solicitação', description: 'Atualizar a identificação das portas e registrar as posições conectadas. Realizar a conferência de forma coordenada para evitar interrupções.', assetId: 'ATV-005' },
  { title: 'Substituir monitor da posição de atendimento', category: 'Equipamentos', type: 'Solicitação', description: 'A posição precisa de um monitor substituto para continuar a operação. Conferir a disponibilidade e registrar a movimentação do ativo.', assetId: 'ATV-009' },
  { title: 'Validar regra de cálculo de chamados resolvidos', category: 'Dados e indicadores', type: 'Solicitação', description: 'Aguardando confirmação sobre o período usado no indicador de resolução. Registrar a definição para manter a comparação consistente nos relatórios.', assetId: 'ATV-008' },
  { title: 'Agendar entrega de equipamento reserva', category: 'Serviços internos', type: 'Solicitação', description: 'O equipamento está preparado e aguarda a confirmação do melhor horário de entrega. Retomar o atendimento após o retorno da área solicitante.', assetId: 'ATV-003' },
  { title: 'Confirmar perfil necessário para consulta de relatórios', category: 'Sistemas e acessos', type: 'Solicitação', description: 'Aguardando a confirmação das telas necessárias para concluir a análise de acesso. A liberação deve atender apenas à atividade aprovada.', assetId: 'ATV-008' },
  { title: 'Validar horário de intervenção na rede interna', category: 'Rede e conectividade', type: 'Solicitação', description: 'A proposta de intervenção depende de uma janela acordada com a operação. Retomar após a confirmação do horário e dos responsáveis pela validação.', assetId: 'ATV-005' },
  { title: 'Aguardar teste do notebook após manutenção', category: 'Equipamentos', type: 'Incidente', description: 'O equipamento recebeu o ajuste inicial e aguarda um teste acompanhado do solicitante. Registrar o resultado antes de propor a solução definitiva.', assetId: 'ATV-001' },
  { title: 'Habilitar consulta de histórico no sistema', category: 'Sistemas e acessos', type: 'Solicitação', description: 'Solicitação de acesso à consulta de histórico para apoiar o atendimento. Perfil revisado e funcionamento validado no ambiente demonstrativo.', assetId: 'ATV-007' },
  { title: 'Restabelecer conexão de posição administrativa', category: 'Rede e conectividade', type: 'Incidente', description: 'Uma posição não conseguia acessar a rede interna. Conectividade conferida e navegação validada após a intervenção.', assetId: 'ATV-004' },
  { title: 'Preparar equipamento para treinamento', category: 'Equipamentos', type: 'Solicitação', description: 'Preparação de equipamento para atividades de treinamento interno. Recursos necessários conferidos e entrega validada.', assetId: 'ATV-003' },
  { title: 'Corrigir legenda do indicador de atendimento', category: 'Dados e indicadores', type: 'Incidente', description: 'A legenda do indicador não correspondia à regra apresentada. Texto ajustado e conferido com a definição usada no cálculo.', assetId: 'ATV-008' },
  { title: 'Revisar lista de equipamentos disponíveis', category: 'Serviços internos', type: 'Solicitação', description: 'Conferência dos equipamentos de apoio disponíveis para a operação. Situações atualizadas no inventário demonstrativo.', assetId: null },
  { title: 'Corrigir ordenação da fila no ST1 Sales', category: 'Sistemas e acessos', type: 'Incidente', description: 'A ordenação da fila não preservava o critério selecionado. Comportamento reproduzido e ajuste validado com registros de teste.', assetId: 'ATV-007' },
  { title: 'Ajustar cobertura na sala de reunião', category: 'Rede e conectividade', type: 'Solicitação', description: 'Avaliação de cobertura solicitada para melhorar a conexão durante as reuniões. Ajuste realizado e funcionamento conferido.', assetId: 'ATV-010' },
  { title: 'Instalar monitor em posto de trabalho', category: 'Equipamentos', type: 'Solicitação', description: 'Instalação de monitor disponível para apoiar o atendimento. Conexões e exibição verificadas após a montagem.', assetId: 'ATV-009' },
  { title: 'Revisar filtro de período do painel', category: 'Dados e indicadores', type: 'Incidente', description: 'O filtro de período incluía registros fora do intervalo exibido. Regra ajustada e totais conferidos em uma amostra demonstrativa.', assetId: 'ATV-008' },
  { title: 'Padronizar descrição das categorias de atendimento', category: 'Serviços internos', type: 'Solicitação', description: 'As categorias precisavam de orientações curtas para facilitar a seleção. Descrições revisadas e validadas para o catálogo de serviços.', assetId: null },
  { title: 'Restabelecer acesso à tela de solicitações', category: 'Sistemas e acessos', type: 'Incidente', description: 'A tela de solicitações apresentava erro no carregamento inicial. Comportamento corrigido e acesso confirmado.', assetId: 'ATV-007' },
  { title: 'Conferir conexão do access point', category: 'Rede e conectividade', type: 'Incidente', description: 'O ponto de acesso deixou de atender os dispositivos da sala. Conexão restabelecida e teste de navegação concluído.', assetId: 'ATV-010' },
  { title: 'Atualizar cadastro de notebook corporativo', category: 'Equipamentos', type: 'Solicitação', description: 'O cadastro precisava refletir a equipe e a localização atuais. Inventário conferido e atualização registrada.', assetId: 'ATV-002' },
  { title: 'Incluir visão de solicitações por equipe', category: 'Dados e indicadores', type: 'Solicitação', description: 'Criação de uma visão para acompanhar a distribuição de solicitações. Filtros e totais validados com a base de demonstração.', assetId: 'ATV-008' },
  { title: 'Conferir materiais para atendimento interno', category: 'Serviços internos', type: 'Solicitação', description: 'Solicitada uma conferência de itens de apoio para o atendimento. Disponibilidade organizada e necessidade de reposição registrada.', assetId: null },
  { title: 'Corrigir rótulo de etapa na consulta do sistema', category: 'Sistemas e acessos', type: 'Incidente', description: 'O rótulo exibido na consulta não correspondia à situação do registro. Texto e associação corrigidos após a validação.', assetId: 'ATV-007' },
  { title: 'Revisar identificação da rede de treinamento', category: 'Rede e conectividade', type: 'Solicitação', description: 'Padronização da identificação da rede autorizada para treinamento. Orientação atualizada e conexão validada pela equipe.', assetId: 'ATV-010' },
  { title: 'Corrigir falha de impressão administrativa', category: 'Equipamentos', type: 'Incidente', description: 'A impressão era interrompida antes de concluir o trabalho. Equipamento verificado e impressão de teste concluída.', assetId: 'ATV-006' },
  { title: 'Conferir atualização de indicadores diários', category: 'Dados e indicadores', type: 'Solicitação', description: 'Verificação da atualização diária e da consistência dos indicadores. Fluxo conferido e resultado registrado.', assetId: 'ATV-008' },
  { title: 'Reorganizar equipamento de apoio na sala de reunião', category: 'Serviços internos', type: 'Solicitação', description: 'Ajuste da disposição dos recursos de apoio para facilitar as reuniões. Instalação concluída e funcionamento validado.', assetId: 'ATV-009' },
  { title: 'Revisar acesso ao painel de solicitações', category: 'Sistemas e acessos', type: 'Solicitação', description: 'Solicitada a revisão do perfil de consulta ao painel. Acesso aprovado, aplicado e confirmado no teste de uso.', assetId: 'ATV-007' },
  { title: 'Restabelecer rede na posição de treinamento', category: 'Rede e conectividade', type: 'Incidente', description: 'A posição de treinamento ficou sem conectividade. Falha tratada e validação final concluída.', assetId: 'ATV-010' },
  { title: 'Entregar notebook de apoio ao administrativo', category: 'Equipamentos', type: 'Solicitação', description: 'Equipamento separado e preparado para uso temporário. Entrega confirmada e inventário atualizado.', assetId: 'ATV-003' },
  { title: 'Corrigir apresentação do total de solicitações', category: 'Dados e indicadores', type: 'Incidente', description: 'O total exibido não acompanhava a seleção de equipe. Regra de filtro corrigida e resultado validado.', assetId: 'ATV-008' },
  { title: 'Atualizar catálogo de serviços internos', category: 'Serviços internos', type: 'Solicitação', description: 'Revisão das descrições e do encaminhamento dos serviços internos. Catálogo atualizado para orientar a abertura de chamados.', assetId: null },
  { title: 'Concluir ajuste de navegação no ST1 Sales', category: 'Sistemas e acessos', type: 'Incidente', description: 'Uma navegação retornava para a tela inicial sem concluir a ação. Ajuste aplicado e validação final registrada.', assetId: 'ATV-007' },
]

export function createSeedData(now = new Date()): AppData {
  const anchor = now.getTime()
  const iso = (hoursFromNow: number) => new Date(anchor + hoursFromNow * HOUR).toISOString()
  const requesters = ['Atendimento', 'Comercial', 'Operações', 'Administrativo', 'Treinamento', 'Planejamento']
  const tickets = SEED_TEMPLATES.map((template, index): Ticket => {
    let priority: Priority
    let status: Status
    let createdHours: number
    let dueHours: number
    let updatedHours: number
    let resolvedAt: string | null = null
    let pausedAt: string | null = null

    if (index < 4) {
      priority = (['Crítica', 'Alta', 'Alta', 'Média'] as Priority[])[index]
      dueHours = [-0.5, -1.5, -3, -6][index]
      createdHours = dueHours - DEFAULT_SETTINGS.slaHours[priority]
      updatedHours = Math.max(createdHours + 0.5, -3)
      status = index === 2 ? 'Novo' : 'Em atendimento'
    } else if (index < 6) {
      priority = index === 4 ? 'Alta' : 'Crítica'
      dueHours = index === 4 ? 0.75 : 1.5
      createdHours = dueHours - DEFAULT_SETTINGS.slaHours[priority]
      updatedHours = Math.max(createdHours + 0.5, -1)
      status = 'Em atendimento'
    } else if (index < 17) {
      priority = index % 3 === 0 ? 'Baixa' : 'Média'
      dueHours = 4 + (index % 5) * 3
      createdHours = dueHours - DEFAULT_SETTINGS.slaHours[priority]
      updatedHours = createdHours + 0.25
      status = index % 2 === 0 ? 'Novo' : 'Em atendimento'
    } else if (index < 22) {
      priority = index % 2 === 0 ? 'Baixa' : 'Média'
      createdHours = -50 - (index - 17) * 6
      dueHours = createdHours + DEFAULT_SETTINGS.slaHours[priority]
      updatedHours = createdHours + 2
      pausedAt = iso(updatedHours)
      status = 'Pendente'
    } else {
      priority = PRIORITIES[index % PRIORITIES.length]
      createdHours = -(((index - 22) % 14) * 24 + 18 + (index % 6))
      dueHours = createdHours + DEFAULT_SETTINGS.slaHours[priority]
      const desiredDuration = DEFAULT_SETTINGS.slaHours[priority] * (index % 7 === 0 ? 1.2 : 0.25 + (index % 4) * 0.1)
      const actualDuration = Math.min(desiredDuration, -createdHours - 1)
      resolvedAt = iso(createdHours + actualDuration)
      status = index >= 42 ? 'Fechado' : 'Resolvido'
      updatedHours = Math.min(-0.25, createdHours + actualDuration + (status === 'Fechado' ? 0.5 : 0))
    }

    const team = categoryTeam(template.category)
    const teamAgents = AGENTS.filter(agent => agent.team === team)
    const assignee = status === 'Novo' ? null : teamAgents[index % teamAgents.length].id
    const id = `ST1-${1048 - index}`
    const history: HistoryEntry[] = [{ id: `evt-${id}-1`, at: iso(createdHours), author: requesters[index % requesters.length], text: 'Chamado aberto pelo portal de serviços.', kind: 'event' }]
    if (assignee) history.push({ id: `evt-${id}-2`, at: iso(createdHours + 0.15), author: 'ST1 Connect', text: `Chamado atribuído à equipe de ${team}.`, kind: 'event' })
    if (status === 'Pendente') history.push({ id: `evt-${id}-3`, at: pausedAt!, author: 'Equipe de atendimento', text: 'Aguardando retorno da área solicitante para continuar. Prazo de resolução pausado.', kind: 'event' })
    else if (resolvedAt) history.push({ id: `evt-${id}-3`, at: resolvedAt, author: 'Equipe de atendimento', text: 'Ajuste concluído e verificação realizada no ambiente demonstrativo.', kind: 'solution' })
    else if (status === 'Em atendimento') history.push({ id: `evt-${id}-3`, at: iso(updatedHours), author: 'Equipe de atendimento', text: 'Análise iniciada. O próximo retorno será registrado neste chamado.', kind: 'comment' })
    if (status === 'Fechado') history.push({ id: `evt-${id}-4`, at: iso(updatedHours), author: requesters[index % requesters.length], text: 'Solução validada. Chamado fechado.', kind: 'event' })

    return { ...template, id, priority, status, requester: requesters[index % requesters.length], team, assignee, createdAt: iso(createdHours), updatedAt: iso(updatedHours), dueAt: iso(dueHours), resolvedAt, pausedAt, pausedMs: 0, history }
  })
  return { version: 1, tickets, assets: SEED_ASSETS.map(asset => ({ ...asset })), settings: { ...DEFAULT_SETTINGS, slaHours: { ...DEFAULT_SETTINGS.slaHours } } }
}

function csvCell(value: string): string {
  // Neutralize spreadsheet formulas, including those hidden after whitespace.
  const safe = /^[\s]*[=+\-@]/u.test(value) || /^[\t\r\n]/u.test(value) ? `'${value}` : value
  return /[;"\r\n]/u.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** CSV UTF-8 com BOM e separador de ponto e vírgula, adequado ao Excel em PT-BR. */
export function toCsv(tickets: Ticket[]): string {
  const header = ['Chamado', 'Título', 'Tipo', 'Categoria', 'Prioridade', 'Situação', 'Solicitante', 'Equipe', 'Responsável', 'Ativo', 'Abertura', 'Última atualização', 'Prazo de resolução', 'Resolução', 'Descrição']
  const rows = tickets.map(ticket => [ticket.id, ticket.title, ticket.type, ticket.category, ticket.priority, ticket.status, ticket.requester, ticket.team, AGENTS.find(agent => agent.id === ticket.assignee)?.name ?? ticket.assignee ?? '', ticket.assetId ?? '', ticket.createdAt, ticket.updatedAt, effectiveDueAt(ticket).toISOString(), ticket.resolvedAt ?? '', ticket.description])
  return '\uFEFF' + [header, ...rows].map(row => row.map(csvCell).join(';')).join('\r\n')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function isText(value: unknown, max = 50_000): value is string {
  return typeof value === 'string' && value.length <= max
}
function isRequiredText(value: unknown, max = 50_000): value is string {
  return isText(value, max) && value.trim().length > 0
}
function isDateString(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 40 && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value))
}
function isNullableDate(value: unknown): value is string | null {
  return value === null || isDateString(value)
}
function oneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === 'string' && options.includes(value as T)
}
function isHistoryEntry(value: unknown): value is HistoryEntry {
  return isRecord(value) && isRequiredText(value.id, 200) && isDateString(value.at) && isRequiredText(value.author, 200) && isRequiredText(value.text) && oneOf(value.kind, ['comment', 'event', 'solution'])
}
function isTicket(value: unknown): value is Ticket {
  if (!isRecord(value)) return false
  if (!(isRequiredText(value.id, 200) && isRequiredText(value.title, 500) && isRequiredText(value.description) && oneOf(value.type, ['Incidente', 'Solicitação']) && oneOf(value.category, CATEGORIES) && oneOf(value.priority, PRIORITIES) && oneOf(value.status, STATUSES) && isRequiredText(value.requester, 200) && oneOf(value.team, TEAMS))) return false
  if (!((value.assignee === null || isRequiredText(value.assignee, 200)) && (value.assetId === null || isRequiredText(value.assetId, 200)) && isDateString(value.createdAt) && isDateString(value.updatedAt) && isDateString(value.dueAt) && isNullableDate(value.resolvedAt) && isNullableDate(value.pausedAt))) return false
  if (!(typeof value.pausedMs === 'number' && Number.isFinite(value.pausedMs) && value.pausedMs >= 0 && Array.isArray(value.history) && value.history.length <= 20_000 && value.history.every(isHistoryEntry))) return false
  const created = Date.parse(value.createdAt)
  const updated = Date.parse(value.updatedAt)
  if (updated < created || Date.parse(value.dueAt) < created || !Number.isFinite(new Date(Date.parse(value.dueAt) + value.pausedMs).getTime())) return false
  if (value.status === 'Pendente' ? value.pausedAt === null : value.pausedAt !== null) return false
  if ((value.status === 'Resolvido' || value.status === 'Fechado') ? value.resolvedAt === null : value.resolvedAt !== null) return false
  if (value.pausedAt && (Date.parse(value.pausedAt) < created || Date.parse(value.pausedAt) > updated)) return false
  if (value.resolvedAt && (Date.parse(value.resolvedAt) < created || Date.parse(value.resolvedAt) > updated)) return false
  if (value.history.some(entry => Date.parse(entry.at) < created || Date.parse(entry.at) > updated)) return false
  return true
}
function isAsset(value: unknown): value is Asset {
  return isRecord(value) && isRequiredText(value.id, 200) && isRequiredText(value.name, 300) && isRequiredText(value.type, 100) && oneOf(value.team, TEAMS) && oneOf(value.status, ['Em uso', 'Disponível', 'Em manutenção']) && isRequiredText(value.model, 300) && isRequiredText(value.location, 300)
}

export function isAppData(value: unknown): value is AppData {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.tickets) || value.tickets.length > 50_000 || !value.tickets.every(isTicket) || !Array.isArray(value.assets) || value.assets.length > 50_000 || !value.assets.every(isAsset)) return false
  if (new Set(value.tickets.map(ticket => ticket.id)).size !== value.tickets.length || new Set(value.assets.map(asset => asset.id)).size !== value.assets.length) return false
  if (!isRecord(value.settings) || !isRequiredText(value.settings.workspace, 100) || !isRecord(value.settings.slaHours)) return false
  const hours = value.settings.slaHours
  return PRIORITIES.every(priority => typeof hours[priority] === 'number' && Number.isFinite(hours[priority]) && (hours[priority] as number) > 0 && (hours[priority] as number) <= 8_760)
}
