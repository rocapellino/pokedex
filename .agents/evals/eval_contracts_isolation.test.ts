/**
 * ==============================================================================
 * .agents/evals/eval_contracts_isolation.test.ts
 * ==============================================================================
 * Evaluación conductual: Aislamiento de Contratos Compartidos (@pokedex/contracts).
 *
 * Reglas evaluadas:
 *   1. Prohibición estricta de importar Zod en packages/contracts/ (AUD-DEP-ZOD-001).
 *   2. Ausencia de dependencias runtime en packages/contracts/package.json.
 *   3. Exportación canónica de tipos de dominio (Pokemon, API, Session).
 * ==============================================================================
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const CONTRACTS_DIR = path.join(ROOT_DIR, 'packages', 'contracts');

test('🤖 Eval Contratos: packages/contracts/ no importa zod bajo ninguna circunstancia (AUD-DEP-ZOD-001)', () => {
  const srcDir = path.join(CONTRACTS_DIR, 'src');
  assert.ok(fs.existsSync(srcDir), 'Directorio packages/contracts/src debe existir');

  const files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.ts'));
  assert.ok(files.length > 0, 'Debe haber archivos TypeScript en packages/contracts/src');

  for (const file of files) {
    const content = fs.readFileSync(path.join(srcDir, file), 'utf-8');
    assert.doesNotMatch(
      content,
      /from\s+['"]zod['"]/i,
      `packages/contracts/src/${file} no puede importar zod (viola AUD-DEP-ZOD-001)`,
    );
    assert.doesNotMatch(
      content,
      /import\(['"]zod['"]\)/i,
      `packages/contracts/src/${file} no puede realizar import dinámico de zod`,
    );
  }
});

test('🤖 Eval Contratos: packages/contracts/package.json declara 0 dependencias de runtime', () => {
  const pkgPath = path.join(CONTRACTS_DIR, 'package.json');
  assert.ok(fs.existsSync(pkgPath), 'packages/contracts/package.json debe existir');

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  assert.strictEqual(
    pkg.dependencies,
    undefined,
    'packages/contracts no debe declarar dependencies en package.json (tipos puros)',
  );
});

test('🤖 Eval Contratos: packages/contracts exporta los tipos canónicos de dominio requeridos', () => {
  const indexPath = path.join(CONTRACTS_DIR, 'src', 'index.ts');
  assert.ok(fs.existsSync(indexPath), 'packages/contracts/src/index.ts debe existir');

  const content = fs.readFileSync(indexPath, 'utf-8');
  assert.match(content, /export\s+\*\s+from\s+['"]\.\/pokemon(\.js)?['"]/, 'Debe exportar pokemon');
  assert.match(content, /export\s+\*\s+from\s+['"]\.\/api(\.js)?['"]/, 'Debe exportar api');
  assert.match(content, /export\s+\*\s+from\s+['"]\.\/session(\.js)?['"]/, 'Debe exportar session');
});
