# Fase C — Encaminhamento interáreas e notificações confiáveis: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar triagem de escopo, diretório de canais configurável por área, entrega rastreável por Trello/e-mail/webhook autorizado e mensagens no sistema + e-mail ao solicitante, sem transformar encaminhamento externo em trabalho ou SLA do Squad de BI.

**Architecture:** Classificador determinístico por regras versionadas; confirmação explícita antes de enviar caso externo; criação atômica do registro e da outbox PostgreSQL; worker com lease/retry e adaptadores de canal. Estado de "canal aceitou" permanece diferente de "área confirmou recebimento". Credenciais ficam apenas no servidor e envs secretas.

**Tech Stack:** PostgreSQL + `pg`, Vercel Functions e Cron (se cadence do plano permitir), provider de e-mail transacional verificado (Resend como candidato a homologar), Trello REST API, React, Node Test Runner.

**Pré-requisito:** Fases A e B aprovadas, banco compartilhado e identidade server-side. Não habilitar canal externo sem autorização e destino de homologação.

**Spec:** `docs/superpowers/specs/2026-10-20-formularios-inteligentes-design.md`

---

## Decisões de desenho

- **Nenhum disparo automático por keyword livre.** Um formulário e campos fechados indicam domínio; nos híbridos o Supervisor decide.
- Canais por área (Trello, caixa postal setorial, webhook aprovado ou manual assistido). Não há quadro universal nem envio para e-mails inventados.
- **Outbox** na mesma transação da confirmação do solicitante. Aceite do provedor ≠ aceite humano; falha de um destino não apaga entregas anteriores.
- Mensagem no sistema tem precedência como registro factual. E-mail é canal secundário com estados próprios.
- Regra de falha: persistir pendência e alertar triagem, nunca dizer "encaminhado" sem receipt técnico.
- Medir SLA do BI e eficiência do roteamento separadamente.

## Mapa de arquivos

| Caminho | Responsabilidade |
| --- | --- |
| `db/migrations/003_routing.sql` | áreas, canais, regras, encaminhamentos, notificações e outbox |
| `api/_lib/classifier.js` | regra determinística e triagem |
| `api/_lib/classifier.test.js` | casos BI, externo, híbrido e sem destino |
| `api/_lib/referrals-service.js` | confirmar, cancelar, reclassificar e registrar eventos |
| `api/routing.js` | gestão Admin de áreas/regras/canais |
| `api/referrals.js` | confirmação e acompanhamento server-side |
| `api/notifications.js` | inbox e status de leitura |
| `api/_lib/outbox.js` | claims/leases/retry e resultado |
| `api/_lib/channels/trello.js` | criação idempotente de card |
| `api/_lib/channels/email.js` | provedor transacional e e-mail ao solicitante |
| `api/_lib/channels/webhook.js` | webhook allowlist, assinado |
| `api/_lib/channels/manual.js` | registro auditado de envio humano |
| `api/_lib/delivery-worker.js` | processador do outbox |
| `api/jobs/dispatch.js` | endpoint de job protegido por segredo |
| `src/features/routing/ReferralTimeline.tsx` | estado do encaminhamento para solicitante |
| `src/features/routing/TriagePage.tsx` | triagem e reprocessamentos |
| `src/features/routing/ChannelSettingsPage.tsx` | configuração por Administrador |
| `src/features/routing/Inbox.tsx` | notificações no próprio sistema |
| `src/features/routing/routing.css` | interface dentro da identidade ST1 Connect |
| `src/App.tsx` | papéis, menu, distinção de filas |
| `vercel.json` | Cron quando tecnicamente permitido |
| `docs/operations/routing-runbook.md` | configuração, testes e tratamento de falhas |

## Task 1: Persistir diretório, encaminhamento, inbox e outbox

**Files:** Create `db/migrations/003_routing.sql`.

- [ ] **Step 1: teste de integridade negativo.** Em banco isolado, tentar referral com canal inexistente, outbox com `event_key` duplicada e status fora da lista; esperado: FK, UNIQUE e CHECK impedem. Depois rodar a migração.

- [ ] **Step 2: criar schema.**

