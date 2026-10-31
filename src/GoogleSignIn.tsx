import { useEffect, useRef, useState } from 'react';
import type { Account } from './AuthGate';
import './google-signin.css';

type CredentialResponse = { credential?: string };
type GoogleIdentity = {
  accounts: { id: {
    initialize: (config: { client_id: string; nonce: string; callback: (result: CredentialResponse) => void; auto_select: boolean; cancel_on_tap_outside: boolean }) => void;
    renderButton: (parent: HTMLElement, opts: Record<string,string|number>) => void;
    disableAutoSelect: () => void;
  } };
};
declare global { interface Window { google?: GoogleIdentity } }

export function preventGoogleAutoSelect() {
  window.google?.accounts.id.disableAutoSelect();
}

export default function GoogleSignIn({
  clientId, onLogin, onError,
}: {
  clientId: string | null;
  onLogin: (user: Account) => void;
  onError: (message: string) => void;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const callbacks = useRef({onLogin,onError});
  const [state,setState] = useState<'loading'|'ready'|'unavailable'>('loading');
  callbacks.current = {onLogin,onError};

  useEffect(()=>{
    if(!clientId || !mount.current){setState('unavailable');return;}
    let active=true;
    let submitting=false;
    let script:HTMLScriptElement|null=null;
    let scriptReady:(()=>void)|null=null;
    let scriptFail:(()=>void)|null=null;
    const element=mount.current;
    setState('loading');

    const prepareGoogleButton=(nonce:string)=>{
      const ready=()=>{
        if(!active||!window.google?.accounts?.id)return;
        element.replaceChildren();
        try{
          window.google.accounts.id.initialize({
            client_id:clientId,nonce,auto_select:false,cancel_on_tap_outside:true,
            callback:async ({credential})=>{
              if(!active||submitting||!credential)return;
              submitting=true;
              try{
                const response=await fetch('/api/auth?action=google',{
                  method:'POST',credentials:'same-origin',cache:'no-store',
                  headers:{'Content-Type':'application/json'},
                  body:JSON.stringify({credential}),
                });
                const payload=await response.json().catch(()=>({}));
                if(!response.ok||!payload.user)
                  throw new Error(payload.error||'O acesso Google não pôde ser validado.');
                if(active)callbacks.current.onLogin(payload.user);
              }catch(cause){
                if(active)callbacks.current.onError(cause instanceof Error?cause.message:'Falha ao entrar com o Google.');
              }finally{submitting=false;}
            },
          });
          window.google.accounts.id.renderButton(element,{
            type:'standard',theme:'outline',size:'large',text:'continue_with',
            shape:'rectangular',logo_alignment:'left',width:300,locale:'pt-BR',
          });
          setState('ready');
        }catch{if(active)setState('unavailable');}
      };
      const fail=()=>{if(active)setState('unavailable');};
      if(window.google?.accounts?.id){
        ready();
        return;
      }
      script=document.querySelector<HTMLScriptElement>('#st1-google-identity');
      if(!script){
        script=document.createElement('script');
        script.id='st1-google-identity';
        script.src='https://accounts.google.com/gsi/client';
        script.async=true;
        script.defer=true;
        document.head.appendChild(script);
      }
      scriptReady=ready;
      scriptFail=fail;
      script.addEventListener('load',ready);
      script.addEventListener('error',fail);
    };

    void (async()=>{
      try{
        const response=await fetch('/api/auth?action=google-challenge',{
          method:'GET',credentials:'same-origin',cache:'no-store',
        });
        const payload=await response.json().catch(()=>({}));
        if(!response.ok||typeof payload.nonce!=='string'||!/^[A-Za-z0-9_-]{32}$/.test(payload.nonce))
          throw new Error(payload.error||'Não foi possível preparar o login com Google.');
        if(active)prepareGoogleButton(payload.nonce);
      }catch(cause){
        if(!active)return;
        setState('unavailable');
        callbacks.current.onError(cause instanceof Error?cause.message:'Não foi possível preparar o login com Google.');
      }
    })();

    return ()=>{
      active=false;
      if(script&&scriptReady)script.removeEventListener('load',scriptReady);
      if(script&&scriptFail)script.removeEventListener('error',scriptFail);
      element.replaceChildren();
    };
  },[clientId]);

  if(!clientId) return <div className="auth-google-awaiting" role="note">
    <b>Login com Google</b><small>Em preparação para os colaboradores da ST1.</small>
  </div>;
  return <div className="auth-google">
    <div className="auth-google-separator"><span/>ou entre com sua conta Google<span/></div>
    <div className="auth-google-button" ref={mount} aria-label="Entrar com conta Google autorizada"/>
    {state==='loading'&&<small>Carregando entrada segura do Google...</small>}
    {state==='unavailable'&&<small role="alert">O botão do Google não carregou. Use o acesso corporativo ou tente novamente.</small>}
    <small>Para colaboradores ST1 e convidados autorizados. O acesso inicial é de Solicitante.</small>
  </div>;
}
