# Fase D — Formulários externos com convites controlados: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que um convidado sem conta ST1 Connect responda somente ao formulário autorizado via convite individual, de uso limitado, com validação do contato, revogação, registro seguro da submissão e comunicação sem expor dados internos.

**Architecture:** Token aleatório de 256 bits, armazenado apenas como hash, atrelado a formulário publicado, destinatário, expiração e limites de uso. A página pública existe fora do AuthGate e não oferece outros módulos. Código enviado ao e-mail convidado verifica posse do contato antes de enviar. A transação PostgreSQL consome o convite e cria protocolo sem violar isolamento de dados.

**Tech Stack:** Vite/React, Vercel Functions, PostgreSQL, Node crypto, provedor de e-mail da Fase C, CSS ST1 Connect. Nenhum SaaS novo necessário além dos previamente homologados.

**Pré-requisito:** Fases A–C completas, com banco, outbox, segurança de APIs e provedor transacional de e-mail ativo. Nenhum formulário público liberado enquanto não existirem validação e rate limiting.

**Spec:** `docs/superpowers/specs/2026-10-20-formularios-inteligentes-design.md`


> **Atualização de infraestrutura (21/10/2026):** a implementação operacional da Fase A utiliza o schema PostgreSQL privado `st1_bi` para evitar exposição pela Data API do Supabase. Os snippets SQL abaixo são exemplos de planejamento; ao implementar as fases seguintes, todos os objetos de dados devem ser qualificados como `st1_bi.nome_da_tabela` e as novas migrations devem seguir o modelo de isolamento e segurança descrito em `docs/operations/supabase-st1-connect-setup.md`. Não criar tabelas operacionais no schema `public`.
---

## Mapa de arquivos

| Caminho | Responsabilidade |
| --- | --- |
| `db/migrations/004_public_invites.sql` | controles de acesso e uso do convite |
| `api/_lib/invitations.js` | tokens, hashing, validade, expiração, revogação |
| `api/_lib/invitations.test.js` | testes de single-use e brute-force |
| `api/_lib/otp.js` | helper já criado na Fase C; reutilizar, sem duplicação |
| `api/_lib/public-form-service.js` | formulário publicado e submissão do convidado |
| `api/invites.js` | criação/listagem/revogação para equipe autorizada |
| `api/public/form.js` | pré-visualização permitida pelo token |
| `api/public/send-code.js` | OTP para e-mail associado ao convite |
| `api/public/verify-code.js` | validação do OTP e grant HTTP-only |
| `api/public/submit.js` | submissão transacional sem conta interna |
| `src/features/public/PublicFormApp.tsx` | formulário externo, e-mail verificado e confirmação |
| `src/features/public/public.css` | layout reduzido e acessível |
| `src/AuthGate.tsx` ou `src/main.tsx` | roteamento direto para página pública |
| `src/features/forms/FormBuilder.tsx` | habilitar compartilhamento externo por formulário |
| `src/features/forms/SharePanel.tsx` | criar e revogar links, status e copiar |
| `vercel.json` | header sem referrer para rota externa |
| `docs/operations/public-links-runbook.md` | segurança, abuso, validação e suporte |

## Task 1: Modelar convites seguros e suas restrições

**Files:** Create `db/migrations/004_public_invites.sql`.

- [ ] **Step 1: testes de constraints em Postgres de homologação.** Simular convite com hash duplicado, uso acima do limite, tentativa com `expires_at` anterior a `created_at` e reuso do mesmo grant; comportamento esperado: rejeição por unique, check e aplicação transacional.

- [ ] **Step 2: schema explícito.**

~~~sql
-- db/migrations/004_public_invites.sql
ALTER TABLE form_templates
  ADD COLUMN external_enabled boolean NOT NULL DEFAULT false;
