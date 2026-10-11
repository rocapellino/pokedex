import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getCompleteTaskfileContent } from '../../helpers/taskfile.js';
import { ROOT_DIR } from '../../helpers/repo.js';
import {
  evaluateTagRetention,
  parseSemverTag,
  compareSemver,
  collectProtectedTags,
  generateMockTags,
  applyTagRetention,
  type GitTagRef,
} from '../../../scripts/tag-retention.ts';

function createMockTag(name: string, date: string, sha?: string): GitTagRef {
  return {
    name,
    sha: sha || `sha-${name.replace(/[^a-zA-Z0-9]/g, '')}-0000000000000000000000`,
    date,
    isAnnotated: true,
  };
}

test('🏷️ Tag Retention: 1. Cero tags no produce eliminaciones ni errores', () => {
  const result = evaluateTagRetention([], 5);
  assert.equal(result.kept.length, 0);
  assert.equal(result.pruned.length, 0);
  assert.equal(result.excluded.length, 0);
  assert.equal(result.protected.length, 0);
});

test('🏷️ Tag Retention: 2. Menos de cinco tags elegibles conserva todos y no elimina nada', () => {
  const tags: GitTagRef[] = [
    createMockTag('v1.3.0', '2026-10-01T10:00:00Z'),
    createMockTag('v1.2.0', '2026-09-01T10:00:00Z'),
    createMockTag('v1.1.0', '2026-08-01T10:00:00Z'),
  ];

  const result = evaluateTagRetention(tags, 5);
  assert.equal(result.kept.length, 3, 'Debe conservar los 3 tags');
  assert.equal(result.pruned.length, 0, 'No debe haber tags a purgar');
  assert.deepEqual(
    result.kept.map((i) => i.tag.name),
    ['v1.3.0', 'v1.2.0', 'v1.1.0'],
  );
});

test('🏷️ Tag Retention: 3. Exactamente cinco tags elegibles conserva los 5 y no elimina nada', () => {
  const tags: GitTagRef[] = [
    createMockTag('v1.5.0', '2026-10-05T10:00:00Z'),
    createMockTag('v1.4.0', '2026-10-04T10:00:00Z'),
    createMockTag('v1.3.0', '2026-10-03T10:00:00Z'),
    createMockTag('v1.2.0', '2026-10-02T10:00:00Z'),
    createMockTag('v1.1.0', '2026-10-01T10:00:00Z'),
  ];

  const result = evaluateTagRetention(tags, 5);
  assert.equal(result.kept.length, 5, 'Debe conservar exactamente 5 tags');
  assert.equal(result.pruned.length, 0, 'No debe purgar ningún tag');
  assert.deepEqual(
    result.kept.map((i) => i.tag.name),
    ['v1.5.0', 'v1.4.0', 'v1.3.0', 'v1.2.0', 'v1.1.0'],
  );
});

test('🏷️ Tag Retention: 4. Más de cinco tags elegibles conserva los 5 más recientes y marca el resto', () => {
  const tags: GitTagRef[] = [
    createMockTag('v1.8.0', '2026-10-08T10:00:00Z'),
    createMockTag('v1.7.0', '2026-10-07T10:00:00Z'),
    createMockTag('v1.6.0', '2026-10-06T10:00:00Z'),
    createMockTag('v1.5.0', '2026-10-05T10:00:00Z'),
    createMockTag('v1.4.0', '2026-10-04T10:00:00Z'),
    createMockTag('v1.3.0', '2026-10-03T10:00:00Z'),
    createMockTag('v1.2.0', '2026-10-02T10:00:00Z'),
    createMockTag('v1.1.0', '2026-10-01T10:00:00Z'),
  ];

  const result = evaluateTagRetention(tags, 5);
  assert.equal(result.kept.length, 5, 'Debe conservar exactamente 5');
  assert.equal(result.pruned.length, 3, 'Debe marcar 3 para purga');
  assert.deepEqual(
    result.kept.map((i) => i.tag.name),
    ['v1.8.0', 'v1.7.0', 'v1.6.0', 'v1.5.0', 'v1.4.0'],
    'Debe conservar los 5 más recientes por SemVer',
  );
  assert.deepEqual(
    result.pruned.map((i) => i.tag.name),
    ['v1.3.0', 'v1.2.0', 'v1.1.0'],
    'Debe purgar los 3 más antiguos',
  );
});

