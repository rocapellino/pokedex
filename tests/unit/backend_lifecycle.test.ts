import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../');

test('🛡️ Backend Lifecycle: closeStorage y setShuttingDownForTest gestionan el estado de apagado grácil', async () => {
  const dbMod: any = fs.existsSync(path.join(ROOT_DIR, 'apps/backend/src/services/db.js'))
    ? await import('../../apps/backend/src/services/db.js')
    : await import('../../apps/backend/src/services/db.ts');
  const { closeStorage } = dbMod;
  assert.equal(typeof closeStorage, 'function', 'closeStorage debe ser una función exportada');

  // closeStorage debe ser idempotente y resolver sin error
  await assert.doesNotReject(async () => {
    await closeStorage();
  }, 'closeStorage debe resolver limpiamente sin arrojar errores');

  const serverMod: any = fs.existsSync(path.join(ROOT_DIR, 'apps/backend/server.js'))
    ? await import('../../apps/backend/server.js')
    : await import('../../apps/backend/server.ts');
  const { getLifecycleStatus, setShuttingDownForTest } = serverMod;
  assert.equal(typeof getLifecycleStatus, 'function', 'getLifecycleStatus debe ser una función');
  assert.equal(typeof setShuttingDownForTest, 'function', 'setShuttingDownForTest debe ser una función');

  // Inicialmente no está apagando
  assert.equal(getLifecycleStatus().isShuttingDown, false);

  // Simular transición a apagado
  setShuttingDownForTest(true);
  assert.equal(getLifecycleStatus().isShuttingDown, true);

  // Restaurar estado
  setShuttingDownForTest(false);
  assert.equal(getLifecycleStatus().isShuttingDown, false);
});