~~~sql
-- db/migrations/003_routing.sql
CREATE TABLE routing_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL CHECK (slug ~ '^[a-z0-9-]{2,80}$'),
  name text NOT NULL,
  active boolean NOT NULL DEFAULT false,
  validated_at timestamptz
);
CREATE TABLE routing_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES routing_departments(id),
  type text NOT NULL CHECK (type IN ('trello','email','webhook','manual')),
  label text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  secret_env_key text,
  enabled boolean NOT NULL DEFAULT false,
  validated_at timestamptz
);
CREATE TABLE routing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_key text NOT NULL,
  answer_field text,
  answer_value text,
  department_id uuid NOT NULL REFERENCES routing_departments(id),
  channel_id uuid NOT NULL REFERENCES routing_channels(id),
  policy text NOT NULL DEFAULT 'confirm' CHECK (policy IN ('confirm','manual')),
  version integer NOT NULL CHECK (version > 0),
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(topic_key,answer_field,answer_value,version)
);
CREATE TABLE referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE REFERENCES request_records(id),
  rule_id uuid NOT NULL REFERENCES routing_rules(id),
  department_id uuid NOT NULL REFERENCES routing_departments(id),
  channel_id uuid NOT NULL REFERENCES routing_channels(id),
  state text NOT NULL DEFAULT 'waiting'
    CHECK (state IN ('triage','waiting','processing','forwarded','acknowledged','failed','cancelled')),
  external_reference text,
  external_url text,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  forwarded_at timestamptz,
  acknowledged_at timestamptz
);
CREATE TABLE referral_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id uuid NOT NULL REFERENCES referrals(id),
  kind text NOT NULL,
  actor_user_id text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text UNIQUE NOT NULL,
  recipient_user_id text NOT NULL,
  request_id uuid NOT NULL REFERENCES request_records(id),
  kind text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_owner ON user_notifications(recipient_user_id,created_at DESC);
CREATE TABLE delivery_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text UNIQUE NOT NULL,
  request_id uuid NOT NULL REFERENCES request_records(id),
  referral_id uuid REFERENCES referrals(id),
  delivery_type text NOT NULL CHECK (delivery_type IN ('channel','requester_email')),
  channel_id uuid REFERENCES routing_channels(id),
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','leased','sent','retry','failed')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_expires_at timestamptz,
  external_id text,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX delivery_due ON delivery_outbox(status,next_attempt_at);
~~~

Sem credenciais nem access tokens em `routing_channels.config`; apenas identificador público/allowlist, e nome de env privada em `secret_env_key`.

- [ ] **Step 3: validar e commitar.** Rodar `DATABASE_URL="$DATABASE_URL_TEST" node db/migrate.mjs` duas vezes; testar leitura/rollback e constraints. Commit: `feat(routing): schema for departments referrals inbox and outbox`.

## Task 2: Classificação determinística e tratamento de ambiguidades

**Files:** Create `api/_lib/classifier.js`, `api/_lib/classifier.test.js`.

- [ ] **Step 1: escrever casos vermelhos.**

~~~js
// api/_lib/classifier.test.js
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { classify } from './classifier.js';
test('demanda BI permanece no Squad', () => {
  assert.equal(classify('divergencia-indicador', {}, []).kind, 'BI');
});
test('sem rota válida exige revisão, não inventa destino', () => {
  assert.equal(classify('duvida-responsabilidade',{tema:'crm'},[]).kind,'REVIEW');
});
test('CRM roteia apenas com canal validado', () => {
  const rules=[{topic_key:'duvida-responsabilidade',answer_field:'tema',answer_value:'crm',
    active:true,channel_enabled:true,department_active:true,channel_validated:true,
    department_id:'dep-1',channel_id:'channel-1',policy:'confirm',id:'rule-1'}];
  assert.equal(classify('duvida-responsabilidade',{tema:'crm'},rules).kind,'EXTERNAL');
});
~~~

- [ ] **Step 2: regras puras, sem previsão baseada em texto livre.**

