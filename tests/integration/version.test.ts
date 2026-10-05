import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app } from '../../apps/backend/server.js';
import { inspectEnvironment, checkRequiredEnvVars } from '../../apps/backend/src/config/startup-env-check.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../');
const PKG_VERSION = (JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf-8')) as { version: string }).version;

test('🛡️ APPS-002: el sentinel MigrationFailedError se exporta y conserva la causa', async () => {
  // El sentinel es lo que impide que un fallo de migracion degrade a memoria.
  // Si dejara de exportarse, el `catch` externo de connectPg no podria
  // distinguirlo de un fallo de conectividad y volveria a degradar en silencio.
  const pgPath = path.join(ROOT_DIR, 'apps/backend/src/services/postgres.ts');
  const pgJsPath = path.join(ROOT_DIR, 'apps/backend/src/services/postgres.js');
  const mod: any = fs.existsSync(pgJsPath)
    ? await import('../../apps/backend/src/services/postgres.js')
    : await import('../../apps/backend/src/services/postgres.ts');

  assert.equal(typeof mod.MigrationFailedError, 'function', 'MigrationFailedError debe exportarse');
  assert.ok(fs.existsSync(pgPath) || fs.existsSync(pgJsPath), 'El modulo de postgres debe existir');

  const cause = new Error('boom');
  const err = new mod.MigrationFailedError('fallo', { cause });
  assert.equal(err.name, 'MigrationFailedError');
  assert.ok(err instanceof Error, 'Debe seguir siendo instanceof Error');
  assert.equal(err.message, 'fallo');
  assert.equal(err.cause, cause, 'Debe conservar la causa original para diagnostico');
});

test('🛡️ APPS-002: produccion aborta ante fallo de migracion, no degrada a memoria', async () => {
  const src = fs.readFileSync(
    path.join(ROOT_DIR, 'apps/backend/src/services/postgres.ts'),
    'utf-8'
  );

  // 1. El sentinel debe re-lanzarse en el catch externo; si no, el fallback a
  //    memoria se tragaria el fallo y el fix seria cosmetico.
  //    Se exige que la guarda NO este neutralizada (&& false): una guarda
  //    presente pero inactiva pasaria un match laxo y no protegeria nada.
  assert.match(
    src,
    /if \(err instanceof MigrationFailedError\) \{\s*\n\s*isPgConnected = false;\s*\n\s*throw err;/,
    'El catch externo debe re-lanzar MigrationFailedError (sin condiciones que lo neutralicen) en vez de degradar a memoria'
  );
  assert.doesNotMatch(
    src,
    /if \(err instanceof MigrationFailedError\s*&&\s*/,
    'La guarda de re-lanzamiento no debe estar condicionada a una falsy: dejaria de ser fail-closed'
  );

  // 2. La rama de produccion debe existir explicitamente.
  assert.match(
    src,
    /if \(isProductionEnv\(\)\) \{\s*throw new MigrationFailedError\(/,
    'La rama de produccion debe lanzar MigrationFailedError'
  );

  // 3. El comportamiento tolerante debe conservar el warn para desarrollo.
  assert.match(
    src,
    /logger\.warn\('\[Storage: PostgreSQL\] Aviso al verificar\/aplicar migraciones Drizzle:/,
    'Desarrollo debe conservar el aviso tolerante de migraciones'
  );
});

test('🛡️ APPS-002: el arranque aborta el proceso si initStorage falla', () => {
  const src = fs.readFileSync(path.join(ROOT_DIR, 'apps/backend/server.ts'), 'utf-8');

  assert.match(
    src,
    /initStorage\(\)\.then\([\s\S]{0,900}\)\.catch\(/,
    'server.ts debe encadenar .catch() sobre initStorage()'
  );
  assert.match(
    src,
    /\.catch\([\s\S]{0,600}process\.exit\(1\);/,
    'El catch de arranque debe terminar con process.exit(1) (fail-closed)'
  );
});

test('🛡️ APPS-008: produccion exige PostgreSQL y acepta la alternativa POSTGRES_*', () => {
  // El snapshot DEBE cubrir TODAS las variables que el test modifica. Si una queda
  // fuera, se filtra al resto de la suite al restaurar (el `restore` la borra por
  // no estar en la lista), y tests posteriores que dependan de ella fallan de
  // forma inexplicable.
  const ENV_KEYS = [
    'NODE_ENV', 'DATABASE_URL', 'POSTGRES_HOST', 'POSTGRES_USER', 'POSTGRES_PASSWORD',
    'POSTGRES_DB', 'POSTGRES_PORT', 'REDIS_URL', 'REDIS_HOST', 'GEMINI_API_KEY',
    'ADMIN_API_KEY', 'ADMIN_SESSION_SECRET', 'CORS_ORIGINS',
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
    assert.equal(
      sinDb.valid,
      false,
      'APPS-008: produccion sin PostgreSQL debe considerarse invalido'
    );
    assert.ok(
      sinDb.missingRequired.includes('DATABASE_URL'),
      'APPS-008: DATABASE_URL / POSTGRES_* debe reportarse como faltante en produccion'
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
      'APPS-008: POSTGRES_HOST + POSTGRES_USER deben satisfacer el requisito de produccion'
    );
    assert.ok(
      !conPostgres.missingRequired.includes('DATABASE_URL'),
      'APPS-008: la alternativa POSTGRES_* no debe reportarse como faltante'
    );

    // 3. DATABASE_URL directa tambien es valida.
    delete process.env.POSTGRES_HOST;
    delete process.env.POSTGRES_USER;
    process.env.DATABASE_URL = 'postgresql://pg:5432/pokedex';
    assert.equal(
      inspectEnvironment().valid,
      true,
      'APPS-008: DATABASE_URL debe satisfacer el requisito por defecto'
    );

    // 4. En desarrollo la ausencia sigue siendo valida (fallback en memoria).
    process.env.NODE_ENV = 'development';
    delete process.env.DATABASE_URL;
    const dev = inspectEnvironment();
    assert.equal(
      dev.valid,
      true,
      'El fallback en memoria debe seguir siendo valido fuera de produccion'
    );
    assert.ok(
      dev.warnings.some((w) => w.includes('DATABASE_URL')),
      'En desarrollo debe emitirse el aviso de fallback a memoria'
    );
  } finally {
    restore();
  }
});

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

test('🏷️ VER-002: /version expone la versión semántica real de la SSOT, no un SHA', async () => {
  const prevEnv = { ...process.env };
  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 3000;

  try {
    // Simula el runtime de producción: APP_VERSION y GIT_SHA son independientes.
    const fakeSha = 'a'.repeat(40);
    process.env.APP_VERSION = PKG_VERSION;
    process.env.GIT_SHA = fakeSha;

    const res = await fetch(`http://127.0.0.1:${port}/version`);
    assert.equal(res.status, 200);
    const data = await res.json();

    // El valor expuesto debe ser exactamente el inyectado (SemVer de la SSOT).
    assert.equal(
      data.version,
      PKG_VERSION,
      `/version.version debe exponer APP_VERSION (${PKG_VERSION}), recibido: ${data.version}`
    );
    assert.match(data.version, /^\d+\.\d+\.\d+$/, `version debe ser SemVer, recibido: ${data.version}`);

    // git_sha debe seguir siendo el commit, no la versión.
    assert.equal(data.git_sha, fakeSha, '/version.git_sha debe exponer GIT_SHA sin sustituirlo por la versión');

    // Regresión VER-002: los dos campos son conceptualmente distintos.
    assert.notEqual(
      data.version,
      data.git_sha,
      '/version.version y /version.git_sha no deben exponer el mismo valor (conflación de metadatos)'
    );
  } finally {
    process.env = prevEnv;
    server.close();
  }
});

test('🏷️ VER-002: /version degrada a "unknown" en lugar de anunciar una versión ficticia', async () => {
  const prevEnv = { ...process.env };
  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 3000;

  try {
    // Sin metadatos de build (build local sin --build-arg).
    delete process.env.APP_VERSION;
    delete process.env.GIT_SHA;
    delete process.env.COMMIT_SHA;

    const res = await fetch(`http://127.0.0.1:${port}/version`);
    assert.equal(res.status, 200);
    const data = await res.json();

    assert.equal(data.version, 'unknown', 'Sin APP_VERSION el endpoint debe degradar a "unknown"');
    assert.equal(data.git_sha, 'unknown', 'Sin GIT_SHA el endpoint debe degradar a "unknown"');
    assert.notEqual(
      data.version,
      '1.0.0',
      'El endpoint no debe anunciar una versión semántica ficticia cuando no dispone de APP_VERSION'
    );
  } finally {
    process.env = prevEnv;
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
