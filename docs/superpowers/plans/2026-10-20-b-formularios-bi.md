# Fase B — Formulários inteligentes e portal do Squad de BI: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implantar catálogo de oito formulários do BI, fluxo curto de resposta, criação de chamado real compartilhado, triagem de dúvidas de escopo e editor de versões aprovado pelo Administrador.

**Architecture:** Usar a fundação PostgreSQL e as sessões server-side da Fase A. Template publicado possui versão imutável e um esquema declarativo de campos, validado novamente no servidor. Solicitações do BI geram ticket; dúvidas sobre responsabilidade geram registro de revisão, nunca ticket executável até classificação humana.

**Tech Stack:** React/TypeScript, Vite, Vercel Functions ESM, PostgreSQL com `pg`, Node Test Runner + `tsx`; CSS e componentes da identidade ST1 Connect.

**Pré-requisito:** Fase A concluída (banco, APIs autenticadas, idempotência, testes de cross-user).

**Spec:** `docs/superpowers/specs/2026-10-20-formularios-inteligentes-design.md`


> **Atualização de infraestrutura (21/10/2026):** a implementação operacional da Fase A utiliza o schema PostgreSQL privado `st1_bi` para evitar exposição pela Data API do Supabase. Os snippets SQL abaixo são exemplos de planejamento; ao implementar as fases seguintes, todos os objetos de dados devem ser qualificados como `st1_bi.nome_da_tabela` e as novas migrations devem seguir o modelo de isolamento e segurança descrito em `docs/operations/supabase-st1-connect-setup.md`. Não criar tabelas operacionais no schema `public`.
---

## Mapa de arquivos

| Arquivo | Finalidade |
| --- | --- |
| `db/migrations/002_forms.sql` | templates, versões e respostas |
| `api/_lib/forms-schema.js` | validação determinística de estrutura e respostas |
| `api/_lib/forms-schema.test.js` | testes de campos obrigatórios e condicionais |
| `api/_lib/forms-store.js` | comandos SQL parametrizados e publicação |
| `api/_lib/form-submission.js` | vínculo atômico entre resposta e solicitação |
| `api/forms/catalog.js` | GET catálogo publicado por papel |
| `api/forms/detail.js` | GET versão publicada por slug |
| `api/forms/admin.js` | criação, edição de draft, publicar, arquivar |
| `api/forms/submit.js` | POST autenticado, validação e idempotência |
| `scripts/seed-bi-forms.mjs` | biblioteca inicial idempotente |
| `src/features/forms/types.ts` | contrato tipado |
| `src/features/forms/CatalogPage.tsx` | catálogo curto e busca |
| `src/features/forms/FormWizard.tsx` | preenchimento contextual em 3 etapas |
| `src/features/forms/FormBuilder.tsx` | editor com visualização e publicação |
| `src/features/forms/form-visibility.ts` | regra de visibilidade sem eval |
| `src/features/forms/forms.test.ts` | testes de apresentação e condições |
| `src/features/forms/forms.css` | estilo responsivo |
| `src/App.tsx` | rotas e permissões de menu |
| `docs/operations/forms-acceptance.md` | QA de conteúdo, UX e versionamento |

## Task 1: Versionar modelo e resposta no banco

**Files:** Create `db/migrations/002_forms.sql`.

- [ ] **Step 1: teste SQL de vínculo a versão.** Num banco de teste migrado pela Fase A, tentar inserir resposta com `version_id` inexistente; deve falhar pela FK. Verificar também slug duplicado, número de versão repetido e impossibilidade de apontar para uma versão de template diferente, por validação transacional no serviço.
- [ ] **Step 2: escrever migração exata.**

~~~sql
-- db/migrations/002_forms.sql
CREATE TABLE form_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]{3,80}$'),
  title text NOT NULL,
  summary text NOT NULL,
  category text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('BI','REVIEW')),
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','published','archived')),
  published_version_id uuid,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE form_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES form_templates(id),
  version_number integer NOT NULL CHECK (version_number > 0),
  schema_json jsonb NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(template_id,version_number),
  UNIQUE(id,template_id)
);
ALTER TABLE form_templates
  ADD CONSTRAINT published_version_fk FOREIGN KEY(published_version_id,id)
  REFERENCES form_versions(id,template_id);
