import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, FormEvent, ReactNode } from 'react';
import {
  ArrowDownToLine, ArrowRight, ArrowUpRight, Bell, BookOpen,
  CalendarDays, Check, CheckCheck, ChevronDown, ChevronLeft,
  ChevronRight, ChevronsUpDown, CircleHelp, Clock3, Command,
  Ellipsis, Headphones, LayoutDashboard, ListFilter, List, LoaderCircle,
  Menu, MessageSquare, Monitor, Network, PanelTop, Plus, Search, Send,
  Settings2, ShieldCheck, SlidersHorizontal, Sparkles, Ticket as TicketIcon,
  TrendingUp, TriangleAlert, Users, X, Zap,
} from 'lucide-react';
import {
  AGENTS, ARTICLES, CATEGORIES, PRIORITIES, STATUSES, TEAMS,
  categoryTeam, createSeedData, effectiveDueAt, getSla, isAppData, isOpen,
  makeId, toCsv, transitionTicket,
} from './domain';
import type { AppData, Category, Priority, Status, Team, Ticket } from './domain';
import { AssetsPage, KnowledgePage, ReportsPage, SettingsPage, TeamsPage } from './SecondaryPages';
import { ProfilePanel } from './AuthGate';
import type { Account } from './AuthGate';

type Page = 'overview' | 'tickets' | 'assets' | 'knowledge' | 'teams' | 'reports' | 'settings';
const STORAGE_KEY = 'st1-connect:v1';
const PAGE_INFO: Record<Page, { title: string; description: string; icon: typeof LayoutDashboard }> = {
  overview: { title: 'Visão geral', description: 'Sua operação conectada. Cada chamado no lugar certo.', icon: LayoutDashboard },
  tickets: { title: 'Central de chamados', description: 'Organize as solicitações e acompanhe cada solução.', icon: TicketIcon },
  assets: { title: 'Ativos e equipamentos', description: 'Uma visão completa dos recursos que movem a operação.', icon: Monitor },
  knowledge: { title: 'Base de conhecimento', description: 'Respostas que ajudam o time a ir mais longe.', icon: BookOpen },
  teams: { title: 'Equipes', description: 'Pessoas conectadas, responsabilidades bem definidas.', icon: Users },
  reports: { title: 'Relatórios', description: 'Transforme o histórico de atendimento em decisões.', icon: TrendingUp },
  settings: { title: 'Configurações', description: 'Ajuste a central à rotina da sua equipe.', icon: Settings2 },
};
const STATUS_COLORS: Record<Status, string> = {
  Novo: '#4984ed', 'Em atendimento': '#f45b28', Pendente: '#e6ad36', Resolvido: '#31aa7a', Fechado: '#8c97a9',
};
const STATUS_CLASS: Record<Status, string> = { Novo: 'blue', 'Em atendimento': 'orange', Pendente: 'amber', Resolvido: 'green', Fechado: 'gray' };
const PRIORITY_CLASS: Record<Priority, string> = { Crítica: 'red', Alta: 'orange', Média: 'blue', Baixa: 'gray' };
const fmtDate = (value: string | Date, time = false) => new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit', month: '2-digit', ...(time ? { hour: '2-digit', minute: '2-digit' } : {}), timeZone: 'America/Fortaleza',
}).format(new Date(value));
const number = (value: number) => new Intl.NumberFormat('pt-BR').format(value);
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function readPage(): Page {
  const value = window.location.hash.replace('#/', '').split('?')[0] as Page;
  return PAGE_INFO[value] ? value : 'overview';
}
function loadData(): { data: AppData; issue: string } {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value) {
      const parsed: unknown = JSON.parse(value);
      if (isAppData(parsed)) return { data: parsed, issue: '' };
      return { data: createSeedData(), issue: 'Os dados salvos não puderam ser lidos. Estamos exibindo exemplos; uma cópia do conteúdo anterior será preservada neste navegador antes de salvar alterações.' };
    }
  } catch {
    return { data: createSeedData(), issue: 'O armazenamento deste navegador está indisponível. As alterações podem ser perdidas ao fechar a página.' };
  }
  return { data: createSeedData(), issue: '' };
}

