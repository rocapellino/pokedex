/**
 * Cableado fail-closed del arranque (APPS-002): `server.ts` debe terminar el proceso
 * si `initStorage()` rechaza. El comportamiento de `connectPg` (MigrationFailedError en
 * producción, tolerancia en desarrollo) lo verifica `postgres_fail_closed.test.ts`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ROOT_DIR } from '../helpers/repo.js';

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
