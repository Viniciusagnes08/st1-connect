import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  ArrowLeft, ArrowRight, BarChart3, Check, CheckCircle2, ClipboardCheck, Clock3,
  Database, ExternalLink, FilePlus2, Inbox, LoaderCircle, LockKeyhole, RefreshCcw,
  Shield, ShieldCheck, SlidersHorizontal, Users, X, AlertCircle,
} from 'lucide-react';
import {
  BiApiError, createBiTicket, getBiQueue, getBiSelf, getBiTicket,
  getMyRequests, getSquadMembers, setBiMember, updateBiState,
} from './api';
import { canDisplayQueue, scopeLabel, stateTone } from './bi-views';
import type { BiQueueItem, BiSelf, BiState, OwnRequest, SquadMember, TicketDetail } from './types';
import './bi-workspace.css';

type User = { id:string; name:string; email:string; role:string };
type Tab = 'mine' | 'new' | 'queue' | 'members';
const DATE_FORMAT = new Intl.DateTimeFormat('pt-BR',{
  dateStyle:'short',timeStyle:'short',timeZone:'America/Fortaleza',
});
function niceDate(value:string) {
  try {return DATE_FORMAT.format(new Date(value));} catch {return '—';}
}
function statusStyle(state:BiState | null) {
  return state ? 'bi-status bi-status-'+stateTone(state) : 'bi-status bi-status-new';
}
function StatusTag({state}: {state:BiState | null}) {
  return <span className={statusStyle(state)}><i />{state || 'Aguardando triagem'}</span>;
}
function MiniEmpty({title,description}: {title:string;description:string}) {
  return <div className="bi-empty"><Inbox size={28} strokeWidth={1.5}/><b>{title}</b><p>{description}</p></div>;
}

