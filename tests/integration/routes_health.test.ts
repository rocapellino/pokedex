import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { setShuttingDownForTest } from '../../apps/backend/src/utils/lifecycle.js';
import { api, startApp, type RunningApp } from '../helpers/http-app.js';

let server: RunningApp;

before(async () => {
  server = await startApp();
});

after(async () => {
  setShuttingDownForTest(false);
  await server.close();
});

test('🩺 GET /healthz: responde 200 "healthy" en texto plano', async () => {
  const res = await api(server.baseUrl, '/healthz');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /text\/plain/);
  assert.equal(res.text.trim(), 'healthy');
});

test('🩺 GET /readyz: sin PostgreSQL conectado responde 503 "unready" con el estado del almacenamiento', async () => {
  const res = await api(server.baseUrl, '/readyz');
  assert.equal(res.status, 503);
  assert.equal(res.body.status, 'unready');
  assert.equal(res.body.postgres_connected, false);
  assert.ok(res.body.pokemons_count > 0, 'el modo degradado conserva el catálogo en memoria');
  assert.match(res.body.detail, /PostgreSQL/);
});

test('🩺 GET /readyz: durante el apagado grácil responde 503 "shutting_down" y se recupera después', async () => {
  setShuttingDownForTest(true);
  try {
    const res = await api(server.baseUrl, '/readyz');
    assert.equal(res.status, 503);
    assert.equal(res.body.status, 'shutting_down');
  } finally {
    setShuttingDownForTest(false);
  }
  assert.equal((await api(server.baseUrl, '/readyz')).body.status, 'unready');
});

test('🩺 La sonda de liveness no depende del apagado: /healthz sigue en 200 mientras /readyz da 503', async () => {
  setShuttingDownForTest(true);
  try {
    assert.equal((await api(server.baseUrl, '/healthz')).status, 200);
    assert.equal((await api(server.baseUrl, '/readyz')).status, 503);
  } finally {
    setShuttingDownForTest(false);
  }
});