test('🏷️ Tag Retention: 5. Ordenación determinista SemVer 2.0 evita trampas alfabéticas', () => {
  // En orden alfabético: v1.100.0 < v1.2.0 y v1.10.0 < v1.9.0
  // SemVer real: v1.100.0 > v1.10.0 > v1.9.0 > v1.2.0
  const tags: GitTagRef[] = [
    createMockTag('v1.2.0', '2026-01-01T10:00:00Z'),
    createMockTag('v1.100.0', '2026-05-01T10:00:00Z'),
    createMockTag('v1.10.0', '2026-03-01T10:00:00Z'),
    createMockTag('v1.9.0', '2026-02-01T10:00:00Z'),
    createMockTag('v1.101.0', '2026-06-01T10:00:00Z'),
    createMockTag('v1.1.0', '2025-12-01T10:00:00Z'),
  ];

  const result = evaluateTagRetention(tags, 3);
  assert.equal(result.kept.length, 3);
  assert.deepEqual(
    result.kept.map((i) => i.tag.name),
    ['v1.101.0', 'v1.100.0', 'v1.10.0'],
    'Debe priorizar numéricamente 101, 100 y 10 sobre 9 y 2',
  );
  assert.deepEqual(
    result.pruned.map((i) => i.tag.name),
    ['v1.9.0', 'v1.2.0', 'v1.1.0'],
  );

  // Caso prerelease: v1.2.0 > v1.2.0-rc.1
  const verNormal = parseSemverTag('v1.2.0')!;
  const verRc = parseSemverTag('v1.2.0-rc.1')!;
  assert.ok(compareSemver(verNormal, verRc) > 0, 'v1.2.0 debe ser mayor que v1.2.0-rc.1');
});

test('🏷️ Tag Retention: 6. Excluye y preserva tags que no corresponden a releases SemVer administradas', () => {
  const tags: GitTagRef[] = [
    createMockTag('v1.5.0', '2026-10-05T10:00:00Z'),
    createMockTag('v1.4.0', '2026-10-04T10:00:00Z'),
    createMockTag('v1.3.0', '2026-10-03T10:00:00Z'),
    createMockTag('v1.2.0', '2026-10-02T10:00:00Z'),
    createMockTag('v1.1.0', '2026-10-01T10:00:00Z'),
    createMockTag('nightly-build-20261011', '2026-10-11T10:00:00Z'),
    createMockTag('beta-preview', '2026-10-09T10:00:00Z'),
    createMockTag('test-release-v1', '2026-10-08T10:00:00Z'),
  ];

  const result = evaluateTagRetention(tags, 3);
  assert.equal(result.kept.length, 3, 'Conserva top 3 elegibles');
  assert.equal(result.pruned.length, 2, 'Purga los otros 2 elegibles');
  assert.equal(result.excluded.length, 3, 'Excluye los 3 tags no SemVer');

  // Los excluidos nunca entran en pruned
  const prunedNames = result.pruned.map((i) => i.tag.name);
  assert.ok(!prunedNames.includes('nightly-build-20261011'));
  assert.ok(!prunedNames.includes('beta-preview'));
  assert.ok(!prunedNames.includes('test-release-v1'));

  // Registra el motivo de exclusión
  for (const item of result.excluded) {
    assert.ok(item.exclusionReason?.includes('SemVer'), 'Debe documentar motivo de exclusión');
  }
});

test('🏷️ Tag Retention: 7. Protege tags referenciados en GitOps y Helm aunque queden fuera del cupo', () => {
  const protectedMap = new Map<string, string>([
    ['v1.1.0', 'GitOps: targetRevision en app-proxmox-preprod.yaml'],
    ['v1.2.0', 'Helm: appVersion en Chart.yaml'],
  ]);

  const tags: GitTagRef[] = [
    createMockTag('v1.8.0', '2026-10-08T10:00:00Z'),
    createMockTag('v1.7.0', '2026-10-07T10:00:00Z'),
    createMockTag('v1.6.0', '2026-10-06T10:00:00Z'),
    createMockTag('v1.5.0', '2026-10-05T10:00:00Z'),
    createMockTag('v1.4.0', '2026-10-04T10:00:00Z'),
    createMockTag('v1.3.0', '2026-10-03T10:00:00Z'),
    createMockTag('v1.2.0', '2026-10-02T10:00:00Z'),
    createMockTag('v1.1.0', '2026-10-01T10:00:00Z'),
  ];

  const result = evaluateTagRetention(tags, 5, protectedMap);
  assert.equal(result.kept.length, 5, 'Conserva los top 5 elegibles');
  assert.equal(result.protected.length, 2, 'Conserva los 2 tags protegidos');
  assert.equal(result.pruned.length, 1, 'Solo v1.3.0 queda para purga');
  assert.equal(result.pruned[0].tag.name, 'v1.3.0');

  // Los tags protegidos no deben estar en pruned
  assert.ok(!result.pruned.some((i) => i.tag.name === 'v1.1.0'));
  assert.ok(!result.pruned.some((i) => i.tag.name === 'v1.2.0'));
  assert.ok(result.protected.some((i) => i.tag.name === 'v1.1.0'));
  assert.ok(result.protected.some((i) => i.tag.name === 'v1.2.0'));
});