CREATE TABLE form_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid UNIQUE NOT NULL REFERENCES request_records(id),
  version_id uuid NOT NULL REFERENCES form_versions(id),
  answers jsonb NOT NULL,
  submitted_by_user_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX forms_submissions_version ON form_submissions(version_id,created_at DESC);
~~~

- [ ] **Step 3: rodar migrador e provar idempotência.** `DATABASE_URL="$DATABASE_URL_TEST" node db/migrate.mjs` duas vezes; esperado: ambas completam, uma linha por migração em `schema_migrations`. Commit: `feat(forms): versioned schemas and submissions`.

## Task 2: Definir contrato seguro dos campos

**Files:** Create `api/_lib/forms-schema.js`, `api/_lib/forms-schema.test.js`.

- [ ] **Step 1: testes vermelhos de formulários condicionais e entradas extras.**

~~~js
// api/_lib/forms-schema.test.js
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { validateSchema, validateAnswers } from './forms-schema.js';
const schema = { version: 1, fields: [
  { id:'sistema', label:'Sistema', type:'select', required:true,
    options:[{ value:'kommo', label:'Kommo' },{value:'bi',label:'BI'}] },
  { id:'painel', label:'Link do painel', type:'short', required:true,
    showIf:{ fieldId:'sistema', equals:'bi' } }
]};
test('não exige campo oculto', () => {
  assert.deepEqual(validateAnswers(schema, {sistema:'kommo'}), { sistema:'kommo' });
});
test('exige campo quando visível', () => {
  assert.throws(() => validateAnswers(schema, {sistema:'bi'}), /painel/);
});
test('rejeita opções inventadas', () => {
  assert.throws(() => validateAnswers(schema, {sistema:'marketing'}), /sistema/);
});
test('rejeita campo não publicado', () => {
  assert.throws(() => validateAnswers(schema, {sistema:'kommo',privilegio:'admin'}), /Campo não permitido/);
});
test('schema não aceita regra para campo posterior', () => {
  assert.throws(() => validateSchema({version:1,fields:[
    {id:'x',label:'X',type:'short',required:true,showIf:{fieldId:'y',equals:'sim'}},
    {id:'y',label:'Y',type:'select',required:true,options:[{value:'sim',label:'Sim'}]}
  ]}), /precedente/);
});
~~~

- [ ] **Step 2: implementar validação de esquema sem expressões executáveis.**

~~~js
// api/_lib/forms-schema.js
const kinds = new Set(['short','long','select','number','date']);
const validId = /^[a-z][a-z0-9_]{1,39}$/;
export function validateSchema(schema) {
  if (schema?.version !== 1 || !Array.isArray(schema.fields)
    || schema.fields.length < 1 || schema.fields.length > 20)
    throw new Error('Estrutura inválida');
  const previous = new Map();
  for (const field of schema.fields) {
    if (!validId.test(field.id) || previous.has(field.id) || !kinds.has(field.type)
      || typeof field.label !== 'string' || field.label.length < 3 || field.label.length > 100
      || typeof field.required !== 'boolean') throw new Error('Campo inválido');
    if (field.type === 'select') {
      if (!Array.isArray(field.options) || field.options.length < 2 || field.options.length > 15)
        throw new Error('Opções inválidas');
      if (field.options.some(o => typeof o.value !== 'string' || !validId.test(o.value)
        || typeof o.label !== 'string' || o.label.length < 1 || o.label.length > 80))
        throw new Error('Valor de opção inválido');
      if (new Set(field.options.map(o => o.value)).size !== field.options.length)
        throw new Error('Opção duplicada');
    }
    if (field.showIf) {
      const parent = previous.get(field.showIf.fieldId);
      if (!parent || parent.type !== 'select') throw new Error('Condição precisa de campo precedente');
      if (!parent.options.some(o => o.value === field.showIf.equals))
        throw new Error('Condição não corresponde às opções');
    }
    previous.set(field.id, field);
  }
  return schema;
}
~~~

- [ ] **Step 3: implementar validação de respostas com visibilidade e tipos.**

