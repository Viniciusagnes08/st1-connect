import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { classifyDatabaseError } from './health.js';

test('classifica erro de pooler por tenant sem vazar texto interno', () => {
  assert.equal(classifyDatabaseError({code:'XX000',message:'FATAL: tenant or user not found'}),'POOLER_TENANT');
});
test('classifica senha, rede e timeout', () => {
  assert.equal(classifyDatabaseError({code:'28P01',message:'password authentication failed'}),'AUTHENTICATION');
  assert.equal(classifyDatabaseError({code:'ENETUNREACH',message:'network unreachable'}),'NETWORK');
  assert.equal(classifyDatabaseError({code:'ETIMEDOUT',message:'timeout'}),'TIMEOUT');
});
test('classifica erro TLS e desconhecido sem expor segredo', () => {
  assert.equal(classifyDatabaseError({message:'certificate has expired'}),'TLS');
  assert.equal(classifyDatabaseError({message:'unknown secret',code:'XX000'}),'UNCLASSIFIED');
});
