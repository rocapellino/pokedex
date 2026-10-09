import test from 'node:test';
import assert from 'node:assert/strict';
import { ok, err, tryCatch, fromPromise } from '../../apps/backend/src/utils/result.js';

test('🧩 Functional [Result]: ok, err, tryCatch y transformaciones algebraicas', async () => {
  // Test Ok
  const resOk = ok(42);
  assert.equal(resOk.isOk(), true);
  assert.equal(resOk.isErr(), false);
  assert.equal(resOk.map((x) => x * 2).unwrap(), 84);
  assert.equal(resOk.unwrapOr(0), 42);

  // Test Err
  const resErr = err<number>(new Error('Fallo simulado'));
  assert.equal(resErr.isOk(), false);
  assert.equal(resErr.isErr(), true);
  assert.equal(resErr.unwrapOr(999), 999);
  assert.throws(() => resErr.unwrap(), /Intentando desenvolver un Err no controlado/);

  // Test tryCatch
  const caughtOk = tryCatch(() => JSON.parse('{"valid":true}'));
  assert.equal(caughtOk.isOk(), true);
  const caughtErr = tryCatch(() => JSON.parse('invalid json'));
  assert.equal(caughtErr.isErr(), true);

  // Test fromPromise
  const promiseOk = await fromPromise(Promise.resolve('datos'));
  assert.equal(promiseOk.isOk(), true);
  assert.equal(promiseOk.unwrap(), 'datos');

  const promiseErr = await fromPromise(Promise.reject(new Error('Async error')));
  assert.equal(promiseErr.isErr(), true);
});