CREATE TABLE public_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text UNIQUE NOT NULL CHECK (length(token_hash)=64),
  template_id uuid NOT NULL REFERENCES form_templates(id),
  version_id uuid NOT NULL REFERENCES form_versions(id),
  recipient_email text NOT NULL,
  created_by_user_id text NOT NULL,
  max_uses integer NOT NULL DEFAULT 1 CHECK (max_uses BETWEEN 1 AND 5),
  uses integer NOT NULL DEFAULT 0 CHECK (uses>=0 AND uses<=max_uses),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  otp_hash text,
  otp_expires_at timestamptz,
  otp_attempts integer NOT NULL DEFAULT 0,
  otp_requested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);
CREATE INDEX public_invites_template ON public_invites(template_id,created_at DESC);
ALTER TABLE request_records
  ADD CONSTRAINT guest_invite_fk FOREIGN KEY (guest_invite_id)
  REFERENCES public_invites(id);
CREATE TABLE public_rate_limits (
  identity_hash text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  requests integer NOT NULL DEFAULT 0
);
CREATE TABLE public_access_grants (
  token_hash text PRIMARY KEY CHECK (length(token_hash)=64),
  invitation_id uuid NOT NULL REFERENCES public_invites(id),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
~~~

Para convite, `version_id` precisa pertencer a `template_id`. Garantir no serviço com SELECT e adicionar chave composta quando aplicável; nunca derivar permissões apenas do slug público. A política padrão é uma utilização e validade máxima de 7 dias. O `CHECK (expires_at>created_at)` já protege o banco; validar também a duração máxima de 7 dias no serviço.

- [ ] **Step 3: migração idempotente e commit.** `DATABASE_URL="$DATABASE_URL_TEST" node db/migrate.mjs`; não alterar convidado real porque ainda não existe. Commit: `feat(public): schema for limited external invitations`.

## Task 2: Gerar token aleatório e impedir reuso

**Files:** Create `api/_lib/invitations.js`, `api/_lib/invitations.test.js`.

- [ ] **Step 1: testes de aleatoriedade/expiração.**

~~~js
// api/_lib/invitations.test.js
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { newInviteToken, hashToken, isUsable } from './invitations.js';
test('token tem 256 bits aleatórios representados com segurança', () => {
  const a=newInviteToken(), b=newInviteToken();
  assert.notEqual(a,b);
  assert.ok(a.length>=43);
  assert.equal(hashToken(a).length,64);
});
test('convite revogado ou usado não é reutilizável', () => {
  const value={uses:1,max_uses:1,expires_at:'2030-01-01T00:00:00Z',revoked_at:null};
  assert.equal(isUsable(value,Date.parse('2026-10-20T00:00:00Z')),false);
});
~~~

- [ ] **Step 2: helpers criptográficos.**

~~~js
// api/_lib/invitations.js
import { randomBytes, createHash } from 'node:crypto';
export const newInviteToken = () => randomBytes(32).toString('base64url');
export const hashToken = token =>
  createHash('sha256').update(String(token)).digest('hex');
export function isUsable(invite, now=Date.now()) {
  return Boolean(invite && !invite.revoked_at
    && new Date(invite.expires_at).getTime()>now
    && invite.uses<invite.max_uses);
}
export function assertInvitedEmail(email) {
  if (typeof email!=='string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || email.length>180) throw new Error('E-mail inválido');
  return email.trim().toLowerCase();
}
~~~

- [ ] **Step 3: teste e commit.** 1000 tokens únicos, expiração no limiar, revogação e limites; `npm test`. Commit: `feat(public): secure invite tokens`.

## Task 3: API para gerar e revogar convites somente com permissão

**Files:** Create `api/invites.js`, `api/_lib/invites-admin.test.js`. Modify `src/features/forms/FormBuilder.tsx`.

- [ ] **Step 1: testes dos papéis.** `Administrador` **com membership BI ativo** pode ativar compartilhamento externo de um modelo publicado; `Supervisor` **com membership BI ativo** pode criar convite individual para modelo previamente habilitado; Técnico/Solicitante recebem 403 para criar/revogar/listar convites.
- [ ] **Step 2: criar convite sem devolver segredos em leituras futuras.**

~~~js
// Núcleo POST em api/invites.js após sessão, Origin e papel
import { newInviteToken, hashToken, assertInvitedEmail } from './_lib/invitations.js';
const raw = newInviteToken();
const email = assertInvitedEmail(req.body.email);
const inserted = await connection().query(
  "INSERT INTO public_invites(token_hash,template_id,version_id,recipient_email,created_by_user_id,expires_at,max_uses) "+
  "SELECT $1,t.id,t.published_version_id,$2,$3,now()+interval '7 days',1 "+
  "FROM form_templates t WHERE t.slug=$4 AND t.state='published' AND t.external_enabled=true RETURNING id,expires_at",
  [hashToken(raw),email,user.id,req.body.slug]
);
if (!inserted.rowCount) return res.status(409).json({error:'Modelo não autoriza convites'});
const link = 'https://st1-connect.vercel.app/f/' +
  encodeURIComponent(req.body.slug) + '#convite=' + encodeURIComponent(raw);
return res.status(201).json({id:inserted.rows[0].id,link,expiresAt:inserted.rows[0].expires_at});
~~~

A string do domínio deve vir da configuração de origem institucional validada pelo servidor (ex.: `PUBLIC_BASE_URL`), nunca de `Host` arbitrário. Usar literal acima somente como exemplo de ambiente ST1 Connect. Link visível **uma vez** na resposta ao criador, não recuperável depois; no banco fica hash.

- [ ] **Step 3: revogação.** POST `action:'revoke',inviteId` valida Admin/Supervisor com membership BI ativo, autoria ou responsabilidade na gestão do convite, grava `revoked_at=now()` com evento de auditoria, impede novas submissões; reabrir o link deve mostrar "Convite revogado" sem detalhes privados. GET lista somente ID, e-mail mascarado, status, expiração e usos, jamais token bruto.
- [ ] **Step 4: QA e commit.** Criação de convite para template desativado → 409; criação fora da role → 403; mesmo slug válido cria tokens distintos; URL codificada e sem segredo em analytics. Commit: `feat(invites): issue and revoke single-use links`.

## Task 4: Formulário público fora do login e sem vazamento por URL

**Files:** Create `api/public/form.js`, `src/features/public/PublicFormApp.tsx`, `src/features/public/public.css`. Modify `src/main.tsx`, `vercel.json`.

- [ ] **Step 1: teste de acesso público isolado.** Sem login, `/f/novo-dashboard#convite=...` abre só o formulário permitido. Um convite para dashboard não libera template de extração. Sem token: tela neutra com instrução. O menu interno jamais aparece.
- [ ] **Step 2: separar bootstrap da página pública.**

~~~tsx
// src/main.tsx (trecho de seleção do componente)
import PublicFormApp from './features/public/PublicFormApp';
const isPublicForm = /^\/f\/[a-z0-9-]+\/?$/.test(window.location.pathname);
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{isPublicForm ? <PublicFormApp/> : <AuthGate/>}</React.StrictMode>
);
~~~

O `PublicFormApp` deve ler `window.location.hash` somente uma vez para recuperar token, validar estrutura, armazená-lo apenas em memória e executar `history.replaceState` removendo o fragmento imediatamente. Não usar `localStorage`, `sessionStorage`, URL query nem cookies acessíveis ao JS para guardar token. Para refresh após limpeza do fragmento, mostrar instrução de reabrir o convite em vez de fingir persistência.

- [ ] **Step 3: API pública exige token no body, não query.**

~~~js
// Núcleo de api/public/form.js
import { hashToken, isUsable } from '../_lib/invitations.js';
const tokenHash = hashToken(req.body.token);
const found = await connection().query(
  "SELECT i.id,i.expires_at,i.revoked_at,i.uses,i.max_uses,"+
  "t.title,t.slug,v.schema_json FROM public_invites i "+
  "JOIN form_templates t ON t.id=i.template_id "+
  "JOIN form_versions v ON v.id=i.version_id "+
  "WHERE i.token_hash=$1 AND t.slug=$2 AND t.external_enabled=true "+
  "AND t.state='published'",[tokenHash,req.body.slug]);
if (!isUsable(found.rows[0])) return res.status(410).json({error:'Convite indisponível'});
return res.json({form:{title:found.rows[0].title,
  fields:found.rows[0].schema_json.fields}});
~~~

O handler deve ser `POST`, limitar corpo, aplicar limitação por IP/token e não devolver endereço de e-mail do convidado antes de comprovar o convite e necessidade.

- [ ] **Step 4: header anti-vazamento e teste.** Em `vercel.json` acrescentar header para `/f/(.*)`: `Referrer-Policy: no-referrer` e `Cache-Control: no-store`, mantendo `index.html` rewrite e headers atuais. Não carregar Analytics/pixels/recursos terceiros na página pública antes de limpar o fragmento. Testar que servidor nunca recebe o token em path/query. Commit: `feat(public): isolated invite-only intake screen`.

## Task 5: Verificação do e-mail de destino com OTP

**Files:** Create `api/public/send-code.js`, `api/public/verify-code.js` e `api/_lib/public-otp.test.js`. Reuse `api/_lib/otp.js` e `api/_lib/channels/email.js` da Fase C, sem duplicar implementação.

- [ ] **Step 1: teste de OTP específico para convite externo, reutilizando o helper da Fase C.**

~~~js
// api/_lib/public-otp.test.js
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createOtp, verifyOtp } from './otp.js';
test('convite aceita apenas o código correto', () => {
  const generated = createOtp('segredo-test-only');
  const wrong = generated.code === '000000' ? '000001' : '000000';
  assert.equal(verifyOtp(generated.code,generated.digest,'segredo-test-only'),true);
  assert.equal(verifyOtp(wrong,generated.digest,'segredo-test-only'),false);
});
~~~

