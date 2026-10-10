import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildCatalog, checkDrift } from '../scripts/test-surface.js';
import type { Pokemon as BackendPokemon } from '../apps/backend/src/types.js';
import type { Pokemon as FrontendPokemon } from '../apps/frontend/src/types.js';
import { ROOT_DIR } from './helpers/repo.js';

test('🛡️ Contratos de Tipos: compatibilidad estructural e interoperabilidad entre Backend y Frontend', () => {
  const sampleBackendPokemon: BackendPokemon = {
    id: 1,
    nombre: 'Bulbasaur',
    tipo: 'Planta',
    tipos: ['Planta', 'Veneno'],
    imagen: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/1.png',
    habilidades: ['Espesura'],
    caracteristicas: {
      peso: 6.9,
      altura: 0.7,
      fuerza: 49,
      edad: 2,
      categoria: 'Semilla',
      descripcion: 'Una rara semilla fue plantada en su espalda al nacer.',
    },
    stats: {
      hp: 45,
      attack: 49,
      defense: 49,
      sp_attack: 65,
      sp_defense: 65,
      speed: 45,
    },
  };

  const frontendView: FrontendPokemon = sampleBackendPokemon;
  assert.strictEqual(frontendView.id, 1);
  assert.strictEqual(frontendView.nombre, 'Bulbasaur');
  assert.strictEqual(frontendView.caracteristicas?.peso, 6.9);
  assert.strictEqual(frontendView.stats?.hp, 45);
});

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

test('🛡️ Contrato de Commits: commitlint.config.js y .pre-commit-config.yaml mantienen paridad estricta en sus tipos', () => {
  const rootDir = ROOT_DIR;
  const commitlintPath = path.join(rootDir, 'commitlint.config.js');
  const preCommitPath = path.join(rootDir, '.pre-commit-config.yaml');

  assert.ok(fs.existsSync(commitlintPath), 'commitlint.config.js debe existir');
  assert.ok(fs.existsSync(preCommitPath), '.pre-commit-config.yaml debe existir');

  const commitlintRaw = fs.readFileSync(commitlintPath, 'utf-8');
  assert.ok(commitlintRaw.includes("'type-enum'"), 'commitlint.config.js debe declarar la regla type-enum');
  const typeEnumBlock = commitlintRaw.slice(commitlintRaw.indexOf("'type-enum'"));
  const arrayStart = typeEnumBlock.indexOf('[');
  const innerArrayStart = typeEnumBlock.indexOf('[', arrayStart + 1);
  const innerArrayEnd = typeEnumBlock.indexOf(']', innerArrayStart);
  const commitlintTypes = typeEnumBlock
    .slice(innerArrayStart + 1, innerArrayEnd)
    .split(',')
    .map((t) => t.replace(/['"\s\r\n]/g, ''))
    .filter(Boolean);

  const preCommitRaw = fs.readFileSync(preCommitPath, 'utf-8');
  const preCommitMatch = preCommitRaw.match(/id:\s*conventional-pre-commit[\s\S]*?args:\s*\[(.*?)\]/);
  assert.ok(preCommitMatch, '.pre-commit-config.yaml debe declarar conventional-pre-commit con args');
  const preCommitTypes = preCommitMatch[1]
    .split(',')
    .map((t) => t.replace(/['"\s\r\n]/g, ''))
    .filter(Boolean);

  assert.deepEqual(
    commitlintTypes.sort(),
    preCommitTypes.sort(),
    'Los tipos de commit permitidos en commitlint.config.js y .pre-commit-config.yaml deben ser idénticos',
  );
  assert.ok(commitlintTypes.length >= 8, 'Debe haber al menos 8 tipos estándar configurados');
});
