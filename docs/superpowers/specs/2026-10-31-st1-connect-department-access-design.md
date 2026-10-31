# ST1 Connect — Procedimento 02: controle de acesso por departamento

**Data:** 2026-10-31 · **Alvo:** apenas Preview (`feature/st1-connect-bi-foundation`).
**Aprovado no chat:** implantar departamentos, gestores, supervisores, executores e solicitantes, mantendo Master separado e Ouvidoria confidencial.

## Decisão de arquitetura

O ST1 Connect usa sessão própria no backend Vercel e banco privado Supabase. As permissões departamentais **não** são inferidas do perfil global (`Administrador/Supervisor/Técnico/Solicitante`); são associações explícitas no banco `st1_services.department_memberships` com `user_id`, `area`, `role` (`gestor/supervisor/executor`) e `active`.

Áreas iniciais: Comercial, CRM, TI, Marketing, Financeiro, Administrativo. `geral` permanece na triagem Master; Ouvidoria é completamente excluída de filas departamentais e não pode ser atribuída a responsáveis; o BI mantém sua fila e membership especializada já implantadas.

Alternativas: (1) campo único `department` em usuário (não cobre múltiplas áreas); (2) confiar no papel global Supervisor (escalonamento entre áreas); **(3) associação explícita por departamento — escolhida**.

## Matriz operacional

| Operação | Master | Gestor de área | Supervisor de área | Executor de área | Solicitante |
|---|---|---|---|---|---|
| Abrir e acompanhar próprios pedidos | Sim | Sim | Sim | Sim | Sim |
| Fila de pedidos não confidenciais da área | Sim | Todos | Todos | Só atribuídos | Não |
| Ler detalhe de pedido não confidencial da área | Sim | Sim | Sim | Apenas atribuído | Só próprios |
| Atualizar estado de pedido da área | Sim | Sim | Sim | Apenas atribuído | Não |
| Atribuir/reatribuir pessoa responsável da área | Sim | Sim | Sim | Não | Não |
| Conceder/revogar papel por departamento | Sim | Não | Não | Não | Não |
| Ler Ouvidoria de terceiros | Apenas Master | Não | Não | Não | Não |

Nenhum papel departamental modifica conta Master nem membership BI. Cargo de Supervisor no cadastro global não equivale a Supervisor de área.

## Fluxo e segurança

1. Usuário autenticado envia pedido para área permitida. `requester_user_id` é preenchido no backend, jamais no cliente.
2. Master concede associação de equipe a partir do cadastro privado de contas ativas; nenhum funcionário é designado por suposição.
3. Gestor e Supervisor da área conseguem filtrar fila e atribuir apenas membros ativos dessa área, com validação do diretório de identidades.
4. Executor enxerga/atua só em itens que lhe foram atribuídos.
5. Ouvidoria e solicitações `confidential=true` permanecem criador/Master; não aparecem em consultas departamentais.
6. Todas as mutações são parametrizadas, autenticadas, registradas em `request_events` e feitas em transação. Mudanças de membership geram auditoria de concessão/revogação (sem dados pessoais).
7. Nenhum dado demonstrativo será criado. Usuário sem associação recebe fila vazia/bloqueio explícito.
8. Manter o RLS no schema privado e políticas exclusivamente da role do backend, sem publicar tabelas via API pública.

## Pronto quando

- [ ] Master concede gestor/supervisor/executor e revoga sem perda de sessão global.
- [ ] Consultas de outra área e `view=all` são negadas; tentativas de IDOR retornam 404 sem divulgar pedido.
- [ ] Executor vê apenas os seus atribuídos e não pode assumir/atribuir solicitações.
- [ ] Atribuição somente a integrante ativo e autorizado da mesma área.
- [ ] Ouvidoria e relatos confidenciais continuam inacessíveis a todos os papéis departamentais.
- [ ] Nova tela de equipes/filas no portal, com estados de carregamento/sem acesso/erro.
- [ ] Testes automatizados e build aprovados; Preview READY; produção inalterada.