test('🏷️ Tag Retention: 8. collectProtectedTags inspecciona correctamente los manifiestos reales', () => {
  const protectedMap = collectProtectedTags(ROOT_DIR);
  assert.ok(protectedMap.size >= 1, 'Debe detectar al menos una referencia protegida');

  // El targetRevision actual de GitOps o appVersion de Helm debe estar protegido
  const chartContent = fs.readFileSync(path.join(ROOT_DIR, 'infra/helm/pokedex/Chart.yaml'), 'utf8');
  const appVersionMatch = chartContent.match(/^appVersion:\s*["']?([^"'\s]+)["']?/m);
  if (appVersionMatch) {
    const expectedTag = `v${appVersionMatch[1]}`;
    assert.ok(protectedMap.has(expectedTag), `Debe proteger ${expectedTag} de Chart.yaml`);
  }
});

test('🏷️ Tag Retention: 9. applyTagRetention ejecuta correctamente en modo simulación', async () => {
  const mockTags = generateMockTags(8);
  const result = await applyTagRetention({
    simulate: true,
    keepCount: 5,
    mockTags,
  });

  assert.equal(result.totalFound, 8);
  assert.equal(result.keepCount, 5);
  assert.equal(result.kept.length, 5);
  assert.equal(result.excluded.length, 1, 'custom-build-test debe ser excluido');
  assert.equal(result.pruned.length, 2, 'Los 2 restantes elegibles son candidatos a purga');
  assert.equal(result.deletedTags.length, 2, 'En modo simulación/dry-run deletedTags registra los simulados');
  assert.equal(result.simulated, true);
  assert.equal(result.dryRun, true);
});

test('🔒 Tag Retention Workflow: Configuración de seguridad, permisos y parámetros de retención', () => {
  const workflowPath = path.join(ROOT_DIR, '.github/workflows/tag-retention.yaml');
  assert.ok(fs.existsSync(workflowPath), '.github/workflows/tag-retention.yaml debe existir');

  const content = fs.readFileSync(workflowPath, 'utf8');

  // Permisos mínimos
  assert.ok(content.includes('permissions:\n  contents: read'), 'Debe declarar contents: read a nivel superior');
  assert.ok(content.includes('contents: write'), 'El job prune-tags debe declarar contents: write');

  // Triggers requeridos
  assert.ok(content.includes('workflow_dispatch:'), 'Debe admitir ejecución manual workflow_dispatch');
  assert.ok(content.includes('default: true'), 'El modo dry_run debe ser true por defecto en inputs');
  assert.ok(content.includes('schedule:'), 'Debe incluir schedule periódico de seguridad');
  assert.ok(content.includes('workflow_run:'), 'Debe activarse tras release');
  assert.ok(
    content.includes('🏷️ Automated Semantic Release & Tag'),
    'El trigger workflow_run debe apuntar exactamente a release-tag.yaml',
  );

  // Concurrencia
  assert.ok(content.includes('concurrency:'), 'Debe definir grupo de concurrencia');
  assert.ok(content.includes('cancel-in-progress: false'), 'cancel-in-progress debe ser false para no interrumpir');

  // Pinning por SHA
  assert.ok(
    content.includes('actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1'),
    'actions/checkout debe estar pinned por SHA',
  );
  assert.ok(
    content.includes('actions/setup-node@820762786026740c76f36085b0efc47a31fe5020'),
    'actions/setup-node debe estar pinned por SHA',
  );

  // Delegación en script canónico
  assert.ok(content.includes('scripts/tag-retention.ts'), 'Debe invocar scripts/tag-retention.ts');
});

test('🔧 Tag Retention CLI & Tareas: package.json y Taskfile exponen la política', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
  assert.ok(packageJson.scripts['tags:retention'], 'package.json debe exponer tags:retention');
  assert.ok(packageJson.scripts['tags:retention:dry-run'], 'package.json debe exponer tags:retention:dry-run');

  const taskfile = getCompleteTaskfileContent(ROOT_DIR);
  assert.ok(taskfile.includes('tags:retention:'), 'Taskfile debe exponer tags:retention');
  assert.ok(taskfile.includes('tags:retention:dry-run:'), 'Taskfile debe exponer tags:retention:dry-run');
});

test('📚 Tag Retention Documentación: TAG_RETENTION_POLICY.md existe e indexada', () => {
  const docPath = path.join(ROOT_DIR, 'docs/operations/TAG_RETENTION_POLICY.md');
  assert.ok(fs.existsSync(docPath), 'TAG_RETENTION_POLICY.md debe existir');

  const readme = fs.readFileSync(path.join(ROOT_DIR, 'docs/README.md'), 'utf8');
  assert.ok(readme.includes('TAG_RETENTION_POLICY.md'), 'docs/README.md debe indexar TAG_RETENTION_POLICY.md');
});