~~~js
// Acrescentar em api/_lib/forms-schema.js
export function validateAnswers(schema, input) {
  validateSchema(schema);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Respostas inválidas');
  const out = {};
  const fields = new Map(schema.fields.map(f => [f.id, f]));
  for (const key of Object.keys(input)) {
    if (!fields.has(key)) throw new Error('Campo não permitido: ' + key);
  }
  for (const field of schema.fields) {
    const shown = !field.showIf || out[field.showIf.fieldId] === field.showIf.equals;
    const value = input[field.id];
    if (!shown) {
      if (value !== undefined && value !== '' && value !== null) throw new Error('Campo não permitido: ' + field.id);
      continue;
    }
    if (value === undefined || value === null || value === '') {
      if (field.required) throw new Error('Campo obrigatório: ' + field.id);
      continue;
    }
    if (field.type === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Número inválido: ' + field.id);
    } else if (field.type === 'date') {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)
        || Number.isNaN(Date.parse(value + 'T00:00:00Z')))
        throw new Error('Data inválida: ' + field.id);
    } else {
      if (typeof value !== 'string' || value.length > (field.type === 'long' ? 5000 : 500))
        throw new Error('Texto inválido: ' + field.id);
      if (field.type === 'select' && !field.options.some(o => o.value === value))
        throw new Error('Opção inválida: ' + field.id);
    }
    out[field.id] = value;
  }
  return out;
}
~~~

- [ ] **Step 4: teste e commit.** `npm test` inclui os 5 casos e rejeita schema circular/injetável. Commit: `feat(forms): declarative conditional validation`.

## Task 3: Biblioteca inicial com oito formulários realmente úteis ao BI

**Files:** Create `scripts/seed-bi-forms.mjs` e `api/_lib/forms-store.js`.

- [ ] **Step 1: declarar os oito modelos com opções fechadas e pouca digitação.**

~~~js
// scripts/seed-bi-forms.mjs (definição exportável)
const short = (id, label) => ({id,label,type:'short',required:true});
const long = (id, label) => ({id,label,type:'long',required:true});
const choose = (id,label,options) => ({id,label,type:'select',required:true,
  options:options.map(v => ({value:v[0],label:v[1]}))});
export const templates = [
  {slug:'novo-dashboard',title:'Novo dashboard ou relatório',scope:'BI',fields:[
    long('decisao','Qual decisão o painel deve apoiar?'),
    short('publico','Quem vai utilizar?'),
    long('metricas','Quais métricas são necessárias?'),
    short('fonte','Em qual fonte estão os dados?'),
    choose('frequencia','Quando atualizar?', [['diario','Diariamente'],['semanal','Semanalmente'],['mensal','Mensalmente']])]},
  {slug:'ajuste-dashboard',title:'Ajuste em dashboard existente',scope:'BI',fields:[
    short('painel','Nome ou link do painel'),long('ajuste','O que precisa mudar?'),
    long('motivo','Qual problema isso resolve?'),short('exemplo','Exemplo ou referência')]},
  {slug:'divergencia-indicador',title:'Erro ou divergência em indicador',scope:'BI',fields:[
    short('painel','Painel e métrica'),short('periodo','Período e filtros'),
    short('observado','Valor observado'),short('referencia','Valor esperado ou referência')]},
  {slug:'extracao-dados',title:'Extração ou consulta de dados',scope:'BI',fields:[
    long('campos','Quais campos você precisa?'),short('periodo','Período/filtros'),
    long('finalidade','Para qual decisão?'),choose('formato','Formato',
      [['xlsx','Planilha'],['csv','CSV'],['painel','Painel']])]},
  {slug:'integracao-bases',title:'Integração entre bases de dados',scope:'BI',fields:[
    short('origem','Fonte de origem'),short('destino','Destino'),
    long('campos','Quais dados precisam circular?'),choose('frequencia','Frequência',
      [['tempo_real','Tempo real'],['diario','Diária'],['semanal','Semanal']])]},
  {slug:'automacao-bi',title:'Automação de dados/BI',scope:'BI',fields:[
    long('rotina','Como funciona hoje?'),short('gatilho','O que inicia a rotina?'),
    short('volume','Volume ou frequência'),long('resultado','Resultado esperado')]},
  {slug:'acesso-dado-bi',title:'Acesso a relatório do BI',scope:'BI',fields:[
    short('recurso','Qual relatório ou base?'),long('finalidade','Para que precisa?'),
    short('area','Qual área utilizará?'),short('aprovacao','Quem aprovou o acesso?')]},
  {slug:'orientacao-dados',title:'Orientação sobre dados',scope:'BI',fields:[
    short('assunto','Sobre qual dado?'),long('duvida','Qual é sua dúvida?'),
    long('decisao','O que pretende decidir?')]},
  {slug:'duvida-responsabilidade',title:'Não sei se é com BI',scope:'REVIEW',fields:[
    short('sistema','Sistema ou assunto'),long('objetivo','O que precisa ser resolvido?'),
    choose('tema','Tema principal',
      [['indicadores','Indicadores'],['crm','CRM'],['marketing','Marketing'],['rede','Rede/TI'],['processos','Processos internos']])]}
];
~~~

