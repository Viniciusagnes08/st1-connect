# ST1 Connect | Fase A — Operação, acesso e liberação

**Data:** 20/10/2026  
**Fase:** desenvolvimento em `feature/st1-connect-bi-foundation`  
**Produção:** preservada na branch `main`.  
**Responsabilidade:** Squad de BI / administrador ST1 Connect.

## O que esta fase entrega

- Tabelas PostgreSQL versionadas para solicitações, membros do Squad, chamados BI, histórico, deduplicação e auditoria.
- APIs server-side para abertura e consulta dos próprios pedidos, fila restrita ao BI e atualização de status.
- Telas na navegação **Squad de BI**: Meus pedidos, Nova solicitação, Fila BI e Acessos do Squad.
- Autorização por **dois fatores funcionais**: papel permitido (Administrador/Supervisor/Técnico) **e membership BI ativo**. Não há relação com autenticação multifator.
- Protocolo `ST1-000001` e chave idempotente para retry sem gerar chamado duplicado.
- A nova operação fica **desabilitada** sem banco PostgreSQL e flag `BI_CONNECT_ENABLED=true`. O legado demonstrativo segue inalterado.

**Não incluído nesta fase:** catálogo de formulários condicionais (Fase B), avisos de e-mail e canais externos (Fase C), convites públicos (Fase D). Nenhum ticket demonstrativo foi migrado para o banco.

## Configuração do PostgreSQL

1. Avaliar PostgreSQL gerenciado autorizado pela empresa. Neon via Vercel Marketplace é uma opção, **não** uma integração já confirmada nem autorização de cobrança.
2. Configurar bases **separadas** para Preview/teste e produção; para conexão usar endereço pooled com TLS confiável, sem desabilitar validação TLS.
3. Criar a variável `DATABASE_URL` como **somente servidor**, em Preview primeiro. Em scripts de teste utilizar `DATABASE_URL_TEST` como endereço reservado, nunca a base de produção.
4. Confirmar cotas, regiões, backups, retenção, custos e quem administra/renova o serviço antes da ativação.
5. Realizar migrações de modo controlado, uma vez por ambiente:

```bash
npm ci
npm test
npm run build
DATABASE_URL="$DATABASE_URL_TEST" npm run db:migrate
```

O migrador utiliza transação PostgreSQL e lock consultivo, registra as versões aplicadas em `schema_migrations`, e pode ser reexecutado. Na base sem configuração, ele falha antes de criar tabelas.

**Atenção:** a migração inicial não inclui dados do navegador. Não copiar os 48 chamados fictícios para a operação real.

## Ativar no Preview (não na produção)

Variáveis exigidas pelas APIs:
- `BI_CONNECT_ENABLED=true` **apenas em Preview depois que DB estiver pronta**.
- `DATABASE_URL` conectada à base Preview/teste.
- `DATABASE_SSL_CA` pode conter a CA pública do servidor quando necessária. O driver sempre valida o certificado TLS; não desabilitar essa verificação.
- Credenciais de identidade já utilizadas no Vercel: `ST1_AUTH_SECRET`, `ST1_BLOB_STORE_ID`, `BLOB_READ_WRITE_TOKEN`. Não replicar credenciais no navegador nem adicioná-las ao GitHub.

Atualização de 21/10/2026: o banco dedicado está criado e a migração do índice e do RLS foi aplicada. A role `st1_connect_preview` possui privilégios mínimos e políticas nas seis tabelas, sem DELETE, DDL ou bypass de RLS. Permanece NOLOGIN até a configuração da credencial. A flag foi salva como `false` somente na Preview da branch BI. Os testes transacionais da role passaram; ainda falta a conexão TCP pelo driver e o fluxo real entre contas.

No painel, entre como Administrador. Abra **Squad de BI → Acessos do Squad** e autorize explicitamente as contas do BI (inclusive a própria conta Admin se fará parte da fila). Somente pessoas com login ativo e papel operacional podem ser autorizadas.

O Supervisor/Analista vê fila se membership ativo; contas com perfil Solicitante continuam vendo exclusivamente seus próprios pedidos.

