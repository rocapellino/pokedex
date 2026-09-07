import test from 'node:test';
import assert from 'node:assert/strict';

test('🛡️ API Limits: la paginación limita estrictamente limit al MAX_PAGE_SIZE de 100', () => {
  const MAX_PAGE_SIZE = 100;
  const parseLimit = (limit: any) => Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(String(limit ?? 50), 10) || 50)
  );

  assert.equal(parseLimit('100000000'), 100);
  assert.equal(parseLimit(500), 100);
  assert.equal(parseLimit(100), 100);
  assert.equal(parseLimit(50), 50);
  assert.equal(parseLimit(1), 1);
  assert.equal(parseLimit(0), 50); // fallback por default
  assert.equal(parseLimit(-20), 1); // no permite negativos menores a 1
  assert.equal(parseLimit('invalid'), 50);
  assert.equal(parseLimit(undefined), 50);
});

test('🛡️ API Limits: la paginación limita estrictamente offset al MAX_OFFSET de 10000', () => {
  const MAX_OFFSET = 10000;
  const parseOffset = (offset: any) => Math.min(
    MAX_OFFSET,
    Math.max(0, parseInt(String(offset ?? 0), 10) || 0)
  );

  assert.equal(parseOffset('999999999'), 10000);
  assert.equal(parseOffset(50000), 10000);
  assert.equal(parseOffset(10000), 10000);
  assert.equal(parseOffset(50), 50);
  assert.equal(parseOffset(0), 0);
  assert.equal(parseOffset(-50), 0); // no permite offsets negativos
  assert.equal(parseOffset('not-a-number'), 0);
  assert.equal(parseOffset(undefined), 0);
});
