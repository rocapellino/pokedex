import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getCompleteTaskfileContent } from '../../helpers/taskfile.js';
import { ROOT_DIR } from '../../helpers/repo.js';
import {
  evaluateHierarchicalTagRetention,
  parseSemverTag,
  compareSemver,
  collectProtectedTags,
  generateMockTags,
  applyTagRetention,
  DEFAULT_CONFIG,
  type GitTagRef,
} from '../../../scripts/tag-retention.ts';
import { collectReleasePinnedDigests } from '../../../scripts/ghcr-retention.ts';

function createMockTag(name: string, date?: string, sha?: string): GitTagRef {
  return {
    name,
    sha: sha || `sha-${name.replace(/[^a-zA-Z0-9]/g, '')}-0000000000000000000000`.slice(0, 40),
    date: date || '2026-10-11T12:00:00Z',
    isAnnotated: true,
  };
}

// =============================================================================
// 1. CLASIFICACIÓN Y ORDEN SEMVER
// =============================================================================

test('🏷️ Clasificación: parseSemverTag admite prefijo "v" opcional y preserva formato original', () => {
  const withV = parseSemverTag('v3.2.1');
  assert.ok(withV);
  assert.equal(withV.major, 3);
  assert.equal(withV.minor, 2);
  assert.equal(withV.patch, 1);
  assert.equal(withV.hasVPrefix, true);
  assert.equal(withV.raw, 'v3.2.1');

  const withoutV = parseSemverTag('3.2.1');
  assert.ok(withoutV);
  assert.equal(withoutV.major, 3);
  assert.equal(withoutV.minor, 2);
  assert.equal(withoutV.patch, 1);
  assert.equal(withoutV.hasVPrefix, false);
  assert.equal(withoutV.raw, '3.2.1');
});

test('🏷️ Orden SemVer: comparación correcta entre v1.9.0 y v1.10.0 (evita trampa alfabética)', () => {
  const v19 = parseSemverTag('v1.9.0')!;
  const v110 = parseSemverTag('v1.10.0')!;
  assert.ok(compareSemver(v110, v19) > 0, 'v1.10.0 debe ser semánticamente mayor que v1.9.0');
});

test('🏷️ Orden SemVer: comparación correcta entre v3.9.9 y v3.10.0', () => {
  const v399 = parseSemverTag('v3.9.9')!;
  const v3100 = parseSemverTag('v3.10.0')!;
  assert.ok(compareSemver(v3100, v399) > 0, 'v3.10.0 debe ser semánticamente mayor que v3.9.9');
});

test('🏷️ Clasificación: maneja líneas major y minor con huecos numéricos', () => {
  const tags: GitTagRef[] = [createMockTag('v1.1.0'), createMockTag('v4.5.1'), createMockTag('v4.1.0')];

  const result = evaluateHierarchicalTagRetention(tags, DEFAULT_CONFIG);
  assert.deepEqual(result.summary.selectedMajors, [4, 1]);
  assert.deepEqual(result.summary.selectedMinorsByMajor[4], [5, 1]);
  assert.equal(result.kept.length, 3);
});

test('🏷️ Clasificación: tags anotados y ligeros se procesan de forma idéntica', () => {
  const annotated = { ...createMockTag('v2.1.0'), isAnnotated: true };
  const lightweight = { ...createMockTag('v2.2.0'), isAnnotated: false };

  const result = evaluateHierarchicalTagRetention([annotated, lightweight], DEFAULT_CONFIG);
  assert.equal(result.kept.length, 2);
  assert.ok(result.kept.some((i) => i.tag.name === 'v2.1.0'));
  assert.ok(result.kept.some((i) => i.tag.name === 'v2.2.0'));
});

