import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { buildCatalog, checkDrift } from '../../../scripts/test-surface.js';
import { ROOT_DIR } from '../../helpers/repo.js';

test('🛡️ Contrato de Superficie de Pruebas: el inventario test-surface.json y test-surface.md están sincronizados sin drift', () => {
  const rootDir = ROOT_DIR;
  const jsonPath = path.join(rootDir, 'docs', 'testing', 'test-surface.json');
  const mdPath = path.join(rootDir, 'docs', 'testing', 'test-surface.md');

  assert.ok(fs.existsSync(jsonPath), 'docs/testing/test-surface.json debe existir');
  assert.ok(fs.existsSync(mdPath), 'docs/testing/test-surface.md debe existir');

  const catalog = buildCatalog();
  const drift = checkDrift(catalog);

  assert.strictEqual(
    drift.hasDrift,
    false,
    `No debe existir drift en la superficie de testing (ejecutar npm run test:surface:update). Nuevos: ${drift.newFiles.join(', ') || '-'}; eliminados: ${drift.removedFiles.join(', ') || '-'}; con metadatos distintos: ${drift.changedFiles.join(', ') || '-'}; documentos desactualizados: ${drift.staleDocuments.join(', ') || '-'}`,
  );
  assert.strictEqual(
    drift.orphanFiles.length,
    0,
    `No debe haber tests huérfanos sin comandos asignados: ${drift.orphanFiles.join(', ')}`,
  );
});

test('🛡️ Contrato de Superficie de Pruebas: el catálogo versionado no contiene datos volátiles (editar un test no lo modifica)', () => {
  // AUD-TST-SRF-001: con hashes, líneas y conteos por archivo, cada edición de un test cambiaba docs/testing/ y los
  // PRs concurrentes chocaban entre sí. El catálogo versionado solo guarda lo que cambia al añadir, mover o borrar
  // un archivo, o al editar su descripción.
  const json = fs.readFileSync(path.join(ROOT_DIR, 'docs', 'testing', 'test-surface.json'), 'utf-8');
  const volatile = [
    'sha256',
    'lineCount',
    'sizeBytes',
    'testCount',
    'testCases',
    'generatedAt',
    'summary',
    'totalTestCases',
  ];
  assert.deepStrictEqual(
    volatile.filter((key) => json.includes(`"${key}"`)),
    [],
    'test-surface.json no debe versionar hashes, líneas, tamaños, conteos ni fecha de generación',
  );

  const markdown = fs.readFileSync(path.join(ROOT_DIR, 'docs', 'testing', 'test-surface.md'), 'utf-8');
  assert.doesNotMatch(
    markdown,
    /Última Sincronización|Líneas de Código|Total de Casos/,
    'test-surface.md no debe versionar métricas',
  );
});

test('🛡️ Contrato de Superficie de Pruebas: todo archivo de tests/ tiene una descripción propia y no la genérica', () => {
  const generic = buildCatalog()
    .files.filter((file) => file.description.startsWith('Suite de pruebas'))
    .map((file) => file.path);

  assert.deepStrictEqual(
    generic,
    [],
    `Añadir una entrada en scripts/test-surface/metadata*.ts para: ${generic.join(', ')}`,
  );
});