## QA de isolamento e funcionalidade

1. **Login:** Administrador, Técnico e Solicitante logam normalmente. Senha alterada e usuário desativado invalidam sessão anterior.
2. **Identidade real:** usuário A envia pedido; em Meus pedidos deve aparecer seu protocolo e seu e-mail. O campo de email não é editável no formulário.
3. **Cross-user:** usuário B não vê os registros de A, nem manipulando URLs da API. `GET /api/requests?userId=<id-de-A>` continua retornando somente registros de B.
4. **Fila BI:** Técnico/ Supervisor sem membership recebe HTTP 403 de `GET /api/bi-tickets`; membership ativo retorna sua fila. Solicitante com membership acidental também permanece sem acesso.
5. **ID direto:** Solicitante A pode abrir `GET /api/bi-tickets?id=<uuid-A>`, mas Solicitante B recebe HTTP 404 para aquele UUID.
6. **Idempotência:** repetir `POST /api/bi-tickets` com mesmo `Idempotency-Key` e payload deve devolver mesmo protocolo; alterar payload com mesma chave retorna 409.
7. **Estados:** marcar Em atendimento, Pendente com motivo, Resolvido com solução, Fechado após resolução; a trilha mostra quem mudou e quando.
8. **Persistência:** recarregar página e abrir em outro navegador autorizado conserva os registros no PostgreSQL; não depende de localStorage.
9. **Ausência de DB/flag:** `GET /api/health` retorna 503 e a tela informa indisponibilidade sem fingir que salvou algo.
10. **UX:** navegação por teclado, layout mínimo 390px, usuário sem pedidos, erro de conexão, proteção de acesso e logout.
11. **Regressão:** `npm test` e `npm run build` passam e o painel demonstrativo existente permanece com seus próprios registros.

A suíte local cobre regras unitárias, identidade, status, membresia e idempotência usando fixture. **Ela não substitui o QA de PostgreSQL em banco real**: migração, concorrência entre dois processos e isolamento entre dois logins devem ser comprovados antes do release.

## Recursos e observabilidade

- `GET /api/health`: apenas `service` e `database:ready/unavailable`; sem URL ou dados de cliente.
- Mensagens HTTP 401: sessão ausente/expirada; 403: pessoa sem acesso; 409: conflito de estado/retry; 503: funcionalidade não habilitada ou banco indisponível.
- Erros internos não retornam stacktrace, connection strings, senha ou hash.
- Monitorar erros HTTP 500/503 no Vercel Preview, sem publicar logs de conteúdo do chamado.

## Planos de recuperação

- **Falha da UI ou API na Preview:** desativar `BI_CONNECT_ENABLED` ou reverter a branch/PR para deployment anterior. Migrações **não são revertidas apagando registros**.
- **Falha de conexão:** não gravar localmente como substituto; indicar indisponibilidade até correção.
- **Falha em permissão:** interromper rollout e revisar memberships/contratos antes de adicionar novos usuários.
- **Segredos comprometidos:** rotacionar credenciais pela ferramenta de gerenciamento, nunca pelo código.
- **Rollback de produção:** só após PR aprovado, com snapshot/backups e plano de restauração definido.

## Checklist para merge e ativação

- [ ] PostgreSQL de Preview provisionado com custos e responsável aprovados.
- [ ] `DATABASE_URL` da Preview aponta para ambiente isolado (nunca produção).
- [ ] Migrações testadas duas vezes, sem erros e sem duplicação.
- [ ] Suíte de testes e build validado em CI e Preview Vercel.
- [ ] Dois usuários de teste isolados; membership BI e 401/403 conferidos.
- [ ] Criação e leitura em dispositivos diferentes confirmadas.
- [ ] Recuperação e logs revisados; fluxo de rollback documentado.
- [ ] Acesso, custo, backups e política de produção aprovados antes do merge em `main`.

**Estado honesto:** até todos os itens acima serem verificados, a Fase A é **código em branch de desenvolvimento**, não uma central de chamados real já operando com dados compartilhados.