export default function App({ user, onLogout }: { user: Account; onLogout: () => void }) {
  const [loaded] = useState(loadData);
  const [data, setData] = useState<AppData>(loaded.data);
  const [storageIssue, setStorageIssue] = useState(loaded.issue);
  const [page, setPage] = useState<Page>(readPage);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const isAdmin = user.role === 'Administrador';
  const canManage = isAdmin || user.role === 'Supervisor';
  const isRequester = user.role === 'Solicitante';
  const canEditTickets = !isRequester;
  const permitted = (p: Page) => p === 'tickets' || p === 'knowledge' || (p === 'overview' && !isRequester) || (p === 'assets' && !isRequester) || ((p === 'teams' || p === 'reports') && canManage) || (p === 'settings' && isAdmin);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('Todos');
  const [priority, setPriority] = useState('Todas');
  const [team, setTeam] = useState('Todas');
  const [category, setCategory] = useState('Todas');
  const [createdDays, setCreatedDays] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newTicket, setNewTicket] = useState<{ title?: string; category?: Category } | null>(null);
  const [toast, setToast] = useState('');
  const [notifications, setNotifications] = useState(false);
  const [now, setNow] = useState(new Date());
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const hash = () => { setPage(readPage()); setMobileOpen(false); };
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    const shortcut = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === 'Escape') { setNotifications(false); setMobileOpen(false); }
    };
    const sync = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try { const parsed: unknown = JSON.parse(e.newValue); if (isAppData(parsed)) setData(parsed); } catch { /* Keep the current valid state. */ }
      }
    };
    window.addEventListener('hashchange', hash);
    window.addEventListener('keydown', shortcut);
    window.addEventListener('storage', sync);
    return () => { clearInterval(timer); window.removeEventListener('hashchange', hash); window.removeEventListener('keydown', shortcut); window.removeEventListener('storage', sync); };
  }, []);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 4500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { document.title = `${PAGE_INFO[page].title} · ST1 Connect`; }, [page]);
  const update = (next: AppData) => {
    setData(next);
    try {
      const previous = localStorage.getItem(STORAGE_KEY);
      if (previous) {
        let valid = false;
        try { valid = isAppData(JSON.parse(previous)); } catch { /* Preserve unreadable state before a new write. */ }
        if (!valid) localStorage.setItem(`${STORAGE_KEY}:recovery`, previous);
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setStorageIssue('');
    }
    catch { setStorageIssue('Não foi possível salvar no navegador. Exporte os chamados para preservar as alterações desta sessão.'); }
  };
  const go = (target: Page) => { const allowed = permitted(target) ? target : 'tickets'; setPage(allowed); window.location.hash = `/${allowed}`; setMobileOpen(false); setNotifications(false); };
  const showTickets = (filter: string = 'Todos', selectedTeam = 'Todas', days: number | null = null) => {
    setQuery(''); setStatus(filter); setPriority('Todas'); setTeam(selectedTeam); setCategory('Todas'); setCreatedDays(days); go('tickets');
  };
  const openTicket = (id: string) => { setSelectedId(id); setNotifications(false); };
  const overdue = (isRequester ? data.tickets.filter(t => t.requester === user.email) : data.tickets).filter(t => isOpen(t) && getSla(t, now).state === 'overdue');
  const visibleTickets = isRequester ? data.tickets.filter(t => t.requester === user.email) : data.tickets;
  const selectedTicket = visibleTickets.find(t => t.id === selectedId);
  const info = PAGE_INFO[page];
  const filtered = useMemo(() => visibleTickets.filter(t => {
    const text = normalize(`${t.id} ${t.title} ${t.requester} ${t.description}`);
    return (!query || text.includes(normalize(query))) &&
      (status === 'Todos' || (status === 'Abertos' ? isOpen(t) : status === 'Vencidos' ? isOpen(t) && getSla(t, now).state === 'overdue' : t.status === status)) &&
      (priority === 'Todas' || priority === t.priority) && (team === 'Todas' || t.team === team) &&
      (category === 'Todas' || t.category === category) && (!createdDays || Date.parse(t.createdAt) >= now.getTime() - createdDays * 86_400_000);
  }), [visibleTickets, query, status, priority, team, category, createdDays, now]);
  const exportTickets = (tickets: Ticket[]) => {
    const url = URL.createObjectURL(new Blob([toCsv(tickets)], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a'); a.href = url; a.download = `st1-connect-chamados-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); setToast(`${tickets.length} chamados exportados.`);
  };
  const onTicketSave = (ticket: Ticket) => { if (!visibleTickets.some(t => t.id === ticket.id)) return; update({ ...data, tickets: data.tickets.map(t => t.id === ticket.id ? ticket : t) }); setToast('Chamado atualizado.'); };

  const safePage: Page = permitted(page) ? page : 'tickets';
  return <div className="app-shell">
    <a className="skip-link" href="#main-content" onClick={e => { e.preventDefault(); const main = document.getElementById('main-content'); main?.focus(); main?.scrollIntoView({ block: 'start' }); }}>Pular para o conteúdo</a>
    {mobileOpen && <button className="sidebar-backdrop" aria-label="Fechar navegação" onClick={() => setMobileOpen(false)} />}
    <aside className={`sidebar ${mobileOpen ? 'is-open' : ''}`} aria-label="Navegação principal">
      <div className="sidebar-header">
        <a className="brand" href="#/overview" onClick={() => go('overview')} aria-label="ST1 Connect, início">
          <span className="brand-st1">st<span>1</span><i /></span><span className="brand-divider" /><span className="brand-connect">connect<span>CENTRAL DE SERVIÇOS</span></span>
        </a>
        <button type="button" className="sidebar-close" onClick={() => setMobileOpen(false)} aria-label="Fechar menu lateral"><X size={19}/></button>
      </div>
      <div className="workspace-switch" aria-label={`Área de trabalho: ${data.settings.workspace}`}>
        <span className="workspace-logo"><Network size={18} /></span>
        <span><b>{data.settings.workspace}</b><small>Central da equipe</small></span>
        <span className="workspace-online" aria-hidden="true" />
      </div>

      <nav className="sidebar-nav-scroll" aria-label="Seções do ST1 Connect" tabIndex={0}>
        {(['overview', 'tickets'] as Page[]).some(permitted) && <div className="sidebar-nav-group">
          <div className="nav-section-label">OPERAÇÃO</div>
          {(['overview', 'tickets'] as Page[]).filter(permitted).map(p => {
            const Icon = PAGE_INFO[p].icon;
            return <a key={p} href={`#/${p}`} onClick={() => { if (p === 'tickets') showTickets(); else go(p); }} className={`nav-item ${safePage === p ? 'active' : ''}`} aria-current={safePage === p ? 'page' : undefined}>
              <Icon size={19} /><span>{p === 'tickets' ? 'Chamados' : PAGE_INFO[p].title}</span>{p === 'tickets' && <b className="nav-count">{visibleTickets.filter(isOpen).length}</b>}
            </a>;
          })}
        </div>}
        {(['assets', 'knowledge'] as Page[]).some(permitted) && <div className="sidebar-nav-group">
          <div className="nav-section-label">RECURSOS</div>
          {(['assets', 'knowledge'] as Page[]).filter(permitted).map(p => {
            const Icon = PAGE_INFO[p].icon;
            return <a key={p} href={`#/${p}`} onClick={() => go(p)} className={`nav-item ${safePage === p ? 'active' : ''}`} aria-current={safePage === p ? 'page' : undefined}>
              <Icon size={19} /><span>{p === 'assets' ? 'Ativos' : PAGE_INFO[p].title}</span>
            </a>;
          })}
        </div>}
        {(['teams', 'reports', 'settings'] as Page[]).some(permitted) && <div className="sidebar-nav-group">
          <div className="nav-section-label">GESTÃO</div>
          {(['teams', 'reports', 'settings'] as Page[]).filter(permitted).map(p => {
            const Icon = PAGE_INFO[p].icon;
            return <a key={p} href={`#/${p}`} onClick={() => go(p)} className={`nav-item ${safePage === p ? 'active' : ''}`} aria-current={safePage === p ? 'page' : undefined}>
              <Icon size={19} /><span>{PAGE_INFO[p].title}</span>
            </a>;
          })}
        </div>}
      </nav>
      <div className="sidebar-bottom">
        <button className="sidebar-profile" onClick={() => setProfileOpen(true)} aria-label="Abrir meu perfil e configurações de acesso" title="Meu acesso">
          <span className="avatar profile-avatar">{user.name.slice(0,2).toUpperCase()}</span>
          <span><b>{user.name}</b><small>{user.role}</small></span>
          <Settings2 size={17} />
        </button>
      </div>
    </aside>

    <div className="app-content">
      <header className="topbar">
        <div className="topbar-left"><button className="icon-button mobile-menu" aria-label="Abrir navegação" onClick={() => setMobileOpen(true)}><Menu size={21} /></button><span className="breadcrumb-root">Workspace</span><ChevronRight className="breadcrumb-chevron" size={14} /><span className="breadcrumb-current">{info.title}</span></div>
        <div className="topbar-actions">
          <form className="global-search" onSubmit={e => { e.preventDefault(); setStatus('Todos'); setPriority('Todas'); setTeam('Todas'); setCategory('Todas'); setCreatedDays(null); go('tickets'); }}><Search size={17} /><input ref={searchRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar chamados..." aria-label="Busca global de chamados" /><kbd><Command size={11} /> K</kbd></form>
          <button className="demo-badge" onClick={() => go('settings')}><span />Demonstração</button>
          <div className="notification-area"><button className="icon-button notification-button" aria-label={`Notificações: ${overdue.length} chamados vencidos`} aria-expanded={notifications} onClick={() => setNotifications(!notifications)}><Bell size={20} />{overdue.length > 0 && <i />}</button>
            {notifications && <><button className="popover-dismiss" aria-label="Fechar notificações" onClick={() => setNotifications(false)} /><section className="notifications-popover"><div className="panel-head"><h3>Precisa de atenção</h3><span className="badge red">{overdue.length}</span></div>{overdue.length ? overdue.slice(0, 5).map(t => <button key={t.id} onClick={() => openTicket(t.id)}><span className="notification-dot" /><span><b>{t.title}</b><small>{t.id} · Prazo vencido</small></span><ChevronRight size={15} /></button>) : <p className="muted">Nenhum chamado vencido neste momento.</p>}<button className="notification-footer" onClick={() => showTickets('Vencidos')}>Ver fila de atenção <ArrowRight size={15} /></button></section></>}
          </div>
          <span className="topbar-divider" /><button className="avatar topbar-avatar" aria-label="Gerenciar meu acesso" onClick={() => setProfileOpen(true)}>{user.name.slice(0,2).toUpperCase()}</button>
        </div>
      </header>

      <main id="main-content" className="main-content" tabIndex={-1}>
        {storageIssue && <div className="storage-warning" role="alert"><TriangleAlert size={18} /><span>{storageIssue}</span><button className="btn btn-ghost" onClick={() => exportTickets(data.tickets)}>Exportar</button></div>}
        <div className="page-header"><div><div className="page-eyebrow">ST1 CONNECT <span>/</span> {page === 'overview' ? 'PAINEL OPERACIONAL' : 'CENTRAL DE SERVIÇOS'}</div><h1>{info.title}<span className="heading-dot">.</span></h1><p>{info.description}</p></div><div className="page-actions">{!isRequester && (safePage === 'tickets' || safePage === 'overview') && <button className="btn btn-secondary export-top" onClick={() => exportTickets(page === 'tickets' ? filtered : data.tickets)}><ArrowDownToLine size={16} />Exportar</button>}{safePage !== 'settings' && <button className="btn btn-primary" onClick={() => setNewTicket({})}><Plus size={18} />Novo chamado</button>}</div></div>
        {safePage === 'overview' && <Dashboard tickets={data.tickets} assetsCount={data.assets.length} now={now} onOpen={openTicket} onFilter={showTickets} onPage={go} onNew={() => setNewTicket({})} />}
        {safePage === 'tickets' && <TicketsPage tickets={filtered} allTickets={visibleTickets} now={now} onOpen={openTicket} status={status} onStatus={setStatus} query={query} setQuery={setQuery} priority={priority} setPriority={setPriority} team={team} setTeam={setTeam} category={category} setCategory={setCategory} createdDays={createdDays} clearDates={() => setCreatedDays(null)} onClear={() => showTickets()} />}
        {safePage === 'assets' && <AssetsPage data={data} onUpdate={update} onOpenTicket={openTicket} notify={setToast} />}
        {safePage === 'knowledge' && <KnowledgePage onNewTicket={(title, chosenCategory) => setNewTicket({ title, category: chosenCategory })} />}
        {safePage === 'teams' && <TeamsPage tickets={data.tickets} onTeamClick={chosenTeam => showTickets('Abertos', chosenTeam)} />}
        {safePage === 'reports' && <ReportsPage tickets={data.tickets} onOpenTicket={openTicket} />}
        {safePage === 'settings' && <SettingsPage data={data} onUpdate={update} notify={setToast} />}
        <footer className="app-footer"><span><span className="footer-mark">st1</span> connect <span className="footer-divider">/</span> Pessoas, processos e soluções.</span><span>Dados demonstrativos · Armazenamento neste navegador <ShieldCheck size={13} /></span></footer>
      </main>
    </div>
    {newTicket && <NewTicketDialog data={data} currentUser={user} initial={newTicket} onClose={() => setNewTicket(null)} onCreate={ticket => { update({ ...data, tickets: [ticket, ...data.tickets] }); setNewTicket(null); setSelectedId(ticket.id); setToast(`Chamado ${ticket.id} criado.`); }} />}
    {selectedTicket && !newTicket && <TicketDetail key={selectedTicket.id} ticket={selectedTicket} data={data} canEdit={canEditTickets} currentUser={user} onClose={() => setSelectedId(null)} onSave={onTicketSave} />}
    {profileOpen && <ProfilePanel user={user} onLogout={onLogout} onClose={() => setProfileOpen(false)}/>}
    {toast && <div className="toast" role="status"><span><Check size={17} /></span>{toast}<button aria-label="Fechar aviso" onClick={() => setToast('')}><X size={15} /></button></div>}
  </div>;
}

function Avatar({ id, size = 'normal' }: { id: string | null; size?: string }) {
  const agent = AGENTS.find(a => a.id === id);
  return <span className={`avatar avatar-${size}`} style={agent ? { '--avatar-color': agent.color } as CSSProperties : undefined} title={agent?.name || 'Sem responsável'}>{agent?.initials || '—'}</span>;
}
function StatusBadge({ status }: { status: Status }) { return <span className={`badge status-badge ${STATUS_CLASS[status]}`}><span />{status}</span>; }
function PriorityBadge({ priority }: { priority: Priority }) { return <span className={`priority-label ${PRIORITY_CLASS[priority]}`}><span className="priority-bars"><i /><i /><i /></span>{priority}</span>; }
function SlaLabel({ ticket, now }: { ticket: Ticket; now: Date }) { const sla = getSla(ticket, now); return <span className={`sla-label text-${sla.tone}`}><Clock3 size={13} />{sla.label}</span>; }

function Dashboard({ tickets, assetsCount, now, onOpen, onFilter, onPage, onNew }: {
  tickets: Ticket[]; assetsCount: number; now: Date; onOpen: (id: string) => void;
  onFilter: (status?: string, team?: string, days?: number | null) => void; onPage: (page: Page) => void; onNew: () => void;
}) {
  const [days, setDays] = useState(14);
  const [selectedTeam, setSelectedTeam] = useState('Todas');
  const scoped = tickets.filter(t => selectedTeam === 'Todas' || t.team === selectedTeam);
  const open = scoped.filter(isOpen);
  const handling = scoped.filter(t => t.status === 'Em atendimento');
  const overdue = open.filter(t => getSla(t, now).state === 'overdue');
  const periodDate = new Date(now.getTime() - (days - 1) * 86_400_000).toLocaleDateString('sv-SE', { timeZone: 'America/Fortaleza' });
  const periodStart = Date.parse(`${periodDate}T00:00:00-03:00`);
  const resolved = scoped.filter(t => t.resolvedAt && Date.parse(t.resolvedAt) >= periodStart && Date.parse(t.resolvedAt) <= now.getTime());
  const onTimeResolved = resolved.filter(t => getSla(t, now).remainingMs >= 0);
  const slaPercent = resolved.length ? Math.round(onTimeResolved.length / resolved.length * 100) : null;
  const priorityTickets = [...open].sort((a, b) => {
    const as = getSla(a, now), bs = getSla(b, now);
    if ((as.state === 'overdue') !== (bs.state === 'overdue')) return as.state === 'overdue' ? -1 : 1;
    return PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority) || effectiveDueAt(a).getTime() - effectiveDueAt(b).getTime();
  }).slice(0, 5);
  const resolutionHours = resolved.length ? resolved.reduce((acc, t) => acc + Math.max(0, Date.parse(t.resolvedAt!) - Date.parse(t.createdAt) - t.pausedMs), 0) / resolved.length / 3_600_000 : 0;
  const daily = Array.from({ length: days }, (_, i) => {
    const date = new Date(now.getTime() - (days - 1 - i) * 86_400_000);
    const key = date.toLocaleDateString('sv-SE', { timeZone: 'America/Fortaleza' });
    const dayKey = (s: string) => new Date(s).toLocaleDateString('sv-SE', { timeZone: 'America/Fortaleza' });
    return { date, opened: scoped.filter(t => dayKey(t.createdAt) === key).length, resolved: scoped.filter(t => t.resolvedAt && dayKey(t.resolvedAt) === key).length };
  });
  const monthLabel = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'America/Fortaleza' }).format(now);
  return <>
    <section className="overview-banner">
      <div className="banner-icon"><Network size={26} strokeWidth={1.7} /></div><div className="banner-copy"><span>MENOS RUÍDO. MAIS CONEXÃO.</span><h2>Tudo o que sua equipe precisa, em um só lugar.</h2><p>Conecte solicitações, pessoas e conhecimento para fazer a operação acontecer.</p></div><div className="banner-art" aria-hidden="true"><div /><div /><div /><Network size={64} strokeWidth={1} /></div><button onClick={onNew} className="banner-link">Vamos resolver <ArrowUpRight size={17} /></button>
    </section>
    <div className="section-toolbar"><div><span className="section-live-dot" />Resumo da operação <small>· {monthLabel}</small></div><div className="toolbar-controls"><label className="select-with-icon"><Users size={15} /><select value={selectedTeam} onChange={e => setSelectedTeam(e.target.value)} aria-label="Filtrar painel por equipe"><option value="Todas">Todas as equipes</option>{TEAMS.map(t => <option key={t}>{t}</option>)}</select><ChevronDown size={13} /></label><label className="select-with-icon"><CalendarDays size={15} /><select value={days} onChange={e => setDays(Number(e.target.value))} aria-label="Período dos gráficos"><option value={7}>Últimos 7 dias</option><option value={14}>Últimos 14 dias</option><option value={30}>Últimos 30 dias</option></select><ChevronDown size={13} /></label></div></div>
    <section className="kpi-grid" aria-label="Indicadores da operação">
      <Kpi label="Chamados em aberto" value={open.length} icon={TicketIcon} color="orange" subtitle="Aguardando uma solução" foot={`${scoped.filter(t => t.status === 'Novo').length} novos na fila`} onClick={() => onFilter('Abertos', selectedTeam)} />
      <Kpi label="Em atendimento" value={handling.length} icon={Headphones} color="blue" subtitle="Em andamento com a equipe" foot={`${new Set(handling.map(t => t.assignee).filter(Boolean)).size} responsáveis envolvidos`} onClick={() => onFilter('Em atendimento', selectedTeam)} />
      <Kpi label="SLA vencido" value={overdue.length} icon={Clock3} color="red" subtitle="Precisam da sua atenção" foot={overdue.length ? 'Priorize estes chamados' : 'Nenhum prazo vencido'} onClick={() => onFilter('Vencidos', selectedTeam)} />
      <Kpi label="Soluções dentro do SLA" value={slaPercent === null ? '—' : `${slaPercent}%`} icon={ShieldCheck} color="green" subtitle={`Dos ${resolved.length} resolvidos em ${days} dias`} foot={`${onTimeResolved.length} entregas dentro do prazo`} onClick={() => onPage('reports')} />
    </section>
    <div className="charts-grid">
      <section className="panel evolution-panel"><div className="panel-head"><div><h2>Fluxo de chamados</h2><p>Entradas e soluções ao longo do período</p></div><div className="chart-legend"><span><i className="legend-orange" />Abertos</span><span><i className="legend-green" />Resolvidos</span></div></div><FlowChart daily={daily} /><div className="chart-footer"><span><TrendingUp size={15} /><b>{daily.reduce((a, d) => a + d.opened, 0)}</b> abertos no período</span><span><CheckCheck size={15} /><b>{daily.reduce((a, d) => a + d.resolved, 0)}</b> resolvidos no período</span></div></section>
      <section className="panel distribution-panel"><div className="panel-head"><div><h2>Por situação</h2><p>Onde estão os chamados</p></div><button className="icon-button" onClick={() => onFilter('Todos', selectedTeam)} aria-label="Abrir todos os chamados"><ArrowUpRight size={18} /></button></div><div className="donut-wrapper"><StatusDonut tickets={scoped} /><div className="donut-caption"><b>{scoped.length}</b><span>chamados</span></div></div><div className="status-legend">{STATUSES.map(s => <button key={s} onClick={() => onFilter(s, selectedTeam)}><i style={{ background: STATUS_COLORS[s] }} /><span>{s}</span><b>{scoped.filter(t => t.status === s).length}</b></button>)}</div></section>
    </div>
    <div className="lower-grid">
      <section className="panel priority-panel"><div className="panel-head"><div className="panel-title-row"><span className="small-alert-icon"><Zap size={17} /></span><div><h2>Prioridade agora</h2><p>Os próximos chamados que merecem atenção</p></div></div><button className="text-link" onClick={() => onFilter('Abertos', selectedTeam)}>Ver todos <ArrowRight size={15} /></button></div><div className="table-scroll"><table className="ticket-table compact-table"><thead><tr><th>Chamado</th><th>Prioridade</th><th>Responsável</th><th>Prazo</th><th><span className="sr-only">Abrir</span></th></tr></thead><tbody>{priorityTickets.map(t => <tr key={t.id}><td><button className="ticket-title-button" onClick={() => onOpen(t.id)}><span>{t.id}</span><b>{t.title}</b><small>{t.category}</small></button></td><td><PriorityBadge priority={t.priority} /></td><td><div className="assignee-cell"><Avatar id={t.assignee} size="small" /><span>{AGENTS.find(a => a.id === t.assignee)?.name || 'Não atribuído'}</span></div></td><td><SlaLabel ticket={t} now={now} /></td><td><button className="row-open" aria-label={`Abrir ${t.id}`} onClick={() => onOpen(t.id)}><ChevronRight size={16} /></button></td></tr>)}</tbody></table>{priorityTickets.length === 0 && <EmptyState title="Tudo em dia por aqui" detail="Nenhum chamado aberto nesta equipe." />}</div><div className="table-caption"><ShieldCheck size={13} />Fila organizada por prazo e prioridade</div></section>
      <section className="panel team-panel"><div className="panel-head"><div><h2>Equipes conectadas</h2><p>Distribuição dos chamados abertos</p></div><Users size={18} className="muted" /></div><div className="team-workloads">{TEAMS.map((t, i) => { const count = tickets.filter(x => x.team === t && isOpen(x)).length; const total = tickets.filter(isOpen).length; return <button key={t} className="team-workload" onClick={() => onFilter('Abertos', t)}><div><span className={`team-symbol team-symbol-${i}`}>{i === 0 ? <PanelTop size={17} /> : i === 1 ? <Network size={17} /> : i === 2 ? <Headphones size={17} /> : <Users size={17} />}</span><span><b>{t}</b><small>{AGENTS.filter(a => a.team === t).length} responsáveis</small></span><strong>{count}</strong></div><div className="workload-track"><span style={{ width: `${total ? count / total * 100 : 0}%` }} /></div></button>; })}</div><button className="team-footer" onClick={() => onPage('teams')}>Gerenciar equipes <ArrowUpRight size={15} /></button></section>
    </div>
    <section className="quick-strip"><button onClick={() => onPage('assets')}><span className="quick-icon"><Monitor size={19} /></span><span><b>{assetsCount} ativos cadastrados</b><small>Inventário conectado aos chamados</small></span><ArrowUpRight size={16} /></button><button onClick={() => onPage('knowledge')}><span className="quick-icon"><BookOpen size={19} /></span><span><b>{ARTICLES.length} artigos na base</b><small>Respostas para o dia a dia</small></span><ArrowUpRight size={16} /></button><button onClick={() => onPage('reports')}><span className="quick-icon"><Clock3 size={19} /></span><span><b>{resolved.length ? `${resolutionHours.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h para resolver` : 'Sem soluções no período'}</b><small>Tempo médio, descontadas as pausas</small></span><ArrowUpRight size={16} /></button></section>
  </>;
}

