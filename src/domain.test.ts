import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { createSeedData, effectiveDueAt, getSla, toCsv, transitionTicket, type Ticket } from './domain'

function fixture(): Ticket {
  return {
    ...createSeedData(new Date('2026-10-20T08:00:00.000Z')).tickets[0],
    status: 'Em atendimento',
    createdAt: '2026-10-20T08:00:00.000Z',
    updatedAt: '2026-10-20T08:00:00.000Z',
    dueAt: '2026-10-20T12:00:00.000Z',
    resolvedAt: null,
    pausedAt: null,
    pausedMs: 0,
    history: [],
  }
}

test('SLA pausa a contagem e acrescenta o tempo parado ao retomar', () => {
  const original = fixture()
  const paused = transitionTicket(original, 'Pendente', 'Aguardando retorno do solicitante.', new Date('2026-10-20T09:00:00.000Z'))
  assert.equal(getSla(paused, new Date('2026-10-20T11:00:00.000Z')).state, 'paused')
  assert.equal(getSla(paused, new Date('2026-10-20T11:00:00.000Z')).remainingMs, 3 * 3_600_000)
  const resumed = transitionTicket(paused, 'Em atendimento', '', new Date('2026-10-20T11:00:00.000Z'))
  assert.equal(resumed.pausedAt, null)
  assert.equal(resumed.pausedMs, 2 * 3_600_000)
  assert.equal(effectiveDueAt(resumed).toISOString(), '2026-10-20T14:00:00.000Z')
  assert.equal(getSla(resumed, new Date('2026-10-20T12:00:00.000Z')).remainingMs, 2 * 3_600_000)
  assert.equal(original.status, 'Em atendimento')
  assert.equal(original.history.length, 0)
})

test('pausas sucessivas acumulam apenas a duração de cada pendência', () => {
  const paused = transitionTicket(fixture(), 'Pendente', 'Aguardando disponibilidade.', new Date('2026-10-20T09:00:00.000Z'))
  const resumed = transitionTicket(paused, 'Em atendimento', '', new Date('2026-10-20T10:00:00.000Z'))
  const pausedAgain = transitionTicket(resumed, 'Pendente', 'Aguardando validação.', new Date('2026-10-20T11:00:00.000Z'))
  const resumedAgain = transitionTicket(pausedAgain, 'Em atendimento', '', new Date('2026-10-20T13:00:00.000Z'))
  assert.equal(resumedAgain.pausedMs, 3 * 3_600_000)
  assert.equal(effectiveDueAt(resumedAgain).toISOString(), '2026-10-20T15:00:00.000Z')
})

test('resolver durante uma pendência contabiliza a pausa e congela o SLA', () => {
  const paused = transitionTicket(fixture(), 'Pendente', 'Aguardando confirmação.', new Date('2026-10-20T09:00:00.000Z'))
  const resolved = transitionTicket(paused, 'Resolvido', 'Conexão restabelecida e validada.', new Date('2026-10-20T13:00:00.000Z'))
  assert.equal(resolved.pausedAt, null)
  assert.equal(resolved.pausedMs, 4 * 3_600_000)
  assert.equal(resolved.resolvedAt, '2026-10-20T13:00:00.000Z')
  assert.deepEqual(getSla(resolved, new Date('2026-10-20T13:00:00.000Z')), getSla(resolved, new Date('2026-11-20T13:00:00.000Z')))
  assert.equal(getSla(resolved).state, 'completed')
  assert.equal(getSla(resolved).tone, 'green')
  const closed = transitionTicket(resolved, 'Fechado', '', new Date('2026-10-20T14:00:00.000Z'))
  assert.equal(closed.resolvedAt, resolved.resolvedAt)
  assert.equal(getSla(closed).remainingMs, getSla(resolved).remainingMs)
})

test('pendência exige motivo, resolução exige solução e fechamento exige resolução', () => {
  assert.throws(() => transitionTicket(fixture(), 'Pendente', '   ', new Date('2026-10-20T09:00:00.000Z')), /motivo/)
  assert.throws(() => transitionTicket(fixture(), 'Resolvido', '', new Date('2026-10-20T09:00:00.000Z')), /solução/)
  assert.throws(() => transitionTicket(fixture(), 'Fechado', '', new Date('2026-10-20T09:00:00.000Z')), /resolvido/)
  assert.throws(() => transitionTicket(fixture(), 'Novo', '', new Date('2026-10-20T07:00:00.000Z')), /anterior/)
})

test('reabrir um chamado limpa a resolução e retoma a avaliação do prazo', () => {
  const resolved = transitionTicket(fixture(), 'Resolvido', 'Teste concluído.', new Date('2026-10-20T11:00:00.000Z'))
  const reopened = transitionTicket(resolved, 'Em atendimento', 'A falha voltou.', new Date('2026-10-20T13:00:00.000Z'))
  assert.equal(reopened.resolvedAt, null)
  assert.equal(getSla(reopened, new Date('2026-10-20T13:00:00.000Z')).state, 'overdue')
  assert.equal(getSla(resolved, new Date('2026-10-20T13:00:00.000Z')).state, 'completed')
})

test('SLA distingue prazo confortável, aviso e atraso sem alterar uma resolução tardia', () => {
  const ticket = fixture()
  assert.equal(getSla(ticket, new Date('2026-10-20T09:00:00.000Z')).state, 'ok')
  assert.equal(getSla(ticket, new Date('2026-10-20T10:00:00.000Z')).state, 'warning')
  assert.equal(getSla(ticket, new Date('2026-10-20T12:00:00.001Z')).state, 'overdue')
  const resolvedLate = transitionTicket(ticket, 'Resolvido', 'Ajuste finalizado.', new Date('2026-10-20T13:00:00.000Z'))
  assert.equal(getSla(resolvedLate).state, 'completed')
  assert.equal(getSla(resolvedLate).tone, 'red')
  assert.match(getSla(resolvedLate).label, /fora do prazo/)
})

test('CSV escapa aspas, delimitadores e quebras de linha e inclui BOM UTF-8', () => {
  const ticket = { ...fixture(), title: 'Ajustar "painel"; validar', description: 'Primeira linha\nSegunda linha' }
  const csv = toCsv([ticket])
  assert.ok(csv.startsWith('\uFEFFChamado;Título;'))
  assert.ok(csv.includes('"Ajustar ""painel""; validar"'))
  assert.ok(csv.includes('"Primeira linha\nSegunda linha"'))
  assert.ok(csv.includes('\r\n'))
})

test('CSV neutraliza fórmulas e sinais precedidos de espaços ou tabulações', () => {
  const ticket = { ...fixture(), title: '=1+1', requester: '  +SUM(A1:A2)', description: '\t@SUM(A1:A2)' }
  const csv = toCsv([ticket])
  assert.ok(csv.includes(";'=1+1;"))
  assert.ok(csv.includes(";'  +SUM(A1:A2);"))
  assert.ok(csv.endsWith("'\t@SUM(A1:A2)"))
  assert.ok(toCsv([{ ...fixture(), title: '-1+1' }]).includes(";'-1+1;"))
})