- [ ] **Step 2: reutilizar a rotina única.** A Fase C já definiu `createOtp(pepper)` e `verifyOtp(code,digest,pepper)` em `api/_lib/otp.js`. O fluxo público chama essas funções com segredo `ST1_INVITE_PEPPER` configurado apenas no servidor. Não criar uma segunda implementação criptográfica nem guardar o código bruto; acrescentar apenas testes de limites, expiração e convite errado.

- [ ] **Step 3: enviar código somente ao e-mail predefinido no convite.** `POST /api/public/send-code` recebe token e slug, valida convite, usa `recipient_email` do banco, jamais endereço do request. Gerar OTP, salvar HMAC com `ST1_INVITE_PEPPER` e validade 10 minutos, máximo 5 tentativas e intervalo mínimo de 60s por convite. Enviar via `sendEmail` da Fase C; aceitar request apenas se o provedor aceitar, e marcar falha quando indisponível. Logs sem código, token, e-mail completo ou segredo.
- [ ] **Step 4: comprovar e gerar grant curto.** `POST /api/public/verify-code` confirma HMAC e prazo, incrementa `otp_attempts` em erro, invalida o OTP no sucesso e cria grant aleatório (32 bytes) com hash salvo em `public_access_grants`, validade 15min. Entregar grant como cookie `HttpOnly; Secure; SameSite=Strict; Path=/api/public; Max-Age=900`. Em `submit` exigir cookie/grant válido para aquele convite; recusar grant usado/expirado e limpar cookie após submissão.
- [ ] **Step 5: testes e commit.** OTP expirado, tentativa 6, novo OTP antes de 60s, injeção de endereço, reuso de grant e e-mail inexistente devem falhar com resposta genérica para evitar enumeração. Commit: `feat(public): email ownership verification`.

