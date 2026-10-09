import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../../apps/backend/server.js';

test('🛡️ Seguridad Express: Middleware inyecta cabeceras CSP, Permissions-Policy, nosniff y Referrer-Policy', async () => {
  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 3000;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/version`);
    assert.equal(res.status, 200);

    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    assert.equal(res.headers.get('cross-origin-opener-policy'), 'same-origin');
    assert.equal(res.headers.get('cross-origin-resource-policy'), 'same-origin');
    assert.ok(res.headers.get('content-security-policy')?.includes("default-src 'self'"));
    assert.ok(res.headers.get('permissions-policy')?.includes('camera=()'));
    assert.ok(res.headers.get('x-request-id'));
  } finally {
    server.close();
  }
});

test('🔍 Observabilidad: requestTracer genera y propaga X-Request-Id para correlación de trazas', async () => {
  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 3000;

  try {
    // 1. Petición sin X-Request-Id genera un identificador UUID automático
    const resAuto = await fetch(`http://127.0.0.1:${port}/healthz`);
    assert.equal(resAuto.status, 200);
    const autoId = resAuto.headers.get('x-request-id');
    assert.ok(autoId && autoId.length >= 16);

    // 2. Petición con X-Request-Id preexistente lo preserva y propaga
    const customTraceId = 'trace-corr-test-12345';
    const resPropagated = await fetch(`http://127.0.0.1:${port}/healthz`, {
      headers: { 'X-Request-Id': customTraceId },
    });
    assert.equal(resPropagated.status, 200);
    assert.equal(resPropagated.headers.get('x-request-id'), customTraceId);
  } finally {
    server.close();
  }
});
