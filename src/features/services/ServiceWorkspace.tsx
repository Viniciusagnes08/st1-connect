import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, CheckCircle2, ClipboardList, FilePlus2, Inbox, LockKeyhole, RefreshCcw, ShieldCheck, X } from 'lucide-react';
import type { Account } from '../../AuthGate';
import {
  changeServiceState, fetchServiceDetail, fetchServiceForms, fetchServiceRequests,
  submitServiceRequest,
} from './service-api';
import type { ServiceDetail,ServiceForm,ServiceRequest,ServiceState } from './service-api';
import './service-workspace.css';
import { GUIDED_MODELS, guidedDescription } from './guided-models';

type Mode='general'|'ouvidoria'|'management';
type Section='mine'|'create'|'queue';
const steps:Record<ServiceState,ServiceState[]>={
  'Novo':['Em triagem','Em atendimento'],
  'Em triagem':['Em atendimento','Pendente','Resolvido'],
  'Em atendimento':['Pendente','Resolvido'],
  'Pendente':['Em triagem','Em atendimento','Resolvido'],
  'Resolvido':['Fechado','Em atendimento'],
  'Fechado':[],
};
const formatted=new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Fortaleza'});
function format(value:string) {
  const parsed=new Date(value);
  return Number.isNaN(parsed.getTime())?'Data indisponível':formatted.format(parsed);
}
const empty=(text:string)=><div className="svc-empty"><Inbox size={28}/><b>Nenhum registro encontrado</b><p>{text}</p></div>;
export default function ServiceWorkspace({user,mode='general'}:{user:Account;mode?:Mode}) {
  const [forms,setForms]=useState<ServiceForm[]>([]);
  const [mine,setMine]=useState<ServiceRequest[]>([]);
  const [queue,setQueue]=useState<ServiceRequest[]>([]);
  const [section,setSection]=useState<Section>(mode==='management'?'queue':mode==='ouvidoria'?'create':'mine');
  const [formKey,setFormKey]=useState(mode==='ouvidoria'?'ouvidoria':'solicitacao-geral');
  const [modelKey,setModelKey]=useState('');
  const models=GUIDED_MODELS.filter(model=>mode==='ouvidoria'?model.area==='ouvidoria':model.area!=='ouvidoria');
  const model=models.find(item=>item.key===modelKey);
  const [selected,setSelected]=useState<ServiceDetail|null>(null);
  const [nextState,setNextState]=useState<ServiceState|' '>(' ');
  const [reason,setReason]=useState('');
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const idempotencyKey=useRef(crypto.randomUUID());

  const refresh=useCallback(async()=>{
    setError('');setLoading(true);
    try {
      const [catalog,requests,masterQueue]=await Promise.all([
        fetchServiceForms(),fetchServiceRequests('mine'),
        user.isMaster?fetchServiceRequests('all'):Promise.resolve([] as ServiceRequest[]),
      ]);
      setForms(catalog);setMine(requests);setQueue(masterQueue);
    } catch(cause) {
      setError(cause instanceof Error?cause.message:'Não foi possível consultar a base de solicitações.');
    } finally {setLoading(false);}
  },[user.isMaster]);
  useEffect(()=>{void refresh();},[refresh]);
  const visibleForms=useMemo(()=>forms.filter(x=>mode!=='ouvidoria'||x.key==='ouvidoria'),[forms,mode]);
  const activeForm=visibleForms.find(x=>x.key===formKey)||visibleForms[0];
  const myItems=mode==='ouvidoria'?mine.filter(x=>x.area==='ouvidoria'):mode==='general'?mine.filter(x=>x.area!=='ouvidoria'):mine;
  const queueItems=mode==='ouvidoria'?queue.filter(x=>x.area==='ouvidoria'):queue;
  const open=async(id:string)=>{
    setBusy(true);setError('');
    try {setSelected(await fetchServiceDetail(id));setNextState(' ');setReason('');}
    catch(cause){setError(cause instanceof Error?cause.message:'Não foi possível abrir a solicitação.');}
    finally {setBusy(false);}
  };
  const submit=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();if(!activeForm)return;
    setBusy(true);setError('');setNotice('');
    const form=event.currentTarget;
    const inputs=new FormData(form);
    let description=String(inputs.get('description')||'');
    try {
      if(model)description=guidedDescription(model,model.questions.map((_,i)=>String(inputs.get('answer-'+i)||'')),description);
    } catch(cause) {
      setError(cause instanceof Error?cause.message:'Confira as respostas.');setBusy(false);return;
    }
    const request={
      formKey:activeForm.key,title:String(inputs.get('title')||''),
      description,
      ...(activeForm.key==='ouvidoria'
        ? {category:String(inputs.get('category')||'')}
        : {area:String(inputs.get('area')||'')}),
    };
    try {
      const result=await submitServiceRequest(request,idempotencyKey.current);
      idempotencyKey.current=crypto.randomUUID();
      form.reset();
      setNotice('Solicitação '+result.protocol+' registrada. Acompanhe o status em Meus pedidos.');
      setSection('mine');
      await refresh();
    }catch(cause){setError(cause instanceof Error?cause.message:'Falha ao registrar a solicitação.');}
    finally {setBusy(false);}
  };
  const changeState=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();if(!selected||nextState===' ')return;
    setBusy(true);setError('');setNotice('');
    try {
      await changeServiceState(selected.request.id,nextState,reason);
      setSelected(await fetchServiceDetail(selected.request.id));
      setNextState(' ');setReason('');
      setNotice('Atendimento atualizado e registrado no histórico.');
      await refresh();
    }catch(cause){setError(cause instanceof Error?cause.message:'Não foi possível atualizar o atendimento.');}
    finally {setBusy(false);}
  };
  if(mode==='management'&&!user.isMaster)return <section className="svc-locked"><LockKeyhole size={24}/><h3>Acesso reservado</h3><p>Somente o Admin Master pode consultar a fila corporativa completa.</p></section>;

  return <div className="svc-workspace">
    <div className={'svc-banner'+(mode==='ouvidoria'?' svc-banner-private':'')}>
      <span className="svc-eyebrow"><ShieldCheck size={16}/>{mode==='ouvidoria'?'CANAL RESERVADO':mode==='management'?'GESTÃO CORPORATIVA':'CENTRAL DE SERVIÇOS'}</span>
      <h2>{mode==='ouvidoria'?'Ouvidoria ST1':mode==='management'?'Painel do Admin Master':'Uma solicitação. Um protocolo. Um acompanhamento.'}</h2>
      <p>{mode==='ouvidoria'?'Relatos protegidos, acompanhados com transparência. Durante a implantação, apenas você e o Admin Master podem visualizar os detalhes.':
        mode==='management'?'Acompanhamento central de solicitações reais e triagem das áreas. Não existem dados demonstrativos nesta fila.':
        'Solicite suporte, melhorias e demandas corporativas. O encaminhamento é realizado pela triagem administrativa até que cada área tenha seus responsáveis.'}</p>
    </div>
    <div className="svc-tabs" role="tablist" aria-label="Central de serviços">
      {mode!=='management'&&<button type="button" role="tab" aria-selected={section==='mine'} className={section==='mine'?'active':''} onClick={()=>setSection('mine')}><ClipboardList size={16}/>Meus pedidos</button>}
      {mode!=='management'&&<button type="button" role="tab" aria-selected={section==='create'} className={section==='create'?'active':''} onClick={()=>setSection('create')}><FilePlus2 size={16}/>Novo formulário</button>}
      {user.isMaster&&<button type="button" role="tab" aria-selected={section==='queue'} className={section==='queue'?'active':''} onClick={()=>setSection('queue')}><ShieldCheck size={16}/>Fila administrativa</button>}
      <button type="button" className="svc-refresh" onClick={()=>void refresh()} disabled={loading||busy}><RefreshCcw size={15}/>Atualizar</button>
    </div>
    {error&&<div className="svc-error" role="alert">{error}</div>}
    {notice&&<div className="svc-notice" role="status"><CheckCircle2 size={17}/>{notice}<button aria-label="Fechar aviso" onClick={()=>setNotice('')}><X size={15}/></button></div>}
    {loading&&<div className="svc-loading" role="status">Carregando registros reais do servidor...</div>}

    {!loading&&section==='create'&&mode!=='management'&&<section className="svc-panel">
      <h3>Preencher solicitação</h3>
      {mode!=='ouvidoria'&&<div className="svc-form-picker">
        {visibleForms.map(form=><button type="button" key={form.key} className={form.key===activeForm?.key?'active':''} onClick={()=>{setFormKey(form.key);setModelKey('');}}>{form.title}</button>)}
      </div>}
      <label className="svc-model-picker">Qual é a sua necessidade?
        <select value={modelKey} onChange={event=>{
          setModelKey(event.target.value);setFormKey(mode==='ouvidoria'?'ouvidoria':'solicitacao-geral');
          idempotencyKey.current=crypto.randomUUID();setError('');
        }}>
          <option value="">Preenchimento livre</option>
          {[...new Set(models.map(item=>item.group))].map(group=><optgroup key={group} label={group}>
            {models.filter(item=>item.group===group).map(item=><option key={item.key} value={item.key}>{item.title}</option>)}
          </optgroup>)}
        </select>
        <small>Escolha um modelo para preencher somente as informações necessárias. Ao trocar de modelo, as respostas do formulário são limpas.</small>
      </label>
      {activeForm ? <form className="svc-form" onSubmit={submit} key={activeForm.key+modelKey}>
        <div className="svc-form-intro"><b>{activeForm.title}</b><p>{activeForm.description}</p></div>
        <div className="svc-form-intro"><b>{user.name}</b><p>{user.email} · Identificação preenchida pela sua conta.</p></div>
        {model?<><div className="svc-form-intro"><b>{model.title}</b><p>Destino: {model.group}. Preencha as perguntas abaixo. O atendimento será encaminhado pela triagem.</p></div>
          <input type="hidden" name={model.category?'category':'area'} value={model.category||model.area}/>
        </>:activeForm.fields.map(field=><label key={field.name}>{field.label}
          <select name={field.name} required={field.required} defaultValue="">
            <option value="" disabled>Selecione uma opção</option>
            {field.options.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>)}
        <label>Assunto<input name="title" required minLength={6} maxLength={160} defaultValue={model?.title||''} placeholder="Resuma sua solicitação em uma frase"/></label>
        {model?.questions.map((question,i)=><label key={question}>{question} <span>Obrigatório</span>
          {['Qual a data desejada?','Qual a data prevista?'].includes(question)
            ?<input type="date" name={'answer-'+i} required/>
            :<textarea name={'answer-'+i} required maxLength={900} rows={3} placeholder="Informe os detalhes deste item"/>}
        </label>)}
        <label>{model?'Informações adicionais (opcional)':'Descrição'}<textarea name="description" required={!model} minLength={model?undefined:12} maxLength={model?1000:5000} rows={model?3:6} placeholder={model?'Acrescente apenas o que ainda não foi informado':'Descreva o contexto, o que aconteceu e o resultado esperado'}/></label>
        <small>Não inclua senhas, códigos de acesso ou dados pessoais desnecessários. As respostas juntas podem ter até 5.000 caracteres.</small>
        {activeForm.confidential&&<div className="svc-confidential"><LockKeyhole size={17}/><span>Este relato não é anônimo. Seu conteúdo é reservado ao solicitante e à administração master nesta fase. Não inclua dados pessoais desnecessários.</span></div>}
        <button type="submit" className="svc-submit" disabled={busy}>Registrar solicitação <ArrowRight size={17}/></button>
      </form>:empty('Nenhum formulário liberado para sua conta.')}
    </section>}

    {!loading&&section==='mine'&&<section className="svc-panel">
      <header className="svc-panel-head"><h3>Seus pedidos</h3><span>{myItems.length} registro(s)</span></header>
      {!myItems.length?empty('Quando registrar um pedido, ele aparecerá aqui com seu protocolo e andamento.'):
        <div className="svc-list">{myItems.map(item=><button key={item.id} type="button" onClick={()=>void open(item.id)}>
          <span><small>{item.protocol} · {format(item.created_at)} · {item.area==='ouvidoria'?'Ouvidoria':item.area}</small><b>{item.title}</b></span>
          <em>{item.state}</em><ArrowRight size={17}/>
        </button>)}</div>}
    </section>}

    {!loading&&section==='queue'&&user.isMaster&&<section className="svc-panel">
      <header className="svc-panel-head"><h3>Triagem administrativa</h3><span>{queueItems.length} registro(s)</span></header>
      {!queueItems.length?empty('Não existem solicitações cadastradas neste escopo.'):
        <div className="svc-list">{queueItems.map(item=><button key={item.id} type="button" onClick={()=>void open(item.id)}>
          <span><small>{item.protocol} · {format(item.created_at)} · {item.area==='ouvidoria'?'Reservado: Ouvidoria':item.area}</small><b>{item.title}</b></span>
          <em>{item.state}</em><ArrowRight size={17}/>
        </button>)}</div>}
    </section>}

    {selected&&<div className="svc-detail-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null);}}>
      <section className="svc-detail" role="dialog" aria-modal="true" aria-label="Detalhes da solicitação">
        <header><div><small>{selected.request.protocol} · {selected.request.area}</small><h3>{selected.request.title}</h3></div><button type="button" aria-label="Fechar detalhes" onClick={()=>setSelected(null)}><X size={19}/></button></header>
        <div className="svc-detail-body">
          {selected.request.confidential&&<div className="svc-confidential"><LockKeyhole size={17}/>Manifestação de acesso restrito</div>}
          <p><b>Status atual:</b> {selected.request.state}</p>
          <p className="svc-detail-description">{selected.request.description}</p>
          <h4>Histórico de atendimento</h4>
          {selected.events.map((evt,i)=><div key={i} className="svc-event"><small>{format(evt.created_at)}</small><b>{evt.event_type==='created'?'Pedido registrado':evt.event_type==='state_changed'?'Status atualizado':'Comentário'}</b>{evt.payload?.to&&<span>{evt.payload.to}</span>}{evt.payload?.reason&&<p>{evt.payload.reason}</p>}</div>)}
          {user.isMaster&&steps[selected.request.state]?.length>0&&<form className="svc-master-update" onSubmit={changeState}>
            <h4>Atualizar atendimento · Admin Master</h4>
            <label>Próximo status<select required value={nextState} onChange={event=>setNextState(event.target.value as ServiceState)}>
              <option value=" " disabled>Selecione um status</option>
              {steps[selected.request.state].map(item=><option key={item}>{item}</option>)}
            </select></label>
            <label>Registro da atualização<textarea rows={3} value={reason} maxLength={2000} onChange={e=>setReason(e.target.value)} placeholder="Descreva a ação tomada. Obrigatório ao marcar Pendente ou Resolvido."/></label>
            <button className="svc-submit" type="submit" disabled={busy||nextState===' '}>Salvar atualização <ArrowRight size={16}/></button>
          </form>}
        </div>
      </section>
    </div>}
  </div>;
}
