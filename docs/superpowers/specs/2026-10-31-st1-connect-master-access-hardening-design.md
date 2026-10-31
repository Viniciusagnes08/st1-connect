# ST1 Connect — Segurança do Admin Master (Procedimento 01)

**Data:** 31/10/2026 · **Ambiente:** Preview da branch `feature/st1-connect-bi-foundation`. Produção preservada.
**Escopo aprovado:** impedir escalonamento de privilégios por administradores delegados sem remover a gestão operacional do time.

## Modelo de autorização

A identidade Master é derivada exclusivamente da conta autenticada no diretório privado, cujo e-mail corresponde a `ST1_BOOTSTRAP_EMAIL`, com papel `Administrador` e `active=true`. O frontend não pode informar `isMaster` para elevar acesso.

| Operação | Admin Master | Administrador delegado |
|---|---|---|
| Criar Solicitante, Técnico ou Supervisor | Permitido | Permitido |
| Criar ou promover Administrador | Permitido | Negado, HTTP 403 |
| Alterar, desativar ou redefinir senha de outra conta Administrador | Permitido | Negado, HTTP 403 |
| Alterar o próprio papel para não Administrador ou desativar a conta Master | Negado | Negado |
| Editar papel de não Administrador e ativar/desativar usuários comuns | Permitido | Permitido |
| Redefinir a própria senha pela rota administrativa sem senha atual | Negado | Negado |
| Autorizar Gmail pessoal | Permitido | Negado |
| Alterar associação ao BI da identidade Master | Permitido | Negado |

## Decisão técnica

**Escolhido:** política pura em `api/_lib/master-admin.js`, aplicada em `api/auth.js` e `api/bi-members.js`, com ocultação equivalente em `src/AuthGate.tsx`.
**Não escolhido:** somente esconder opções no frontend (facilmente contornável pela API).
**Não escolhido:** migrar todo o login para Supabase Auth nesta fase (risco de interromper contas existentes).

Validações de papel, situação e senha ocorrem **antes de modificar registros**. A sessão mantém assinatura HMAC, expiração e versão vinculada ao cadastro. A recuperação da conta inicial segue o fluxo existente; nenhum e-mail, senha, hash ou configuração de recuperação deve ser alterado por este procedimento.

## Auditoria inicial

Alterações de permissões e contas, convites Google, alterações de senha administrativa e uso de recuperação Master são acrescentados ao campo `auditTrail` do JSON privado de contas. A mesma gravação com ETag atualiza conta e auditoria, evitando sucesso sem evento correspondente. Eventos contêm apenas IDs, ação, timestamp e valores de papel/situação; **não** incluem e-mail, senha, token ou hash.

O histórico é **limitado aos 1.000 eventos mais recentes**. `GET /api/auth?action=audit` retorna os últimos 100 somente para o Master. Isso é uma trilha operacional de fase inicial, **não** um armazenamento independente, imutável ou adequado para retenção regulatória. A auditoria definitiva deve integrar o Procedimento 03.

## Critérios de aceitação

1. Conta Master válida mantém `isMaster=true` após autenticação por senha; não pode ser desativada/demovida, mesmo por sessão própria.
2. Admin delegado recebe HTTP 403 em tentativas de criar/promover Administrador, alterar Administrador e redefinir senha da conta Master.
3. Admin delegado mantém gerenciamento de contas comuns, com sessão revogada após alteração de versão/desativação.
4. Apenas Master pode ler eventos administrativos; registros não contêm credenciais.
5. BI mantém controle por membership; apenas Master altera membership da própria identidade protegida.
6. `npm test` e `npm run build` aprovados; deploy Preview READY; validação manual de login existente antes de promoção.

## Fora deste escopo

- Login Google e origem OAuth (Procedimento 04).
- RLS de usuários e auditabilidade imutável do banco (Procedimento 03).
- Filas por departamento e roteamento operacional (Procedimentos 02 e 05).
- Publicação em produção, alteração de contas reais, redefinição de senhas existentes.