test('🏷️ Clasificación: versiones prerelease se excluyen de la retención y nunca se purgan', () => {
  const tags: GitTagRef[] = [createMockTag('v3.0.0'), createMockTag('v3.1.0-rc.1'), createMockTag('v3.1.0-beta.2')];

  const result = evaluateHierarchicalTagRetention(tags, DEFAULT_CONFIG);
  assert.equal(result.kept.length, 1);
  assert.equal(result.kept[0].tag.name, 'v3.0.0');
  assert.equal(result.excluded.length, 2);
  assert.equal(result.pruned.length, 0);

  for (const item of result.excluded) {
    assert.ok(item.exclusionReason?.includes('prerelease'));
    assert.equal(item.isEligible, false);
  }
});

test('🏷️ Clasificación: build metadata se parsea sin alterar precedencia de versión', () => {
  const normal = parseSemverTag('v2.1.0')!;
  const withBuild = parseSemverTag('v2.1.0+build.42')!;
  assert.ok(withBuild);
  assert.equal(withBuild.build, 'build.42');
  assert.equal(compareSemver(normal, withBuild), 0, 'Build metadata no altera precedencia SemVer');
});

test('🏷️ Clasificación: tags con formato no SemVer se excluyen y nunca se purgan', () => {
  const tags: GitTagRef[] = [
    createMockTag('v2.0.0'),
    createMockTag('nightly-20261011'),
    createMockTag('feature-branch-tag'),
    createMockTag('draft'),
  ];

  const result = evaluateHierarchicalTagRetention(tags, DEFAULT_CONFIG);
  assert.equal(result.kept.length, 1);
  assert.equal(result.excluded.length, 3);
  assert.equal(result.pruned.length, 0);

  for (const item of result.excluded) {
    assert.ok(item.exclusionReason?.includes('SemVer'));
  }
});

test('🏷️ Clasificación: versiones ambiguas con distinto SHA provocan detención segura', () => {
  const tags: GitTagRef[] = [
    createMockTag('v1.0.0', undefined, 'sha-1111111111111111111111111111111111111111'),
    createMockTag('1.0.0', undefined, 'sha-2222222222222222222222222222222222222222'),
  ];

  assert.throws(() => evaluateHierarchicalTagRetention(tags, DEFAULT_CONFIG), /Ambigüedad crítica detectada/);
});

// =============================================================================
// 2. RETENCIÓN JERÁRQUICA (OPCIÓN B)
// =============================================================================

test('🏷️ Retención: repositorio sin tags devuelve conjuntos vacíos sin errores', () => {
  const result = evaluateHierarchicalTagRetention([], DEFAULT_CONFIG);
  assert.equal(result.kept.length, 0);
  assert.equal(result.pruned.length, 0);
  assert.equal(result.excluded.length, 0);
  assert.equal(result.protected.length, 0);
});

test('🏷️ Retención: menos de dos líneas major conserva la única major disponible', () => {
  const tags: GitTagRef[] = [createMockTag('v1.1.0'), createMockTag('v1.2.0')];

  const result = evaluateHierarchicalTagRetention(tags, DEFAULT_CONFIG);
  assert.deepEqual(result.summary.selectedMajors, [1]);
  assert.equal(result.kept.length, 2);
  assert.equal(result.pruned.length, 0);
});

test('🏷️ Retención: exactamente dos líneas major conserva ambas', () => {
  const tags: GitTagRef[] = [createMockTag('v1.1.0'), createMockTag('v2.1.0')];

  const result = evaluateHierarchicalTagRetention(tags, DEFAULT_CONFIG);
  assert.deepEqual(result.summary.selectedMajors, [2, 1]);
  assert.equal(result.kept.length, 2);
  assert.equal(result.pruned.length, 0);
});

test('🏷️ Retención: más de dos líneas major conserva solo las dos más recientes', () => {
  const tags: GitTagRef[] = [createMockTag('v1.0.0'), createMockTag('v2.0.0'), createMockTag('v3.0.0')];

  const result = evaluateHierarchicalTagRetention(tags, { keepMajorCount: 2, keepMinorCount: 3, keepPatchCount: 1 });
  assert.deepEqual(result.summary.selectedMajors, [3, 2]);
  assert.equal(result.kept.length, 2);
  assert.equal(result.pruned.length, 1);
  assert.equal(result.pruned[0].tag.name, 'v1.0.0');
});

