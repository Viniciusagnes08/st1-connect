# ST1 Connect — acesso da conta inicial por alias (somente homologação)

## Problema identificado
A conta administrativa inicial do ST1 Connect utiliza um endereço corporativo sem pontuação na parte anterior ao @. O endereço informado pelo titular adiciona um ponto; como o login é uma comparação exata, a API devolvia 401 antes de verificar a senha da conta existente.

O cadastro do ST1 Connect permanece no Vercel Blob privado em `st1-connect/contas-v1.json`. Criar uma conta diretamente no Supabase Auth/Postgres não altera o login atual.

## Correção limitada à Preview
- `ST1_BOOTSTRAP_LOGIN_ALIAS`: nome alternativo explicitamente configurado **apenas no ambiente Preview da branch** `feature/st1-connect-bi-foundation`.
- `api/auth.js` aceita o alias somente quando `VERCEL_ENV === 'preview'`, a conta original está ativa e tem papel Administrador, o domínio é igual e os nomes locais só diferem pelos pontos.
- Um usuário cujo e-mail corresponda diretamente ao informado sempre tem prioridade sobre o alias.
- A correção **não cria nova conta**, não altera e-mail canônico, senha ou papel, não lê senhas fornecidas por mensagens e não amplia permissões.
- A senha cadastrada continua obrigatória; a autenticação é idêntica à do e-mail canônico.
- Produção permanece sem alias. Os demais e-mails não ganham variantes automáticas.

## Verificação e encerramento
1. Executar `npm test` e `npm run build` por CI, incluindo `api/auth-login-alias.test.js` com senhas **sintéticas**.
2. Publicar uma nova Preview **após** salvar a env, já que deploy anterior não herda env nova.
3. Titular testa o login no novo endereço com a senha válida da conta, sem compartilhá-la em chat. Código da API não comprova a senha real até teste autenticado.
4. Como uma senha foi inserida em uma conversa, o titular deve **criar uma senha inédita diretamente na interface** em Meu Acesso > Minha Conta e guardar em gerenciador de senhas.
5. Após comprovar acesso e validar titularidade do novo endereço por e-mail, migrar o e-mail canônico por procedimento administrativo autenticado, preservando o ID do usuário. Remover `ST1_BOOTSTRAP_LOGIN_ALIAS` e atualizar Preview.
6. Não integrar o PR à produção enquanto a migração e os testes estiverem pendentes.

## Resultado esperado
Usuário corporativo autorizado entra na Preview com a variação explícita de e-mail e sua senha existente, preservando identidade administrativa e estado do banco. Se houver 401 após a correção, verificar a versão da Preview, o e-mail canônico e o status do hash no Blob — não inserir senhas em SQL.
