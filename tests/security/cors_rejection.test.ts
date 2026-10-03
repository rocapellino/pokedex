/**
 * ==============================================================================
 * Respuesta ante un origen rechazado por CORS (AUD-SEC-CORS-002)
 * ==============================================================================
 *
 * El callback de `cors` rechazaba con un Error genérico que terminaba en el
 * handler global: respuesta 500 y stack completo en el log por cada petición
 * de un origen no autorizado. Un rechazo de política es un 403, no un fallo
 * del servidor.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { app } from '../../apps/backend/server.js';

test('🛡️ AUD-SEC-CORS-002: un origen no autorizado recibe 403 con código propio', async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  try {
    const { port } = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/healthz`, {
      headers: { Origin: 'http://evil.test' },
    });
    const body = (await response.json()) as { code?: string };

    assert.equal(response.status, 403);
    assert.equal(body.code, 'CORS_ORIGIN_REJECTED');
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
