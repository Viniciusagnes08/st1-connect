import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, ArrowDownToLine, ArrowRight, BarChart3, CheckCircle2,
  ChevronRight, ClipboardList, Database, FileClock, FileText,
  HardDriveDownload, LayoutDashboard, LockKeyhole, Menu, MessageSquare,
  MonitorCog, Network, RefreshCcw, Settings2, ShieldCheck, Users, X,
} from 'lucide-react';
import type { Account } from './AuthGate';
import { ProfilePanel } from './AuthGate';
import BIWorkspace from './features/bi/BIWorkspace';
import ServiceWorkspace from './features/services/ServiceWorkspace';
import DepartmentWorkspace from './features/services/DepartmentWorkspace';
import { getMyRequests } from './features/bi/api';
import type { OwnRequest } from './features/bi/types';
import { scopeLabel } from './features/bi/bi-views';
import { downloadLegacyBackup, readLegacyBackup } from './legacy-backup';
import './operational.css';

type Page = 'overview' | 'requests' | 'bi' | 'services' | 'ouvidoria' | 'management' | 'areas' | 'departments' | 'legacy';
type LoadResult =
  | { kind: 'loading'; items: OwnRequest[] }
  | { kind: 'ready'; items: OwnRequest[] }
  | { kind: 'error'; items: OwnRequest[]; message: string };
type LegacyState =
  | { kind: 'checking' }
  | { kind: 'available'; keys: string[] }
  | { kind: 'empty' }
  | { kind: 'error'; message: string };

const ROUTES = new Set<Page>(['overview', 'requests', 'bi', 'services', 'ouvidoria', 'management', 'areas', 'departments', 'legacy']);
const PAGE_LABELS: Record<Page, string> = {
  overview: 'Visão geral',
  requests: 'Minhas solicitações',
  bi: 'Central de BI',
  services: 'Solicitações gerais',
  ouvidoria: 'Ouvidoria',
  management: 'Admin Master',
  areas: 'Áreas de atendimento',
  departments: 'Equipes e departamentos',
  legacy: 'Dados locais anteriores',
};
const FUTURE_AREAS = [
  { name: 'Sistemas e CRM', description: 'Acessos, sistemas comerciais, automações e integrações.', icon: MonitorCog },
  { name: 'Infraestrutura e TI', description: 'Conectividade interna, equipamentos e suporte técnico.', icon: Network },
  { name: 'Marketing e Comunicação', description: 'Materiais, criativos, campanhas e comunicação.', icon: MessageSquare },
  { name: 'Financeiro e Administrativo', description: 'Demandas administrativas com fluxos e responsáveis a validar.', icon: ClipboardList },
] as const;

function readPage(): Page {
  const requested = window.location.hash.replace(/^#\/?/, '').split('?')[0] as Page;
  return ROUTES.has(requested) ? requested : 'overview';
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Data não disponível';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Fortaleza',
  }).format(parsed);
}

function ScopePill({ scope }: { scope: OwnRequest['scope'] }) {
  return <span className="op-request-scope">{scopeLabel(scope)}</span>;
}

