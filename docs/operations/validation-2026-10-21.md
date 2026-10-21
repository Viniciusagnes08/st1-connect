# Validação técnica do ST1 Connect — 21/10/2026

## Código e testes

- Base de produção: `main` no commit `cb7810a3dc3c6c5e2fe08657b111019937b0bbf3`.
- Base da Central BI: `6b32f50f9b07bb61308d1fc1ea26c5da945bbab6`.
- Suíte inicial: 19 testes em main e 43 na Central BI; builds aprovados.
- Correção: origem inválida/opaca na autenticação passa a retornar 403 em vez de lançar Invalid URL (500 reproduzido na produção anterior).
- Regressão e ciclo de autenticação com armazenamento isolado: main com 21 testes; BI com 46 testes. Ambos os builds aprovados.
- Corrigido o TLS do driver: `ssl:'require'` no Postgres.js desativava a validação do certificado. O backend agora exige `rejectUnauthorized:true` e aceita a CA pública em `DATABASE_SSL_CA` quando necessária.
- Auditoria npm: nenhuma vulnerabilidade conhecida informada nas duas bases.
- A correção foi publicada no PR #4, com CI e Preview aprovados, e integrada à main no commit `3e3512fd9aac99b2dbb5c61ae71acd46cfbb415a`. A entrega no domínio principal deve ser confirmada separadamente.
- Testes locais de autenticação usam somente credenciais sintéticas e Blob simulado. Não comprovam escrita no Blob real.

## Banco confirmado diretamente

- Projeto `cxqoypwsqokkwcirugrg`, ST1 Connect, região `sa-east-1`, `ACTIVE_HEALTHY`, organização no plano Free.
- Migração inicial registrada: `20261021023801_st1_connect_bi_foundation_private_schema`.
- Migração aplicada nesta validação: `20261021034315_index_submission_keys_request_id`.
- Migração adicional aplicada: `20261021035541_restrict_bi_backend_role`.
- O índice `submission_keys_request_id_idx` foi criado e o aviso de FK sem índice deixou de aparecer no advisor.
- Criação/leitura/atualização, integridade referencial, chaves únicas e CHECKs foram testados em transação com rollback. As seis tabelas ficaram vazias após os testes.
- `anon` e `authenticated` não têm USAGE no schema nem privilégios de tabela. Tentativas de SELECT com essas roles foram recusadas no teste transacional.
- RLS está ativo nas seis tabelas, com políticas restritas à role de backend `st1_connect_preview`. As permissões de operação são concedidas por tabela; não há DELETE nem DDL. A API continua responsável pela autorização individual de usuários. A role permanece NOLOGIN até a conexão ser configurada.
- O teste transacional com a role de backend confirmou inserção/leitura/atualização, bloqueio de DELETE, DDL e leitura da auditoria. Todos os dados e a autorização administrativa temporária de SET ROLE foram revertidos.
- `BI_CONNECT_ENABLED=false` foi criada e relida na Vercel, somente em Preview e na branch `feature/st1-connect-bi-foundation`.

## Pendências que impedem aprovação operacional

- A tentativa manual de publicar a main foi recusada pela Vercel com `api-deployments-free-per-day` (mais de 100 deploys; mensagem de tentar em 24 horas). Posteriormente a publicação automática da Preview do PR #4 concluiu; conferir a produção pelo SHA e pelo HTTP.
- A publicação automática da main `3e3512f` foi recusada: status Vercel `failure`, mensagem `Deployment rate limited — retry in 24 hours.` O domínio principal permanece numa versão anterior. `/api/health` e `/api/requests` retornam 404 na produção, que não contém a Central BI.
- DATABASE_URL privada ainda precisa ser configurada em Preview e testada pelo driver real. A obtenção do endpoint atribuído ao pooler depende do painel Supabase autenticado, mas Local browser use permanece bloqueado pelo Work. Não inferir o host apenas pela região nem usar credenciais do Academy.
- BI_CONNECT_ENABLED deve ser ativada em Preview somente após migração e conexão verificadas.
- Faltam fluxos reais com dois logins, leitura entre dispositivos, concorrência via API e validação visual da aplicação autenticada.
- Um teste SQL com rollback não é teste de persistência entre sessões nem ensaio de backup/restauração.
- A indisponibilidade temporária de Local browser use interrompeu o QA visual. A escrita no GitHub foi concluída via conector; isso não comprova publicação no domínio principal.

## Próxima publicação

1. Confirmar a main com a correção de autenticação e os testes incluídos no npm test.
2. Publicar a main quando a cota liberar e confirmar o commit e os hashes dos assets no domínio principal.
3. Obter o endpoint do pooler no painel autenticado, criar a credencial da role restrita e configurar DATABASE_URL em Preview para `feature/st1-connect-bi-foundation`; testar TLS, schema e privilégios pelo driver real.
4. Homologar criação, retry idempotente, isolamento e revogação com duas contas antes de integrar a Central BI à produção.
