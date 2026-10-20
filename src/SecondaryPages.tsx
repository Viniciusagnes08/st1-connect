import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
  ArrowDownToLine, ArrowLeft, ArrowRight, BookOpen, Cable, Check,
  CheckCircle2, ChevronRight, Clock3, FileText, HardDrive, Info,
  Laptop, Layers3, LifeBuoy, Monitor, Plus, RotateCcw, Search,
  Server, Settings2, ShieldCheck, Ticket as TicketIcon, Users, X,
} from 'lucide-react';
import {
  AGENTS, ARTICLES, CATEGORIES, PRIORITIES, TEAMS,
  createSeedData, effectiveDueAt, getSla, isOpen, makeId, toCsv,
} from './domain';
import type { AppData, Asset, Category, Priority, Settings, Team, Ticket } from './domain';
import './secondary.css';

const OPERATION_TIME_ZONE = 'America/Fortaleza';
const DAY_MS = 24 * 60 * 60 * 1000;
const dateFormatter = new Intl.DateTimeFormat('pt-BR', { timeZone: OPERATION_TIME_ZONE, day: '2-digit', month: 'short', year: 'numeric' });
const dayLabelFormatter = new Intl.DateTimeFormat('pt-BR', { timeZone: OPERATION_TIME_ZONE, day: '2-digit', month: '2-digit' });
const calendarFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: OPERATION_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const formatDate = (value: string) => dateFormatter.format(new Date(value));
const formatNumber = (value: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value);
const assetStatuses: Asset['status'][] = ['Em uso', 'Disponível', 'Em manutenção'];

function startOfOperationDay(now: Date): Date {
  const parts = calendarFormatter.formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)!.value;
  // Fortaleza uses UTC−03:00. Calendar boundaries must not depend on the browser's local timezone.
  return new Date(`${part('year')}-${part('month')}-${part('day')}T00:00:00-03:00`);
}

function Empty({ title, children }: { title: string; children: ReactNode }) {
  return <div className="secondary-empty"><Search size={25} /><h3>{title}</h3><p>{children}</p></div>;
}