São oito formulários de BI **e um auxiliar de triagem**. O auxiliar não gera ticket executável do BI. Publicar modelos apenas após revisão editorial e da responsabilidade com liderança.

- [ ] **Step 2: tornar seeding idempotente.** Em `forms-store.js`, implementar `insertTemplateIfAbsent(db,model,actorId)` com `INSERT ... ON CONFLICT(slug) DO NOTHING`; criar `form_versions` versão 1 apenas se o slug acabou de ser inserido. Guardar `schema_json` como `{version:1,fields:model.fields}`, validar com `validateSchema`; iniciar estado `draft`. `seed-bi-forms.mjs` chama migrador, percorre templates com transação, e **não muda formulários editados** em reexecução.
- [ ] **Step 3: teste da biblioteca.** Validar cada estrutura com `validateSchema` e assert de nove slugs únicos, oito `scope='BI'` e um `scope='REVIEW'`. Commit: `feat(forms): seed BI-specific request catalog`.

## Task 4: Publicação, edição e leitura de formulários no servidor

**Files:** Create `api/forms/catalog.js`, `api/forms/detail.js`, `api/forms/admin.js`, `api/_lib/forms-store.test.js`.

- [ ] **Step 1: teste de publicação imutável.** Criar no banco de teste um draft versão 1, publicar, editar; assert de versão 2 criada sem alterar o JSON da versão 1, e tentativa de atualização de versão publicada recusada. Testar que Técnico/Solicitante e Administrador sem membership BI recebem 403 em endpoints administrativos.
- [ ] **Step 2: implementar leitura autenticada.**

~~~js
// api/forms/catalog.js
import { currentPrincipal } from '../_lib/identity.js';
import { connection } from '../_lib/db.js';
import { sendError } from '../_lib/http.js';
export default async function handler(req, res) {
  res.setHeader('Cache-Control','no-store');
  try {
    await currentPrincipal(req);
    if (req.method !== 'GET') return res.status(405).end();
    const data = await connection().query(
      "SELECT slug,title,summary,category,scope FROM form_templates WHERE state='published' ORDER BY title"
    );
    return res.json({items:data.rows});
  } catch(error) { return sendError(res,error); }
}
~~~

`api/forms/detail.js` recebe slug no parâmetro validado `/^[a-z0-9-]{3,80}$/` e consulta `form_templates` JOIN `form_versions` pelo `published_version_id`. Nunca retorna versões internas não publicadas para Solicitante.