test('🏷️ Retención: menos de tres líneas minor en una major conserva todas las disponibles', () => {
  const tags: GitTagRef[] = [createMockTag('v2.1.0'), createMockTag('v2.2.0')];

  const result = evaluateHierarchicalTagRetention(tags, DEFAULT_CONFIG);
  assert.deepEqual(result.summary.selectedMinorsByMajor[2], [2, 1]);
  assert.equal(result.kept.length, 2);
  assert.equal(result.pruned.length, 0);
});

test('🏷️ Retención: exactamente tres líneas minor conserva las tres', () => {
  const tags: GitTagRef[] = [createMockTag('v2.1.0'), createMockTag('v2.2.0'), createMockTag('v2.3.0')];

  const result = evaluateHierarchicalTagRetention(tags, DEFAULT_CONFIG);
  assert.deepEqual(result.summary.selectedMinorsByMajor[2], [3, 2, 1]);
  assert.equal(result.kept.length, 3);
  assert.equal(result.pruned.length, 0);
});

test('🏷️ Retención: más de tres líneas minor purga las minors más antiguas', () => {
  const tags: GitTagRef[] = [
    createMockTag('v2.1.0'),
    createMockTag('v2.2.0'),
    createMockTag('v2.3.0'),
    createMockTag('v2.4.0'),
  ];

  const result = evaluateHierarchicalTagRetention(tags, DEFAULT_CONFIG);
  assert.deepEqual(result.summary.selectedMinorsByMajor[2], [4, 3, 2]);
  assert.equal(result.kept.length, 3);
  assert.equal(result.pruned.length, 1);
  assert.equal(result.pruned[0].tag.name, 'v2.1.0');
});

test('🏷️ Retención: línea minor con múltiples patches conserva solo el último patch disponible', () => {
  const tags: GitTagRef[] = [
    createMockTag('v2.1.0'),
    createMockTag('v2.1.1'),
    createMockTag('v2.1.4'),
    createMockTag('v2.1.2'),
  ];

  const result = evaluateHierarchicalTagRetention(tags, DEFAULT_CONFIG);
  assert.equal(result.kept.length, 1);
  assert.equal(result.kept[0].tag.name, 'v2.1.4');
  assert.equal(result.pruned.length, 3);
  assert.deepEqual(
    result.pruned.map((i) => i.tag.name),
    ['v2.1.2', 'v2.1.1', 'v2.1.0'],
  );
});

test('🏷️ Retención: caso de prueba canónico del usuario (árbol completo de versiones)', () => {
  // Lista exacta del prompt
  const names = [
    'v1.4.0',
    'v1.5.2',
    'v2.1.0',
    'v2.1.3',
    'v2.2.0',
    'v2.2.2',
    'v2.3.0',
    'v2.3.4',
    'v2.4.0',
    'v3.0.0',
    'v3.1.0',
    'v3.1.4',
    'v3.2.0',
    'v3.2.2',
    'v3.3.0',
    'v3.3.5',
    'v3.4.0',
    'v3.4.1',
  ];

  const tags = names.map((name) => createMockTag(name));
  const result = evaluateHierarchicalTagRetention(tags, DEFAULT_CONFIG);

  // Majors seleccionadas: 3 y 2
  assert.deepEqual(result.summary.selectedMajors, [3, 2]);

  // Minors de v3: v3.4.x, v3.3.x, v3.2.x -> últimos patches: v3.4.1, v3.3.5, v3.2.2
  assert.deepEqual(result.summary.selectedMinorsByMajor[3], [4, 3, 2]);

  // Minors de v2: v2.4.x, v2.3.x, v2.2.x -> últimos patches: v2.4.0, v2.3.4, v2.2.2
  assert.deepEqual(result.summary.selectedMinorsByMajor[2], [4, 3, 2]);

  // Total conservado: 6 tags exactos
  assert.equal(result.kept.length, 6);
  assert.deepEqual(
    result.kept.map((i) => i.tag.name),
    ['v3.4.1', 'v3.3.5', 'v3.2.2', 'v2.4.0', 'v2.3.4', 'v2.2.2'],
  );

  // Purgados: 12 tags restantes
  assert.equal(result.pruned.length, 12);
});