export default function OperationalApp({ user, onLogout }: { user: Account; onLogout: () => void }) {
  const [page, setPage] = useState<Page>(readPage);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [requests, setRequests] = useState<LoadResult>({ kind: 'loading', items: [] });
  const [legacy, setLegacy] = useState<LegacyState>({ kind: 'checking' });
  const [notice, setNotice] = useState('');

  const navigate = useCallback((target: Page) => {
    window.location.hash = '/' + target;
    setPage(target);
    setMobileOpen(false);
  }, []);

  useEffect(() => {
    const syncRoute = () => {
      const current = readPage();
      setPage(current);
      setMobileOpen(false);
      const requested = window.location.hash.replace(/^#\/?/, '').split('?')[0];
      if (!ROUTES.has(requested as Page)) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search + '#/' + current);
      }
    };
    syncRoute();
    window.addEventListener('hashchange', syncRoute);
    return () => window.removeEventListener('hashchange', syncRoute);
  }, []);

  useEffect(() => { document.title = PAGE_LABELS[page] + ' · ST1 Connect'; }, [page]);

  const refreshRequests = useCallback(async () => {
    setRequests({ kind: 'loading', items: [] });
    try {
      const items = await getMyRequests();
      if (!Array.isArray(items)) throw new Error('A fonte não retornou uma lista válida de solicitações.');
      setRequests({ kind: 'ready', items });
    } catch (cause) {
      setRequests({
        kind: 'error',
        items: [],
        message: cause instanceof Error ? cause.message : 'Não foi possível consultar as solicitações.',
      });
    }
  }, []);

  useEffect(() => {
    if (page === 'overview' || page === 'requests') void refreshRequests();
  }, [page, refreshRequests]);

  const checkLegacy = useCallback(() => {
    try {
      const backup = readLegacyBackup(window.localStorage, window.location.origin);
      setLegacy(backup ? { kind: 'available', keys: Object.keys(backup.entries) } : { kind: 'empty' });
    } catch (cause) {
      setLegacy({
        kind: 'error',
        message: cause instanceof Error ? cause.message : 'Falha ao verificar os dados deste navegador.',
      });
    }
  }, []);

  useEffect(() => { if (page === 'legacy') checkLegacy(); }, [page, checkLegacy]);

  const exportLegacy = () => {
    try {
      const backup = readLegacyBackup(window.localStorage, window.location.origin);
      if (!backup) { setLegacy({ kind: 'empty' }); return; }
      downloadLegacyBackup(backup);
      setNotice('Arquivo de dados locais preparado no seu navegador. Nenhum dado foi apagado.');
      setLegacy({ kind: 'available', keys: Object.keys(backup.entries) });
    } catch (cause) {
      setLegacy({
        kind: 'error',
        message: cause instanceof Error ? cause.message : 'Não foi possível exportar o conteúdo deste navegador.',
      });
    }
  };

  const summary = useMemo(() => {
    if (requests.kind !== 'ready') return null;
    const total = requests.items.length;
    const finished = requests.items.filter(item => item.state === 'Resolvido' || item.state === 'Fechado').length;
    return { total, inProgress: total - finished, finished };
  }, [requests]);

  const navItem = (target: Page, label: string, Icon: typeof LayoutDashboard) => (
    <a
      key={target}
      href={'#/' + target}
      onClick={() => { setPage(target); setMobileOpen(false); }}
      className={'nav-item ' + (page === target ? 'active' : '')}
      aria-current={page === target ? 'page' : undefined}
    >
      <Icon size={19} aria-hidden="true" /><span>{label}</span>
    </a>
  );

  const requestList = (limit?: number) => {
    if (requests.kind === 'loading') return (
      <div className="op-empty" role="status" aria-live="polite">
        <RefreshCcw className="op-spinning" size={24} /><b>Consultando solicitações</b>
        <p>Buscando seus registros reais no servidor.</p>
      </div>
    );
    if (requests.kind === 'error') return (
      <div className="op-empty op-error" role="alert">
        <AlertCircle size={24} /><b>Não foi possível consultar o banco</b>
        <p>{requests.message} Não exibimos números fictícios enquanto o serviço estiver indisponível.</p>
        <button type="button" className="btn btn-secondary" onClick={() => void refreshRequests()}>
          <RefreshCcw size={15} />Tentar novamente
        </button>
      </div>
    );
    if (!requests.items.length) return (
      <div className="op-empty">
        <ClipboardList size={25} /><b>Nenhuma solicitação registrada</b>
        <p>Não existem pedidos vinculados à sua conta na base compartilhada. Isso não significa que toda a empresa esteja sem chamados.</p>
        <button type="button" className="btn btn-primary" onClick={() => navigate('bi')}>
          Abrir Central de BI <ArrowRight size={16} />
        </button>
      </div>
    );
    return <div className="op-requests-list">
      {requests.items.slice(0, limit).map(item => (
        <div className="op-request-item" key={item.id}>
          <div className="op-request-icon"><FileText size={19} /></div>
          <div className="op-request-copy">
            <span>{item.protocol} · {formatDate(item.created_at)}</span>
            <b>{item.title}</b>
            <ScopePill scope={item.scope} />
          </div>
          <span className="op-request-state">{item.state ?? 'Aguardando triagem'}</span>
          {<button type="button" className="op-request-open" onClick={() => navigate(item.scope==='BI'?'bi':item.scope==='OUVIDORIA'?'ouvidoria':'services')} aria-label={'Abrir a área de acompanhamento ' + item.protocol}>
            <ArrowRight size={17} />
          </button>}
        </div>
      ))}
    </div>;
  };

  return <div className="app-shell op-app">
    <a className="skip-link" href="#main-content" onClick={event => {
      event.preventDefault();
      const main = document.getElementById('main-content');
      main?.focus();
      main?.scrollIntoView({ block: 'start' });
    }}>Pular para o conteúdo</a>

    {mobileOpen && <button className="sidebar-backdrop" aria-label="Fechar navegação" onClick={() => setMobileOpen(false)} />}
    <aside className={'sidebar ' + (mobileOpen ? 'is-open' : '')} aria-label="Navegação principal">
      <div className="sidebar-header">
        <a className="brand" href="#/overview" onClick={() => setMobileOpen(false)} aria-label="ST1 Connect, portal corporativo">
          <span className="brand-st1">st<span>1</span><i /></span>
          <span className="brand-divider" />
          <span className="brand-connect">connect<span>PLATAFORMA CORPORATIVA</span></span>
        </a>
        <button type="button" className="sidebar-close" onClick={() => setMobileOpen(false)} aria-label="Fechar menu lateral"><X size={19}/></button>
      </div>
      <div className="workspace-switch" aria-label="Área de trabalho ST1 Internet">
        <span className="workspace-logo"><Network size={18}/></span>
        <span><b>ST1 Internet</b><small>Ambiente multiárea</small></span>
        <span className="workspace-online" aria-hidden="true"/>
      </div>
      <nav className="sidebar-nav-scroll" aria-label="Seções do ST1 Connect" tabIndex={0}>
        <div className="sidebar-nav-group">
          <div className="nav-section-label">PLATAFORMA</div>
          {navItem('overview', 'Visão geral', LayoutDashboard)}
          {navItem('requests', 'Minhas solicitações', ClipboardList)}
        </div>
        <div className="sidebar-nav-group sidebar-nav-highlight">
          <div className="nav-section-label">ÁREAS DE ATENDIMENTO</div>
          {navItem('bi', 'Central de BI', BarChart3)}
          {navItem('services', 'Solicitações gerais', ClipboardList)}
          {navItem('ouvidoria', 'Ouvidoria', ShieldCheck)}
          {user.isMaster && navItem('management', 'Gestão Master', MonitorCog)}
          {navItem('areas', 'Outras áreas', Users)}
          {navItem('departments', 'Equipes e departamentos', Users)}
        </div>
        <div className="sidebar-nav-group">
          <div className="nav-section-label">CONTINUIDADE DOS DADOS</div>
          {navItem('legacy', 'Dados locais anteriores', HardDriveDownload)}
        </div>
      </nav>
      <div className="sidebar-bottom">
        <button type="button" className="sidebar-profile" onClick={() => setProfileOpen(true)} aria-label="Abrir meu perfil e configurações de acesso" title="Meu acesso">
          <span className="avatar profile-avatar">{user.name.slice(0, 2).toUpperCase()}</span>
          <span><b>{user.name}</b><small>{user.isMaster ? 'Admin Master' : user.role}</small></span>
          <Settings2 size={17}/>
        </button>
      </div>
    </aside>

    <div className="app-content">
      <header className="topbar">
        <div className="topbar-left">
          <button type="button" className="icon-button mobile-menu" aria-label="Abrir navegação" onClick={() => setMobileOpen(true)}><Menu size={21}/></button>
          <span className="breadcrumb-root">ST1 Connect</span>
          <ChevronRight className="breadcrumb-chevron" size={14}/>
          <span className="breadcrumb-current">{PAGE_LABELS[page]}</span>
        </div>
        <div className="topbar-actions">
          <span className="op-topbar-environment"><ShieldCheck size={15}/>Portal corporativo</span>
          <span className="topbar-divider"/>
          <button type="button" className="avatar topbar-avatar" aria-label="Gerenciar meu acesso" onClick={() => setProfileOpen(true)}>{user.name.slice(0, 2).toUpperCase()}</button>
        </div>
      </header>

      <main id="main-content" className="main-content" tabIndex={-1}>
        <div className="page-header">
          <div>
            <div className="page-eyebrow">ST1 CONNECT <span>/</span> AMBIENTE CORPORATIVO</div>
            <h1>{PAGE_LABELS[page]}<span className="heading-dot">.</span></h1>
            <p>{page === 'overview' ? 'Uma única porta de entrada. Cada solicitação no seu destino correto.' :
                page === 'requests' ? 'Acompanhamento dos registros reais vinculados à sua conta.' :
                page === 'bi' ? 'Módulo de dados, relatórios, indicadores e inteligência da ST1.' :
                page === 'services' ? 'Formulários gerais com protocolo, histórico e triagem corporativa.' :
                page === 'ouvidoria' ? 'Canal reservado para manifestações e acompanhamento pelo solicitante.' :
                page === 'management' ? 'Visão de triagem administrativa para a conta master autenticada.' :
                page === 'areas' ? 'Expansão progressiva por área, com responsáveis e dados validados.' :
                page === 'departments' ? 'Filas e permissões de acesso específicas de cada área.' :
                'Preservação de registros anteriores do navegador, sem importação automática.'}
            </p>
          </div>
          {(page === 'overview' || page === 'requests') && <div className="page-actions">
            <button type="button" className="btn btn-secondary" onClick={() => void refreshRequests()} aria-label="Atualizar minhas solicitações">
              <RefreshCcw size={16} /> Atualizar
            </button>
          </div>}
        </div>

        {page === 'overview' && <>
          <section className="op-hero">
            <span className="op-hero-eyebrow"><ShieldCheck size={15}/> ST1 INTERNET · PLATAFORMA MULTIÁREA</span>
            <h2>Uma central para toda a ST1.<br/><strong>Somente dados verdadeiros.</strong></h2>
            <p>BI, solicitações gerais e Ouvidoria compartilham uma experiência corporativa. O acompanhamento usa registros reais, enquanto o atendimento especializado por departamento depende da designação de responsáveis.</p>
            <button type="button" className="op-hero-button" onClick={() => navigate('services')}>Abrir solicitação <ArrowRight size={17}/></button>
            <Database className="op-hero-art" size={220} strokeWidth={0.75} aria-hidden="true"/>
          </section>

          <div className="op-data-note"><Database size={17}/><span>Fonte dos indicadores abaixo: <b>suas próprias solicitações no Supabase</b>. Não representam o total de chamados da ST1.</span></div>
          <section className="op-kpi-grid" aria-label="Resumo pessoal de solicitações">
            <div className="op-kpi-card"><span>Meus pedidos</span><b>{summary ? summary.total : '—'}</b><small>{requests.kind === 'ready' ? 'Registros confirmados' : 'Aguardando fonte válida'}</small></div>
            <div className="op-kpi-card"><span>Em andamento</span><b>{summary ? summary.inProgress : '—'}</b><small>{requests.kind === 'ready' ? 'Inclui pedidos em triagem' : 'Aguardando fonte válida'}</small></div>
            <div className="op-kpi-card"><span>Concluídos</span><b>{summary ? summary.finished : '—'}</b><small>{requests.kind === 'ready' ? 'Resolvidos ou fechados' : 'Aguardando fonte válida'}</small></div>
          </section>

          <div className="op-two-columns">
            <section className="op-surface">
              <div className="op-surface-head"><div><small>ACOMPANHAMENTO</small><h3>Suas solicitações recentes</h3></div><button type="button" onClick={() => navigate('requests')}>Ver todas <ArrowRight size={15}/></button></div>
              {requestList(4)}
            </section>
            <section className="op-surface">
              <div className="op-surface-head"><div><small>MÓDULOS</small><h3>Central de serviços</h3></div></div>
              <div className="op-modules">
                <button type="button" className="op-module-live" onClick={() => navigate('bi')}><span className="op-module-icon"><BarChart3 size={19}/></span><span><b>Dados e Inteligência (BI)</b><small>Fila especializada existente</small></span><ArrowRight size={18}/></button>
                <button type="button" className="op-module-live" onClick={() => navigate('services')}><span className="op-module-icon"><ClipboardList size={19}/></span><span><b>Solicitação Geral</b><small>Recebimento com protocolo e triagem administrativa</small></span><ArrowRight size={18}/></button>
                <button type="button" className="op-module-live" onClick={() => navigate('ouvidoria')}><span className="op-module-icon"><ShieldCheck size={19}/></span><span><b>Ouvidoria</b><small>Canal reservado com acompanhamento</small></span><ArrowRight size={18}/></button>
                <div className="op-module-pending"><span className="op-module-icon"><FileClock size={19}/></span><span><b>Atendimento especializado</b><small>Equipes e roteamento por área ainda em implantação</small></span><span className="op-pending-tag">Pendente</span></div>
              </div>
              <button type="button" className="op-secondary-link" onClick={() => navigate('areas')}>Conhecer os próximos módulos <ArrowRight size={15}/></button>
            </section>
          </div>
        </>}

        {page === 'requests' && <section className="op-surface">
          <div className="op-surface-head"><div><small>REGISTROS COMPARTILHADOS</small><h3>Solicitações vinculadas à sua conta</h3><p>Consulta ao servidor. Chamados antigos de demonstração não são exibidos.</p></div></div>
          {requestList()}
        </section>}

        {page === 'bi' && <BIWorkspace user={user}/>}
        {page === 'services' && <ServiceWorkspace user={user} mode="general"/>}
        {page === 'ouvidoria' && <ServiceWorkspace user={user} mode="ouvidoria"/>}
        {page === 'management' && <ServiceWorkspace user={user} mode="management"/>}

        {page === 'departments' && <DepartmentWorkspace user={user}/>}
        {page === 'areas' && <section className="op-areas-layout">
          <div className="op-areas-note"><LockKeyhole size={21}/><div><b>Implantação controlada por área</b><p>O formulário geral já recebe pedidos reais para triagem, mas o roteamento automático e as filas especializadas permanecem em implantação até haver responsáveis definidos.</p></div></div>
          <div className="op-areas-grid">
            <button type="button" className="op-area-card op-area-active" onClick={() => navigate('bi')}>
              <span className="op-area-icon"><BarChart3 size={25}/></span><span className="op-area-status is-enabled"><CheckCircle2 size={14}/> Módulo disponível</span>
              <h3>Dados e Inteligência (BI)</h3><p>Dashboards, indicadores, relatórios, consultas e solicitações de dados.</p>
              <span className="op-area-cta">Abrir Central de BI <ArrowRight size={16}/></span>
            </button>
            {FUTURE_AREAS.map(area => {
              const Icon = area.icon;
              return <article className="op-area-card op-area-disabled" key={area.name}>
                <span className="op-area-icon"><Icon size={25}/></span>
                <span className="op-area-status">Em implantação</span>
                <h3>{area.name}</h3><p>{area.description}</p>
                <span className="op-area-cta is-disabled"><LockKeyhole size={15}/> Atendimento especializado ainda não habilitado</span>
              </article>;
            })}
          </div>
        </section>}

        {page === 'legacy' && <section className="op-surface op-legacy">
          <div className="op-legacy-intro"><span className="op-legacy-icon"><HardDriveDownload size={26}/></span><div><small>GUARDA E RECUPERAÇÃO</small><h2>Dados salvos anteriormente neste navegador</h2><p>O módulo antigo armazenava exemplos e possíveis alterações manuais no próprio navegador. Não vamos apagar nem importar automaticamente esses registros para a base operacional.</p></div></div>
          <div className="op-legacy-warning"><AlertCircle size={19}/><span>Os dados deste arquivo <b>não são considerados operacionais ou confiáveis</b>. Revise e classifique qualquer informação antes de uma futura importação.</span></div>
          {legacy.kind === 'checking' && <p className="op-legacy-status">Conferindo armazenamento local...</p>}
          {legacy.kind === 'available' && <div className="op-legacy-status"><CheckCircle2 size={18}/><span>Encontramos {legacy.keys.length} {legacy.keys.length === 1 ? 'registro de armazenamento' : 'registros de armazenamento'} neste endereço. Você pode preservar o conteúdo completo em um arquivo JSON.</span></div>}
          {legacy.kind === 'empty' && <div className="op-legacy-status"><FileText size={18}/><span>Nenhum dado anterior foi encontrado neste endereço do site.</span></div>}
          {legacy.kind === 'error' && <div className="op-legacy-status is-error" role="alert"><AlertCircle size={18}/><span>{legacy.message}</span></div>}
          <div className="op-legacy-actions">
            <button type="button" className="btn btn-primary" onClick={exportLegacy} disabled={legacy.kind !== 'available'}><ArrowDownToLine size={17}/> Exportar dados deste navegador</button>
            <button type="button" className="btn btn-secondary" onClick={checkLegacy}><RefreshCcw size={16}/> Verificar novamente</button>
          </div>
          <div className="op-origin"><b>Limite importante:</b> cada domínio do site possui seu próprio armazenamento. Se você usou outro link do Vercel ou o endereço principal, abra exatamente aquele endereço para recuperar seus registros. Esta prévia não consegue acessar os dados locais de outro domínio.</div>
        </section>}

        <footer className="app-footer">
          <span><span className="footer-mark">st1</span> connect <span className="footer-divider">/</span> Uma plataforma corporativa, várias áreas.</span>
          <span>Dados reais por usuário · Módulos liberados progressivamente <ShieldCheck size={13}/></span>
        </footer>
      </main>
    </div>
    {profileOpen && <ProfilePanel user={user} onLogout={onLogout} onClose={() => setProfileOpen(false)}/>}
    {notice && <div className="toast" role="status"><span><CheckCircle2 size={17}/></span>{notice}<button type="button" aria-label="Fechar aviso" onClick={() => setNotice('')}><X size={15}/></button></div>}
  </div>;
}
