/**
 * ==============================================================================
 * Resolución de zod en el monorepo (AUD-DEP-ZOD-001)
 * ==============================================================================
 * La raíz hoistea zod 3 (lo arrastra `lighthouse` vía `chromium-bidi`) y el backend usa zod 4 anidado
 * en `apps/backend/node_modules`. Mientras solo el backend importe zod, la resolución es correcta; si
 * otro paquete lo importara, resolvería zod 3 sin avisar y los esquemas se comportarían distinto.
 * ==============================================================================
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE_DIRS = ['apps', 'scripts', 'tests'];
const IMPORT_ZOD = /(?:from\s+|require\()\s*['"]zod(?:\/[^'"]*)?['"]/;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'coverage') return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|mts|cts|js|mjs|cjs)$/.test(entry.name) ? [full] : [];
  });
}

function zodMajorFrom(fromDir: string): number {
  const requireFrom = createRequire(path.join(fromDir, 'noop.js'));
  const manifest = requireFrom.resolve('zod/package.json');
  return Number(JSON.parse(fs.readFileSync(manifest, 'utf-8')).version.split('.')[0]);
}

test('📦 AUD-DEP-ZOD-001: el backend resuelve zod 4, la versión que declara', () => {
  const declared = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'apps/backend/package.json'), 'utf-8'));
  const declaredMajor = Number(/\d+/.exec(declared.dependencies.zod)?.[0]);
  assert.equal(declaredMajor, 4, 'apps/backend/package.json debe declarar zod 4');
  assert.equal(
    zodMajorFrom(path.join(ROOT_DIR, 'apps/backend/src')),
    declaredMajor,
    'El backend debe resolver la misma versión mayor de zod que declara, no la que hoistea la raíz',
  );
});

test('📦 AUD-DEP-ZOD-001: solo el backend importa zod; fuera de él resolvería la copia hoisteada', () => {
  const backendDir = path.join(ROOT_DIR, 'apps/backend') + path.sep;
  const outsiders = SOURCE_DIRS.flatMap((dir) => sourceFiles(path.join(ROOT_DIR, dir)))
    .filter((file) => !file.startsWith(backendDir))
    .filter((file) => IMPORT_ZOD.test(fs.readFileSync(file, 'utf-8')))
    .map((file) => path.relative(ROOT_DIR, file).split(path.sep).join('/'))
    .filter((file) => file !== 'tests/unit/zod_resolution.test.ts');

  assert.deepEqual(
    outsiders,
    [],
    'Estos archivos importan zod fuera del backend y resolverían la copia de la raíz (zod 3): declarar zod en su workspace',
  );
});
