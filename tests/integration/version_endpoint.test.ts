import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { app } from '../../apps/backend/server.js';
import { ROOT_DIR } from '../helpers/repo.js';

const PKG_VERSION = (JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf-8')) as { version: string })
  .version;

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
      `/version.version debe exponer APP_VERSION (${PKG_VERSION}), recibido: ${data.version}`,
    );
    assert.match(data.version, /^\d+\.\d+\.\d+$/, `version debe ser SemVer, recibido: ${data.version}`);

    // git_sha debe seguir siendo el commit, no la versión.
    assert.equal(data.git_sha, fakeSha, '/version.git_sha debe exponer GIT_SHA sin sustituirlo por la versión');

    // Regresión VER-002: los dos campos son conceptualmente distintos.
    assert.notEqual(
      data.version,
      data.git_sha,
      '/version.version y /version.git_sha no deben exponer el mismo valor (conflación de metadatos)',
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
      'El endpoint no debe anunciar una versión semántica ficticia cuando no dispone de APP_VERSION',
    );
  } finally {
    process.env = prevEnv;
    server.close();
  }
});
