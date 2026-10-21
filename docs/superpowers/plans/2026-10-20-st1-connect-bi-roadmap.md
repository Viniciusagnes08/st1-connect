# ST1 Connect — Roadmap técnico do Squad de BI

**Data:** 20/10/2026  
**Status:** arquitetura funcional aprovada; planos técnicos prontos para revisão e execução posterior, sem alterações funcionais na produção.  
**Origem:** `docs/superpowers/specs/2026-10-20-formularios-inteligentes-design.md`.

## Resultado final

O ST1 Connect será uma **central exclusiva do Squad de BI** para abrir, executar e acompanhar solicitações de dashboards, indicadores, acesso a dados, relatórios, consultas e automações.

Assuntos fora do escopo terão um **registro de encaminhamento**, não ticket executável do BI. A pessoa solicitante verá a classificação, justificativa, protocolo, destino e status no sistema, receberá e-mail no endereço associado à conta verificada e terá seu pedido transmitido a um canal oficialmente configurado por área. Envio aceito pelo canal **não é** confirmação de recebimento humano nem resolução final.

## Entregas independentes e sequenciais

| Ordem | Plano | Resultado verificável | Gate |
| --- | --- | --- | --- |
| **A** | [Banco e fila compartilhada](2026-10-20-a-base-compartilhada-bi.md) | chamados BI transacionais, permissões por papel **e membership**, consulta em vários dispositivos | custo/infra PostgreSQL + teste de isolamento |
| **B** | [Formulários inteligentes BI](2026-10-20-b-formularios-bi.md) | 8 modelos BI e 1 formulário de triagem, construtor, submissão e acompanhamento por protocolo | aceite dos modelos com equipe BI, testes de UX |
| **C** | [Encaminhamento e notificações](2026-10-20-c-encaminhamento-e-notificacoes.md) | diretório por área, confirmação, Trello/e-mail/webhook homologado, inbox, e-mails, outbox/retry e métricas separadas | canais oficiais e provedor de e-mail, plano do worker, validação de domínio |
| **D** | [Convidados externos controlados](2026-10-20-d-formularios-externos.md) | links individuais de uso único, OTP, revogação e submissão segura sem conta interna | revisão de privacidade e aprovação explícita de modelos públicos |

Cada plano tem tarefas pequenas, arquivos exatos, exemplos de código, testes, commits e critérios de aceite. **Não iniciar C sem A+B homologadas; não iniciar D sem C confiável.** A entrega B pode atender o Squad internamente mesmo com encaminhamentos automáticos desativados.

## Arquitetura alvo

~~~text
Solicitante com login
   |
   v
Catálogo BI (8 modelos + revisão de responsabilidade)
   |
   v
Versão publicada do formulário -> Validação no backend -> PostgreSQL
   |                                               |
   | scope=BI                                      | scope=REVIEW
   v                                               v
Fila BI / responsável / histórico          Revisão/triagem de escopo
                                                   |
                                                   v
                                            Confirmação do destino
                                                   |
                                                   v
                                        Referral + Outbox na transação
                                                   |
                           +-----------------------+-----------------------+
                           v                       v                       v
                     Trello da área           E-mail setorial     Webhook autorizado
                           |                       |                       |
                           +----------- recibo técnico, retries, logs -----+
                                                   |
                                   +---------------+--------------+
                                   v                              v
                          Notificação in-app               E-mail ao solicitante
                          (status verdadeiro)              (conta verificada)
                                                   |
                                        ACK humano apenas se confirmado

Link externo individual -> OTP no e-mail convidado -> formulário permitido
                                                   |
                                                   v
                                     mesmo registro transacional,
                                     sem acesso ao painel interno
~~~

**Dados canônicos:** contas e sessões permanecem no backend existente até a migração segura; PostgreSQL guarda requests, templates, respostas, bi_tickets, referrals, rules e outbox; Blob privado somente para anexos permitidos e dados legados de identidade enquanto forem fonte oficial.

## Infraestrutura e aprovações necessárias

### PostgreSQL — Supabase escolhido para homologação

A alternativa agora prevista é um **projeto Supabase dedicado ao ST1 Connect** no plano Free, sem reutilizar o ST1 Academy. A organização conectada tem um projeto ativo e outro inativo; falta o usuário indicar a organização para criação do banco. O código já foi ajustado para o schema privado `st1_bi`, não exposto na Data API. Ver `docs/operations/supabase-st1-connect-setup.md`.

### PostgreSQL
- O provedor previsto nesta implantação é Supabase Postgres em projeto dedicado, com confirmação prévia de organização, custo e condições de armazenamento.
- **Nenhum banco PostgreSQL conectado foi confirmado na inspeção deste trabalho.**
- Para usar, confirmar empresa contratante, plano, cotas, região, custos, retenção, separação Preview/Produção, backups, data retention e conexão pooled.
- Variáveis server-side como `DATABASE_URL` e `DATABASE_URL_TEST` não entram no repositório, não têm prefixo `VITE_` e não aparecem no navegador.
- Não migrar registros demonstrativos automaticamente.

