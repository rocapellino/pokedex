import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ROOT_DIR } from '../helpers/repo.js';

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
  const src = fs.readFileSync(path.join(ROOT_DIR, 'apps/backend/src/services/postgres.ts'), 'utf-8');

  // 1. El sentinel debe re-lanzarse en el catch externo; si no, el fallback a
  //    memoria se tragaria el fallo y el fix seria cosmetico.
  //    Se exige que la guarda NO este neutralizada (&& false): una guarda
  //    presente pero inactiva pasaria un match laxo y no protegeria nada.
  assert.match(
    src,
    /if \(err instanceof MigrationFailedError\) \{\s*\n\s*isPgConnected = false;\s*\n\s*throw err;/,
    'El catch externo debe re-lanzar MigrationFailedError (sin condiciones que lo neutralicen) en vez de degradar a memoria',
  );
  assert.doesNotMatch(
    src,
    /if \(err instanceof MigrationFailedError\s*&&\s*/,
    'La guarda de re-lanzamiento no debe estar condicionada a una falsy: dejaria de ser fail-closed',
  );

  // 2. La rama de produccion debe existir explicitamente.
  assert.match(
    src,
    /if \(isProductionEnv\(\)\) \{\s*throw new MigrationFailedError\(/,
    'La rama de produccion debe lanzar MigrationFailedError',
  );

  // 3. El comportamiento tolerante debe conservar el warn para desarrollo.
  assert.match(
    src,
    /logger\.warn\('\[Storage: PostgreSQL\] Aviso al verificar\/aplicar migraciones Drizzle:/,
    'Desarrollo debe conservar el aviso tolerante de migraciones',
  );
});

test('🛡️ APPS-002: el arranque aborta el proceso si initStorage falla', () => {
  const src = fs.readFileSync(path.join(ROOT_DIR, 'apps/backend/server.ts'), 'utf-8');

  assert.match(
    src,
    /initStorage\(\)\s*\.then\([\s\S]{0,900}\)\s*\.catch\(/,
    'server.ts debe encadenar .catch() sobre initStorage()',
  );
  assert.match(
    src,
    /\.catch\([\s\S]{0,600}process\.exit\(1\);/,
    'El catch de arranque debe terminar con process.exit(1) (fail-closed)',
  );
});
