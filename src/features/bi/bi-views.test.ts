import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { canDisplayQueue, stateTone, scopeLabel } from './bi-views';

test('a navegação esconde fila quando membership não está ativo', () => {
  assert.equal(canDisplayQueue(false), false);
  assert.equal(canDisplayQueue(true), true);
});

test('revisão e encaminhamento não aparecem como BI resolvido', () => {
  assert.equal(scopeLabel('REVIEW'), 'Aguardando triagem');
  assert.equal(scopeLabel('EXTERNAL'), 'Encaminhamento externo');
  assert.equal(stateTone('Pendente'),'warning');
  assert.equal(stateTone('Resolvido'),'done');
});
