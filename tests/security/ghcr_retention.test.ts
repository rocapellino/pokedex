import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCompleteTaskfileContent } from '../helpers/taskfile.js';
import {
  calculateVersionsToPrune,
  generateMockPackageVersions,
  applyGhcrRetention,
  collectPinnedDigests,
  DEFAULT_PACKAGES,
  PackageVersion,
} from '../../scripts/ghcr-retention.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../');

/**
 * Elimina las líneas de comentario de un YAML.
 *
 * Los workflows documentan en comentarios qué se retiró y por qué. Evaluar esas
 * afirmaciones como si fueran configuración produce falsos positivos: nombrar el
 * paso eliminado en el comentario que explica su eliminación haría fallar el
 * test que justamente comprueba que fue eliminado.
 */
function withoutComments(yaml: string): string {
  return yaml
    .split(/\r?\n/)
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');
}

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

  // Solo las imágenes con tag de release compiten por el cupo (las versiones sin
  // tag son referrers/artefactos y nunca se purgan), por lo que se etiquetan.
  versions.forEach((v) => {
    v.metadata = { package_type: 'container', container: { tags: [`v1.0.${v.id}`] } };
  });

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
  // generateMockPackageVersions deja sin tag la versión de índice 3: no compite
  // por el cupo ni se purga, así que de 5 versiones quedan 4 imágenes de release.
  assert.equal(pokedexResult.totalVersions, 5);
  assert.equal(pokedexResult.kept.length, 3);
  assert.equal(pokedexResult.pruned.length, 1);
  assert.equal(pokedexResult.deletedIds.length, 1);

  const apiResult = results.find((r) => r.packageName === 'pokedex-api');
  assert.ok(apiResult, 'Debe contener resultado para pokedex-api');
  assert.equal(apiResult.totalVersions, 4);
  assert.equal(apiResult.kept.length, 3);
  assert.equal(apiResult.pruned.length, 0);
  assert.equal(apiResult.deletedIds.length, 0);
});

test('🔒 GHCR Retention Workflow: Configuración de seguridad, permisos y parámetros de retención', () => {
  // 1. Workflow autónomo de retención ghcr-retention.yaml
  const retentionWfPath = path.join(ROOT_DIR, '.github/workflows/ghcr-retention.yaml');
  assert.ok(fs.existsSync(retentionWfPath), '.github/workflows/ghcr-retention.yaml debe existir');

  const retentionWf = fs.readFileSync(retentionWfPath, 'utf-8');
  assert.ok(retentionWf.includes('packages: write'), 'Debe requerir permiso packages: write');
  assert.ok(retentionWf.includes('workflow_dispatch:'), 'Debe admitir ejecución manual');
  assert.ok(retentionWf.includes('cron:'), 'Debe incluir schedule periódica');
  assert.ok(retentionWf.includes('workflow_run:'), 'Debe activarse tras publicación en CI/CD');
  // WF-003: la retención de este workflow la aplica el script canónico tipado.
  // Se quitó la acción de terceros que repetía la poda dentro del mismo job.
  assert.ok(
    retentionWf.includes('scripts/ghcr-retention.ts'),
    'ghcr-retention.yaml debe delegar la retención en el script canónico tipado'
  );
  assert.ok(
    !withoutComments(retentionWf).includes('dataaxiom/ghcr-cleanup-action'),
    'ghcr-retention.yaml no debe volver a duplicar la poda dentro del mismo job (WF-003)'
  );
  // 2. ci.yaml ya no aplica retención inline: `keep-n-tagged: 3` purgaba digests todavía
  //    fijados en GitOps y `delete-untagged` eliminaba referrers de firmas y atestaciones.
  //    El único mecanismo es el script, que protege ambos (reemplaza a WF-003).
  const ciWf = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/ci.yaml'), 'utf-8');
  assert.ok(
    !withoutComments(ciWf).includes('dataaxiom/ghcr-cleanup-action'),
    'ci.yaml no debe aplicar retención inline sin proteger los digests fijados en GitOps'
  );

  // 3. package.json y Taskfile.yaml exponen las tareas oficiales
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf-8'));
  assert.ok(packageJson.scripts['ghcr:retention'], 'package.json debe incluir script ghcr:retention');
  assert.ok(packageJson.scripts['ghcr:retention:dry-run'], 'package.json debe incluir script ghcr:retention:dry-run');

  const taskfile = getCompleteTaskfileContent(ROOT_DIR);
  assert.ok(taskfile.includes('ghcr:retention:'), 'Taskfile.yaml debe exponer ghcr:retention');
  assert.ok(taskfile.includes('ghcr:retention:dry-run:'), 'Taskfile.yaml debe exponer ghcr:retention:dry-run');

  // 4. Documentación formal existe e indexada
  const docPath = path.join(ROOT_DIR, 'docs/operations/GHCR_RETENTION_POLICY.md');
  assert.ok(fs.existsSync(docPath), 'GHCR_RETENTION_POLICY.md debe existir');
  const readme = fs.readFileSync(path.join(ROOT_DIR, 'docs/README.md'), 'utf-8');
  assert.ok(readme.includes('GHCR_RETENTION_POLICY.md'), 'docs/README.md debe indexar GHCR_RETENTION_POLICY.md');
});

