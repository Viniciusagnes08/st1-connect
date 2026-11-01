# ST1 Connect — Master Google restrito à homologação

**Contexto:** conclusão do procedimento 04 (login Google). O diretório de contas do Vercel Blob é compartilhado entre Preview e produção. Portanto, não persistir uma promoção de função para conceder acesso de homologação.

## Desenho implementado

- Vincular exclusivamente ao **ID interno da conta Google já registrada**, mais e-mail corporativo idêntico, conforme as duas variáveis Vercel da branch de Preview.
- Exigir `VERCEL_ENV=preview` e `VERCEL_GIT_COMMIT_REF=feature/st1-connect-bi-foundation`.
- Exigir conta ativa, autenticada por Google (Google subject numérico já vinculado), sem senha local e sem convite pendente.
- Projetar o papel `Administrador` em memória ao desserializar a sessão HMAC e ao responder às APIs. Não alterar o objeto do diretório compartilhado.
- Manter a identificação original do Master inicial por e-mail de bootstrap.
- Bloquear alterações do perfil compartilhado da conta Master Google virtual, inclusive tentativa de promover permanentemente seu papel.
- Todas as outras contas Google, inclusive corporativas, continuam como Solicitante até autorização explícita conforme as regras normais de funções.

## Arquivos

- `api/_lib/master-admin.js`: predicado de identidade Preview e projeção de papel.
- `api/_lib/auth-session.js`: identidade efetiva **após** verificar cookie HMAC, versão, expiração e conta ativa.
- `api/_lib/identity.js`: propagação da identidade efetiva em endpoints de atendimento, BI e equipes.
- `api/auth.js`: representação uniforme do papel e Master na resposta ao login Google/consulta de sessão, sem persistência.
- `api/_lib/preview-google-master.test.js`: testes unitários e simulação de API sem contas reais nem escrita no Blob.

## Procedimento de implantação

1. Confirmar que `ST1_PREVIEW_MASTER_GOOGLE_USER_ID` e `ST1_PREVIEW_MASTER_GOOGLE_EMAIL` existem **somente na Preview da branch**; nunca divulgar valores no código/logs.
2. Rodar `npm test` e `npm run build` na CI. Verificar cenários positivos, negativos, produção e imutabilidade do cadastro.
3. Publicar exclusivamente a branch `feature/st1-connect-bi-foundation` na **Vercel Preview** e conferir SHA + estado READY; manter SSO.
4. Com uma sessão Google corporativa previamente autorizada, entrar e consultar `Minha Conta`, menu administrativo e `Equipes e departamentos`; confirmar papel Master e ausência de erros 401/403.
5. Encerrar sessão, confirmar que login de outra conta não recebe Master e que produção não foi alterada. Não executar concessões reais de cargos em homologação sem isolamento do diretório compartilhado.

## Segurança e limitações

- A autoridade Master virtual aplica-se à aplicação e às APIs da Preview. **Não** representa uma mudança de papel persistente no cadastro de produção.
- **Atenção:** embora o login não persista a promoção, ações administrativas voluntárias sobre usuários no Blob compartilhado ainda podem impactar a produção. Não executar essas ações durante o teste básico; separar armazenamento Preview de Production antes de homologação administrativa com escritas.
- A assinatura de sessão e o vínculo Google devem continuar sendo verificados pelo backend; dados enviados pelo browser não podem atribuir `isMaster`.
- A Preview deve permanecer protegida por SSO. Não promover para `main` ou para Vercel Production.
- A homologação real do Google OAuth exige navegador autorizado; testes com identidades sintéticas e CI isoladamente não comprovam E2E.

## Reversão

Desfazer somente a promoção da branch caso o CI ou o login real falhe. Remover as duas variáveis exclusivas da Preview para desativar imediatamente o Master virtual **após um novo deployment**, sem alterar qualquer conta compartilhada. Não remover credenciais gerais.