## Task 6: Submissão externa atômica, single-use e sem acesso a dados de terceiros

**Files:** Create `api/_lib/public-form-service.js`, `api/public/submit.js`, `api/_lib/public-form-service.test.js`. Modify `api/_lib/form-submission.js`.

- [ ] **Step 1: teste de corrida com duas requisições.** Mesmo token e grant submetidos em paralelo → exatamente um protocolo; segundo recebe 409/410. Um token pertencente a outro formulário não funciona; um convite revogado não cria registros.
- [ ] **Step 2: consumir uso com SQL condicional na transação.**

~~~sql
UPDATE public_invites
SET uses=uses+1
WHERE id=$1 AND revoked_at IS NULL
  AND expires_at>now() AND uses<max_uses
RETURNING id,recipient_email,template_id,version_id;
~~~

- [ ] **Step 3: criar registro em uma única transação.** Depois de `UPDATE ... RETURNING`, carregar versão fixada, validar respostas com `validateAnswers`, gerar protocolo usando `request_protocol_seq` da Fase A e inserir em `request_records` com `requester_user_id=NULL`, `guest_invite_id=invite.id`, `requester_email=invite.recipient_email` e `scope='BI'` ou `'REVIEW'` conforme template. Se BI, inserir `bi_tickets`; inserir `form_submissions` com `submitted_by_user_id=NULL`; evento, auditoria e consumo de grant. Se qualquer passo falhar, rollback inclui uso do convite.
- [ ] **Step 4: confirmação pública mínima.** Retornar somente protocolo e "Solicitação recebida" ou "Aguardando triagem"; não expor outras solicitações, times internos, usuários da operação, links de administração ou relatórios. Para acompanhamento posterior, o convidado recebe e-mail ao endereço já verificado com referência e orientação, sem abrir lista global ou link de ticket interno.
- [ ] **Step 5: commit.** `npm test` com integração PostgreSQL teste, asserts de single-use/rollback e garantia de nenhum caminho de leitura externo para `api/requests`. Commit: `feat(public): atomic guest submissions`.

