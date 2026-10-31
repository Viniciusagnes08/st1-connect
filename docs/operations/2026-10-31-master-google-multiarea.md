# ST1 Connect — Admin Master, identidade Google e atendimento multiárea

## Escopo

ST1 Connect é uma plataforma corporativa multiárea, não um sistema exclusivamente de BI.

A implementação inicial contém:
- Administrador bootstrap autenticado, identificado como Admin Master com capacidades administrativas transversais.
- BI preservado com seu banco privado e permissões usuais por Squad.
- Formulários ativos de solicitação geral e Ouvidoria, com persistência SQL e protocolos ST1-S-******.
- Histórico das solicitações e triagem master sem autocompletar solicitações ou inventar registros.
- Google Identity Services para **Solicitantes**, com acesso somente após validação do token no backend.
- Conta Google Workspace **verificada** do domínio corporativo permite auto cadastro como Solicitante.
- Gmail pessoal requer autorização individual do Admin Master no painel Meu Acesso.
- Senhas preexistentes não são copiadas/migradas ao Google; vinculação automática de conta Master por e-mail é proibida.

## Acesso Master

`api/_lib/master-admin.js` verifica a identidade do servidor (cookie assinado e usuário persistido)
e o endereço canônico bootstrap. `isMaster` é derivado, nunca recebido do frontend.

Capacidades:
- Gerenciar usuários e perfis existentes.
- Gerenciar membros do Squad BI.
- Consultar e atualizar fila BI sem associação manual no Squad.
- Consultar e atualizar a fila de solicitações gerais e Ouvidoria.
- Autorizar convites individuais de contas Gmail pessoais.

As filas de outros departamentos não foram inventadas. Pedidos de áreas sem atendentes cadastrados
continuam na triagem master, sem designação automática.

## Ouvidoria

- O formulário é identificado e **não anônimo**.
- Só o autor e Admin Master podem consultar detalhes nessa implantação.
- A lista geral de BI nunca inclui conteúdo de Ouvidoria.
- A base privada `st1_services` está sujeita a RLS, sem acesso direto dos papéis `anon` ou `authenticated`.
- Não habilitar compartilhamento com outros atendentes até haver política de confidencialidade, controle de privilégios
  e tratamento de dados pessoais aprovados.
- Relatos não são automaticamente enviados por e-mail a pessoas externas.

## Google Login — pré-requisitos para habilitar botão

1. Na **Google Cloud Console**, criar/selecionar projeto da ST1.
2. Configurar tela de consentimento e o público da aplicação (Google Workspace interno, caso exista, ou externo com usuários de teste quando aplicável).
3. Criar **OAuth Client ID do tipo Aplicação Web**, no Google Auth Platform → Clients.
4. Registrar em **Authorized JavaScript origins** o endereço HTTPS exato da preview ST1 Connect usada pelos colaboradores. Para distribuição corporativa, preferir domínio estável/controle de Vercel sobre URLs novas a cada commit.
5. Copiar **somente o Client ID público** do Google. Não enviar Client Secret, senha ou tokens de usuário.
6. No Vercel project `st1-connect`, adicionar `ST1_GOOGLE_CLIENT_ID` com esse Client ID, escopo Preview da branch `feature/st1-connect-bi-foundation`.
7. Redeploy depois de adicionar variável. `GET /api/auth?action=status` deve devolver `googleClientId` e o botão Google deverá renderizar.
8. Homologar login com um colaborador real autorizado e outra conta não autorizada. Testar permissões de Solicitante antes de liberar ao Comercial.
9. Não usar login Google para elevar contas existentes de administrador; vincular contas preexistentes somente por processo autenticado e auditado.

Implementação usa `https://accounts.google.com/gsi/client`, recebendo ID token no callback.
`api/_lib/google-oidc.js` confere a assinatura RS256 pelas chaves JWKS do Google, audiência, emissor,
expiração, sub, email_verified e hosted domain; não confia no campo de perfil do frontend.

Nenhuma credencial Google Cloud é necessária no código do repositório.

**Estado atual:** o Google OAuth depende da configuração externa do Client ID e origem. Até isso ocorrer,
a tela apresenta apenas status de preparação, não um login falso.

## Homologação da Preview

- `ST1_SERVICES_ENABLED=true` apenas na Preview da branch autoriza API corporativa.
- Verificar `/api/health` retorna `database=ready`, `modules.bi=ready` e `modules.services=ready`.
- Testar que `GET /api/service-requests` sem sessão retorna 401.
- Testar que Solicitante pode criar e ler somente seus registros, não ver fila `view=all`.
- Testar que Admin Master lê filas e altera status com justificativa.
- Conferir que Ouvidoria não aparece na fila do BI.
- Registrar uma solicitação real apenas por usuário autorizado. **Não inserir exemplos em banco real.**
- Produção permanece na branch main até aprovação da homologação de identidade, Ouvidoria e backups.

## Principais arquivos

- `api/_lib/master-admin.js`
- `api/_lib/google-oidc.js`, `api/auth.js`, `src/GoogleSignIn.tsx`
- `api/_lib/service-catalog.js`, `api/_lib/service-service.js`, `api/service-requests.js`
- `src/features/services/ServiceWorkspace.tsx`, `src/OperationalApp.tsx`
- `supabase/migrations/20261031164000_st1_services_core.sql`

## Critérios para publicação corporativa

1. Login Google homologado pelo próprio colaborador, sem criação de admin.
2. RLS / APIs e confidencialidade testados em dois navegadores/contas reais.
3. Política de tratamento de Ouvidoria aprovada antes de receber relatos sensíveis reais.
4. Verificação da infraestrutura, restauração e backup.
5. Aprovação explícita para merge e publicação na branch main.
