import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  calculateVersionsToPrune,
  generateMockPackageVersions,
  applyGhcrRetention,
  PackageVersion,
} from '../../scripts/ghcr-retention.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../');

test('📦 GHCR Retention: calculateVersionsToPrune conserva estrictamente los últimos N y marca el resto para purga', () => {
  const versions: PackageVersion[] = [
    {
      id: 1,
      name: 'sha256:1111',
      url: 'https://api.github.com/v1',
      created_at: '2026-09-10T10:00:00Z',
      updated_at: '2026-09-10T10:00:00Z',
    },
    {
      id: 2,
      name: 'sha256:2222',
      url: 'https://api.github.com/v2',
      created_at: '2026-09-15T10:00:00Z',
      updated_at: '2026-09-15T10:00:00Z',
    },
    {
      id: 3,
      name: 'sha256:3333',
      url: 'https://api.github.com/v3',
      created_at: '2026-09-18T10:00:00Z',
      updated_at: '2026-09-18T10:00:00Z',
    },
    {
      id: 4,
      name: 'sha256:4444',
      url: 'https://api.github.com/v4',
      created_at: '2026-09-19T10:00:00Z',
      updated_at: '2026-09-19T10:00:00Z',
    },
    {
      id: 5,
      name: 'sha256:5555',
      url: 'https://api.github.com/v5',
      created_at: '2026-09-01T10:00:00Z',
      updated_at: '2026-09-01T10:00:00Z',
    },
  ];

  // Caso normal: keep=3
  const result = calculateVersionsToPrune(versions, 3);
  assert.equal(result.keep.length, 3, 'Debe conservar exactamente 3 versiones');
  assert.equal(result.prune.length, 2, 'Debe marcar 2 versiones para purga');

  // Verificar que las conservadas son las más recientes (id 4, 3, 2)
  assert.deepEqual(
    result.keep.map((v) => v.id),
    [4, 3, 2],
    'Las versiones conservadas deben ser las de fechas más recientes'
  );
  assert.deepEqual(
    result.prune.map((v) => v.id),
    [1, 5],
    'Las versiones purgadas deben ser las más antiguas'
  );

  // Caso borde: lista vacía
  const emptyResult = calculateVersionsToPrune([], 3);
  assert.equal(emptyResult.keep.length, 0);
  assert.equal(emptyResult.prune.length, 0);

  // Caso borde: menos versiones que keep
  const fewResult = calculateVersionsToPrune(versions.slice(0, 2), 3);
  assert.equal(fewResult.keep.length, 2);
  assert.equal(fewResult.prune.length, 0);
});

test('📦 GHCR Retention: applyGhcrRetention ejecuta correctamente en modo simulación', async () => {
  const mockVersions = {
    pokedex: generateMockPackageVersions('pokedex', 5),
    'pokedex-api': generateMockPackageVersions('pokedex-api', 4),
  };

  const results = await applyGhcrRetention({
    simulate: true,
    keepCount: 3,
    packages: ['pokedex', 'pokedex-api'],
    mockVersions,
  });

  assert.equal(results.length, 2, 'Debe procesar los 2 paquetes solicitados');

  const pokedexResult = results.find((r) => r.packageName === 'pokedex');
  assert.ok(pokedexResult, 'Debe contener resultado para pokedex');
  assert.equal(pokedexResult.totalVersions, 5);
  assert.equal(pokedexResult.kept.length, 3);
  assert.equal(pokedexResult.pruned.length, 2);
  assert.equal(pokedexResult.deletedIds.length, 2);

  const apiResult = results.find((r) => r.packageName === 'pokedex-api');
  assert.ok(apiResult, 'Debe contener resultado para pokedex-api');
  assert.equal(apiResult.totalVersions, 4);
  assert.equal(apiResult.kept.length, 3);
  assert.equal(apiResult.pruned.length, 1);
  assert.equal(apiResult.deletedIds.length, 1);
});

test('🔒 GHCR Retention Workflow: Configuración de seguridad, permisos y parámetros de retención', () => {
  // 1. Workflow autónomo de retención ghcr-retention.yml
  const retentionWfPath = path.join(ROOT_DIR, '.github/workflows/ghcr-retention.yml');
  assert.ok(fs.existsSync(retentionWfPath), '.github/workflows/ghcr-retention.yml debe existir');

  const retentionWf = fs.readFileSync(retentionWfPath, 'utf-8');
  assert.ok(retentionWf.includes('packages: write'), 'Debe requerir permiso packages: write');
  assert.ok(retentionWf.includes('keep-n-tagged:'), 'Debe configurar keep-n-tagged');
  assert.ok(retentionWf.includes('delete-untagged: true'), 'Debe eliminar imágenes untagged');
  assert.ok(retentionWf.includes('workflow_dispatch:'), 'Debe admitir ejecución manual');
  assert.ok(retentionWf.includes('cron:'), 'Debe incluir schedule periódica');
  assert.ok(retentionWf.includes('workflow_run:'), 'Debe activarse tras publicación en CI/CD');

  // 2. ci.yml incorpora paso de retención en job publish
  const ciWfPath = path.join(ROOT_DIR, '.github/workflows/ci.yml');
  const ciWf = fs.readFileSync(ciWfPath, 'utf-8');
  assert.ok(
    ciWf.includes('dataaxiom/ghcr-cleanup-action'),
    'ci.yml debe incluir dataaxiom/ghcr-cleanup-action en job publish'
  );
  assert.ok(
    ciWf.includes('keep-n-tagged: 3'),
    'ci.yml debe fijar keep-n-tagged: 3 para retener solo los últimos 3'
  );

  // 3. package.json y Taskfile.yml exponen las tareas oficiales
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf-8'));
  assert.ok(packageJson.scripts['ghcr:retention'], 'package.json debe incluir script ghcr:retention');
  assert.ok(packageJson.scripts['ghcr:retention:dry-run'], 'package.json debe incluir script ghcr:retention:dry-run');

  const taskfile = fs.readFileSync(path.join(ROOT_DIR, 'Taskfile.yml'), 'utf-8');
  assert.ok(taskfile.includes('ghcr:retention:'), 'Taskfile.yml debe exponer ghcr:retention');
  assert.ok(taskfile.includes('ghcr:retention:dry-run:'), 'Taskfile.yml debe exponer ghcr:retention:dry-run');

  // 4. Documentación formal existe e indexada
  const docPath = path.join(ROOT_DIR, 'docs/operations/GHCR_RETENTION_POLICY.md');
  assert.ok(fs.existsSync(docPath), 'GHCR_RETENTION_POLICY.md debe existir');
  const readme = fs.readFileSync(path.join(ROOT_DIR, 'docs/README.md'), 'utf-8');
  assert.ok(readme.includes('GHCR_RETENTION_POLICY.md'), 'docs/README.md debe indexar GHCR_RETENTION_POLICY.md');
});
