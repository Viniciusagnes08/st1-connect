import {useEffect,useState} from 'react';
import type {Account} from '../../AuthGate';
import {fetchMyDepartments,fetchDepartmentMembers,setDepartmentMember,fetchDepartmentQueue,fetchServiceDetail,changeServiceState,assignDepartmentRequest,fetchDepartmentAssignees,fetchDepartmentAudit} from './service-api';
import type {DepartmentMembership,DepartmentMember,ServiceRequest,ServiceDetail,ServiceState,DepartmentAccessAudit} from './service-api';
import './service-workspace.css';

const labels:Record<string,string>={comercial:'Comercial',crm:'Sistemas e CRM',ti:'Infraestrutura e TI',marketing:'Marketing',financeiro:'Financeiro',administrativo:'Administrativo'};
const states:ServiceState[]=['Novo','Em triagem','Em atendimento','Pendente','Resolvido','Fechado'];
const eventLabels:Record<DepartmentAccessAudit['event_type'],string>={
 granted:'Acesso concedido',role_changed:'Função alterada',
 revoked:'Acesso revogado',reactivated:'Acesso reativado',
};
export default function DepartmentWorkspace({user}:{user:Account}){
 const [memberships,setMemberships]=useState<DepartmentMembership[]>([]);
 const [areas,setAreas]=useState<string[]>([]);
 const [area,setArea]=useState('');
 const [list,setList]=useState<ServiceRequest[]>([]);
 const [detail,setDetail]=useState<ServiceDetail|null>(null);
 const [catalog,setCatalog]=useState<DepartmentMember[]>([]);
 const [members,setMembers]=useState<DepartmentMembership[]>([]);
 const [audit,setAudit]=useState<DepartmentAccessAudit[]>([]);
 const [chosen,setChosen]=useState('');
 const [role,setRole]=useState<DepartmentMembership['role']>('executor');
 const [active,setActive]=useState(true);
 const [next,setNext]=useState<ServiceState>('Em triagem');
 const [reason,setReason]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [message,setMessage]=useState('');
 const reload=async()=>{
  setError('');
  try{
   const mine=await fetchMyDepartments();
   setMemberships(mine.items);setAreas(mine.areas);
   if(user.isMaster){const [team,history]=await Promise.all([fetchDepartmentMembers(),fetchDepartmentAudit()]);setMembers(team.items);setCatalog(team.users);setAudit(history.events);}
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível consultar os acessos.');}
 };
 useEffect(()=>{void reload();},[]);
 useEffect(()=>{
  if(!area)return;
  setList([]);setDetail(null);
  fetchDepartmentQueue(area).then(setList).catch(e=>setError(e.message));
  if(user.isMaster||['gestor','supervisor'].includes(memberships.find(m=>m.area===area)?.role||'')){
   fetchDepartmentAssignees(area).then(data=>{
    if(!user.isMaster){setMembers(data.items);setCatalog(data.users);}
   }).catch(e=>setError(e.message));
  }
 },[area,memberships,user.isMaster]);
 const selectable=user.isMaster?areas:memberships.map(x=>x.area);
 const selectArea=(value:string)=>{setArea(value);setChosen('');setDetail(null);setError('');};
 const open=async(id:string)=>{setBusy(true);try{setDetail(await fetchServiceDetail(id));setReason('');setNext('Em triagem');}catch(e){setError(e instanceof Error?e.message:'Falha ao abrir chamado.');}finally{setBusy(false);}};
 const update=async()=>{if(!detail)return;setBusy(true);try{await changeServiceState(detail.request.id,next,reason);setDetail(await fetchServiceDetail(detail.request.id));setList(await fetchDepartmentQueue(area));setMessage('Atendimento registrado.');}catch(e){setError(e instanceof Error?e.message:'Atualização negada.');}finally{setBusy(false);}};
 const grant=async()=>{if(!chosen||!area)return;setBusy(true);try{await setDepartmentMember({userId:chosen,area,role,active});await reload();setMessage('Permissão departamental atualizada.');}catch(e){setError(e instanceof Error?e.message:'Falha na atualização.');}finally{setBusy(false);}};
 const assign=async(id:string,target:string)=>{setBusy(true);try{await assignDepartmentRequest(id,target);setDetail(await fetchServiceDetail(id));setList(await fetchDepartmentQueue(area));setMessage('Responsável atribuído.');}catch(e){setError(e instanceof Error?e.message:'Atribuição negada.');}finally{setBusy(false);}};
 const assigned=members.filter(m=>m.area===area&&m.active&&catalog.some(u=>u.id===m.user_id&&u.active));
 const myRole=memberships.find(m=>m.area===area)?.role;
 const canAssign=user.isMaster||myRole==='gestor'||myRole==='supervisor';
 return <div className="svc-workspace">
  <div className="svc-banner"><span className="svc-eyebrow">CONTROLE DE ACESSO POR DEPARTAMENTO</span><h2>Filas e equipes</h2><p>Somente solicitações reais da área autorizada. Ouvidoria permanece reservada ao solicitante e ao Admin Master.</p></div>
  {error&&<div role="alert" className="svc-error">{error}</div>}
  {message&&<div role="status" className="svc-notice">{message}</div>}
  <section className="svc-panel"><h3>Escolha a área</h3>
   <label>Departamento <select aria-label="Departamento" value={area} onChange={e=>selectArea(e.target.value)}><option value="">Selecione uma área</option>{selectable.map(x=><option key={x} value={x}>{labels[x]||x}</option>)}</select></label>
   {!selectable.length&&<p>Você ainda não possui departamentos autorizados.</p>}
  </section>
  {area&&<section className="svc-panel"><header className="svc-panel-head"><h3>Fila: {labels[area]||area}</h3><span>{list.length} solicitações</span></header>
   {!list.length?<p>Sem solicitações acessíveis nesta área.</p>:<div className="svc-list">{list.map(item=><button key={item.id} type="button" onClick={()=>void open(item.id)}><span><small>{item.protocol}</small><b>{item.title}</b></span><em>{item.state}</em></button>)}</div>}
  </section>}
  {area&&user.isMaster&&<section className="svc-panel"><h3>Permissões e responsáveis</h3>
   <p>Somente o Admin Master concede e revoga acesso por departamento.</p>
   <div className="svc-form">
    <label>Colaborador<select value={chosen} onChange={e=>{
      const selected=e.target.value;
      setChosen(selected);
      const existing=members.find(m=>m.area===area&&m.user_id===selected);
      if(existing){setRole(existing.role);setActive(existing.active);}
      else{setRole('executor');setActive(true);}
     }}><option value="">Selecione</option>{catalog.filter(u=>u.active).map(u=><option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}</select></label>
    <label>Função<select value={role} onChange={e=>setRole(e.target.value as DepartmentMembership['role'])}><option value="gestor">Gestor</option><option value="supervisor">Supervisor</option><option value="executor">Executor</option></select></label>
    <label>Status<select value={String(active)} onChange={e=>setActive(e.target.value==='true')}><option value="true">Ativo</option><option value="false">Revogado</option></select></label>
    <button type="button" className="svc-submit" disabled={busy||!chosen} onClick={()=>void grant()}>Salvar permissão</button>
   </div>
   <div className="svc-list">{members.filter(m=>m.area===area).map(m=><div key={m.user_id} className="svc-department-member">{catalog.find(u=>u.id===m.user_id)?.name||'Conta não encontrada'} · {m.role} · {m.active?'Ativo':'Revogado'}</div>)}</div>
  </section>}
  {area&&user.isMaster&&<section className="svc-panel" aria-label="Histórico de permissões">
   <h3>Histórico de acessos</h3>
   <p>Alterações de permissões armazenadas no banco, disponíveis somente para o Admin Master.</p>
   <div className="svc-list">
    {audit.filter(entry=>entry.area===area).length===0?
      <p>Nenhuma alteração registrada para esta área.</p>:
      audit.filter(entry=>entry.area===area).slice(0,25).map((entry,i)=>
       <div key={entry.occurred_at+':'+entry.target_user_id+':'+i} className="svc-department-member">
        <b>{eventLabels[entry.event_type]}</b> ·
        {' '+(catalog.find(u=>u.id===entry.target_user_id)?.name||'Colaborador não identificado')} ·
        {' '+entry.next_role} ·
        {' '+new Date(entry.occurred_at).toLocaleString('pt-BR')}
       </div>)}
   </div>
  </section>}
  {detail&&<section className="svc-panel" aria-label="Detalhe do atendimento"><h3>{detail.request.protocol} — {detail.request.title}</h3><p>{detail.request.description}</p><p>Status: {detail.request.state}</p>
   {canAssign&&<label>Responsável<select value={detail.request.assigned_to_user_id||''} onChange={e=>{if(e.target.value)void assign(detail.request.id,e.target.value);}}><option value="">Não atribuído</option>{assigned.map(m=><option key={m.user_id} value={m.user_id}>{catalog.find(u=>u.id===m.user_id)?.name||m.user_id}</option>)}</select></label>}
   {states.filter(x=>x!==detail.request.state).length>0&&<div className="svc-form"><label>Próximo status<select value={next} onChange={e=>setNext(e.target.value as ServiceState)}>{states.map(s=><option key={s}>{s}</option>)}</select></label><label>Justificativa<textarea value={reason} onChange={e=>setReason(e.target.value)}/></label><button type="button" className="svc-submit" disabled={busy} onClick={()=>void update()}>Atualizar atendimento</button></div>}
   <button type="button" onClick={()=>setDetail(null)}>Fechar</button>
  </section>}
 </div>;
}
