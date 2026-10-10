import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { ROOT_DIR } from '../../helpers/repo.js';

const TESTS_DIR = path.join(ROOT_DIR, 'tests');

/**
 * AUD-TST-DIR-001: la raíz de `tests/` solo contiene directorios; cada test vive en el subdirectorio de su área
 * (pauta de ubicación de la skill `repo-testing`). Una excepción exige su justificación por escrito aquí, además
 * de la del PR y de la descripción del archivo en `scripts/test-surface/metadata*.ts`.
 */
const ROOT_EXCEPTIONS: Record<string, string> = {};

const isTestFile = (name: string) => /\.(test|spec)\.[cm]?[jt]s$/.test(name);

const rootFiles = () =>
  fs
    .readdirSync(TESTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);

test('🗂️ Ubicación de tests: la raíz de tests/ no contiene archivos de test fuera de las excepciones justificadas', () => {
  const loose = rootFiles().filter((name) => isTestFile(name) && !(name in ROOT_EXCEPTIONS));

  assert.deepStrictEqual(
    loose,
    [],
    `Mover a un subdirectorio de su área (ver la pauta de ubicación de repo-testing): ${loose.join(', ')}`,
  );
});

test('🗂️ Ubicación de tests: cada excepción de la raíz existe y lleva una justificación escrita', () => {
  const present = new Set(rootFiles());

  for (const [name, reason] of Object.entries(ROOT_EXCEPTIONS)) {
    assert.ok(present.has(name), `La excepción ${name} ya no existe en tests/: se retira de ROOT_EXCEPTIONS`);
    assert.ok(reason.trim().length > 0, `La excepción ${name} necesita una justificación`);
  }
});
