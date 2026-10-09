import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectEnvironment, checkRequiredEnvVars } from '../../apps/backend/src/config/startup-env-check.js';

test('🛡️ APPS-008: produccion exige PostgreSQL y acepta la alternativa POSTGRES_*', () => {
  // El snapshot DEBE cubrir TODAS las variables que el test modifica. Si una queda
  // fuera, se filtra al resto de la suite al restaurar (el `restore` la borra por
  // no estar en la lista), y tests posteriores que dependan de ella fallan de
  // forma inexplicable.
  const ENV_KEYS = [
    'NODE_ENV',
    'DATABASE_URL',
    'POSTGRES_HOST',
    'POSTGRES_USER',
    'POSTGRES_PASSWORD',
    'POSTGRES_DB',
    'POSTGRES_PORT',
    'REDIS_URL',
    'REDIS_HOST',
    'GEMINI_API_KEY',
    'ADMIN_API_KEY',
    'ADMIN_SESSION_SECRET',
    'CORS_ORIGINS',
  ] as const;
  // Estos tests NO pueden usar `process.env = prevEnv`: los tests vecinos de este
  // mismo archivo restauran el entorno REEMPLAZANDO el objeto completo
  // (`process.env = prevEnv`). Si este test capturara una referencia al objeto y
  // la mutara, el `finally` de aquellos restauraria una copia contaminada con
  // NODE_ENV=production, y "bypass transparente en entorno de tests" fallaria
  // aunque este test pasara.
  //
  // La solucion es capturar y restaurar una COPIA de los valores, mutando siempre
  // el objeto vivo: compatible tanto con restauracion por valor como por
  // reemplazo.
  const snapshot: Record<string, string | undefined> = {};
  for (const k of ENV_KEYS) snapshot[k] = process.env[k];

  const restore = () => {
    for (const k of ENV_KEYS) {
      if (snapshot[k] === undefined) delete process.env[k];
      else process.env[k] = snapshot[k];
    }
  };

  try {
    // 1. Sin ninguna configuracion de base de datos, produccion debe fallar.
    //    Sin esto, la API arrancaria en memoria y K8s la declararia Healthy.
    process.env.NODE_ENV = 'production';
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_HOST;
    delete process.env.POSTGRES_USER;

    const sinDb = inspectEnvironment();
    assert.equal(sinDb.valid, false, 'APPS-008: produccion sin PostgreSQL debe considerarse invalido');
    assert.ok(
      sinDb.missingRequired.includes('DATABASE_URL'),
      'APPS-008: DATABASE_URL / POSTGRES_* debe reportarse como faltante en produccion',
    );

    // 2. Regresion: la alternativa compuesta POSTGRES_* debe bastar en
    //    produccion. Antes de este fix, `isConfigured` no existia y la
    //    comprobacion vivia en la rama `else if`, que en produccion nunca se
    //    ejecuta: un despliegue valido con POSTGRES_* habria abortado al
    //    arrancar por una variable que si estaba configurada.
    //
    //    Se configuran tambien ADMIN_API_KEY, ADMIN_SESSION_SECRET y
    //    CORS_ORIGINS porque son requisitos de produccion preexistentes; sin
    //    ellos `valid` seria false por causas ajenas a APPS-008 y esta
    //    asercion no distinguiria un fallo real de un falso positivo.
    process.env.ADMIN_API_KEY = 'test-admin-key';
    process.env.ADMIN_SESSION_SECRET = 'x'.repeat(32);
    process.env.CORS_ORIGINS = 'https://pokedex.example.com';

    process.env.POSTGRES_HOST = 'pg-proxmox';
    process.env.POSTGRES_USER = 'pokedex';
    const conPostgres = inspectEnvironment();
    assert.equal(
      conPostgres.valid,
      true,
      'APPS-008: POSTGRES_HOST + POSTGRES_USER deben satisfacer el requisito de produccion',
    );
    assert.ok(
      !conPostgres.missingRequired.includes('DATABASE_URL'),
      'APPS-008: la alternativa POSTGRES_* no debe reportarse como faltante',
    );

    // 3. DATABASE_URL directa tambien es valida.
    delete process.env.POSTGRES_HOST;
    delete process.env.POSTGRES_USER;
    process.env.DATABASE_URL = 'postgresql://pg:5432/pokedex';
    assert.equal(inspectEnvironment().valid, true, 'APPS-008: DATABASE_URL debe satisfacer el requisito por defecto');

    // 4. En desarrollo la ausencia sigue siendo valida (fallback en memoria).
    process.env.NODE_ENV = 'development';
    delete process.env.DATABASE_URL;
    const dev = inspectEnvironment();
    assert.equal(dev.valid, true, 'El fallback en memoria debe seguir siendo valido fuera de produccion');
    assert.ok(
      dev.warnings.some((w) => w.includes('DATABASE_URL')),
      'En desarrollo debe emitirse el aviso de fallback a memoria',
    );
  } finally {
    restore();
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

    assert.throws(() => checkRequiredEnvVars({ throwOnError: true, logWarnings: false }), /ERROR DE ARRANQUE/);
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
    process.env.DATABASE_URL = 'postgresql://127.0.0.1:5432/pokedex';

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

    assert.throws(() => checkRequiredEnvVars({ throwOnError: true, logWarnings: false }), /ERROR DE ARRANQUE/);
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