~~~js
// api/_lib/classifier.js
const biTopics = new Set([
  'novo-dashboard','ajuste-dashboard','divergencia-indicador','extracao-dados',
  'integracao-bases','automacao-bi','acesso-dado-bi','orientacao-dados'
]);
export function classify(topicKey, answers, rules) {
  if (biTopics.has(topicKey)) return {kind:'BI'};
  const eligible = rules.filter(r => r.active && r.channel_enabled
    && r.department_active && r.channel_validated && r.topic_key === topicKey
    && (!r.answer_field || answers[r.answer_field] === r.answer_value));
  if (eligible.length !== 1) return {kind:'REVIEW',reason:'Destino não confirmado ou ambíguo'};
  return {kind:'EXTERNAL',rule:eligible[0]};
}
~~~

Pedidos híbridos entram em `REVIEW` quando há conflito de domínio detectado pelo Supervisor; não corrigir "na marra" por keyword. Salvar ID e versão da regra utilizada no encaminhamento.

- [ ] **Step 3: testes e commit.** Casos com 0, 1, 2 regras elegíveis; canal inativo; assunto CRM que cita BI mas primariamente CRM; BI com dependência CRM continua BI até revisão. Commit: `feat(routing): deterministic scope classifier`.

## Task 3: Confirmar encaminhamento antes do disparo

**Files:** Create `api/_lib/referrals-service.js`, `api/referrals.js`, `api/_lib/referrals-service.test.js`.

- [ ] **Step 1: teste de dupla confirmação.** Mesmo `request_id` confirmado duas vezes gera apenas uma linha em `referrals` e um evento de canal na outbox, sem segundo card/email. Sem confirmação explícita, nenhuma outbox externa.
- [ ] **Step 2: implementar criação transacional.**

~~~js
// api/_lib/referrals-service.js
export async function confirmReferral(db, user, requestId, destination) {
  const query = await db.query(
    'SELECT id,scope,requester_user_id,title,details FROM request_records WHERE id=$1 FOR UPDATE',
    [requestId]);
  const request = query.rows[0];
  if (!request) throw Object.assign(new Error('Solicitação inexistente'),{status:404});
  if (request.requester_user_id !== user.id &&
      !['Administrador','Supervisor'].includes(user.role))
    throw Object.assign(new Error('Acesso proibido'),{status:403});
  if (request.scope === 'BI')
    throw Object.assign(new Error('Demanda BI exige reclassificação pelo Supervisor'),{status:409});
  const known = await db.query('SELECT * FROM referrals WHERE request_id=$1',[requestId]);
  if (known.rowCount) return known.rows[0];
  // destination contém exclusivamente regra/canal reread do banco, nunca do body público.
  if (!destination?.active || !destination?.channel_enabled || !destination?.channel_validated)
    throw Object.assign(new Error('Destino não confirmado'),{status:409});
  const inserted = await db.query(
    "INSERT INTO referrals(request_id,rule_id,department_id,channel_id,state) VALUES($1,$2,$3,$4,'waiting') RETURNING *",
    [requestId,destination.id,destination.department_id,destination.channel_id]);
  const referral = inserted.rows[0];
  await db.query("UPDATE request_records SET scope='EXTERNAL' WHERE id=$1",[requestId]);
  await db.query(
    "INSERT INTO delivery_outbox(event_key,request_id,referral_id,delivery_type,channel_id,payload) VALUES($1,$2,$3,'channel',$4,$5::jsonb)",
    ['channel:' + referral.id,requestId,referral.id,destination.channel_id,
      JSON.stringify({requestId,referralId:referral.id})]);
  await db.query(
    "INSERT INTO referral_events(referral_id,kind,actor_user_id) VALUES($1,'confirmed_by_requester',$2)",
    [referral.id,user.id]);
  return referral;
}
~~~

`api/referrals.js` valida sessão, CSRF/Origin, revê regra e dados no banco, chama `inTransaction` e devolve `state:'waiting'`, sem enviar pela API de requisição. Endpoints de Supervisor/Admin permitem reclassificar um pedido BI com justificativa e ajuste explícito do ticket, sem perder eventos históricos.

- [ ] **Step 3: testar erros e autorização.** Confirmar outro usuário sem papel → 403; canal desabilitado → 409; retry → mesma referral; canal sem validação → permanece em triagem. Commit: `feat(referrals): atomic confirmation and queue`.

## Task 4: Inbox real no ST1 Connect e acompanhamento pessoal

**Files:** Create `api/notifications.js`, `src/features/routing/Inbox.tsx`, `src/features/routing/ReferralTimeline.tsx`, `src/features/routing/routing.css`.

