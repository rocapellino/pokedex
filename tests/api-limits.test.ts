import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePaginationLimit,
  parsePaginationOffset,
  parsePagination,
  MAX_PAGE_SIZE,
  MAX_OFFSET,
} from '../apps/backend/src/utils/pagination.js';

test('🛡️ API Limits: parsePaginationLimit limita estrictamente al MAX_PAGE_SIZE de 100', () => {
  assert.equal(MAX_PAGE_SIZE, 100);
  assert.equal(parsePaginationLimit('100000000'), 100);
  assert.equal(parsePaginationLimit(500), 100);
  assert.equal(parsePaginationLimit(100), 100);
  assert.equal(parsePaginationLimit(50), 50);
  assert.equal(parsePaginationLimit(1), 1);
  assert.equal(parsePaginationLimit(0), 50); // fallback por default
  assert.equal(parsePaginationLimit(-20), 1); // no permite negativos menores a 1
  assert.equal(parsePaginationLimit('invalid'), 50);
  assert.equal(parsePaginationLimit(undefined), 50);
});

test('🛡️ API Limits: parsePaginationOffset limita estrictamente al MAX_OFFSET de 10000', () => {
  assert.equal(MAX_OFFSET, 10000);
  assert.equal(parsePaginationOffset('999999999'), 10000);
  assert.equal(parsePaginationOffset(50000), 10000);
  assert.equal(parsePaginationOffset(10000), 10000);
  assert.equal(parsePaginationOffset(50), 50);
  assert.equal(parsePaginationOffset(0), 0);
  assert.equal(parsePaginationOffset(-50), 0); // no permite offsets negativos
  assert.equal(parsePaginationOffset('not-a-number'), 0);
  assert.equal(parsePaginationOffset(undefined), 0);
});

test('🛡️ API Limits: parsePagination combina limit y offset correctamente', () => {
  const result = parsePagination({ limit: '200', offset: '500' });
  assert.deepEqual(result, { limit: 100, offset: 500 });

  const defaults = parsePagination({});
  assert.deepEqual(defaults, { limit: 50, offset: 0 });
});