export default function BIWorkspace({ user }: { user: User }) {
  const [self,setSelf] = useState<BiSelf|null>(null);
  const [mine,setMine] = useState<OwnRequest[]>([]);
  const [queue,setQueue] = useState<BiQueueItem[]>([]);
  const [accounts,setAccounts] = useState<SquadMember[]>([]);
  const [tab,setTab] = useState<Tab>('mine');
  const [loading,setLoading] = useState(true);
  const [refreshing,setRefreshing] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [selected,setSelected] = useState<TicketDetail|null>(null);
  const [detailLoading,setDetailLoading] = useState(false);
  const [note,setNote] = useState('');
  const [formTitle,setFormTitle] = useState('');
  const [formDescription,setFormDescription] = useState('');
  const idempotencyKey = useRef(crypto.randomUUID());

  const initialize = useCallback(async () => {
    setRefreshing(true);setError('');
    try {
      const [session,requests]=await Promise.all([getBiSelf(),getMyRequests()]);
      setSelf(session);setMine(requests);
    } catch(e) {
      setError(e instanceof Error ? e.message : 'Não foi possível acessar o BI.');
    } finally {setLoading(false);setRefreshing(false);}
  },[]);

  useEffect(()=>{void initialize();},[initialize]);

  const refreshQueue=useCallback(async ()=>{
    try{setQueue(await getBiQueue());setError('');}
    catch(e){setError(e instanceof Error ? e.message : 'Não foi possível carregar a fila.');}
  },[]);
  const refreshAccounts=useCallback(async ()=>{
    try{setAccounts(await getSquadMembers());setError('');}
    catch(e){setError(e instanceof Error ? e.message : 'Não foi possível carregar membros.');}
  },[]);

  useEffect(()=>{
    if(tab==='queue'&&self?.isBiStaff)void refreshQueue();
    if(tab==='members'&&self?.canManageMembers)void refreshAccounts();
  },[tab,self?.isBiStaff,self?.canManageMembers,refreshQueue,refreshAccounts]);

  const openRequest=async(id:string)=>{
    setDetailLoading(true);setError('');
    try{setSelected(await getBiTicket(id));setNote('');}
    catch(e){setError(e instanceof Error ? e.message : 'Não foi possível abrir o registro.');}
    finally{setDetailLoading(false);}
  };
  const handleCreate=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();setBusy(true);setError('');setNotice('');
    try{
      const result=await createBiTicket({
        title:formTitle.trim(),description:formDescription.trim(),
      },idempotencyKey.current);
      setNotice('Solicitação '+result.protocol+' registrada na fila do BI.');
      idempotencyKey.current=crypto.randomUUID();
      setFormTitle('');setFormDescription('');
      setMine(await getMyRequests());
      setTab('mine');
    }catch(e){setError(e instanceof Error?e.message:'Falha ao criar solicitação.');}
    finally{setBusy(false);}
  };
  const handleMember=async(person:SquadMember,role:'manager'|'analyst',active:boolean)=>{
    setBusy(true);setError('');setNotice('');
    try{
      await setBiMember(person.id,role,active);
      setAccounts(await getSquadMembers());
      if(person.id===user.id)setSelf(await getBiSelf());
      setNotice('Acesso do Squad atualizado: '+person.name+'.');
    }catch(e){setError(e instanceof Error?e.message:'Falha ao atualizar membro.');}
    finally{setBusy(false);}
  };
  const changeState=async(state:BiState)=>{
    if(!selected)return;
    setBusy(true);setError('');setNotice('');
    try{
      await updateBiState(selected.ticket.id,state,note);
      setSelected(await getBiTicket(selected.ticket.id));
      await Promise.all([refreshQueue(),getMyRequests().then(setMine)]);
      setNote('');
      setNotice('Situação do chamado atualizada.');
    }catch(e){setError(e instanceof Error?e.message:'Falha ao atualizar situação.');}
    finally{setBusy(false);}
  };

  const openCount = useMemo(()=>queue.filter(x=>x.state==='Novo').length,[queue]);
  const handlingCount=useMemo(()=>queue.filter(x=>x.state==='Em atendimento').length,[queue]);
  const finishedCount=useMemo(()=>queue.filter(x=>x.state==='Resolvido'||x.state==='Fechado').length,[queue]);
  const isMember=canDisplayQueue(self?.isBiStaff===true);
  const admin=self?.canManageMembers===true;
  const disabled=loading||Boolean(error&&!self);
  return <div className="bi-workspace">
    <div className="bi-banner">
      <div className="bi-banner-copy">
        <span className="bi-label"><span className="bi-label-dot"/>SQUAD BI <i/> CENTRAL INTERNA</span>
        <h2>Dados organizados.<br/><strong>Demandas no lugar certo.</strong></h2>
        <p>Solicite análises, acompanhe seus pedidos e centralize a execução do time de BI.</p>
      </div>
      <div className="bi-banner-art" aria-hidden="true">
        <div className="bi-orbit bi-orbit-1"/><div className="bi-orbit bi-orbit-2"/>
        <Database size={60} strokeWidth={1.2}/>
      </div>
      <div className="bi-banner-side"><ShieldCheck size={17}/><span>Acesso por perfil<br/>e Squad autorizado</span></div>
    </div>

    <div className="bi-control-row">
      <div className="bi-context"><span className="bi-live-mark"/><b>Espaço do Squad de BI</b><small>Solicitações reais, sem dados de demonstração</small></div>
      <button type="button" className="bi-refresh" onClick={()=>{void initialize();if(tab==='queue')void refreshQueue();if(tab==='members')void refreshAccounts();}} disabled={refreshing} aria-label="Atualizar solicitações"><RefreshCcw size={16} className={refreshing?'bi-spin':''}/>Atualizar</button>
    </div>

    {notice&&<div className="bi-notice" role="status"><CheckCircle2 size={18}/>{notice}<button aria-label="Fechar confirmação" onClick={()=>setNotice('')}><X size={16}/></button></div>}
    {error&&<div className="bi-error" role="alert"><AlertCircle size={18}/><span>{error}</span>{!self&&<button type="button" onClick={()=>void initialize()}>Tentar novamente</button>}</div>}

    {disabled ? <section className="bi-setup">
      <span className="bi-setup-icon">{loading?<LoaderCircle size={29} className="bi-spin"/>:<LockKeyhole size={29}/>}</span>
      <h3>{loading?'Verificando acesso ao Squad...':'O espaço compartilhado ainda não está ativo'}</h3>
      <p>{loading?'Estamos conferindo sua identidade e a disponibilidade dos dados.':
        'O sistema de demonstração continua disponível. A nova fila de BI depende da configuração e validação do banco de dados no servidor.'}</p>
      {!loading&&<span className="bi-setup-caption">Nenhuma solicitação foi enviada nem salva neste navegador.</span>}
    </section> : <>
      <div className="bi-tabs" role="tablist" aria-label="Áreas do espaço BI">
        <button type="button" role="tab" aria-selected={tab==='mine'} className={tab==='mine'?'active':''} onClick={()=>setTab('mine')}><ClipboardCheck size={16}/>Meus pedidos</button>
        <button type="button" role="tab" aria-selected={tab==='new'} className={tab==='new'?'active':''} onClick={()=>setTab('new')}><FilePlus2 size={16}/>Nova solicitação</button>
        {isMember&&<button type="button" role="tab" aria-selected={tab==='queue'} className={tab==='queue'?'active':''} onClick={()=>setTab('queue')}><BarChart3 size={16}/>Fila do BI</button>}
        {admin&&<button type="button" role="tab" aria-selected={tab==='members'} className={tab==='members'?'active':''} onClick={()=>setTab('members')}><Users size={16}/>Acessos do Squad</button>}
      </div>

      {tab==='mine'&&<section className="bi-panel">
        <div className="bi-panel-heading"><div><span className="bi-overline">ACOMPANHAMENTO</span><h3>Meus pedidos</h3><p>Acompanhe as solicitações vinculadas ao seu acesso.</p></div><button className="bi-primary" type="button" onClick={()=>setTab('new')}><FilePlus2 size={16}/>Nova solicitação</button></div>
        {mine.length===0?<MiniEmpty title="Ainda não há solicitações" description="Quando você enviar seu primeiro pedido, ele aparecerá aqui com protocolo e situação."/>:
          <div className="bi-list">{mine.map(item=><button type="button" key={item.id} className="bi-list-row" onClick={()=>{if(item.scope==='BI')void openRequest(item.id);}}>
            <div className="bi-document-icon"><ClipboardCheck size={19}/></div>
            <div className="bi-list-main"><small>{item.protocol} · {scopeLabel(item.scope)}</small><b>{item.title}</b><span>Registrado em {niceDate(item.created_at)}</span></div>
            <StatusTag state={item.state}/><ArrowRight className="bi-row-arrow" size={17}/>
          </button>)}</div>}
      </section>}

      {tab==='new'&&<section className="bi-panel bi-form-panel">
        <div className="bi-panel-heading"><div><span className="bi-overline">ABERTURA RÁPIDA</span><h3>Nova solicitação de BI</h3><p>Este é o formulário inicial da Fase A. Formulários específicos serão disponibilizados na próxima etapa.</p></div></div>
        <div className="bi-form-grid">
          <form onSubmit={handleCreate} className="bi-new-form">
            <div className="bi-form-person"><span className="bi-avatar">{user.name.slice(0,2).toUpperCase()}</span><div><small>SOLICITANTE IDENTIFICADO</small><b>{user.name}</b><span>{user.email}</span></div><Shield size={17}/></div>
            <label>Qual solicitação você precisa fazer? <em>*</em><input required minLength={6} maxLength={160} value={formTitle} onChange={e=>setFormTitle(e.target.value)} placeholder="Ex.: Corrigir divergência no BI Comercial"/></label>
            <label>Descreva o resultado esperado e o contexto <em>*</em><textarea required minLength={12} maxLength={5000} rows={5} value={formDescription} onChange={e=>setFormDescription(e.target.value)} placeholder="Informe painel, período, indicador e o resultado esperado para facilitar a análise."/></label>
            <div className="bi-form-bottom"><span><ShieldCheck size={17}/>Seus dados serão vinculados à conta conectada.</span><button className="bi-primary" disabled={busy} type="submit">{busy?'Registrando...':'Registrar no BI'}<ArrowRight size={16}/></button></div>
          </form>
          <aside className="bi-form-aside"><span><SlidersHorizontal size={20}/></span><h4>Como funciona?</h4><ol><li>Você descreve a necessidade.</li><li>O chamado entra na fila real do Squad de BI.</li><li>Você acompanha o protocolo em Meus pedidos.</li></ol><p>Sem promessa de prazo automático: a priorização é feita após análise do Squad.</p></aside>
        </div>
      </section>}

      {tab==='queue'&&isMember&&<section className="bi-panel">
        <div className="bi-panel-heading"><div><span className="bi-overline">OPERAÇÃO • SQUAD BI</span><h3>Fila compartilhada</h3><p>Chamados executáveis do BI. Pedidos de outras áreas não entram nesta fila.</p></div></div>
        <div className="bi-kpis">
          <div><span>Novos</span><b>{openCount}</b><small>Aguardando triagem</small></div>
          <div><span>Em atendimento</span><b>{handlingCount}</b><small>Trabalho iniciado</small></div>
          <div><span>Concluídos</span><b>{finishedCount}</b><small>Resolvidos ou fechados</small></div>
        </div>
        {queue.length===0?<MiniEmpty title="Fila sem chamados reais" description="Nenhum pedido foi registrado ainda no banco compartilhado."/>:
          <div className="bi-list">{queue.map(item=><button key={item.id} type="button" onClick={()=>void openRequest(item.id)} className="bi-list-row">
            <div className="bi-document-icon"><Database size={18}/></div>
            <div className="bi-list-main"><small>{item.protocol} · {item.requester_email}</small><b>{item.title}</b><span>Recebido em {niceDate(item.created_at)}</span></div>
            <StatusTag state={item.state}/><ArrowRight size={17} className="bi-row-arrow"/>
          </button>)}</div>}
      </section>}

      {tab==='members'&&admin&&<section className="bi-panel">
        <div className="bi-panel-heading"><div><span className="bi-overline">CONTROLE DE ACESSO</span><h3>Membros do Squad</h3><p>Autorize apenas pessoas que atuam no BI. O perfil técnico sozinho não libera a fila.</p></div></div>
        {accounts.length===0?<MiniEmpty title="Nenhuma conta disponível" description="Crie os usuários em Meu acesso para autorizar aqui os membros do Squad."/>:
          <div className="bi-people">{accounts.map(person=><div className="bi-person" key={person.id}>
            <span className="bi-person-avatar">{person.name.slice(0,2).toUpperCase()}</span>
            <div className="bi-person-info"><b>{person.name}</b><small>{person.email}</small><span>{person.role}{!person.active?' · Conta desativada':''}</span></div>
            <select aria-label={'Papel no BI de '+person.name} disabled={busy||!person.active} value={person.membership?.biRole||'analyst'} onChange={e=>void handleMember(person,e.target.value as 'manager'|'analyst',true)}><option value="analyst">Analista BI</option><option value="manager">Gestão BI</option></select>
            <button type="button" disabled={busy||!person.active} className={person.membership?.active?'bi-secondary':'bi-primary'} onClick={()=>void handleMember(person,person.membership?.biRole||'analyst',!person.membership?.active)}>
              {person.membership?.active?'Remover do Squad':'Autorizar no BI'}
            </button>
          </div>)}</div>}
        <p className="bi-members-foot"><LockKeyhole size={15}/>A conta precisa estar ativa e possuir um perfil operacional autorizado para acessar a fila. Tudo é verificado no servidor.</p>
      </section>}

    </>}

    {detailLoading&&<div className="bi-detail-overlay"><div className="bi-detail-progress"><LoaderCircle className="bi-spin" size={20}/>Abrindo chamado...</div></div>}
    {selected&&<div className="bi-detail-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null);}}>
      <section className="bi-detail" role="dialog" aria-modal="true" aria-label={'Chamado '+selected.ticket.protocol}>
        <div className="bi-detail-top"><button type="button" onClick={()=>setSelected(null)}><ArrowLeft size={17}/>Voltar</button><span>{selected.ticket.protocol}</span><button type="button" aria-label="Fechar" onClick={()=>setSelected(null)}><X size={19}/></button></div>
        <div className="bi-detail-body"><span className="bi-overline">CHAMADO REAL · SQUAD BI</span><h3>{selected.ticket.title}</h3><div className="bi-detail-metadata"><StatusTag state={selected.ticket.state}/><span><Clock3 size={14}/>{niceDate(selected.ticket.created_at)}</span><span>{selected.ticket.requester_email}</span></div>
          <div className="bi-detail-description"><h4>Descrição recebida</h4><p>{selected.ticket.details?.description || 'Sem descrição disponível.'}</p></div>
          <div className="bi-detail-events"><h4>Histórico do atendimento</h4>{selected.events.map((event,index)=><div key={index}><span className="bi-event-dot"/><div><b>{event.event_type==='created'?'Solicitação recebida':event.event_type==='state_changed'?'Situação alterada':'Evento registrado'}</b><small>{niceDate(event.created_at)}</small><p>{event.payload?.reason|| (event.payload?.to ? 'Alterado para '+event.payload.to : 'Registro do sistema')}</p></div></div>)}</div>
          {isMember&&<div className="bi-detail-actions"><h4>Atualizar atendimento</h4><label>Justificativa quando necessária<textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Ex.: Aguardo validação da base de dados..." rows={3} maxLength={2000}/></label><div>
            {selected.ticket.state==='Novo'&&<button disabled={busy} onClick={()=>void changeState('Em atendimento')}>Iniciar atendimento</button>}
            {['Novo','Em atendimento'].includes(selected.ticket.state)&&<button disabled={busy} onClick={()=>void changeState('Pendente')}>Marcar pendente</button>}
            {selected.ticket.state==='Pendente'&&<button disabled={busy} onClick={()=>void changeState('Em atendimento')}>Retomar</button>}
            {['Em atendimento','Pendente'].includes(selected.ticket.state)&&<button disabled={busy} onClick={()=>void changeState('Resolvido')}>Resolver</button>}
            {selected.ticket.state==='Resolvido'&&<button disabled={busy} onClick={()=>void changeState('Fechado')}>Fechar</button>}
            {selected.ticket.state==='Resolvido'&&<button disabled={busy} onClick={()=>void changeState('Em atendimento')}>Reabrir</button>}
          </div></div>}
        </div>
      </section>
    </div>}
  </div>;
}