- [ ] **Step 1: teste de isolamento da inbox.** Solicitações A e B geram mensagens para seus respectivos `recipient_user_id`; GET autenticado de A nunca retorna a de B; PATCH marcar lida deve exigir `WHERE recipient_user_id=$1`.
- [ ] **Step 2: API paginada e marcação de lida.**

~~~js
// núcleo de GET em api/notifications.js, após currentPrincipal(req)
const rows = await connection().query(
  'SELECT id,request_id,kind,title,message,read_at,created_at FROM user_notifications WHERE recipient_user_id=$1 ORDER BY created_at DESC LIMIT 50',
  [user.id]
);
return res.status(200).json({items:rows.rows});
~~~

POST `action:'read'` usa `UPDATE user_notifications SET read_at=now() WHERE id=$1 AND recipient_user_id=$2 RETURNING id`, retorna 404 quando não pertence ao usuário.

- [ ] **Step 3: interface legível.** `Inbox.tsx` no sino já existente, filtro não lidas e link do protocolo. `ReferralTimeline.tsx` traduz states: triage → "Recebido para triagem"; waiting → "Aguardando encaminhamento"; processing → "Envio em andamento"; forwarded → "Enviado ao canal, aguardando confirmação da área"; acknowledged → "Recebimento confirmado"; failed → "Falha de encaminhamento"; cancelled → "Cancelado". Nunca dizer "Resolvido" no encaminhamento.
- [ ] **Step 4: commit.** Teste de rota e refresh em dois dispositivos, inclusive tela sem nenhuma notificação. Commit: `feat(inbox): in-app notifications and referral timeline`.

## Task 5: Processador de outbox idempotente, com retry real

**Files:** Create `api/_lib/outbox.js`, `api/_lib/delivery-worker.js`, `api/jobs/dispatch.js`, `api/_lib/outbox.test.js`. Modify `vercel.json` **somente após validar suporte a cron**.

- [ ] **Step 1: testes concorrentes e reprocessamento.** Duas chamadas do worker simultâneas não devem reclamar a mesma entrega durante o lease; erro transitório agenda retry; erro permanente gera falha/alerta; crash durante provider call recupera após lease expirar e busca referência externa quando possível.
- [ ] **Step 2: operação atômica de claim de jobs.**

~~~js
// api/_lib/outbox.js
export async function claimJobs(db) {
  return (await db.query(
    "UPDATE delivery_outbox o SET status='leased',attempts=o.attempts+1,lease_expires_at=now()+interval '2 minutes' "+
    "WHERE o.id IN (SELECT id FROM delivery_outbox WHERE "+
    "((status IN ('queued','retry') AND next_attempt_at<=now()) OR "+
    "(status='leased' AND lease_expires_at<now())) "+
    "ORDER BY next_attempt_at LIMIT 10 FOR UPDATE SKIP LOCKED) "+
    "RETURNING o.*"
  )).rows;
}
export function retryAfter(attempts, now=Date.now()) {
  const minutes = Math.min(120, Math.pow(2,Math.min(attempts,7)));
  return new Date(now + minutes * 60000).toISOString();
}
~~~

- [ ] **Step 3: worker com resultado explícito.** `delivery-worker.js` itera jobs reclamados, faz lookup do canal ativo, chama adaptador pelo `type`, grava `status='sent'` + `external_id` quando resposta tecnicamente aceita, atualiza `referrals.state='forwarded'` e insere evento/notification e **uma nova outbox requester_email** na mesma transação. Se falhar, classifica erro, incrementa retry com `retryAfter` e após 5 tentativas marca failed; atualiza timeline e notifica triagem. Não logar corpo nem segredos.
- [ ] **Step 4: endpoint Cron protegido.**

~~~js
// api/jobs/dispatch.js
import { runDeliveryBatch } from '../_lib/delivery-worker.js';
export default async function handler(req, res) {
  res.setHeader('Cache-Control','no-store');
  const secret = process.env.CRON_SECRET;
  if (req.method !== 'GET') return res.status(405).end();
  if (!secret || req.headers.authorization !== 'Bearer ' + secret)
    return res.status(401).json({error:'Não autorizado'});
  const summary = await runDeliveryBatch();
  return res.status(200).json({processed:summary.processed,failed:summary.failed});
}
~~~