## Task 7: UI de compartilhamento, revogação e segurança de lançamento

**Files:** Create `src/features/forms/SharePanel.tsx`, `docs/operations/public-links-runbook.md`, testes Playwright (se incluídos na stack de QA). Modify `src/features/forms/FormBuilder.tsx` e `README.md`.

- [ ] **Step 1: criar painel de compartilhamento.** Admin seleciona formulário publicado e habilitado, informa e-mail do convidado, escolhe validade dentro do limite, gera link único, copia no clique; lista convites com status ativo/usado/expirado/revogado e botão **Revogar**. Nunca mostrar link com segredo já emitido em listagens.
- [ ] **Step 2: fluxo público responsivo.** Tela branca e laranja no padrão ST1 com título do formulário, perguntas condicionais, validação em linha, solicitação de código enviada ao endereço convidado (e-mail mascarado após validação permitida), revisão do compartilhamento com área responsável, confirmação do envio e protocolo. Sem navbar de Admin.
- [ ] **Step 3: segurança de rota e conteúdo.** Rate limit persistente por hash de token e IP (HMAC com pepper rotacionável, sem IP cru no banco), CSRF por Origin para envios, limite de payload 20 KiB, sanitização de link, no-store, proteção contra brute-force do OTP, mensagem genérica para convite inválido, CSP compatível. Anexos permanecem desativados até scanner/limites de mídia privados aprovados.
- [ ] **Step 4: teste E2E.** Conta Admin gera link → convidado recebe link → abre formulário sem login → recebe OTP → valida → responde → vê protocolo → segunda tentativa falha → Admin vê histórico e revoga um novo convite → link revogado falha. Testar também logout do Admin, manipulação manual de rotas, dispositivos móveis e proteção de PII.
- [ ] **Step 5: registrar aceites e liberar gradualmente.** `npm test && npm run build`; Vercel Preview com provedores sandbox, checagem de abuso, aprovações do BI e validação de destinatários externos. Abrir somente modelos explicitamente marcados como compartilháveis; não liberar catálogos amplos. Commit: `docs(qa): controlled external forms go-live`.

## Definition of Done

- [ ] Links individuais, uso único por padrão, escopo fixo, validade e revogação real.
- [ ] Token bruto existe apenas no link emitido e na memória da página; hash no banco.
- [ ] Prova de posse do contato por e-mail; sem e-mail verificável, não permitir submissão.
- [ ] Envio gera solicitação atômica com protocolo; visitantes externos não recebem acesso ao painel.
- [ ] Nenhum leak em referrer, logs, cookies JS ou relatórios.
- [ ] Testes de concorrência, abuso, OTP, expiração e permissão concluídos.
- [ ] Interface rápida em mobile e aceite formal antes de compartilhar com a equipe.