test('🏷️ Retención: conserva tags protegidos de GitOps aunque queden fuera de los límites de Major', () => {
  const protectedMap = new Map<string, string>([['v1.4.0', 'GitOps: targetRevision en app-proxmox-preprod.yaml']]);

  const tags: GitTagRef[] = [createMockTag('v1.4.0'), createMockTag('v2.1.0'), createMockTag('v3.1.0')];

  const result = evaluateHierarchicalTagRetention(tags, DEFAULT_CONFIG, protectedMap);
  // v3 y v2 en kept
  assert.equal(result.kept.length, 2);
  // v1.4.0 protegido
  assert.equal(result.protected.length, 1);
  assert.equal(result.protected[0].tag.name, 'v1.4.0');
  assert.equal(result.pruned.length, 0);
});

test('🏷️ Retención: idempotencia estricta (re-ejecutar sobre el resultado retenido no genera purgas)', () => {
  const rawTags = generateMockTags();
  const firstPass = evaluateHierarchicalTagRetention(rawTags, DEFAULT_CONFIG);
  assert.ok(firstPass.pruned.length > 0);

  // Segunda ejecución con solo los tags conservados (kept + protected + excluded)
  const survivors = [...firstPass.kept.map((i) => i.tag), ...firstPass.protected.map((i) => i.tag)];
  const secondPass = evaluateHierarchicalTagRetention(survivors, DEFAULT_CONFIG);

  assert.equal(secondPass.pruned.length, 0, 'La segunda ejecución no debe proponer eliminaciones');
  assert.equal(secondPass.kept.length, firstPass.kept.length);
});

// =============================================================================
// 3. SEGURIDAD, WORKFLOW Y GOBERNANZA
// =============================================================================

test('🔒 Seguridad: applyTagRetention en modo simulación reporta sin mutaciones', async () => {
  const result = await applyTagRetention({
    simulate: true,
  });

  assert.ok(result.kept.length > 0);
  assert.ok(result.pruned.length > 0);
  assert.equal(result.dryRun, true);
  assert.equal(result.simulated, true);
  assert.ok(result.deletedTags.length > 0, 'En simulación registra los tags calculados');
});

test('🔒 Workflow: tag-retention.yaml declara inputs de jerarquía SemVer y permisos mínimos', () => {
  const workflowPath = path.join(ROOT_DIR, '.github/workflows/tag-retention.yaml');
  assert.ok(fs.existsSync(workflowPath));

  const content = fs.readFileSync(workflowPath, 'utf8');

  // Permisos mínimos
  assert.ok(content.includes('permissions:\n  contents: read'));
  assert.ok(content.includes('contents: write'));

  // Inputs jerárquicos
  assert.ok(content.includes('major_count:'));
  assert.ok(content.includes('minor_count:'));
  assert.ok(content.includes('patch_count:'));
  assert.ok(content.includes('default: 2'));
  assert.ok(content.includes('default: 3'));
  assert.ok(content.includes('default: 1'));
  assert.ok(content.includes('default: true'), 'dry_run debe ser true por defecto');

  // Concurrencia
  assert.ok(content.includes('concurrency:'));
  assert.ok(content.includes('cancel-in-progress: false'));

  // Pinning por SHA
  assert.ok(content.includes('actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1'));
  assert.ok(content.includes('actions/setup-node@820762786026740c76f36085b0efc47a31fe5020'));
});