- [ ] **Step 5: agendamento com gate de plano.** A documentação do Vercel informa que **Hobby aceita cron no máximo diário**; para rotina próxima de tempo real validar plano Pro/Enterprise ou contratar fila/workflow aprovada. Se o projeto suportar a cadência e o custo estiverem autorizados, adicionar a `vercel.json` preservando rewrites:

~~~json
"crons": [
  { "path": "/api/jobs/dispatch", "schedule": "*/5 * * * *" }
]
~~~

Para Hobby, **não publicar essa expressão**; ativar um serviço de entrega durável aprovado ou manter funcionalidade marcada indisponível até decidir infraestrutura. `CRON_SECRET` configurado apenas no Vercel; Cron roda em produção, invocar a função diretamente com segredo de teste em homologação.

- [ ] **Step 6: commit.** Testes de claim/retry, crash/replay, auth 401 do cron e ausência de vazamento de payload. Commit: `feat(outbox): durable delivery worker`.

## Task 6: Adaptadores Trello, e-mail setorial, webhook e envio manual

**Files:** Create `api/_lib/channels/trello.js`, `api/_lib/channels/email.js`, `api/_lib/channels/webhook.js`, `api/_lib/channels/manual.js`, `api/_lib/channels/channels.test.js`.

- [ ] **Step 1: teste de mensagem padronizada e limitação de dados.**

~~~js
// Exemplo de contrato de adaptador
const delivered = await adapter.send({
  requestId:'a-uuid',protocol:'ST1-000234',title:'Problema no Kommo',
  requesterName:'Solicitante Teste',requesterEmail:'pessoa@example.invalid',
  summary:'Não consigo atualizar uma etapa do funil.',channelConfig:{idList:'test-list'},
  eventKey:'channel:referral-uuid',
});
assert.equal(delivered.accepted,true);
assert.equal(typeof delivered.reference,'string');
~~~

Não incluir senha, convite público, token, logs de sessão ou campos indiscriminados no objeto do adaptador. `summary` é resumo autorizado por política do canal; respostas completas ficam em link protegido quando houver autenticação/autorização do destinatário.

- [ ] **Step 2: Trello em quadro/lista validada.**

~~~js
// api/_lib/channels/trello.js
export async function sendToTrello(message, secrets, http=fetch) {
  if (!message.channelConfig.idList || !secrets.key || !secrets.token)
    throw new Error('Configuração Trello indisponível');
  const marker = '[ST1_CONNECT_ID:' + message.eventKey + ']';
  // Antes de criar, buscar em canal/lista o marker e retornar card existente
  // se houve falha entre criação e gravação do recibo na execução anterior.
  const url = new URL('https://api.trello.com/1/cards');
  url.searchParams.set('key', secrets.key);
  url.searchParams.set('token', secrets.token);
  const response = await http(url, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({idList:message.channelConfig.idList,
      name:'[ST1 CONNECT] ' + message.title + ' | ' + message.protocol,
      desc:marker + '\nSolicitante: ' + message.requesterName +
        '\nContato: ' + message.requesterEmail +
        '\nResumo: ' + message.summary})
  });
  if (!response.ok) throw new Error('Trello recusou criação');
  const data = await response.json();
  return {accepted:true,reference:data.id,url:data.url};
}
~~~

**Obrigatório complementar** com busca exata do marker na lista antes de criar card, sob lease no banco, para reconciliar resultado indefinido após timeout; o comentário acima representa a posição exata desse bloco. Use API Trello com privilégios mínimos e sem imprimir URL com token em logs. Sem reconciliação, teste de retry contra Trello é falho e o conector não pode ser ativado.

- [ ] **Step 3: provedor transacional institucional para e-mail.**

~~~js
// api/_lib/channels/email.js
export async function sendEmail(message, env=process.env, http=fetch) {
  if (!env.RESEND_API_KEY || !env.ST1_MAIL_FROM)
    throw new Error('E-mail transacional não configurado');
  if (!message.to || !message.subject || !message.html)
    throw new Error('Mensagem incompleta');
  const response = await http('https://api.resend.com/emails',{
    method:'POST',
    headers:{Authorization:'Bearer ' + env.RESEND_API_KEY,
      'Content-Type':'application/json',
      'Idempotency-Key':message.eventKey},
    body:JSON.stringify({from:env.ST1_MAIL_FROM,to:[message.to],
      subject:message.subject,html:message.html})
  });
  if (!response.ok) throw new Error('Provedor de e-mail recusou entrega');
  const data = await response.json();
  return {accepted:true,reference:data.id};
}
~~~