- [ ] **Step 3: editor restrito e publicação transacional.** Em `api/forms/admin.js` aceitar POST `{action:'create',title,slug,scope,schema}`, `{action:'revise',templateId,schema}`, `{action:'publish',templateId,versionId}` e `{action:'archive',templateId}`. Validar `currentPrincipal.role==='Administrador'` **e membership BI ativo** pelo servidor, `validWriteOrigin` e `validateSchema`; usar ``inTransaction` e SQL parametrizado. Para `publish` consultar versão e confirmar `version.template_id===templateId` antes de atualizar `published_version_id` e `state`; registrar `audit_log`.
- [ ] **Step 4: resultado dos testes.** Sem login → 401; sem papel → 403; template arquivado → 404 no catálogo; nova versão publicada não altera antiga. Commit: `feat(api): protect form lifecycle`.

## Task 5: Submissão atômica da resposta com solicitação BI ou revisão

**Files:** Create `api/_lib/form-submission.js`, `api/_lib/form-submission.test.js`, `api/forms/submit.js`. Modify: `api/_lib/bi-service.js`.

- [ ] **Step 1: isolar a persistência já existente.** Extrair de `createBiRequest` (Fase A) a função reutilizável `createRequestRecord(db,actor,{title,topicKey,scope,details},key)`; ela centraliza sequência de protocolo, idempotência e registro de `request_events`. Para `scope==='BI'` cria `bi_tickets`; para `scope==='REVIEW'` **não cria**. O handler legado de BI continua passando o mesmo contrato e usando a função comum. Um único lugar gera protocolos.
- [ ] **Step 2: código de submissão com validação publicada.**

~~~js
// api/_lib/form-submission.js
import { validateAnswers } from './forms-schema.js';
import { createRequestRecord } from './bi-service.js';
export async function submitForm(db, user, slug, answers, key) {
  const rows = await db.query(
    "SELECT t.id,t.slug,t.title,t.scope,v.id AS version_id,v.schema_json FROM form_templates t JOIN form_versions v ON v.id=t.published_version_id WHERE t.slug=$1 AND t.state='published'",
    [slug],
  );
  const form = rows.rows[0];
  if (!form) throw Object.assign(new Error('Formulário não disponível'), {status:404});
  const valid = validateAnswers(form.schema_json, answers);
  const result = await createRequestRecord(db,user,{
    title: form.title,
    topicKey: form.slug,
    scope: form.scope,
    details: {answers:valid,versionId:form.version_id},
  },key);
  if (!result.repeated) await db.query(
    'INSERT INTO form_submissions(request_id,version_id,answers,submitted_by_user_id) VALUES($1,$2,$3::jsonb,$4)',
    [result.id,form.version_id,JSON.stringify(valid),user.id],
  );
  return result;
}
~~~

O POST `api/forms/submit.js` autentica a sessão, valida CSRF/Origin, limita o corpo a 20 KiB, exige `Idempotency-Key` e chama `inTransaction(db=>submitForm(db,user,slug,answers,key))`. Não permitir client informar scope/assignedUserId: ambos vêm do modelo publicado.

- [ ] **Step 3: testes antes de release.** Validar formulário incompleto → 400 sem request, modelo não publicado → 404, submissão legítima BI cria request + ticket + answer, modelo REVIEW cria request + answer sem ticket BI, refresh/retry mantém protocolo único, resposta antiga preserva sua versão. Commit: `feat(forms): atomic published-form submission`.

## Task 6: Catálogo com preenchimento rápido e perguntas condicionais

**Files:** Create `src/features/forms/types.ts`, `src/features/forms/form-visibility.ts`, `src/features/forms/forms.test.ts`, `src/features/forms/CatalogPage.tsx`, `src/features/forms/FormWizard.tsx`, `src/features/forms/forms.css`. Modify: `src/App.tsx`.

- [ ] **Step 1: teste de condições e normalização.**

~~~ts
// src/features/forms/forms.test.ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { isVisible, normalizeSearch } from './form-visibility';
test('campo depende da resposta anterior', () => {
  const field = {showIf:{fieldId:'tipo',equals:'dash'}};
  assert.equal(isVisible(field,{tipo:'dash'}),true);
  assert.equal(isVisible(field,{tipo:'crm'}),false);
});
test('busca ignora acentos', () => assert.equal(normalizeSearch('Extração'), 'extracao'));
~~~

- [ ] **Step 2: helpers visuais e tipos.**

~~~ts
// src/features/forms/form-visibility.ts
export type Conditional = { showIf?: { fieldId: string; equals: string } };
export const isVisible = (field: Conditional, answers: Record<string, unknown>) =>
  !field.showIf || answers[field.showIf.fieldId] === field.showIf.equals;
export const normalizeSearch = (text: string) =>
  text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
~~~

Em `types.ts` declarar `FormField` com tipos short, long, select, number, date, required, options e showIf; `PublishedForm` com slug, título, versão ID e campos; e `SubmissionResult` {id,protocol,scope}.

- [ ] **Step 3: implementar catálogo.** `CatalogPage.tsx` busca `/api/forms/catalog`, mostra 8 cards BI, seção auxiliar "Não sei se é com BI", busca local sobre nome/descrição, estados vazio/carregamento/erro e botões acessíveis ≥44px. Sem links que apontem para API ou páginas inacabadas.
- [ ] **Step 4: wizard de 3 etapas.** `FormWizard.tsx` recebe slug, busca versão publicada, usa state `answers` e `isVisible`, apresenta um conjunto curto de perguntas, revisão e botão de envio. Gerar `crypto.randomUUID()` uma única vez por tentativa de formulário, repetir a mesma chave em retry. Após resposta 201/200 mostrar protocolo e botão para `Minhas solicitações`; se scope REVIEW, explicar "Aguardando análise de responsabilidade", não "BI está atendendo".
- [ ] **Step 5: ligar no app e testar.** Rota `#/solicitar` para catálogo, `#/formulario/:slug` para wizard e `#/formularios` para Admin; adaptar `readPage` para extrair o primeiro segmento da rota e carregar slug do hash sem deixar página não autorizada ativa. Rodar `npm test && npm run build` e teste móvel 390px. Commit: `feat(ui): fast BI request forms`.

