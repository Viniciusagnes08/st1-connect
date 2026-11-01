# ST1 Connect — liberação do Google e Admin Master

**Ambiente:** `feature/st1-connect-bi-foundation` (Preview Vercel).
**Verificação:** 31/10/2026.
**Status:** implementação de login Google, permissões Master e formulários pronta em código na prévia; Google ainda sem ID de cliente OAuth; produção não liberada.

## Arquitetura já presente

- `api/_lib/master-admin.js`: Master somente quando sessão válida, conta ativa, papel Administrador e e-mail da identidade administrativa inicial conferido contra variável interna. O cliente não pode se declarar Master.
- `api/_lib/bi-membership.js`: Master acessa gestão da Central BI sem exigir membership de squad.
- `api/_lib/google-oidc.js`: valida assinaturas Google contra JWKS, issuer, audience, expiração e e-mail confirmado; vinculação por `sub`; contas @gmail.com pessoais exigem convite explícito do Master.
- `src/GoogleSignIn.tsx` e `api/auth.js?action=google`: botão Google e troca segura do ID Token por sessão interna.
- `api/service-requests.js` e `st1_services`: solicitações reais, formulários de solicitação e ouvidoria, acompanhamento próprio e fila Master; origem e acesso são verificados no servidor.
- A prévia tem `BI_CONNECT_ENABLED=true`, `ST1_SERVICES_ENABLED=true`, `DATABASE_URL` e recuperação administrativa emergencial desativada.
- `ST1_GOOGLE_CLIENT_ID` **não configurado** na Vercel. Logo, a autenticação com Google **não está liberada**.

## Dependência externa obrigatória: Google Cloud

1. Em [Google Auth Platform](https://console.cloud.google.com/auth/clients), selecionar um projeto Google Cloud autorizado pela ST1; criar cliente **OAuth 2.0 → Aplicativo da Web** (ou reutilizar cliente Web aprovado).
2. Configurar tela de consentimento/branding como **ST1 Connect**, com links institucionais e responsáveis pela privacidade. Preferir cliente separado entre homologação e produção.
3. Adicionar as **Origens JavaScript autorizadas** das URLs exatas em que o login será utilizado, sempre `https://`, sem path e sem wildcard. Para a prévia, usar a origem efetiva do deployment ou alias liberado na Vercel. Para produção, cadastrar a origem de produção apenas no momento do go-live.
4. Anotar **somente o Client ID público** terminado em `.apps.googleusercontent.com`. **Não enviar Client Secret, senha, cookies, códigos ou tokens para o chat nem gravar em código**. Este fluxo usa ID Token, não OAuth authorization-code exchange no backend.
5. Na Vercel, definir `ST1_GOOGLE_CLIENT_ID` no escopo **Preview, restrito à branch**. Opcionalmente definir `ST1_GOOGLE_WORKSPACE_DOMAIN=st1.net.br` após confirmar que este é efetivamente um domínio Google Workspace com atributo `hd`.
6. Acionar novo deployment de Preview e validar `GET /api/auth?action=status`: `googleClientId` deve aparecer e `adminRecoveryAvailable=false`.

## Aceitação funcional obrigatória antes da publicação

- [ ] Login corporativo Google assinado e confirmado gera sessão no ST1 Connect, somente com papel `Solicitante` por padrão.
- [ ] Gmail pessoal sem convite é bloqueado; convite Master habilita somente o endereço autorizado, sem autoelevação.
- [ ] Conta administrativa já existente não é vinculada ao Google nem tem seu papel sobrescrito automaticamente.
- [ ] Conta inicial com papel Administrador mantém `isMaster=true` e pode acessar todas as páginas de gestão e fila corporativa; contas comuns não acessam gestão nem consulta `view=all`.
- [ ] Usuário comum cria solicitação, visualiza somente as próprias, vê status e histórico em segundo navegador; POST/PATCH não autorizado é negado.
- [ ] Ouvidoria só pode ser lida pelo solicitante ou Master; dados confidenciais nunca aparecem na fila de outro usuário.
- [ ] `/api/health` responde `database:ready` e `modules.services:ready`, com testes de requisição autenticada em Preview.
- [ ] `npm test` e `npm run build` passam no commit do deploy; validação humana no navegador.
- [ ] Produção tem credenciais de banco runtime de privilégio mínimo e configurações próprias; não reutilizar deployment Preview como produção nem copiar segredos sem revisão.
- [ ] Liberar a produção somente após confirmação dos itens acima e revisão de proteção da Vercel para o público interno.

**Estado da auditoria (31/10):** schema privado `st1_services` existe, permissões de SELECT/INSERT/UPDATE do runtime presentes; roles públicas sem SELECT; zero linhas em `st1_services.requests` e `st1_bi.request_records`; Supabase Security Advisors sem alertas. Build de Preview READY. Testes E2E autenticados e endpoint de saúde não foram verificados por bloqueio de acesso à prévia pelas ferramentas disponíveis.
