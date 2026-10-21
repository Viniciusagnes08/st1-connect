import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff, KeyRound, LockKeyhole, LogOut, Plus, ShieldCheck, UserRound, Users, Wifi, X } from 'lucide-react';
import App from './App';
import './auth.css';

export type Role = 'Administrador' | 'Supervisor' | 'Técnico' | 'Solicitante';
export type Account = { id: string; name: string; email: string; role: Role; active: boolean };
const roles: Role[] = ['Administrador', 'Supervisor', 'Técnico', 'Solicitante'];
const roleHelp: Record<Role,string> = {
  Administrador: 'Acesso integral, configurações e gerenciamento de contas.',
  Supervisor: 'Acompanhamento da operação, chamados e relatórios.',
  Técnico: 'Atendimento e acompanhamento de chamados.',
  Solicitante: 'Abertura e acompanhamento dos próprios chamados.',
};
async function request(action: string, body?: object) {
  const response = await fetch(`/api/auth?action=${encodeURIComponent(action)}`, {
    method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : {},
    credentials: 'same-origin', cache: 'no-store', ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Não foi possível completar a solicitação.');
  return result;
}

export default function AuthGate() {
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [user, setUser] = useState<Account | null>(null);
  const [error, setError] = useState('');
  const [inviteToken, setInviteToken] = useState(() => {
    const hash = window.location.hash;
    if (!hash.startsWith('#/activate?')) return '';
    return new URLSearchParams(hash.split('?')[1] || '').get('token') || '';
  });
  useEffect(() => {
    request('status').then(data => { setConfigured(data.configured); setUser(data.user); }).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);
  const exit = async () => {
    try { await request('logout', {}); } catch { /* Expired server-side session still means local sign-out. */ }
    setUser(null); window.location.hash = '/overview';
  };
  if (loading) return <div className="auth-loading"><span className="auth-spinner" />Preparando acesso seguro...</div>;
  if (user) return <App user={user} onLogout={exit} />;
  return <LoginScreen setup={!configured && !inviteToken} inviteToken={inviteToken} error={error} onLogin={u => {
    if (inviteToken) window.history.replaceState(null, '', window.location.pathname + window.location.search + '#/overview');
    setInviteToken(''); setUser(u); setError('');
  }} />;
}

function LoginScreen({ setup, inviteToken, error: initialError, onLogin }: { setup: boolean; inviteToken: string; error: string; onLogin: (user: Account) => void }) {
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);
  const [forgot, setForgot] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError('');
    const data = new FormData(event.currentTarget);
    const payload = Object.fromEntries(data.entries());
    if (inviteToken) {
      if (payload.password !== payload.confirmPassword) { setError('As senhas digitadas não são iguais.'); setBusy(false); return; }
      payload.inviteToken = inviteToken;
      delete payload.confirmPassword;
    }
    try {
      const response = await request(inviteToken ? 'activate' : setup ? 'setup' : 'login', payload);
      onLogin(response.user);
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha no acesso.'); }
    finally { setBusy(false); }
  };
  return <div className="auth-layout">
    <aside className="auth-hero">
      <div className="auth-brand"><b>st<span>1</span></b><i />connect <small>CENTRAL DE SERVIÇOS</small></div>
      <div className="auth-hero-content">
        <span className="auth-kicker"><span /> AMBIENTE CORPORATIVO · ST1 INTERNET</span>
        <h1>Todo chamado.<br />Uma solução.<br /><em>Um só lugar.</em></h1>
        <p>Organize demandas, conecte sua equipe e acompanhe cada atendimento do início ao fim.</p>
        <div className="auth-hero-feature"><ShieldCheck size={20} /><div><b>Seu ambiente, seu acesso</b><span>Perfis e permissões para cada responsabilidade.</span></div></div>
      </div>
      <div className="auth-hero-bottom"><span><Wifi size={16} /> ST1 CONNECT / SERVICE DESK</span><span>2026 © ST1 Internet</span></div>
      <div className="auth-orbit" aria-hidden="true"><div /><div /><div /><span /></div>
    </aside>
    <main className="auth-main">
      <div className="auth-mobile-brand"><b>st<span>1</span></b> connect</div>
      <div className="auth-form-shell">
        <div className="auth-symbol"><LockKeyhole size={26}/></div>
        <div className="auth-overline">{inviteToken ? 'SEU CONVITE DE ACESSO' : setup ? 'CONFIGURAÇÃO INICIAL' : 'BEM-VINDO DE VOLTA'}</div>
        <h2>{inviteToken ? 'Crie sua senha' : setup ? 'Ative o ST1 Connect' : 'Acesse sua conta'}</h2>
        <p className="auth-subtitle">{inviteToken ? 'Sua conta de Administrador foi reservada. Escolha uma senha forte para finalizar a ativação e entrar no painel.' : setup ? 'Crie a primeira conta de administrador usando o código de ativação configurado no Vercel.' : 'Entre com seu e-mail e senha para acessar a central de serviços.'}</p>
        {forgot ? <div className="auth-help"><KeyRound size={22}/><h3>Precisa recuperar o acesso?</h3><p>Solicite a redefinição da sua senha ao administrador do ST1 Connect. Por segurança, não existe recuperação por e-mail nesta versão.</p><button type="button" className="auth-text-button" onClick={() => setForgot(false)}>Voltar para o login</button></div> : <form className="auth-form" onSubmit={submit}>
          {setup && <><label>Seu nome completo<input name="name" required minLength={3} maxLength={80} placeholder="Nome e sobrenome" autoComplete="name"/></label><label>Código de ativação<input name="setupToken" type="password" required autoComplete="off" placeholder="Código privado do administrador"/></label></>}
          {inviteToken ? <div className="auth-invite-email"><UserRound size={18}/><div><small>Conta reservada para</small><strong>Viniciusagnes@st1.net.br</strong><span>Administrador · ST1 Connect</span></div><ShieldCheck size={20}/></div> : <label>E-mail corporativo<input name="email" type="email" required maxLength={180} placeholder="seu.email@empresa.com.br" autoComplete="username" autoFocus /></label>}
          <label>{inviteToken ? 'Crie sua senha' : 'Senha'}<div className="auth-password"><input name="password" type={visible ? 'text' : 'password'} required minLength={setup || inviteToken ? 12 : 1} maxLength={128} placeholder={setup || inviteToken ? 'Mínimo de 12 caracteres com letras e números' : 'Digite sua senha'} autoComplete={setup || inviteToken ? 'new-password' : 'current-password'} autoFocus={Boolean(inviteToken)}/><button type="button" aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></label>
          {inviteToken && <label>Confirme sua senha<input name="confirmPassword" type={visible ? 'text' : 'password'} required minLength={12} maxLength={128} placeholder="Repita a senha escolhida" autoComplete="new-password"/></label>}
          {error && <div className="auth-error" role="alert">{error}</div>}
          {!setup && !inviteToken && <button type="button" className="auth-forgot" onClick={() => setForgot(true)}>Esqueci minha senha</button>}
          <button className="auth-submit" type="submit" disabled={busy}>{busy ? 'Validando acesso...' : inviteToken ? 'Ativar minha conta' : setup ? 'Ativar administrador' : 'Entrar no ST1 Connect'}<ArrowRight size={18}/></button>
        </form>}
        <div className="auth-footer"><ShieldCheck size={15}/> Acesso protegido e exclusivo para usuários autorizados.</div>
      </div>
      <div className="auth-bottom-link">ST1 CONNECT <span>·</span> CENTRAL INTERNA DE SERVIÇOS</div>
    </main>
  </div>;
}

export function ProfilePanel({ user, onLogout, onClose }: { user: Account; onLogout: () => void; onClose: () => void }) {
  const [tab, setTab] = useState<'profile' | 'users'>(user.role === 'Administrador' ? 'users' : 'profile');
  const [users, setUsers] = useState<Account[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const refresh = async () => {
    if (user.role !== 'Administrador') return;
    try { const data = await request('users'); setUsers(data.users); } catch(e) { setError(e instanceof Error ? e.message : 'Falha ao carregar usuários.'); }
  };
  useEffect(() => { void refresh(); }, [user.role]);
  const submitUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    try { await request('users', payload); await refresh(); setAdding(false); setNotice('Usuário cadastrado com sucesso.'); }
    catch(e) { setError(e instanceof Error ? e.message : 'Não foi possível cadastrar.'); } finally { setBusy(false); }
  };
  const change = async (target: Account, patch: { role?: Role; active?: boolean }) => {
    setBusy(true);setError('');setNotice('');
    try { await request('user-update', { id: target.id, role: patch.role || target.role, active: patch.active ?? target.active }); await refresh(); setNotice('Permissão atualizada.'); }
    catch(e) { setError(e instanceof Error ? e.message : 'Não foi possível alterar.'); } finally {setBusy(false);}
  };
  const password = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true);setError('');setNotice('');
    const form=event.currentTarget; const values=Object.fromEntries(new FormData(form).entries());
    try { await request('password', values);form.reset();setNotice('Sua senha foi alterada.'); }
    catch(e) {setError(e instanceof Error ? e.message : 'Não foi possível alterar a senha.');} finally {setBusy(false);}
  };
  return <div className="auth-modal-layer" role="presentation" onMouseDown={e => {if(e.target===e.currentTarget)onClose();}}>
    <section className="auth-management" role="dialog" aria-modal="true" aria-label="Meu acesso">
      <header className="auth-management-header"><div><span>ST1 CONNECT</span><h2>Meu acesso</h2><p>{user.name} · {user.role}</p></div><button onClick={onClose} aria-label="Fechar"><X size={20}/></button></header>
      <div className="auth-management-tabs"><button className={tab==='profile'?'selected':''} onClick={()=>setTab('profile')}><UserRound size={16}/> Minha conta</button>{user.role==='Administrador' && <button className={tab==='users'?'selected':''} onClick={()=>setTab('users')}><Users size={16}/> Usuários e permissões</button>}</div>
      <div className="auth-management-body">
        {error && <p className="auth-inline-error" role="alert">{error}</p>}{notice && <p className="auth-inline-ok" role="status">{notice}</p>}
        {tab === 'profile' ? <><div className="auth-person"><span>{user.name.slice(0,2).toUpperCase()}</span><div><b>{user.name}</b><p>{user.email}</p><small>{roleHelp[user.role]}</small></div></div><h3>Alterar minha senha</h3><form onSubmit={password} className="auth-small-form"><label>Senha atual<input name="currentPassword" type="password" required autoComplete="current-password"/></label><label>Nova senha<input name="newPassword" type="password" minLength={12} maxLength={128} required autoComplete="new-password" placeholder="12 caracteres, letras e números"/></label><button type="submit" disabled={busy}>Salvar nova senha</button></form></> :
        <><div className="auth-users-heading"><div><h3>Contas autorizadas</h3><p>Controle quem acessa a central e qual perfil utiliza.</p></div><button onClick={()=>setAdding(!adding)}><Plus size={15}/> Novo usuário</button></div>
        {adding && <form className="auth-add-user" onSubmit={submitUser}><label>Nome<input name="name" required minLength={3} placeholder="Nome completo"/></label><label>E-mail<input name="email" required type="email" placeholder="email@empresa.com.br"/></label><label>Perfil<select name="role">{roles.map(r=><option key={r}>{r}</option>)}</select></label><label>Senha provisória<input name="password" type="password" required minLength={12} maxLength={128} placeholder="12 caracteres, letras e números"/></label><div><button type="button" className="auth-secondary" onClick={()=>setAdding(false)}>Cancelar</button><button type="submit" disabled={busy}>Criar acesso</button></div></form>}
        <div className="auth-user-list">{users.map(account=><div key={account.id} className="auth-user-row"><span className="auth-user-avatar">{account.name.slice(0,2).toUpperCase()}</span><div className="auth-user-desc"><b>{account.name}</b><small>{account.email}</small><span className={account.active?'active':'inactive'}>{account.active?'Ativo':'Desativado'}</span></div><select aria-label={`Perfil de ${account.name}`} value={account.role} disabled={busy||account.id===user.id} onChange={e=>change(account,{role:e.target.value as Role})}>{roles.map(role=><option key={role}>{role}</option>)}</select><button type="button" className="auth-user-toggle" disabled={busy||account.id===user.id} onClick={()=>change(account,{active:!account.active})}>{account.active?'Desativar':'Ativar'}</button></div>)}</div>
        <p className="auth-user-hint">Novos usuários recebem uma senha inicial definida pelo administrador. Eles podem alterá-la em Minha conta.</p></>}
      </div>
      <footer className="auth-management-footer"><button onClick={onLogout}><LogOut size={17}/> Sair da conta</button><span><ShieldCheck size={15}/> Sessão protegida</span></footer>
    </section>
  </div>;
}