function Dialog({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return <dialog ref={dialogRef} className="secondary-dialog" aria-labelledby="secondary-dialog-title" onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="secondary-dialog-inner">
      <header className="secondary-dialog-heading"><div><h2 id="secondary-dialog-title">{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button type="button" className="secondary-icon-button" onClick={onClose} aria-label="Fechar janela"><X size={20} /></button></header>
      {children}
    </div>
  </dialog>;
}

function AssetIcon({ type, size = 22 }: { type: string; size?: number }) {
  const normalized = type.toLowerCase();
  if (normalized.includes('notebook') || normalized.includes('computador')) return <Laptop size={size} />;
  if (normalized.includes('roteador') || normalized.includes('switch') || normalized.includes('rede')) return <Cable size={size} />;
  if (normalized.includes('sistema') || normalized.includes('servidor')) return <Server size={size} />;
  return <Monitor size={size} />;
}

export function AssetsPage({ data, onUpdate, onOpenTicket, notify }: {
  data: AppData; onUpdate: (data: AppData) => void; onOpenTicket: (id: string) => void; notify: (message: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('Todos os status');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState('');
  const selected = data.assets.find(asset => asset.id === selectedId);
  const assets = data.assets.filter(asset =>
    `${asset.name} ${asset.id} ${asset.model} ${asset.type} ${asset.team}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')) &&
    (status === 'Todos os status' || asset.status === status),
  );
  const addAsset = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const name = String(values.get('name') ?? '').trim();
    const model = String(values.get('model') ?? '').trim();
    const location = String(values.get('location') ?? '').trim();
    if (name.length < 3 || !model || !location) { setError('Preencha o nome, o modelo e a unidade do ativo.'); return; }
    const asset: Asset = {
      id: makeId('ATV'), name, model, location,
      type: String(values.get('type')),
      team: String(values.get('team')) as Team,
      status: String(values.get('status')) as Asset['status'],
    };
    onUpdate({ ...data, assets: [asset, ...data.assets] });
    setIsAdding(false); setSelectedId(asset.id); setSearch(''); setStatus('Todos os status');
    notify('Ativo cadastrado com sucesso.');
  };
  return <div className="secondary-page">
    <div className="secondary-stat-grid secondary-stat-grid-three">
      <SmallStat icon={<HardDrive size={20} />} label="Ativos cadastrados" value={data.assets.length} detail="Inventário da central" />
      <SmallStat icon={<CheckCircle2 size={20} />} label="Em uso" value={data.assets.filter(asset => asset.status === 'Em uso').length} detail="Equipamentos em operação" tone="green" />
      <SmallStat icon={<Settings2 size={20} />} label="Em manutenção" value={data.assets.filter(asset => asset.status === 'Em manutenção').length} detail="Acompanhamento necessário" tone="amber" />
    </div>
    <section className="panel secondary-panel">
      <div className="secondary-toolbar"><div className="secondary-search"><Search size={17} /><input aria-label="Buscar ativo" placeholder="Buscar nome, patrimônio ou modelo..." value={search} onChange={event => setSearch(event.target.value)} /></div><div className="secondary-toolbar-actions"><select className="secondary-select" aria-label="Filtrar situação dos ativos" value={status} onChange={event => setStatus(event.target.value)}><option>Todos os status</option>{assetStatuses.map(value => <option key={value}>{value}</option>)}</select><button className="btn btn-primary" onClick={() => { setError(''); setIsAdding(true); }}><Plus size={17} />Novo ativo</button></div></div>
      <div className="secondary-table-scroll"><table className="secondary-table"><thead><tr><th>Ativo</th><th>Tipo</th><th>Equipe</th><th>Unidade</th><th>Situação</th><th><span className="secondary-sr-only">Detalhes</span></th></tr></thead><tbody>{assets.map(asset => <tr key={asset.id} className={selectedId === asset.id ? 'asset-selected-row' : undefined}><td><button className="asset-name-button" onClick={() => setSelectedId(selectedId === asset.id ? null : asset.id)}><span className="asset-icon"><AssetIcon type={asset.type} /></span><span><strong>{asset.name}</strong><small>{asset.id} · {asset.model}</small></span></button></td><td>{asset.type}</td><td>{asset.team}</td><td>{asset.location}</td><td><span className={`secondary-status ${asset.status === 'Em uso' ? 'secondary-status-green' : asset.status === 'Em manutenção' ? 'secondary-status-amber' : 'secondary-status-blue'}`}>{asset.status}</span></td><td><button className="secondary-icon-button" onClick={() => setSelectedId(selectedId === asset.id ? null : asset.id)} aria-label={`Ver detalhes de ${asset.name}`}><ChevronRight size={18} /></button></td></tr>)}</tbody></table></div>
      {!assets.length && <Empty title="Nenhum ativo encontrado">Tente outro termo ou ajuste o filtro de situação.</Empty>}
      <div className="secondary-table-footer">{assets.length} de {data.assets.length} ativos</div>
    </section>
    {selected && <section className="panel secondary-panel asset-detail-panel"><div className="secondary-section-heading"><div><span className="secondary-eyebrow">DETALHES DO ATIVO</span><h2>{selected.name}</h2><p>{selected.id} · {selected.model}</p></div><button className="secondary-icon-button" aria-label="Fechar detalhes do ativo" onClick={() => setSelectedId(null)}><X size={18} /></button></div><div className="asset-detail-content"><div className="asset-detail-meta"><div><span>Tipo</span><strong>{selected.type}</strong></div><div><span>Equipe responsável</span><strong>{selected.team}</strong></div><div><span>Unidade</span><strong>{selected.location}</strong></div><label><span>Situação do ativo</span><select className="secondary-select" value={selected.status} onChange={event => { onUpdate({ ...data, assets: data.assets.map(asset => asset.id === selected.id ? { ...asset, status: event.target.value as Asset['status'] } : asset) }); notify('Situação do ativo atualizada.'); }}>{assetStatuses.map(value => <option key={value}>{value}</option>)}</select></label></div><div className="asset-linked-tickets"><h3>Chamados vinculados <span>{data.tickets.filter(ticket => ticket.assetId === selected.id).length}</span></h3>{data.tickets.filter(ticket => ticket.assetId === selected.id).length ? data.tickets.filter(ticket => ticket.assetId === selected.id).map(ticket => <button key={ticket.id} onClick={() => onOpenTicket(ticket.id)}><TicketIcon size={17} /><span><strong>{ticket.title}</strong><small>{ticket.id} · {ticket.status}</small></span><ArrowRight size={16} /></button>) : <p className="muted">Este ativo ainda não possui chamados vinculados.</p>}</div></div></section>}
    {isAdding && <Dialog title="Cadastrar ativo" subtitle="Organize os equipamentos e sistemas da sua operação." onClose={() => setIsAdding(false)}><form onSubmit={addAsset} className="secondary-form"><div className="secondary-form-grid"><label className="secondary-form-wide">Nome do ativo<input autoFocus name="name" placeholder="Ex.: Notebook de atendimento 04" required minLength={3} maxLength={100} /></label><label>Tipo<select name="type"><option>Notebook</option><option>Computador</option><option>Roteador</option><option>Switch</option><option>Impressora</option><option>Sistema</option><option>Servidor</option><option>Outro</option></select></label><label>Modelo ou versão<input name="model" placeholder="Ex.: Latitude 3450" required maxLength={100} /></label><label>Equipe<select name="team">{TEAMS.map(team => <option key={team}>{team}</option>)}</select></label><label>Situação<select name="status">{assetStatuses.map(value => <option key={value}>{value}</option>)}</select></label><label className="secondary-form-wide">Unidade<input name="location" placeholder="Ex.: Unidade administrativa" required maxLength={100} /></label></div>{error && <p className="secondary-form-error" role="alert">{error}</p>}<div className="secondary-dialog-actions"><button type="button" className="btn btn-secondary" onClick={() => setIsAdding(false)}>Cancelar</button><button className="btn btn-primary" type="submit"><Plus size={17} />Cadastrar ativo</button></div></form></Dialog>}
  </div>;
}

const categoryIcon = (category: Category, size = 22) => category === 'Rede e conectividade' ? <Cable size={size} /> : category === 'Equipamentos' ? <Laptop size={size} /> : category === 'Dados e indicadores' ? <Layers3 size={size} /> : category === 'Serviços internos' ? <LifeBuoy size={size} /> : <Monitor size={size} />;

export function KnowledgePage({ onNewTicket }: { onNewTicket: (title?: string, category?: Category) => void }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<Category | 'Todos'>('Todos');
  const [articleId, setArticleId] = useState<string | null>(null);
  const article = ARTICLES.find(item => item.id === articleId);
  const articles = ARTICLES.filter(item => (category === 'Todos' || item.category === category) && `${item.title} ${item.summary} ${item.body.join(' ')}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));
  if (article) return <div className="knowledge-reader-layout"><article className="panel knowledge-reader"><button className="knowledge-back" onClick={() => setArticleId(null)}><ArrowLeft size={16} />Voltar para os artigos</button><span className="secondary-status secondary-status-orange">{article.category}</span><h2>{article.title}</h2><p className="knowledge-lead">{article.summary}</p><div className="knowledge-article-meta"><span><Clock3 size={15} />{article.readingMinutes} min de leitura</span><span>Revisado em {formatDate(article.updatedAt)}</span></div><div className="knowledge-article-body">{article.body.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div><div className="knowledge-article-note"><Info size={18} /><p>Procedimento de demonstração. Confirme o fluxo com a equipe responsável antes de aplicar na operação.</p></div></article><aside className="knowledge-reader-aside"><div className="panel knowledge-help-card"><span className="knowledge-help-icon"><LifeBuoy size={25} /></span><h3>Precisa de uma mão?</h3><p>Leve o contexto deste artigo para a equipe de atendimento.</p><button className="btn btn-primary" onClick={() => onNewTicket(`Ajuda: ${article.title}`, article.category)}>Abrir chamado<ArrowRight size={16} /></button></div><div className="panel knowledge-related"><h3>Continue explorando</h3>{ARTICLES.filter(item => item.id !== article.id).slice(0, 3).map(item => <button key={item.id} onClick={() => setArticleId(item.id)}><BookOpen size={17} /><span>{item.title}</span><ChevronRight size={16} /></button>)}</div></aside></div>;
  return <div className="secondary-page"><section className="knowledge-intro"><div className="knowledge-intro-copy"><span className="secondary-eyebrow">CONHECIMENTO QUE CONECTA</span><h2>Uma resposta pode estar aqui.</h2><p>Encontre orientações e resolva as dúvidas do dia a dia.</p><div className="secondary-search knowledge-search"><Search size={19} /><input aria-label="Buscar na base de conhecimento" placeholder="O que você precisa resolver?" value={search} onChange={event => setSearch(event.target.value)} /></div></div><div className="knowledge-illustration" aria-hidden="true"><div className="knowledge-illustration-book"><BookOpen size={63} strokeWidth={1.25} /></div><span className="knowledge-illustration-check"><Check size={22} /></span><span className="knowledge-illustration-small"><FileText size={22} /></span></div></section><div className="knowledge-category-tabs" role="group" aria-label="Categoria dos artigos">{(['Todos', ...CATEGORIES] as const).map(value => <button className={value === category ? 'active' : ''} key={value} onClick={() => setCategory(value)}>{value}</button>)}</div><div className="secondary-section-heading knowledge-list-heading"><h2>{category === 'Todos' ? 'Explore a base de conhecimento' : category}</h2><span>{articles.length} {articles.length === 1 ? 'artigo' : 'artigos'}</span></div><div className="knowledge-grid">{articles.map(item => <button key={item.id} className="panel knowledge-card" onClick={() => setArticleId(item.id)}><span className="knowledge-card-icon">{categoryIcon(item.category)}</span><small>{item.category}</small><h3>{item.title}</h3><p>{item.summary}</p><div className="knowledge-card-footer"><span><Clock3 size={14} />{item.readingMinutes} min de leitura</span><ArrowRight size={17} /></div></button>)}</div>{!articles.length && <section className="panel"><Empty title="Ainda não encontramos essa resposta">Experimente outra palavra ou abra um chamado com sua dúvida.</Empty></section>}<div className="knowledge-bottom-help"><div><h3>Não encontrou o que precisava?</h3><p>Conte com a equipe para seguir em frente.</p></div><button className="btn btn-secondary" onClick={() => onNewTicket()}><Plus size={16} />Abrir chamado</button></div></div>;
}

function SmallStat({ label, value, detail, icon, tone = 'orange' }: { label: string; value: number | string; detail: string; icon: ReactNode; tone?: string }) {
  return <div className="panel secondary-stat"><div className="secondary-stat-top"><span>{label}</span><span className={`secondary-stat-icon secondary-stat-icon-${tone}`}>{icon}</span></div><strong>{value}</strong><small>{detail}</small></div>;
}

export function TeamsPage({ tickets, onTeamClick }: { tickets: Ticket[]; onTeamClick: (team: Team) => void }) {
  const openTickets = tickets.filter(isOpen);
  const teamIcons = [<Monitor size={22} />, <Cable size={22} />, <LifeBuoy size={22} />, <Users size={22} />];
  const teamDescriptions: Record<Team, string> = { Sistemas: 'Aplicações, acessos e dados', Redes: 'Conectividade e infraestrutura', Suporte: 'Equipamentos e atendimento', Administrativo: 'Solicitações e serviços internos' };
  const maxWorkload = Math.max(1, ...AGENTS.map(agent => openTickets.filter(ticket => ticket.assignee === agent.id).length));
  return <div className="secondary-page"><div className="secondary-stat-grid secondary-stat-grid-three"><SmallStat label="Equipes conectadas" value={TEAMS.length} detail={`${AGENTS.length} agentes de demonstração`} icon={<Users size={20} />} /><SmallStat label="Chamados em aberto" value={openTickets.length} detail="Distribuídos entre as equipes" icon={<TicketIcon size={20} />} tone="blue" /><SmallStat label="Sem responsável" value={openTickets.filter(ticket => !ticket.assignee).length} detail="Aguardando atribuição de agente" icon={<Clock3 size={20} />} tone="amber" /></div><div className="team-card-grid">{TEAMS.map((team, index) => {
    const teamOpen = openTickets.filter(ticket => ticket.team === team);
    const agents = AGENTS.filter(agent => agent.team === team);
    const overdue = teamOpen.filter(ticket => getSla(ticket).state === 'overdue').length;
    return <section className="panel team-card" key={team}><div className="team-card-heading"><span className={`team-card-icon team-card-icon-${index}`}>{teamIcons[index]}</span><div><h2>{team}</h2><p>{teamDescriptions[team]}</p></div><span className="secondary-status secondary-status-gray">{agents.length} {agents.length === 1 ? 'agente' : 'agentes'}</span></div><div className="team-card-summary"><div><strong>{teamOpen.length}</strong><span>Em aberto</span></div><div><strong>{teamOpen.filter(ticket => ticket.status === 'Em atendimento').length}</strong><span>Em atendimento</span></div><div className={overdue ? 'team-card-warning' : ''}><strong>{overdue}</strong><span>Prazo vencido</span></div></div><div className="team-card-people">{agents.map(agent => {
      const count = teamOpen.filter(ticket => ticket.assignee === agent.id).length;
      return <div className="team-card-person" key={agent.id}><span className="team-card-avatar" style={{ backgroundColor: agent.color }}>{agent.initials}</span><div><strong>{agent.name}</strong><div className="team-card-workload"><span style={{ width: `${count / maxWorkload * 100}%` }} /></div></div><span>{count}<small>em aberto</small></span></div>;
    })}<div className="team-card-unassigned"><span>Sem agente atribuído</span><strong>{teamOpen.filter(ticket => !ticket.assignee).length}</strong></div></div><button className="team-card-footer" onClick={() => onTeamClick(team)}>Ver fila de {team.toLocaleLowerCase('pt-BR')}<ArrowRight size={17} /></button></section>;
  })}</div><p className="secondary-footnote"><Info size={15} />A carga de trabalho considera chamados novos, em atendimento e pendentes.</p></div>;
}

export function ReportsPage({ tickets, onOpenTicket }: { tickets: Ticket[]; onOpenTicket: (id: string) => void }) {
  const [days, setDays] = useState(14);
  const [category, setCategory] = useState<Category | null>(null);
  const [exportMessage, setExportMessage] = useState('');
  const report = useMemo(() => {
    const now = new Date();
    const start = new Date(startOfOperationDay(now).getTime() - (days - 1) * DAY_MS);
    const cohort = tickets.filter(ticket => new Date(ticket.createdAt) >= start && new Date(ticket.createdAt) <= now);
    const resolved = cohort.filter(ticket => !isOpen(ticket) && ticket.resolvedAt);
    const onTime = resolved.filter(ticket => new Date(ticket.resolvedAt!) <= effectiveDueAt(ticket));
    const resolutionMs = resolved.reduce((total, ticket) => total + Math.max(0, new Date(ticket.resolvedAt!).getTime() - new Date(ticket.createdAt).getTime() - ticket.pausedMs), 0);
    const daily = Array.from({ length: days }, (_, index) => {
      const date = new Date(start.getTime() + index * DAY_MS);
      const end = new Date(date.getTime() + DAY_MS);
      return { label: dayLabelFormatter.format(date), opened: tickets.filter(ticket => new Date(ticket.createdAt) >= date && new Date(ticket.createdAt) < end).length, resolved: tickets.filter(ticket => ticket.resolvedAt && new Date(ticket.resolvedAt) >= date && new Date(ticket.resolvedAt) < end).length };
    });
    return { cohort, resolved, onTime, resolutionHours: resolved.length ? resolutionMs / resolved.length / 3600000 : null, daily };
  }, [tickets, days]);
  const maxDaily = Math.max(1, ...report.daily.flatMap(day => [day.opened, day.resolved]));
  const categoryRows = CATEGORIES.map(item => ({ category: item, items: report.cohort.filter(ticket => ticket.category === item) })).sort((a, b) => b.items.length - a.items.length);
  const exportReport = () => {
    const payload = toCsv(category ? report.cohort.filter(ticket => ticket.category === category) : report.cohort);
    const blob = new Blob([payload], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = `st1-connect-relatorio-${days}-dias.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExportMessage('Relatório CSV preparado para download.');
  };
  return <div className="secondary-page"><div className="report-toolbar"><div><span className="secondary-eyebrow">LEITURA DA OPERAÇÃO</span><p>Indicadores calculados a partir dos chamados cadastrados.</p></div><div className="secondary-toolbar-actions"><select className="secondary-select" aria-label="Período do relatório" value={days} onChange={event => { setDays(Number(event.target.value)); setCategory(null); }}><option value={7}>Últimos 7 dias</option><option value={14}>Últimos 14 dias</option><option value={30}>Últimos 30 dias</option></select><button className="btn btn-secondary" onClick={exportReport}><ArrowDownToLine size={17} />Exportar CSV</button></div></div>{exportMessage && <p className="report-export-feedback" role="status"><CheckCircle2 size={15} />{exportMessage}</p>}<div className="secondary-stat-grid"><SmallStat label="Chamados recebidos" value={report.cohort.length} detail="Abertos dentro do período" icon={<TicketIcon size={20} />} /><SmallStat label="Taxa de resolução" value={report.cohort.length ? `${formatNumber(report.resolved.length / report.cohort.length * 100)}%` : '—'} detail={`${report.resolved.length} dos ${report.cohort.length} chamados do período`} icon={<CheckCircle2 size={20} />} tone="green" /><SmallStat label="Tempo médio de resolução" value={report.resolutionHours === null ? '—' : `${formatNumber(report.resolutionHours)}h`} detail="Descontadas as horas em pendência" icon={<Clock3 size={20} />} tone="blue" /><SmallStat label="Resoluções dentro do prazo" value={report.resolved.length ? `${formatNumber(report.onTime.length / report.resolved.length * 100)}%` : '—'} detail={`${report.onTime.length} de ${report.resolved.length} resoluções`} icon={<ShieldCheck size={20} />} tone="green" /></div><section className="panel secondary-panel"><div className="secondary-section-heading"><div><h2>Evolução do atendimento</h2><p>Eventos de abertura e resolução em cada dia do período</p></div><div className="report-legend"><span><i />Recebidos</span><span><i />Resolvidos</span></div></div><div className="report-chart-scroll"><div className="report-chart" style={{ minWidth: days > 14 ? 790 : 480 }}>{report.daily.map((day, index) => <div className="report-chart-day" key={day.label}><div className="report-chart-bars"><div className="report-bar report-bar-opened" style={{ height: `${day.opened / maxDaily * 100}%` }} title={`${day.label}: ${day.opened} recebidos`}><span>{day.opened || ''}</span></div><div className="report-bar report-bar-resolved" style={{ height: `${day.resolved / maxDaily * 100}%` }} title={`${day.label}: ${day.resolved} resolvidos`}><span>{day.resolved || ''}</span></div></div><small>{days < 15 || index % 2 === 0 ? day.label : ' '}</small></div>)}</div></div><p className="secondary-footnote report-chart-caption">Escala proporcional ao volume diário. As resoluções podem incluir chamados abertos antes do período.</p></section><div className="report-bottom-grid"><section className="panel secondary-panel"><div className="secondary-section-heading"><div><h2>Onde estão as demandas?</h2><p>Chamados abertos por categoria</p></div><Layers3 size={20} /></div><div className="report-category-list">{categoryRows.map(row => <button key={row.category} className={`report-category ${category === row.category ? 'active' : ''}`} onClick={() => setCategory(category === row.category ? null : row.category)}><div><strong>{row.category}</strong><span>{row.items.length}<ChevronRight size={15} /></span></div><div className="report-category-track"><span style={{ width: `${row.items.length / Math.max(1, report.cohort.length) * 100}%` }} /></div></button>)}</div></section><section className="panel secondary-panel"><div className="secondary-section-heading"><div><h2>{category || 'Prioridades do período'}</h2><p>{category ? 'Chamados da categoria selecionada' : 'Distribuição dos chamados recebidos'}</p></div>{category && <button className="secondary-icon-button" aria-label="Limpar filtro de categoria" onClick={() => setCategory(null)}><X size={17} /></button>}</div>{category ? <div className="report-filtered-list">{report.cohort.filter(ticket => ticket.category === category).length ? report.cohort.filter(ticket => ticket.category === category).map(ticket => <button key={ticket.id} onClick={() => onOpenTicket(ticket.id)}><span><strong>{ticket.title}</strong><small>{ticket.id} · {ticket.status}</small></span><ArrowRight size={17} /></button>) : <Empty title="Sem chamados nesta categoria">O período selecionado não possui registros.</Empty>}</div> : <div className="report-priority-list">{PRIORITIES.map((priority, index) => { const count = report.cohort.filter(ticket => ticket.priority === priority).length; return <div key={priority}><span className={`report-priority-dot report-priority-dot-${index}`} /><strong>{priority}</strong><span>{count} {count === 1 ? 'chamado' : 'chamados'}</span><b>{report.cohort.length ? Math.round(count / report.cohort.length * 100) : 0}%</b></div>; })}</div>}</section></div></div>;
}

export function SettingsPage({ data, onUpdate, notify }: { data: AppData; onUpdate: (data: AppData) => void; notify: (message: string) => void }) {
  const [workspace, setWorkspace] = useState(data.settings.workspace);
  const [slaHours, setSlaHours] = useState<Record<Priority, string>>(() => Object.fromEntries(PRIORITIES.map(priority => [priority, String(data.settings.slaHours[priority])])) as Record<Priority, string>);
  const [restore, setRestore] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setWorkspace(data.settings.workspace);
    setSlaHours(Object.fromEntries(PRIORITIES.map(priority => [priority, String(data.settings.slaHours[priority])])) as Record<Priority, string>);
  }, [data.settings]);
  const saveSettings = (event: FormEvent) => {
    event.preventDefault();
    if (!workspace.trim() || PRIORITIES.some(priority => !Number.isFinite(Number(slaHours[priority])) || Number(slaHours[priority]) < 0.5 || Number(slaHours[priority]) > 720)) { setError('Informe o nome da central e prazos entre 0,5 e 720 horas.'); return; }
    const settings: Settings = { workspace: workspace.trim(), slaHours: Object.fromEntries(PRIORITIES.map(priority => [priority, Number(slaHours[priority])])) as Record<Priority, number> };
    onUpdate({ ...data, settings }); setError(''); notify('Configurações salvas. Novos chamados usarão estes prazos.');
  };
  return <div className="settings-layout"><form onSubmit={saveSettings} className="settings-main"><section className="panel secondary-panel"><div className="secondary-section-heading"><div><h2>Identidade da central</h2><p>Um espaço para conectar as equipes da ST1.</p></div><Settings2 size={21} /></div><div className="settings-fields"><label>Nome do espaço de trabalho<input required maxLength={60} value={workspace} onChange={event => setWorkspace(event.target.value)} /></label><div className="settings-brand-preview"><span>st1<span>connect</span></span><small>Central de serviços</small></div></div></section><section className="panel secondary-panel"><div className="secondary-section-heading"><div><h2>Prazos de resolução</h2><p>Defina o tempo previsto para cada prioridade.</p></div><Clock3 size={21} /></div><div className="settings-sla-grid">{PRIORITIES.map((priority, index) => <label key={priority}><span><i className={`report-priority-dot report-priority-dot-${index}`} />{priority}</span><div><input aria-label={`Prazo da prioridade ${priority} em horas`} type="number" min="0.5" max="720" step="0.5" required value={slaHours[priority]} onChange={event => setSlaHours({ ...slaHours, [priority]: event.target.value })} /><span>horas</span></div></label>)}</div><div className="settings-note"><Info size={18} /><p>Os prazos são demonstrativos e contam horas corridas. A pendência pausa a contagem. Mudanças passam a valer para novos chamados; os prazos já registrados são preservados.</p></div></section>{error && <p role="alert" className="secondary-form-error">{error}</p>}<div className="settings-save-row"><p>As preferências ficam salvas neste navegador.</p><button className="btn btn-primary" type="submit"><Check size={17} />Salvar configurações</button></div></form><aside className="settings-aside"><section className="panel settings-demo-card"><span className="secondary-status secondary-status-orange"><span className="settings-demo-dot" />Demonstração</span><h2>Experimente a operação.</h2><p>Esta versão usa exemplos para você explorar os fluxos do ST1 Connect.</p><ul><li><CheckCircle2 size={17} />Chamados e ativos editáveis</li><li><CheckCircle2 size={17} />Dados salvos neste navegador</li><li><Info size={17} />Sem sincronização entre usuários</li><li><Info size={17} />Sem conexão com o GLPI</li></ul><p className="settings-demo-footnote">Não utilize dados reais de clientes ou informações confidenciais nesta demonstração.</p></section><section className="panel settings-reset-card"><RotateCcw size={21} /><h3>Começar de novo</h3><p>Restaure os exemplos iniciais e remova as alterações feitas neste navegador.</p><button className="btn btn-secondary" type="button" onClick={() => setRestore(true)}>Restaurar demonstração</button></section></aside>{restore && <Dialog title="Restaurar a demonstração?" subtitle="Os chamados, ativos e configurações deste navegador serão substituídos pelos exemplos iniciais." onClose={() => setRestore(false)}><div className="secondary-dialog-actions"><button className="btn btn-secondary" onClick={() => setRestore(false)}>Cancelar</button><button className="btn btn-primary" onClick={() => { onUpdate(createSeedData()); setRestore(false); notify('Demonstração restaurada com os exemplos iniciais.'); }}><RotateCcw size={16} />Sim, restaurar exemplos</button></div></Dialog>}</div>;
}