Usar domínio remetente ST1 verificado em provedor com SPF/DKIM/DMARC. **Aceite HTTP do provedor não prova entrega na caixa**. Resolver o destinatário da conta ativa no servidor; para contas ainda sem verificação de e-mail, concluir verificação via link/OTP antes do disparo automático. Não usar credencial Gmail pessoal ou conta do usuário para o sistema.

- [ ] **Step 4: webhook restrito.**

~~~js
// api/_lib/channels/webhook.js
import { createHmac } from 'node:crypto';
export async function sendWebhook(message, urlString, secret, hosts, http=fetch) {
  const url = new URL(urlString);
  if (url.protocol !== 'https:' || !hosts.includes(url.hostname)
    || url.username || url.password || url.port) throw new Error('Destino não autorizado');
  const body = JSON.stringify(message);
  const sig = createHmac('sha256',secret).update(body).digest('hex');
  const response = await http(url,{method:'POST',redirect:'error',
    headers:{'Content-Type':'application/json','X-ST1-Signature':sig,
      'Idempotency-Key':message.eventKey},body,signal:AbortSignal.timeout(8000)});
  if (!response.ok) throw new Error('Webhook recusado');
  return {accepted:true,reference:message.eventKey};
}
~~~

A allowlist de hosts é fixa em env/configuração revisada por Admin e validada na borda; resolver DNS com prevenção SSRF inclusive IP privado/loopback e revalidação pós-DNS antes de produção. Sem esse teste, não ativar webhook. O ACK de negócio é separado de HTTP 200.

- [ ] **Step 5: manual assistido e testes.** `manual.js` monta texto copiável e só marca `forwarded` após Supervisor confirmar o canal e anexar comprovante; teste impede que `copy()` seja registrado como enviado. Homologar Trello com card de teste e e-mail com inbox de teste. Commit: `feat(channels): controlled Trello email webhook and manual adapters`.

## Task 7: Diretório de áreas/canais com autorização e versionamento

**Files:** Create `api/routing.js`, `api/_lib/routing-admin.js`, `api/_lib/routing-admin.test.js`, `src/features/routing/ChannelSettingsPage.tsx`.

- [ ] **Step 1: teste do gate administrativo.** Solicitante, Técnico e Supervisor não podem alterar `routing_channels` nem `routing_rules`; somente Admin autenticado com POST same-origin. Destino sem `validated_at` não pode ser ativado.
- [ ] **Step 2: validar configuração por tipo.**

~~~js
// api/_lib/routing-admin.js
export function validateChannel(kind, config) {
  if (kind === 'trello' && /^[a-zA-Z0-9]{24}$/.test(config?.idList || ''))
    return {idList:config.idList};
  if (kind === 'email' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config?.address || '')
    && Array.isArray(config.allowedDomain) === false)
    return {address:config.address.toLowerCase()};
  if (kind === 'manual' && typeof config?.instruction === 'string'
    && config.instruction.length >= 10 && config.instruction.length <= 400)
    return {instruction:config.instruction};
  throw new Error('Configuração do canal inválida ou requer homologação');
}
~~~

Webhook exige fluxo separado de hostname aprovado e segredo em env; não aceitar webhook arbitrário no payload de Admin como envio imediato.

- [ ] **Step 3: criar UI Admin.** Lista de áreas (BI, CRM/Sistemas, Marketing, Redes/TI, Financeiro, RH), cada uma com status **Sem canal**, **Em validação** ou **Homologado**, seletor de tipo, campos não-secretos, resumo do que será compartilhado e botão **Validar configuração**. Habilitar só após testar canal de homologação e registrar aprovação.
- [ ] **Step 4: registrar auditoria.** Toda alteração cria evento com Admin, timestamp, canal anterior/novo e versão da regra; solicitações existentes permanecem na versão original até reclassificação explícita. Commit: `feat(admin): governed routing directory`.

