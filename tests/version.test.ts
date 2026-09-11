import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../apps/backend/server.js';
import { inspectEnvironment, checkRequiredEnvVars } from '../apps/backend/src/config/startup-env-check.js';

test('📦 Endpoint /version expone metadata segura de la aplicación y base de datos', async () => {
  // Crear un mock de request para Express app
  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 3000;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/version`);
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.equal(data.app, 'pokedex');
    assert.ok(typeof data.version === 'string' && data.version.length > 0);
    assert.ok(typeof data.node_version === 'string' && data.node_version.startsWith('v'));
    assert.ok(typeof data.uptime_seconds === 'number' && data.uptime_seconds >= 0);
    assert.ok(data.database);
    assert.ok(['postgresql', 'memory'].includes(data.database.engine));
    assert.ok(typeof data.database.postgres_connected === 'boolean');
    assert.ok(['normal', 'degraded'].includes(data.database.mode));

    // Validar alias /api/v1/version
    const resAlias = await fetch(`http://127.0.0.1:${port}/api/v1/version`);
    assert.equal(resAlias.status, 200);
    const dataAlias = await resAlias.json();
    assert.equal(dataAlias.app, 'pokedex');
  } finally {
    server.close();
  }
});

test('🛡️ Startup Env Check: bypass transparente en entorno de tests', () => {
  const result = checkRequiredEnvVars();
  assert.equal(result.valid, true);
  assert.equal(result.missingRequired.length, 0);
});

test('🛡️ Startup Env Check: detecta variables requeridas faltantes en producción', () => {
  const prevEnv = { ...process.env };
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.ADMIN_API_KEY;
    delete process.env.ADMIN_SESSION_SECRET;
    delete process.env.CORS_ORIGINS;

    const result = inspectEnvironment();
    assert.equal(result.valid, false);
    assert.ok(result.missingRequired.includes('ADMIN_API_KEY'));
    assert.ok(result.missingRequired.includes('ADMIN_SESSION_SECRET'));
    assert.ok(result.missingRequired.includes('CORS_ORIGINS'));

    assert.throws(
      () => checkRequiredEnvVars({ throwOnError: true, logWarnings: false }),
      /ERROR DE ARRANQUE/
    );
  } finally {
    process.env = prevEnv;
  }
});

test('🛡️ Startup Env Check: pasa exitosamente en producción si variables críticas existen', () => {
  const prevEnv = { ...process.env };
  try {
    process.env.NODE_ENV = 'production';
    process.env.ADMIN_API_KEY = 'pokedex-super-admin-entropy-key-change-me'; // gitleaks:allow
    process.env.ADMIN_SESSION_SECRET = 'pokedex-internal-hmac-session-secret-entropy'; // gitleaks:allow
    process.env.CORS_ORIGINS = 'https://pokedex.local';

    const result = inspectEnvironment();
    assert.equal(result.valid, true);
    assert.equal(result.missingRequired.length, 0);
  } finally {
    process.env = prevEnv;
  }
});

test('🛡️ Startup Env Check: SKIP_ENV_CHECK=true NO bypasses validación en producción', () => {
  const prevEnv = { ...process.env };
  try {
    process.env.NODE_ENV = 'production';
    process.env.SKIP_ENV_CHECK = 'true';
    delete process.env.ADMIN_API_KEY;
    delete process.env.ADMIN_SESSION_SECRET;
    delete process.env.CORS_ORIGINS;

    assert.throws(
      () => checkRequiredEnvVars({ throwOnError: true, logWarnings: false }),
      /ERROR DE ARRANQUE/
    );
  } finally {
    process.env = prevEnv;
  }
});

test('🛡️ Startup Env Check: SKIP_ENV_CHECK=true sí permite bypass en entornos no productivos', () => {
  const prevEnv = { ...process.env };
  try {
    process.env.NODE_ENV = 'development';
    process.env.SKIP_ENV_CHECK = 'true';
    delete process.env.ADMIN_API_KEY;
    delete process.env.ADMIN_SESSION_SECRET;
    delete process.env.CORS_ORIGINS;

    const result = checkRequiredEnvVars({ throwOnError: true, logWarnings: false });
    assert.equal(result.valid, true);
    assert.equal(result.missingRequired.length, 0);
  } finally {
    process.env = prevEnv;
  }
});

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