### Mensageria
- Exige provedor transacional e remetente de domínio ST1 verificado; Resend é **candidato técnico**, não serviço já configurado.
- O e-mail é enviado ao contato do login **após validação do e-mail**. Contas sem verificação recebem orientação in-app para confirmar endereço.
- Provedor pode aceitar uma mensagem sem entregá-la à caixa; registrar estados distintos.
- O envio inicial de confirmação, a atualização de encaminhamento e o aviso de falha têm chaves distintas para não duplicar.

### Canais
- Trello, e-mail institucional e webhook devem ser configurados por área com identificador e owner oficial.
- Se a área não tiver canal e DRI validados, classificar como **Sem destino confirmado** e manter triagem assistida.
- Trello é a origem da execução daquela área, não segundo backlog dentro do BI.
- Webhook para endereço arbitrário fica **desabilitado** até existir controle SSRF de egress/DNS e homologação.
- WhatsApp automático não faz parte do primeiro lançamento; copiar/abrir link não equivale a entregar mensagem.

### Worker de entregas
- A outbox permite retry e recuperação sem perder solicitação.
- Verificar nível do plano Vercel antes de agendar: em Hobby, Cron tem restrição de frequência **diária**; agendamento a cada 5 minutos exige plano adequado ou fila externa aprovada. Não prometer e-mail imediato com job que só roda uma vez ao dia.
- Endpoint de job exige `CRON_SECRET` e não mostra payloads de clientes em logs.

## Papéis e pertencimento ao Squad

**Acesso à fila BI exige duas condições simultâneas:**
1. papel de Administrador, Supervisor ou Técnico; e
2. membership explícito e ativo na tabela `bi_memberships` concedido a uma conta existente do Squad.

Solicitante vê somente protocolos próprios. Administração de templates e canais continua exclusiva do Administrador; Supervisor BI aprova exceções e convites nos limites autorizados. Essa distinção impede que qualquer Técnico da empresa ganhe acesso aos dados BI apenas por ter perfil técnico.

## Teste end-to-end obrigatório antes de publicação

1. Solicitante A e B abrem formulários BI; cada um vê apenas os próprios pedidos, inclusive acessando URLs/APIs manualmente.
2. Supervisor BI vê os dois pedidos; Técnico de outra área não vê a fila do BI sem membership.
3. Erro de indicador gera ticket BI; erro funcional do Kommo, quando encaminhado fora do escopo, **não** entra em bi_tickets.
4. Pedidos fora do escopo registram confirmação da pessoa antes de entrega; canal homologado recebe campos mínimos e protocolo.
5. Falha/timeout do Trello não cria duplicata em retry; e-mail com mesmo eventKey não se repete dentro da janela suportada.
6. A solicitação tem status **Aguardando envio / Encaminhado / Recebimento confirmado** sem confundir receipt técnico e aceite humano.
7. Usuário solicitante vê timeline e recebe e-mail apenas quando o contato foi verificado; o sistema nunca alega envio bem-sucedido se o provedor recusou.
8. Link externo expira, pode ser revogado, exige OTP no e-mail convidado e não libera menu interno.
9. Banco e outbox persistem entre navegadores; recuperação de falhas funciona. Testes antigos do dashboard ficam verdes.
10. Rollback de frontend/Functions é possível sem apagar pedidos ou versões de formulário.

## Controle de escopo e riscos

| Risco | Tratamento no plano |
| --- | --- |
| Fila BI virar helpdesk de toda a ST1 | templates apenas BI, routing separado, ownership de outras áreas |
| Atribuição errada por IA ou campo livre | classificação determinística, confirmação e revisão humana para híbridos |
| Dados confidenciais em formulário | autorização por registro e minimização do conteúdo encaminhado |
| Mensagens duplicadas ou falsas | outbox + idempotência + distinguir aceite técnico e humano |
| Dependência de provedor ou plano Vercel | feature flags, teste por integração, manual assistido quando permitido |
| E-mail enviado a identidade não verificada | OTP/contato validado antes do automático |
| Duplicação no Trello | consulta por marker + lease + revisão manual no resultado indefinido |
| Tickets demonstrativos contaminarem relatórios reais | não migrar localStorage automaticamente |

## Critério para autorizar o início do desenvolvimento

Antes do código de produção, confirmar:
- acesso e orçamento permitidos para PostgreSQL, armazenamento e serviço de e-mail;
- proprietários e canais reais por área, com a lista de destinos a homologar;
- responsabilidade técnica e operador de sustentação do Squad BI;
- branch de desenvolvimento, política de revisão de PR e quem aprova produção.

A ausência desses dados **não impede a criação de código e testes locais**, mas impede ativar integração externa, migração de produção ou cobrança de serviços.

## Fonte técnica oficial consultada

- Postgres no Vercel Marketplace: https://vercel.com/docs/postgres
- Neon no Vercel: https://vercel.com/marketplace/neon
- Restrições de Cron: https://vercel.com/docs/cron-jobs/manage-cron-jobs
- Segurança do Cron: https://vercel.com/docs/cron-jobs/manage-cron-jobs
- Resend: idempotência por 24 h: https://resend.com/blog/engineering-idempotency-keys

**Status do projeto após documentação:** especificação e quatro planos de implementação versionados. Nenhum banco, canal de envio, automação, liberação de formulário ou código funcional novo foi implantado por estes documentos.