function Kpi({ label, value, icon: Icon, color, subtitle, foot, onClick }: { label: string; value: string | number; icon: typeof TicketIcon; color: string; subtitle: string; foot: string; onClick: () => void }) {
  return <button className={`kpi-card kpi-${color}`} onClick={onClick}><div className="kpi-top"><span>{label}</span><span className={`kpi-icon ${color}`}><Icon size={19} strokeWidth={1.7} /></span></div><div className="kpi-value">{value}<ArrowUpRight size={18} /></div><p>{subtitle}</p><div className="kpi-foot"><span />{foot}<ChevronRight size={13} /></div></button>;
}

type DailyFlow = { date: Date; opened: number; resolved: number };
function FlowChart({ daily }: { daily: DailyFlow[] }) {
  const [active, setActive] = useState<number | null>(null);
  const w = 720, h = 225, left = 32, right = 18, top = 20, bottom = 33;
  const max = Math.max(4, ...daily.flatMap(d => [d.opened, d.resolved]));
  const ceiling = Math.ceil(max / 4) * 4;
  const x = (i: number) => left + i * (w - left - right) / Math.max(daily.length - 1, 1);
  const y = (v: number) => h - bottom - v / ceiling * (h - top - bottom);
  const path = (key: 'opened' | 'resolved') => daily.map((d, i) => `${i ? 'L' : 'M'}${x(i)},${y(d[key])}`).join(' ');
  const openedPath = path('opened');
  return <div className="flow-chart"><svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Evolução diária. ${daily.map(d => `${fmtDate(d.date)}: ${d.opened} abertos e ${d.resolved} resolvidos`).join('; ')}`}>
    <defs><linearGradient id="flow-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#f45b28" stopOpacity="0.17" /><stop offset="100%" stopColor="#f45b28" stopOpacity="0.005" /></linearGradient></defs>
    {[0, 1, 2, 3, 4].map(n => <g key={n}><line x1={left} x2={w - right} y1={y(n * ceiling / 4)} y2={y(n * ceiling / 4)} stroke="#e9ecf0" strokeDasharray="3 5" /><text x="13" y={y(n * ceiling / 4) + 4} fill="#9198a5" fontSize="10" textAnchor="middle">{n * ceiling / 4}</text></g>)}
    <path d={`${openedPath} L${x(daily.length - 1)},${h - bottom} L${left},${h - bottom} Z`} fill="url(#flow-fill)" />
    <path d={path('resolved')} fill="none" stroke="#35aa88" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="5 4" />
    <path d={openedPath} fill="none" stroke="#f45b28" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    {daily.map((d, i) => <g key={i}>{(i % Math.max(1, Math.ceil(daily.length / 7)) === 0 || i === daily.length - 1) && <text x={x(i)} y={h - 8} fill="#9198a5" fontSize="10" textAnchor="middle">{fmtDate(d.date)}</text>}<rect x={x(i) - (w - left - right) / daily.length / 2} y={top} width={(w - left - right) / daily.length} height={h - bottom - top} fill="transparent" onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}><title>{fmtDate(d.date)} · {d.opened} abertos · {d.resolved} resolvidos</title></rect></g>)}
    {active !== null && <g pointerEvents="none"><line x1={x(active)} x2={x(active)} y1={top} y2={h - bottom} stroke="#f45b28" strokeDasharray="3 3" opacity=".5" /><circle cx={x(active)} cy={y(daily[active].opened)} r="4" fill="#f45b28" stroke="white" strokeWidth="2" /><circle cx={x(active)} cy={y(daily[active].resolved)} r="4" fill="#35aa88" stroke="white" strokeWidth="2" /></g>}
  </svg><div className="chart-accessible-data"><details><summary>Ver dados do gráfico</summary><table><thead><tr><th>Data</th><th>Abertos</th><th>Resolvidos</th></tr></thead><tbody>{daily.map((d, i) => <tr key={i}><td>{fmtDate(d.date)}</td><td>{d.opened}</td><td>{d.resolved}</td></tr>)}</tbody></table></details></div></div>;
}
function StatusDonut({ tickets }: { tickets: Ticket[] }) {
  const circumference = 2 * Math.PI * 66; let offset = 0;
  return <svg className="status-donut" viewBox="0 0 170 170" role="img" aria-label="Distribuição dos chamados por situação"><circle cx="85" cy="85" r="66" stroke="#f1f3f6" strokeWidth="15" fill="none" />{STATUSES.map(s => { const length = tickets.length ? tickets.filter(t => t.status === s).length / tickets.length * circumference : 0; const previous = offset; offset += length; return length > 0 ? <circle key={s} cx="85" cy="85" r="66" fill="none" stroke={STATUS_COLORS[s]} strokeWidth="15" strokeDasharray={`${Math.max(0, length - 4)} ${circumference - Math.max(0, length - 4)}`} strokeDashoffset={-previous} transform="rotate(-90 85 85)"><title>{s}: {tickets.filter(t => t.status === s).length}</title></circle> : null; })}</svg>;
}

function TicketsPage({ tickets, allTickets, now, onOpen, status, onStatus, query, setQuery, priority, setPriority, team, setTeam, category, setCategory, createdDays, clearDates, onClear }: {
  tickets: Ticket[]; allTickets: Ticket[]; now: Date; onOpen: (id: string) => void; status: string; onStatus: (s: string) => void; query: string; setQuery: (s: string) => void; priority: string; setPriority: (s: string) => void; team: string; setTeam: (s: string) => void; category: string; setCategory: (s: string) => void; createdDays: number | null; clearDates: () => void; onClear: () => void;
}) {
  const [view, setView] = useState<'list' | 'board'>('list');
  const [currentPage, setCurrentPage] = useState(1);
  const [sort, setSort] = useState('priority');
  useEffect(() => setCurrentPage(1), [query, status, priority, team, category, createdDays]);
  const sorted = [...tickets].sort((a, b) => sort === 'newest' ? Date.parse(b.createdAt) - Date.parse(a.createdAt) : sort === 'deadline' ? effectiveDueAt(a).getTime() - effectiveDueAt(b).getTime() : PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority) || Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const maxPages = Math.max(1, Math.ceil(sorted.length / 9));
  const page = Math.min(currentPage, maxPages);
  const hasFilters = query || priority !== 'Todas' || team !== 'Todas' || category !== 'Todas' || createdDays || status !== 'Todos';
  return <section className="panel tickets-panel"><div className="tickets-tabs"><div className="status-tabs">{['Todos', 'Abertos', 'Em atendimento', 'Pendente', 'Resolvido', 'Vencidos'].map(s => <button key={s} className={status === s ? 'selected' : ''} onClick={() => onStatus(s)}>{s}{s === 'Todos' && <span>{allTickets.length}</span>}{s === 'Vencidos' && <span className="overdue-tab-count">{allTickets.filter(t => isOpen(t) && getSla(t, now).state === 'overdue').length}</span>}</button>)}</div><div className="view-switch"><button title="Visualização em lista" aria-label="Visualização em lista" aria-pressed={view === 'list'} className={view === 'list' ? 'selected' : ''} onClick={() => setView('list')}><List size={18} /></button><button title="Visualização Kanban" aria-label="Visualização Kanban" aria-pressed={view === 'board'} className={view === 'board' ? 'selected' : ''} onClick={() => setView('board')}><PanelTop size={18} /></button></div></div>
    <div className="ticket-filters"><label className="table-search"><Search size={17} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por título, número ou solicitante" aria-label="Buscar na lista de chamados" /></label><label className="filter-select"><ListFilter size={15} /><select value={priority} onChange={e => setPriority(e.target.value)} aria-label="Filtrar por prioridade"><option value="Todas">Prioridade</option>{PRIORITIES.map(p => <option key={p}>{p}</option>)}</select></label><label className="filter-select"><Users size={15} /><select value={team} onChange={e => setTeam(e.target.value)} aria-label="Filtrar por equipe"><option value="Todas">Equipe</option>{TEAMS.map(t => <option key={t}>{t}</option>)}</select></label><label className="filter-select category-filter"><SlidersHorizontal size={15} /><select value={category} onChange={e => setCategory(e.target.value)} aria-label="Filtrar por categoria"><option value="Todas">Categoria</option>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label></div>
    <div className="results-line"><span><b>{tickets.length}</b> chamados encontrados {createdDays && <button className="filter-chip" onClick={clearDates}>Criados em {createdDays} dias <X size={12} /></button>}{status === 'Fechado' || status === 'Novo' ? <span className="filter-chip">{status}</span> : null}{hasFilters && <button className="clear-filters" onClick={onClear}>Limpar filtros</button>}</span><label>Ordenar por <select value={sort} onChange={e => setSort(e.target.value)} aria-label="Ordenar chamados"><option value="priority">Prioridade</option><option value="newest">Mais recentes</option><option value="deadline">Prazo</option></select></label></div>
    {!tickets.length ? <EmptyState title="Nenhum chamado encontrado" detail="Experimente outra busca ou remova os filtros para ver mais resultados." action={<button className="btn btn-secondary" onClick={onClear}>Limpar filtros</button>} /> : view === 'list' ? <><div className="table-scroll"><table className="ticket-table full-ticket-table"><thead><tr><th>Chamado</th><th>Situação</th><th>Prioridade</th><th>Responsável</th><th>Prazo de resolução</th><th>Aberto em</th><th><span className="sr-only">Abrir</span></th></tr></thead><tbody>{sorted.slice((page - 1) * 9, page * 9).map(t => <tr key={t.id}><td><button className="ticket-title-button" onClick={() => onOpen(t.id)}><span>{t.id}</span><b>{t.title}</b><small>{t.requester} <span className="inline-dot">·</span> {t.category}</small></button></td><td><StatusBadge status={t.status} /></td><td><PriorityBadge priority={t.priority} /></td><td><div className="assignee-cell"><Avatar id={t.assignee} size="small" /><span>{AGENTS.find(a => a.id === t.assignee)?.name || 'Não atribuído'}<small>{t.team}</small></span></div></td><td><SlaLabel ticket={t} now={now} /></td><td className="date-cell">{fmtDate(t.createdAt, true)}</td><td><button className="row-open" aria-label={`Abrir ${t.id}`} onClick={() => onOpen(t.id)}><ChevronRight size={17} /></button></td></tr>)}</tbody></table></div><div className="pagination"><span>Exibindo {(page - 1) * 9 + 1}–{Math.min(page * 9, sorted.length)} de {number(sorted.length)} chamados</span><div><button className="icon-button" aria-label="Página anterior" disabled={page === 1} onClick={() => setCurrentPage(page - 1)}><ChevronLeft size={17} /></button>{Array.from({ length: maxPages }, (_, i) => <button key={i} className={`page-number ${page === i + 1 ? 'selected' : ''}`} aria-label={`Página ${i + 1}`} aria-current={page === i + 1 ? 'page' : undefined} onClick={() => setCurrentPage(i + 1)}>{i + 1}</button>)}<button className="icon-button" aria-label="Próxima página" disabled={page === maxPages} onClick={() => setCurrentPage(page + 1)}><ChevronRight size={17} /></button></div></div></> : <div className="kanban-board">{STATUSES.map(s => <section key={s} className="kanban-column"><h3><i style={{ background: STATUS_COLORS[s] }} />{s}<span>{sorted.filter(t => t.status === s).length}</span></h3><div className="kanban-cards">{sorted.filter(t => t.status === s).map(t => <button key={t.id} className="kanban-card" onClick={() => onOpen(t.id)}><div><span>{t.id}</span><PriorityBadge priority={t.priority} /></div><h4>{t.title}</h4><p>{t.category}</p><footer><Avatar id={t.assignee} size="small" /><SlaLabel ticket={t} now={now} /><span className="kanban-comments"><MessageSquare size={12} />{t.history.filter(h => h.kind === 'comment').length}</span></footer></button>)}{sorted.every(t => t.status !== s) && <div className="kanban-empty">Nenhum chamado</div>}</div></section>)}</div>}
  </section>;
}

function Modal({ children, onClose, className = '', labelledBy }: { children: ReactNode; onClose: () => void; className?: string; labelledBy: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const el = ref.current; if (el && !el.open) el.showModal(); return () => { if (el?.open) el.close(); }; }, []);
  return <dialog ref={ref} className={`app-dialog ${className}`} aria-labelledby={labelledBy} onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) { const r = e.currentTarget.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose(); } }}>{children}</dialog>;
}
function NewTicketDialog({ data, currentUser, initial, onClose, onCreate }: { data: AppData; currentUser: Account; initial: { title?: string; category?: Category }; onClose: () => void; onCreate: (t: Ticket) => void }) {
  const [chosenCategory, setChosenCategory] = useState<Category>(initial.category || 'Sistemas e acessos');
  const [chosenPriority, setChosenPriority] = useState<Priority>('Média');
  const [error, setError] = useState('');
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const form = new FormData(e.currentTarget); const title = String(form.get('title') || '').trim(); const description = String(form.get('description') || '').trim();
    if (title.length < 6 || description.length < 12) { setError('Descreva o assunto com ao menos 6 caracteres e a solicitação com ao menos 12.'); return; }
    const now = new Date().toISOString();
    const lastNumber = Math.max(1000, ...data.tickets.map(t => Number(/^ST1-(\d+)$/.exec(t.id)?.[1] || 0)).filter(Number.isSafeInteger));
    if (!Number.isSafeInteger(lastNumber + 1) || data.tickets.some(t => t.id === `ST1-${lastNumber + 1}`)) { setError('Não foi possível gerar um número único para o chamado.'); return; }
    const ticket: Ticket = { id: `ST1-${lastNumber + 1}`, title, description, type: form.get('type') as Ticket['type'], category: chosenCategory, priority: chosenPriority, status: 'Novo', requester: currentUser.role === 'Solicitante' ? currentUser.email : String(form.get('requester') || '').trim() || currentUser.email, team: categoryTeam(chosenCategory), assignee: null, assetId: String(form.get('asset') || '') || null, createdAt: now, updatedAt: now, dueAt: new Date(Date.parse(now) + data.settings.slaHours[chosenPriority] * 3_600_000).toISOString(), resolvedAt: null, pausedAt: null, pausedMs: 0, history: [{ id: makeId('event'), at: now, author: currentUser.name, text: `Chamado criado e encaminhado à equipe ${categoryTeam(chosenCategory)}.`, kind: 'event' }] };
    onCreate(ticket);
  };
  return <Modal onClose={onClose} labelledBy="new-ticket-title" className="new-ticket-dialog"><div className="dialog-header"><span className="dialog-icon"><TicketIcon size={22} /></span><div><span className="dialog-eyebrow">VAMOS CONECTAR UMA SOLUÇÃO</span><h2 id="new-ticket-title">Novo chamado</h2></div><button className="icon-button" onClick={onClose} aria-label="Fechar novo chamado"><X size={20} /></button></div><form onSubmit={submit}><div className="dialog-body"><div className="type-choice"><label><input type="radio" name="type" value="Incidente" defaultChecked /><span><TriangleAlert size={18} /><b>Incidente</b><small>Algo não está funcionando</small></span></label><label><input type="radio" name="type" value="Solicitação" /><span><Plus size={18} /><b>Solicitação</b><small>Preciso de um serviço ou recurso</small></span></label></div><label className="form-field">Assunto <span>*</span><input name="title" className="field" placeholder="Resuma o que você precisa" required minLength={6} maxLength={120} defaultValue={initial.title} autoFocus /></label><label className="form-field">Descrição <span>*</span><textarea name="description" className="field" placeholder="Conte o que aconteceu, o impacto e o que já foi tentado..." rows={4} required minLength={12} maxLength={5000} /></label><div className="form-grid"><label className="form-field">Categoria<select className="field" value={chosenCategory} onChange={e => setChosenCategory(e.target.value as Category)}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label><label className="form-field">Prioridade<select className="field" value={chosenPriority} onChange={e => setChosenPriority(e.target.value as Priority)}>{PRIORITIES.map(p => <option key={p}>{p}</option>)}</select></label><label className="form-field">{currentUser.role === 'Solicitante' ? 'Solicitante' : 'Equipe solicitante'}<input className="field" name="requester" placeholder="Ex.: Comercial Digital" maxLength={80} defaultValue={currentUser.role === 'Solicitante' ? currentUser.email : ''} disabled={currentUser.role === 'Solicitante'} required /></label><label className="form-field">Ativo relacionado <small>Opcional</small><select className="field" name="asset"><option value="">Nenhum ativo</option>{data.assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label></div><div className="routing-note"><Zap size={16} /><span>Direcionado para <b>{categoryTeam(chosenCategory)}</b> · Prazo de resolução de <b>{data.settings.slaHours[chosenPriority]} horas corridas</b>.</span></div>{error && <p className="form-error" role="alert">{error}</p>}</div><div className="dialog-footer"><span><ShieldCheck size={14} />Ambiente de demonstração</span><button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button><button type="submit" className="btn btn-primary">Criar chamado <ArrowRight size={16} /></button></div></form></Modal>;
}

function TicketDetail({ ticket, data, canEdit, currentUser, onClose, onSave }: { ticket: Ticket; data: AppData; canEdit: boolean; currentUser: Account; onClose: () => void; onSave: (t: Ticket) => void }) {
  const [nextStatus, setNextStatus] = useState<Status>(ticket.status);
  const [assignee, setAssignee] = useState(ticket.assignee || '');
  const [team, setTeam] = useState<Team>(ticket.team);
  const [priority, setPriority] = useState<Priority>(ticket.priority);
  const [note, setNote] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { setNextStatus(ticket.status); setAssignee(ticket.assignee || ''); setTeam(ticket.team); setPriority(ticket.priority); }, [ticket]);
  const addComment = (e: FormEvent) => { e.preventDefault(); if (!comment.trim()) return; const now = new Date().toISOString(); onSave({ ...ticket, updatedAt: now, history: [...ticket.history, { id: makeId('comment'), at: now, author: currentUser.name, text: comment.trim(), kind: 'comment' }] }); setComment(''); };
  const save = (e: FormEvent) => {
    e.preventDefault(); setError('');
    try {
      const now = new Date(); const history = [...ticket.history];
      const event = (text: string) => history.push({ id: makeId('event'), at: now.toISOString(), author: currentUser.name, text, kind: 'event' });
      if (team !== ticket.team) event(`Equipe alterada de ${ticket.team} para ${team}.`);
      if ((assignee || null) !== ticket.assignee) event(assignee ? `Chamado atribuído a ${AGENTS.find(a => a.id === assignee)?.name || assignee}.` : 'Responsável removido; o chamado permanece na fila da equipe.');
      if (priority !== ticket.priority) event(`Prioridade alterada de ${ticket.priority} para ${priority}. O prazo de resolução original foi mantido.`);
      let next: Ticket = { ...ticket, team, assignee: assignee || null, priority, updatedAt: now.toISOString(), history };
      const target = nextStatus === 'Novo' && assignee ? 'Em atendimento' : nextStatus;
      if (target !== ticket.status) next = transitionTicket(next, target, note, now);
      onSave(next); setNote(''); setNextStatus(next.status);
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível atualizar o chamado.'); }
  };
  const asset = data.assets.find(a => a.id === ticket.assetId);
  const changed = nextStatus !== ticket.status || team !== ticket.team || priority !== ticket.priority || (assignee || null) !== ticket.assignee;
  return <Modal onClose={onClose} labelledBy="ticket-detail-title" className="ticket-detail-dialog"><div className="detail-top"><span className="detail-ticket-code"><TicketIcon size={17} />{ticket.id}</span><StatusBadge status={ticket.status} /><span className="detail-type">{ticket.type}</span><button className="icon-button" aria-label="Fechar detalhes do chamado" onClick={onClose}><X size={21} /></button></div><div className="detail-heading"><h2 id="ticket-detail-title">{ticket.title}</h2><p>Aberto por <b>{ticket.requester}</b> em {fmtDate(ticket.createdAt, true)}</p></div><div className="detail-layout"><div className="detail-main"><section className="detail-section"><h3>Descrição do chamado</h3><p className="ticket-description">{ticket.description}</p><div className="detail-tags"><span>{ticket.category}</span>{asset && <span><Monitor size={13} />{asset.name}</span>}</div></section><section className="detail-section history-section"><h3>Histórico de atendimento <span>{ticket.history.length}</span></h3><div className="history-list">{ticket.history.map(h => <article className={`history-item history-${h.kind}`} key={h.id}><span className="history-icon">{h.kind === 'comment' ? <MessageSquare size={14} /> : h.kind === 'solution' ? <CheckCheck size={15} /> : <LoaderCircle size={13} />}</span><div><header><b>{h.author}</b><time dateTime={h.at}>{fmtDate(h.at, true)}</time></header><p>{h.text}</p>{h.kind === 'solution' && <span className="solution-tag">Solução registrada</span>}</div></article>)}</div><form className="comment-form" onSubmit={addComment}><label htmlFor="ticket-comment">Adicionar uma interação</label><textarea id="ticket-comment" value={comment} onChange={e => setComment(e.target.value)} placeholder="Registre uma atualização para o time..." maxLength={3000} rows={3} required /><div><span>Histórico local da demonstração</span><button className="btn btn-primary" disabled={!comment.trim()} type="submit"><Send size={15} />Registrar</button></div></form></section></div>{canEdit && <aside className="detail-sidebar"><form onSubmit={save}><div className="sla-detail-box"><Clock3 size={19} /><span>Prazo de resolução<b>{fmtDate(effectiveDueAt(ticket), true)}</b><SlaLabel ticket={ticket} now={new Date()} /></span></div><label className="form-field">Situação<select className="field" value={nextStatus} onChange={e => setNextStatus(e.target.value as Status)}>{STATUSES.map(s => <option key={s} disabled={s === 'Fechado' && ticket.status !== 'Resolvido' && ticket.status !== 'Fechado'}>{s}</option>)}</select></label><label className="form-field">Equipe responsável<select className="field" value={team} onChange={e => { setTeam(e.target.value as Team); setAssignee(''); }}>{TEAMS.map(t => <option key={t}>{t}</option>)}</select></label><label className="form-field">Responsável<select className="field" value={assignee} onChange={e => setAssignee(e.target.value)}><option value="">Não atribuído</option>{AGENTS.filter(a => a.team === team).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label className="form-field">Prioridade<select className="field" value={priority} onChange={e => setPriority(e.target.value as Priority)}>{PRIORITIES.map(p => <option key={p}>{p}</option>)}</select></label>{nextStatus !== ticket.status && (nextStatus === 'Resolvido' || nextStatus === 'Pendente') && <label className="form-field">{nextStatus === 'Resolvido' ? 'Solução aplicada' : 'Motivo da pendência'} <span>*</span><textarea className="field" value={note} onChange={e => setNote(e.target.value)} required rows={4} minLength={3} maxLength={3000} placeholder={nextStatus === 'Resolvido' ? 'Como o chamado foi resolvido?' : 'Por que o atendimento precisa aguardar?'} /></label>}{error && <p className="form-error" role="alert">{error}</p>}<button className="btn btn-primary detail-save" disabled={!changed} type="submit"><Check size={16} />Salvar alterações</button><p className="detail-tip"><CircleHelp size={14} />A pendência pausa o SLA. Resolvido aguarda validação para fechar.</p></form></aside>}</div></Modal>;
}

function EmptyState({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return <div className="empty-state"><span><Search size={27} /></span><h3>{title}</h3><p>{detail}</p>{action}</div>;
}