test('🔧 CLI y Tareas: Taskfile y package.json exponen la retención de tags', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
  assert.ok(pkg.scripts['tags:retention']);
  assert.ok(pkg.scripts['tags:retention:dry-run']);

  const taskfile = getCompleteTaskfileContent(ROOT_DIR);
  assert.ok(taskfile.includes('tags:retention:'));
  assert.ok(taskfile.includes('tags:retention:dry-run:'));
});

test('📚 Documentación: TAG_RETENTION_POLICY.md indexada y documenta Opción B y Opción A', () => {
  const docPath = path.join(ROOT_DIR, 'docs/operations/TAG_RETENTION_POLICY.md');
  assert.ok(fs.existsSync(docPath));

  const content = fs.readFileSync(docPath, 'utf8');
  assert.ok(content.includes('Opción B'));
  assert.ok(content.includes('Opción A'));
  assert.ok(content.includes('keepMajorCount'));
  assert.ok(content.includes('v3.4.1'));

  const readme = fs.readFileSync(path.join(ROOT_DIR, 'docs/README.md'), 'utf8');
  assert.ok(readme.includes('TAG_RETENTION_POLICY.md'));
});

test('🏷️ Protección: collectProtectedTags detecta referencias activas y excepciones personalizadas', () => {
  const custom = ['v9.9.9-custom'];
  const protectedMap = collectProtectedTags(ROOT_DIR, custom);

  assert.ok(protectedMap.has('v9.9.9-custom'), 'Debe incluir excepciones personalizadas');
  assert.ok(protectedMap.size >= 2, 'Debe incluir referencias de GitOps o Chart');
});

test('🏷️ Protección [AUD-REL-RET-002]: collectProtectedTags protege la ventana de rollback de GHCR (N, N-1, N-2)', () => {
  const ghcrRollback = collectReleasePinnedDigests(ROOT_DIR, 3);
  assert.ok(ghcrRollback.tags.length > 0, 'Debe existir al menos un tag de release en el repositorio');

  const protectedMap = collectProtectedTags(ROOT_DIR);
  for (const tag of ghcrRollback.tags) {
    assert.ok(
      protectedMap.has(tag),
      `AUD-REL-RET-002: el tag de rollback de GHCR ${tag} debe estar protegido en collectProtectedTags para no desproteger sus imágenes OCI`,
    );
  }

  // Al evaluar la retención jerárquica con patch_count=1 sobre múltiples patches de la misma minor,
  // ninguno de los 3 releases de rollback de GHCR puede quedar en candidatos a purga (pruned).
  const tags = ghcrRollback.tags.map((name) => createMockTag(name));
  const evaluation = evaluateHierarchicalTagRetention(tags, DEFAULT_CONFIG, protectedMap);
  const prunedNames = evaluation.pruned.map((item) => item.tag.name);
  for (const tag of ghcrRollback.tags) {
    assert.ok(
      !prunedNames.includes(tag),
      `AUD-REL-RET-002: ${tag} no puede marcarse como candidato a purga mientras forme parte de la ventana de rollback de GHCR`,
    );
  }
});

test('🔒 Seguridad: la simulación automática por falta de GITHUB_TOKEN se declara y advierte sobre el resultado', async () => {
  const originalToken = process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_TOKEN;
  const logs = mock.method(console, 'log', () => undefined);
  const warns = mock.method(console, 'warn', () => undefined);
  try {
    const result = await applyTagRetention({ dryRun: true, protectedTags: new Map() });
    assert.equal(result.simulated, true);

    const out = logs.mock.calls.map((c) => String(c.arguments[0])).join('\n');
    const warning = warns.mock.calls.map((c) => String(c.arguments[0])).join('\n');
    assert.match(out, /Modo Simulado\s+: SÍ \(automático por falta de GITHUB_TOKEN/);
    assert.doesNotMatch(out, /Modo Simulado\s+: NO/);
    assert.match(warning, /RESULTADO SIMULADO/);
  } finally {
    logs.mock.restore();
    warns.mock.restore();
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalToken;
  }
});
