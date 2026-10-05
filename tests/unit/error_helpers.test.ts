import { test } from 'node:test';
import assert from 'node:assert/strict';
import { errorMessage as backendErrorMessage } from '../../apps/backend/src/utils/errors.js';
import { errorMessage, errorStatus } from '../../apps/frontend/src/shared/errors.js';

test('errorMessage (backend): usa el mensaje de un Error y convierte otros valores a texto', () => {
  assert.equal(backendErrorMessage(new Error('fallo de red')), 'fallo de red');
  assert.equal(backendErrorMessage('texto plano'), 'texto plano');
  assert.equal(backendErrorMessage(42), '42');
  assert.equal(backendErrorMessage(null), 'null');
  assert.equal(backendErrorMessage(undefined), 'undefined');
});

test('errorMessage (frontend): usa el mensaje de un Error y convierte otros valores a texto', () => {
  assert.equal(errorMessage(new TypeError('tipo inválido')), 'tipo inválido');
  assert.equal(errorMessage('texto plano'), 'texto plano');
  assert.equal(errorMessage({ code: 1 }), '[object Object]');
});

test('errorStatus: devuelve el código HTTP solo si el error lo expone como número', () => {
  assert.equal(errorStatus(Object.assign(new Error('no autorizado'), { status: 401 })), 401);
  assert.equal(errorStatus({ status: 503 }), 503);
  assert.equal(errorStatus({ status: '401' }), undefined);
  assert.equal(errorStatus({}), undefined);
  assert.equal(errorStatus(new Error('sin status')), undefined);
  assert.equal(errorStatus(null), undefined);
  assert.equal(errorStatus('401'), undefined);
});