// Regresión (auditoría de pipeline 2026-10-03): la retención ordenaba TODAS las versiones
// por fecha y conservaba las 3 más nuevas. Las firmas, SBOM y atestaciones de Cosign
// (tags sha256-<digest>.sig/.sbom/.att y referrers sin tag) desplazaban a la imagen real:
// la versión `main` recién publicada se purgó minutos después del CI. Además, nada
// protegía los digests que GitOps tiene fijados y que los clústeres necesitan descargar.
function version(id: number, digest: string, date: string, tags: string[]): PackageVersion {
  return {
    id,
    name: `sha256:${digest.repeat(64).slice(0, 64)}`,
    url: `https://api.github.com/v${id}`,
    created_at: date,
    updated_at: date,
    metadata: { package_type: 'container', container: { tags } },
  };
}

test('📦 GHCR Retention: firmas, SBOM y versiones sin tag no desplazan ni purgan imágenes', () => {
  const image = version(1, 'a', '2026-10-03T21:46:00Z', ['main', 'f'.repeat(40)]);
  const signature = version(2, 'b', '2026-10-03T21:49:08Z', [`sha256-${'a'.repeat(64)}.sig`]);
  const sbom = version(3, 'c', '2026-10-03T21:49:07Z', [`sha256-${'a'.repeat(64)}.sbom`]);
  const referrer = version(4, 'd', '2026-10-03T21:49:06Z', []);
  const older = [5, 6, 7].map((id) => version(id, String(id), `2026-10-0${id - 4}T10:00:00Z`, [`v1.0.${id}`]));

  const { keep, prune } = calculateVersionsToPrune([image, signature, sbom, referrer, ...older], 3);

  assert.ok(keep.some((v) => v.id === image.id), 'La imagen más reciente debe conservarse');
  assert.deepEqual(prune.map((v) => v.id), [5], 'Solo se purga la imagen de release más antigua fuera del top 3');
  for (const artifact of [signature, sbom, referrer]) {
    assert.ok(!prune.some((v) => v.id === artifact.id), `La versión ${artifact.id} (artefacto Cosign o sin tag) no se purga`);
  }
});

test('📦 GHCR Retention: nunca purga un digest fijado en GitOps aunque quede fuera del top N', () => {
  const pinned = version(10, '9', '2026-09-01T10:00:00Z', ['v1.80.0']);
  const recent = [11, 12, 13].map((id) => version(id, String(id - 10), `2026-10-0${id - 10}T10:00:00Z`, [`v1.9${id}.0`]));

  const { keep, prune } = calculateVersionsToPrune([pinned, ...recent], 3, new Set([pinned.name]));

  assert.ok(keep.some((v) => v.id === pinned.id), 'El digest fijado debe conservarse');
  assert.equal(prune.length, 0);
});

test('📦 GHCR Retention: protege los digests api y web declarados en GitOps y gestiona ambos paquetes', () => {
  const pinned = collectPinnedDigests();
  for (const file of ['gitops/environments/proxmox/values.yaml', 'gitops/environments/proxmox-preprod/values.yaml']) {
    const values = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
    for (const digest of values.match(/sha256:[a-f0-9]{64}/g) ?? []) {
      assert.ok(pinned.has(digest), `${digest} de ${file} debe estar protegido`);
    }
  }
  assert.ok(DEFAULT_PACKAGES.includes('pokedex-api') && DEFAULT_PACKAGES.includes('pokedex-web'));
});
