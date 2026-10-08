/**
 * ==============================================================================
 * Autenticación del endpoint /metrics (AUD-SEC-OBS-001)
 * ==============================================================================
 *
 * La restricción por CIDR de nginx no protege `/metrics` detrás del ingress: nginx ve como origen
 * al pod del ingress controller, que cae dentro de la subred permitida. Con `METRICS_BEARER_TOKEN`
 * definido, la propia API exige `Authorization: Bearer <token>`, venga la petición por donde venga.
 * Sin token configurado el endpoint conserva su comportamiento abierto (despliegue gradual: el
 * scraper debe recibir el token antes de que el servidor lo exija).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { app } from '../../apps/backend/server.js';
import { inspectEnvironment } from '../../apps/backend/src/config/startup-env-check.js';

const TOKEN = 'metrics-token-de-prueba-con-longitud-suficiente-0123456789';

async function withServer(token: string | undefined, run: (baseUrl: string) => Promise<void>): Promise<void> {
  const previous = process.env.METRICS_BEARER_TOKEN;
  if (token === undefined) delete process.env.METRICS_BEARER_TOKEN;
  else process.env.METRICS_BEARER_TOKEN = token;

  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  try {
    const { port } = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (previous === undefined) delete process.env.METRICS_BEARER_TOKEN;
    else process.env.METRICS_BEARER_TOKEN = previous;
  }
}

test('🔐 Metrics Auth: con token configurado, /metrics sin credenciales responde 401 con WWW-Authenticate', async () => {
  await withServer(TOKEN, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/metrics`);
    await response.arrayBuffer();

    assert.equal(response.status, 401);
    assert.equal(response.headers.get('www-authenticate'), 'Bearer realm="metrics"');
  });
});

test('🔐 Metrics Auth: un token incorrecto o con otro esquema se rechaza', async () => {
  await withServer(TOKEN, async (baseUrl) => {
    for (const header of [`Bearer ${TOKEN}x`, 'Bearer ', `Basic ${TOKEN}`, TOKEN, `bearer-${TOKEN}`]) {
      const response = await fetch(`${baseUrl}/metrics`, { headers: { Authorization: header } });
      await response.arrayBuffer();
      assert.equal(response.status, 401, `la cabecera "${header.slice(0, 12)}…" debió rechazarse`);
    }
  });
});

test('🔐 Metrics Auth: el token correcto devuelve las métricas en formato Prometheus', async () => {
  await withServer(TOKEN, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/metrics`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /text\/plain.*version=0\.0\.4/);
    assert.match(body, /^pokedex_/m);
  });
});

test('🔐 Metrics Auth: el token no se exige en /healthz ni /readyz (sondas de Kubernetes)', async () => {
  await withServer(TOKEN, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/healthz`);
    await response.arrayBuffer();
    assert.equal(response.status, 200);
  });
});

test('🔐 Metrics Auth: sin token configurado /metrics sigue abierto (despliegue gradual)', async () => {
  await withServer(undefined, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/metrics`);
    await response.arrayBuffer();
    assert.equal(response.status, 200);
  });
});

test('🔐 Metrics Auth: en producción sin token el arranque advierte que /metrics está abierto', () => {
  const saved = { env: process.env.NODE_ENV, token: process.env.METRICS_BEARER_TOKEN };
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.METRICS_BEARER_TOKEN;
    const withoutToken = inspectEnvironment();
    assert.ok(withoutToken.warnings.some((w) => w.includes('METRICS_BEARER_TOKEN')));
    assert.ok(
      !withoutToken.missingRequired.includes('METRICS_BEARER_TOKEN'),
      'el token es opcional: no aborta el arranque',
    );

    process.env.METRICS_BEARER_TOKEN = TOKEN;
    assert.ok(!inspectEnvironment().warnings.some((w) => w.includes('METRICS_BEARER_TOKEN')));
  } finally {
    if (saved.env === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = saved.env;
    if (saved.token === undefined) delete process.env.METRICS_BEARER_TOKEN;
    else process.env.METRICS_BEARER_TOKEN = saved.token;
  }
});
