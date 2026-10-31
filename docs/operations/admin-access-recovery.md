# ST1 Connect — recuperação emergencial do administrador

## Problema resolvido nesta branch

A autenticação do ST1 Connect está armazenada em um Vercel Blob privado,
não no Supabase. O formulário antigo **Esqueci minha senha** só instruía
contatar um administrador, impedindo a recuperação do administrador inicial.

## Recurso de uso único, exclusivo da prévia

A ação `POST /api/auth?action=recover-admin` só está disponível quando:

- `VERCEL_ENV=preview`;
- `ST1_ADMIN_RECOVERY_ENABLED=true`, configurada exclusivamente na branch
  `feature/st1-connect-bi-foundation`;
- `ST1_SETUP_TOKEN` possui comprimento suficiente (24+ caracteres);
- `ST1_BOOTSTRAP_EMAIL` está configurado.

A interface de recuperação só aparece após `GET /api/auth?action=status`
responder `adminRecoveryAvailable: true`.

A ação requer o **e-mail original do administrador bootstrap**, o **código
administrativo existente no Vercel** e uma nova senha com pelo menos
12 caracteres (letras e números). O código não deve ser enviado por chat,
armazenado no repositório, colocado em URL, nem exibido em registros.

Em caso de validação bem-sucedida, a senha é derivada via `scrypt`
com salt aleatório, a versão da conta aumenta para invalidar todas as sessões
anteriores e o código tem seu SHA-256 registrado no Blob, impedindo
a reutilização. Convites antigos/expirados são removidos. O usuário recebe
uma nova sessão via cookie HttpOnly/Secure/SameSite Strict.

## Como homologar com segurança

1. Verifique que a nova prévia esteja READY.
2. Acesse `/api/auth?action=status` na prévia e confirme
   `adminRecoveryAvailable: true`, sem revelar qualquer credencial.
3. Acesse a prévia do ST1 Connect, clique em **Esqueci minha senha**.
4. O titular deve obter o código **diretamente** no painel Vercel,
   **ST1 Connect → Settings → Environment Variables → ST1_SETUP_TOKEN**.
   Se não puder visualizar esse código, faça uma rotação segura no Vercel;
   não adivinhe nem envie o segredo ao assistente.
5. Digite e-mail do administrador inicial, código administrativo, nova senha
   e confirmação no formulário. Clique em **Redefinir senha e entrar**.
6. Confirme a entrada no Squad de BI e que a nova senha funciona no
   site principal, que compartilha o mesmo armazenamento privado de contas.
7. **Após sucesso**, desabilite `ST1_ADMIN_RECOVERY_ENABLED` na prévia
   e redeploy para remover a superfície de recuperação; a versão em
   produção nunca teve o recurso habilitado.

## Restrições e falhas tratadas

- Não permite redefinir uma conta `Solicitante` nem administradores
  diferentes do e-mail bootstrap.
- Não expõe existência do e-mail nem código correto nas respostas.
- Não aceita token reutilizado.
- Não remove usuários, não altera permissões, não desativa MFA externo
  e não altera o banco Supabase.
- `POST` exige origem HTTPS com host idêntico; requests de origem
  cruzada são negados.
- O backend não disponibiliza recovery em produção, mesmo se houver
  engano ao configurar a flag.
- A restauração da senha é uma alteração da conta compartilhada entre
  prévia e produção; as demais contas não são alteradas.

## Cobertura de testes

`api/auth-recovery.test.js` verifica recuperação sem sessão,
uma única utilização, sessão antiga revogada, convite vencido,
restrição a administrador inicial, origem e proteção em produção.
`src/auth-recovery.test.ts` verifica apresentação condicional e UI.
Não há senha real nem segredo real nos testes.

## Recuperação por e-mail de uso único

A branch de teste suporta `recover-admin-link`: requer `ST1_EMAIL_RECOVERY_HASH` (SHA-256 do token, sem guardar o token) e `ST1_EMAIL_RECOVERY_EXPIRES_AT` (epoch em milissegundos), ambos apenas no ambiente Preview. A rota confere o e-mail inicial cadastrado e revoga sessões após redefinição. O link deve ser entregue somente ao e-mail inicial, nunca colocado em repositório ou chat. Desativar as variáveis após a conclusão. A alteração de documentação dispara uma nova compilação da prévia para refletir as variáveis.

Recompilação do ambiente Preview para validar a entrega do link de recuperação de senha do administrador inicial.
