# ST1 Connect — Google OIDC, configuração e homologação

**Data:** 31/10/2026 · **Alvo:** somente homologação `feature/st1-connect-bi-foundation`, mantendo `main` e Vercel Production inalterados.

## Estado do projeto

- A integração Google Identity Services utiliza o modo de botão + callback JavaScript (`src/GoogleSignIn.tsx`) e valida ID token RS256 no servidor (`api/_lib/google-oidc.js`).
- `ST1_GOOGLE_CLIENT_ID` está presente na variável Preview da Vercel, com formato de Client ID válido; **não comprova** correspondência com o Cliente OAuth cadastrado no Cloud.
- Vercel Authentication (`ssoProtection.enabled=true`) protege a Preview. Mantenha-a habilitada até definir uma estratégia de testes que não exponha o portal.
- O login Google possui desafio de 10 minutos, assinado por `ST1_AUTH_SECRET`, emitido por `GET /api/auth?action=google-challenge`. A nonce é vinculada à claim Google `nonce` e a cookie HttpOnly/Secure/SameSite=Strict no mesmo domínio.
- `POST /api/auth?action=google` valida desafio, assinatura JWKS, `iss`, `aud`, `iat`, `exp`, `sub`, `email_verified`, `hd` e nonce. Em sucesso, define sessão ST1 e expira o cookie do desafio.
- A sessão do portal continua sendo cookie assinado próprio; **não** houve migração para Supabase Auth. Nenhum `client_secret` foi colocado no frontend.

## Configuração obrigatória no Google Cloud

1. Abrir **Google Auth Platform → Clients**, projeto `st1-connect`: https://console.cloud.google.com/auth/clients?project=st1-connect
2. Escolher o OAuth Client ID que corresponda **exatamente** a `ST1_GOOGLE_CLIENT_ID` na Preview Vercel. Tipo **Web application**; não usar ID de Android/iOS/Desktop.
3. Adicionar em **Authorized JavaScript origins** esta origem exata (sem caminho, `/#/overview`, query string, barra final ou parâmetros `utm_`):

```text
https://st1-connect-git-feature-st1-connect-bi-fo-ebfb78-vinicius-agnes.vercel.app
```

4. Para esta implementação popup + callback JavaScript, não é necessário configurar `/api/auth` como URI de redirecionamento.
5. Em **Audience**, escolher a política apropriada: **Internal** cobre apenas contas Workspace da organização, portanto não atende Gmail pessoal convidado. Se for necessário aceitar Gmail pessoal pré-autorizado, utilizar um público **External** configurado conforme as regras do Google e incluir os usuários de teste na fase Testing.
6. Conferir Branding, escopos básicos `openid`, `email`, `profile` e eventual exigência de teste/verificação. Não solicitar escopos administrativos adicionais.
7. Salvar, aguardar propagação das configurações e realizar o login real no host acima a partir de um navegador autorizado na Vercel.

Referências Google: 
- https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid
- https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
- https://developers.google.com/identity/gsi/web/reference/js-reference

## Matriz de acesso esperada

| Identidade | Resultado |
|---|---|
| Workspace verificado `@st1.net.br`, `hd=st1.net.br`, conta inexistente | Criar conta Solicitante |
| Retorno do mesmo Google `sub` e e-mail, Workspace válido | Login na mesma conta |
| Gmail pessoal com convite Master pendente | Vincular pelo `sub`, papel Solicitante |
| Gmail sem convite | Rejeitar 403 |
| Conta existente com senha, inclusive Admin Master | Não vincular automaticamente |
| Google token sem nonce, assinatura válida para outro cliente ou expirado | Rejeitar 401 |
| Conta desativada, e-mail divergente ou `hd` inválido | Rejeitar |
| Gmail pessoal vinculado, tentativa de promover papel | Rejeitar 403 |

## Testes automatizados

- `api/_lib/google-challenge.test.js`: nonce, assinatura, integridade, cookie e expiração.
- `api/_lib/google-oidc.test.js`: assinatura real sobre JWT sintético e política de domínio/convite/nonce.
- `api/_lib/google-login-flow.test.js`: rota real com Google JWKS simulado, conta corporativa, Gmail convidado, logout, sessão, admin, bloqueios.
- `api/auth-google.test.js`: casos legados migrados para desafio assinado.
- `npm test` e `npm run build` devem passar na CI da branch.

## Bloqueio de deployment Vercel (31/10/2026)

Após os testes de código (119 aprovados), uma tentativa de publicar a branch em Preview retornou `HTTP 402 payment_required` com código `api-deployments-free-per-day` (limite de mais de 100 deployments na janela diária). O provedor informou `retryAfter=86400`.

**Portanto, o Preview no endereço habitual ainda aponta para um commit anterior e não contém necessariamente o desafio Google implementado nesta etapa.** Não considerar a autenticação de ponta a ponta homologada até publicar o SHA atualizado, confirmar `READY` e testar com duas contas autorizadas.

Não alterar assinatura, remover proteção SSO ou trocar alvo para produção como contorno. Após a janela de quota ou ajuste aprovado pelo proprietário, realizar novo deployment de Preview da branch e verificar o SHA.

## Gate que permanece pendente

O conector de navegador disponível não permite acessar a sessão atual do Google Cloud Console. Também não há ferramenta conectada para consultar ou alterar os clientes OAuth deste projeto. **A origem não foi alterada no Google Cloud por esta execução.**

Um build aprovado não comprova que o Google aceita a origem nem que uma conta corporativa realiza o fluxo real. Somente após:
- Origem salva no OAuth Client ID correto;
- Conta Workspace autorizada concluindo login/logout na Preview;
- Gmail autorizado e Gmail não autorizado validados;
- Master preservado e Vercel Authentication mantida;
- Resultado documentado sem tokens, prints de credenciais ou informações pessoais.

Não promover a produção antes disso.

## Plano de rollback

Reverter commits da branch Preview relacionados ao desafio e política, se houver incompatibilidade. Não alterar segredos, usuários, master, credenciais de produção ou RLS para contornar problemas de OAuth.
