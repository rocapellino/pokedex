/**
 * ==============================================================================
 * Endurecimiento HTTP del servidor Express
 * ==============================================================================
 *
 * - X-XSS-Protection: el auditor XSS heredado de los navegadores se desactiva
 *   (`0`, recomendación OWASP); la defensa real es la CSP.
 * - Rate limiting: las rutas del fallback SPA y del backoffice aplicaban
 *   `globalRateLimiter` dos veces (a nivel de app y de ruta) sobre el mismo
 *   contador, de modo que cada petición consumía dos cupos y el límite efectivo
 *   era la mitad del declarado (300 por minuto).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { app } from '../../../apps/backend/server.js';

async function withServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  try {
    const { port } = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test('🛡️ HTTP Hardening: X-XSS-Protection desactiva el auditor heredado y la CSP sigue presente', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/healthz`);

    assert.equal(response.headers.get('x-xss-protection'), '0');
    assert.match(response.headers.get('content-security-policy') ?? '', /default-src 'self'/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  });
});

test('🛡️ HTTP Hardening: una petición al fallback SPA consume un solo cupo del limitador global', async () => {
  await withServer(async (baseUrl) => {
    // Con el cupo duplicado, el límite de 300/min se agotaba a las 150 peticiones.
    const requests = 200;
    let rejected = 0;
    for (let i = 0; i < requests; i++) {
      const response = await fetch(`${baseUrl}/ruta-spa-inexistente`);
      await response.arrayBuffer();
      if (response.status === 429) rejected++;
    }

    assert.equal(
      rejected,
      0,
      `${rejected} de ${requests} peticiones recibieron 429 con un límite declarado de 300/min`,
    );
  });
});