## Task 8: Tela de triagem para Supervisor e confirmação pelo solicitante

**Files:** Create `src/features/routing/TriagePage.tsx`, `src/features/routing/ReferralTimeline.tsx`. Modify `src/App.tsx`, `src/features/forms/FormWizard.tsx`.

- [ ] **Step 1: UI do solicitante com ciência do encaminhamento.** Para demanda fora de escopo, mostrar: "Esta solicitação parece pertencer a [área]", motivo em frase objetiva, campos que serão compartilhados, canal configurado, dois controles **Confirmar encaminhamento** e **Pedir revisão**. O primeiro chama `POST /api/referrals`, o segundo cria evento de revisão e mantém `scope=REVIEW`.
- [ ] **Step 2: fila de exceções.** `TriagePage.tsx` lista pedidos sem destino, encaminhamentos em retry/falha, reclassificações solicitadas, canais não homologados e itens aguardando confirmação. Supervisor pode aprovar destino sugerido com justificativa; Admin pode editar regra geral.
- [ ] **Step 3: notificações reais e e-mail compatíveis com estado.** Ao conseguir `forwarded`, mostrar "Encaminhado ao canal [nome], aguardando confirmação de recebimento" e agendar um único e-mail com protocolo/contato/resumo/link privado. Falha exibe "Aguardando encaminhamento" ou "Falha no envio" e notifica triagem. Não enviar corpo sensível integral em e-mail não homologado.
- [ ] **Step 4: executar QA.** Mobile 390px/desktop, teclado, dois usuários, sem duplicação ao clicar novamente, fallback manual e acesso por URL. Commit: `feat(ui): request scope review and tracking`.

## Task 9: Observabilidade, custos e liberação por canal

**Files:** Create `docs/operations/routing-runbook.md` e `api/_lib/routing-metrics.js`. Modify `README.md`.

- [ ] **Step 1: consultas de métricas separadas.**

~~~sql
-- Exemplo: não contar encaminhamentos como tickets resolvidos do BI
SELECT scope,count(*) FROM request_records GROUP BY scope;
SELECT state,count(*) FROM referrals GROUP BY state;
SELECT status,delivery_type,count(*) FROM delivery_outbox GROUP BY status,delivery_type;
~~~

Adicionar contadores de `forwarded` vs `acknowledged`, tempo até entrega técnica, falhas e canal sem dono, com denominadores declarados. Não misturar SLA de atendimento BI com tempo de triagem interáreas.

- [ ] **Step 2: simular falhas específicas.** Trello 401, e-mail 429, webhook timeout, cron secret inválido, worker parado, caminho sem canal, retry após resultado externo incerto; cada caso tem estado rastreável e não gera sucesso falso. Registrar logs estruturados sem PII nem segredos; alertar admin quando falha definitiva.
- [ ] **Step 3: homologações.** Admin confirma endereço remetente, quadro/lista, autorizações, webhook e canal de resposta de cada área. **Ativar individualmente** cada integração com feature flag, iniciando ambiente de teste e validação manual da pessoa/área receptora.
- [ ] **Step 4: liberar com gate.** `npm test && npm run build`, migrations em ambiente teste, Preview, checklist de permissão/custo/cadência, teste fim-a-fim com protocolo fictício marcado como homologação e observação em Vercel. Se cron não atender latência esperada, adiar automático. Commit: `docs(ops): routing delivery and exception playbook`.

## Definition of Done

- [ ] Demanda BI não sai para outra área por classificador baseado apenas em texto livre.
- [ ] Pedido fora do escopo tem protocolo e status, mas não entra no SLA de execução BI.
- [ ] Cada rota usa canal institucional validado, sem tokens no cliente/DB legível.
- [ ] Mensagem in-app + e-mail ao endereço da conta após evento válido; nunca inventar recebimento humano.
- [ ] Outbox persistente, retries, deduplicação, trilha auditada e alertas de erro.
- [ ] Trello, e-mail, webhook e manual homologados separadamente ou mantidos desativados.
- [ ] Supervisor vê exceções, Admin controla regras, solicitante acompanha apenas os próprios registros.
- [ ] Métricas de triagem e BI distintas e coerentes.