## Task 7: Construtor de modelos para Administrador

**Files:** Create `src/features/forms/FormBuilder.tsx`, `src/features/forms/FormPreview.tsx`. Modify: `src/App.tsx` e `src/features/forms/forms.css`.

- [ ] **Step 1: teste de ações bloqueadas por papel.** `api/forms/admin.js` deve retornar 403 para Técnico/Solicitante em criação/edição/publicação/arquivo; qualquer mutação com templateVersionId inconsistente → 409.
- [ ] **Step 2: editor dividido em identificação, perguntas e publicação.** Criar/duplicar modelo draft, ordem de perguntas, seletor de obrigatório, editor de opções fechadas, regra showIf apontando apenas para select anterior, prévia real sem persistir respostas. Teclas e botões "subir/descer" para reordenar; não depender exclusivamente de drag and drop.
- [ ] **Step 3: fluxo seguro de publicação.** O frontend envia draft para `/api/forms/admin`, mostra resumo de mudanças, confirma "Publicar nova versão", exibe versionNumber e preserva registros anteriores. Ao arquivar, pedir confirmação de que novos envios serão impedidos; não apagar respostas existentes.
- [ ] **Step 4: aceitar com Admin e rejeitar com Solicitante.** Teste de edição, publicação, reabertura de rascunho, links quebrados, rotas manuais e integração de versão. Commit: `feat(forms): admin form builder and preview`.

## Task 8: Homologação e liberação do portal interno

**Files:** Create `docs/operations/forms-acceptance.md`. Modify `README.md`.

- [ ] **Step 1: executar jornada representativa.** Dois solicitantes independentes abrem divergência de indicador e um dashboard novo. Suas respostas aparecem nos respectivos protocolos; Supervisor BI visualiza ambos; Solicitante 1 não acessa o registro de Solicitante 2, mesmo por URL/API.
- [ ] **Step 2: executar jornada fora de escopo.** Abrir "Não sei se é com BI" sobre falha no Kommo; `scope=REVIEW` e **nenhuma linha nova em bi_tickets**. Não encaminhar para fora automaticamente antes da Fase C.
- [ ] **Step 3: validar UX com 3 usuários reais em ambiente de teste.** Medir número de cliques até o formulário e duração de preenchimento; registrar gargalos; critérios-alvo: até 2 cliques e menos de 90 segundos para caso simples, sem eliminar campos necessários à compreensão.
- [ ] **Step 4: encerrar release.** Todos os testes antigos e novos verdes, `npm run build` pronto, migração e seed em ambiente de teste, PR, Preview e aprovação da liderança. O portal interno pode ser liberado após assinatura de QA; **rotas de encaminhamento e externos permanecem desligadas até as fases seguintes**. Commit: `docs(qa): acceptance of BI forms and request flow`.

## Definition of Done

- [ ] Oito formulários BI e um de triagem auxiliar, todos com campos adequados e versionados.
- [ ] Qualquer resposta aceita gera registro auditável e protocolo compartilhado, sem duplicidade.
- [ ] Pedidos para triagem não entram no backlog executável do BI.
- [ ] Cada solicitante vê somente seus pedidos; Admin controla versões sem reescrever histórico.
- [ ] Autoria, e-mail e papel são derivados da sessão no servidor.
- [ ] Fluxo acessível e rápido no mobile, com erros, preview e confirmação factual.
- [ ] Build, unidade, integração e E2E aprovados antes de ativar internamente.
