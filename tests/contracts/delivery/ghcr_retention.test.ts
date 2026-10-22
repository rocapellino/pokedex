import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { getCompleteTaskfileContent } from '../../helpers/taskfile.js';
import {
  calculateVersionsToPrune,
  generateMockPackageVersions,
  applyGhcrRetention,
  collectPinnedDigests,
  DEFAULT_PACKAGES,
  fetchPackageVersions,
  MAX_VERSION_PAGES,
  retentionExitCode,
  type PackageVersion,
} from '../../../scripts/ghcr-retention.ts';
import { ROOT_DIR } from '../../helpers/repo.js';

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
    'Las versiones conservadas deben ser las de fechas más recientes',
  );
  assert.deepEqual(
    result.prune.map((v) => v.id),
    [1, 5],
    'Las versiones purgadas deben ser las más antiguas',
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
    'ghcr-retention.yaml debe delegar la retención en el script canónico tipado',
  );
  assert.ok(
    !withoutComments(retentionWf).includes('dataaxiom/ghcr-cleanup-action'),
    'ghcr-retention.yaml no debe volver a duplicar la poda dentro del mismo job (WF-003)',
  );
  // 2. ci.yaml ya no aplica retención inline: `keep-n-tagged: 3` purgaba digests todavía
  //    fijados en GitOps y `delete-untagged` eliminaba referrers de firmas y atestaciones.
  //    El único mecanismo es el script, que protege ambos (reemplaza a WF-003).
  const ciWf = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/ci.yaml'), 'utf-8');
  assert.ok(
    !withoutComments(ciWf).includes('dataaxiom/ghcr-cleanup-action'),
    'ci.yaml no debe aplicar retención inline sin proteger los digests fijados en GitOps',
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

  assert.ok(
    keep.some((v) => v.id === image.id),
    'La imagen más reciente debe conservarse',
  );
  assert.deepEqual(
    prune.map((v) => v.id),
    [5],
    'Solo se purga la imagen de release más antigua fuera del top 3',
  );
  for (const artifact of [signature, sbom, referrer]) {
    assert.ok(
      !prune.some((v) => v.id === artifact.id),
      `La versión ${artifact.id} (artefacto Cosign o sin tag) no se purga`,
    );
  }
});

test('📦 GHCR Retention: nunca purga un digest fijado en GitOps aunque quede fuera del top N', () => {
  const pinned = version(10, '9', '2026-09-01T10:00:00Z', ['v1.80.0']);
  const recent = [11, 12, 13].map((id) =>
    version(id, String(id - 10), `2026-10-0${id - 10}T10:00:00Z`, [`v1.9${id}.0`]),
  );

  const { keep, prune } = calculateVersionsToPrune([pinned, ...recent], 3, new Set([pinned.name]));

  assert.ok(
    keep.some((v) => v.id === pinned.id),
    'El digest fijado debe conservarse',
  );
  assert.equal(prune.length, 0);
});

test('📦 GHCR Retention: protege los digests api y web declarados en GitOps y gestiona ambos paquetes', () => {
  const pinned = collectPinnedDigests(ROOT_DIR);
  for (const file of ['gitops/environments/proxmox-preprod/values.yaml']) {
    const values = fs.readFileSync(path.join(ROOT_DIR, file), 'utf8');
    for (const digest of values.match(/sha256:[a-f0-9]{64}/g) ?? []) {
      assert.ok(pinned.has(digest), `${digest} de ${file} debe estar protegido`);
    }
  }
  assert.ok(DEFAULT_PACKAGES.includes('pokedex-api') && DEFAULT_PACKAGES.includes('pokedex-web'));
});

test('📦 GHCR: la simulación automática por falta de GITHUB_TOKEN se declara y advierte sobre el resultado', async () => {
  const originalToken = process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_TOKEN;
  const logs = mock.method(console, 'log', () => undefined);
  const warns = mock.method(console, 'warn', () => undefined);
  try {
    const results = await applyGhcrRetention({ dryRun: true, protectedDigests: new Set() });
    assert.ok(results.every((r) => r.simulated === true));

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

// =============================================================================
// AUD-REL-GHCR-001: la retención falla de forma cerrada ante errores de API
// =============================================================================

/**
 * Ejecuta applyGhcrRetention con `fetch` y la consola sustituidos, y devuelve lo emitido.
 * `GITHUB_TOKEN` se fija explícitamente para evitar la simulación automática.
 */
async function runWithStubbedApi(
  handler: (url: string, init?: RequestInit) => Response,
  options: Parameters<typeof applyGhcrRetention>[0],
) {
  const fetchStub = mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) =>
    handler(String(url), init),
  );
  const logs = mock.method(console, 'log', () => undefined);
  const warns = mock.method(console, 'warn', () => undefined);
  const errors = mock.method(console, 'error', () => undefined);
  try {
    const results = await applyGhcrRetention({ token: 'test-token', protectedDigests: new Set(), ...options });
    const text = (m: typeof logs) => m.mock.calls.map((c) => String(c.arguments[0])).join('\n');
    return { results, out: text(logs), warn: text(warns), err: text(errors), fetchCalls: fetchStub.mock.calls };
  } finally {
    fetchStub.mock.restore();
    logs.mock.restore();
    warns.mock.restore();
    errors.mock.restore();
  }
}

test('🔒 GHCR Retention: un 403 al consultar un paquete se registra como error y no se declara éxito', async () => {
  const { results, out, err } = await runWithStubbedApi(
    () => new Response('{"message":"You need at least read:packages scope"}', { status: 403 }),
    { packages: ['pokedex', 'pokedex-api'], dryRun: true },
  );

  assert.equal(results.length, 2, 'cada paquete fallido debe figurar en los resultados');
  for (const r of results) {
    assert.equal(r.errors.length, 1, `${r.packageName} debe registrar su error de consulta`);
    assert.match(r.errors[0], /403/);
  }
  assert.equal(retentionExitCode(results), 1, 'el proceso debe terminar con código distinto de cero');
  assert.doesNotMatch(out, /aplicada con éxito/, 'no debe imprimir el mensaje de éxito');
  assert.match(err, /RETENCIÓN INCOMPLETA/);
});

test('🔒 GHCR Retention: un fallo al eliminar una versión se registra como error y no se declara éxito', async () => {
  const versions = generateMockPackageVersions('pokedex-api', 6);
  const { results, out, err } = await runWithStubbedApi(
    (_url, init) =>
      init?.method === 'DELETE'
        ? new Response('{"message":"Server Error"}', { status: 500 })
        : new Response(JSON.stringify(versions), { status: 200 }),
    { packages: ['pokedex-api'], keepCount: 3, dryRun: false },
  );

  const [result] = results;
  assert.ok(result.pruned.length > 0, 'el escenario debe tener versiones a purgar');
  assert.equal(result.deletedIds.length, 0, 'una versión no eliminada no puede figurar como eliminada');
  assert.equal(result.errors.length, result.pruned.length, 'cada eliminación fallida debe registrarse');
  assert.match(result.errors[0], /500/);
  assert.equal(retentionExitCode(results), 1);
  assert.doesNotMatch(out, /aplicada con éxito/);
  assert.match(err, /RETENCIÓN INCOMPLETA/);
});

test('📦 GHCR Retention: sin errores conserva el comportamiento y el código de salida 0', async () => {
  const versions = generateMockPackageVersions('pokedex-web', 6);
  const { results, out } = await runWithStubbedApi(() => new Response(JSON.stringify(versions), { status: 200 }), {
    packages: ['pokedex-web'],
    keepCount: 3,
    dryRun: true,
  });

  assert.equal(results[0].errors.length, 0);
  assert.equal(retentionExitCode(results), 0);
  assert.match(out, /aplicada con éxito/);
});

test('📦 GHCR Retention: un paquete inexistente (404) no es un error', async () => {
  const { results } = await runWithStubbedApi(() => new Response('{"message":"Not Found"}', { status: 404 }), {
    packages: ['pokedex'],
    dryRun: true,
  });

  assert.equal(results[0].totalVersions, 0);
  assert.equal(results[0].errors.length, 0);
  assert.equal(retentionExitCode(results), 0);
});

// =============================================================================
// Paginación de la consulta de versiones (la API devuelve como máximo 100 por página)
// =============================================================================

const API_ORIGIN = 'https://api.github.com';
const PAGE_SIZE = 100;

/** Versión de release sintética con id único y fecha decreciente (mayor id = más reciente). */
function releaseVersion(id: number): PackageVersion {
  const date = new Date(Date.UTC(2026, 0, 1) + id * 60_000).toISOString();
  return {
    id,
    name: `sha256:${id.toString(16).padStart(64, '0')}`,
    url: `${API_ORIGIN}/versions/${id}`,
    created_at: date,
    updated_at: date,
    metadata: { package_type: 'container', container: { tags: [`v1.0.${id}`] } },
  };
}

/** Sirve `total` versiones en páginas de 100, enlazadas con `Link: rel="next"` como hace GitHub. */
function pagedApi(total: number, seen: { urls: string[]; auth: (string | null)[] }) {
  return (url: string, init?: RequestInit): Response => {
    seen.urls.push(url);
    seen.auth.push(new Headers(init?.headers).get('authorization'));
    const page = Number(new URL(url).searchParams.get('page') ?? '1');
    const first = (page - 1) * PAGE_SIZE;
    const body = Array.from({ length: Math.max(0, Math.min(PAGE_SIZE, total - first)) }, (_, i) =>
      releaseVersion(first + i + 1),
    );
    const headers = new Headers({ 'content-type': 'application/json' });
    if (first + PAGE_SIZE < total) {
      headers.set(
        'link',
        `<${API_ORIGIN}/users/o/packages/container/p/versions?per_page=100&page=${page + 1}>; rel="next"`,
      );
    }
    return new Response(JSON.stringify(body), { status: 200, headers });
  };
}

async function withFetch<T>(handler: (url: string, init?: RequestInit) => Response, fn: () => Promise<T>): Promise<T> {
  const stub = mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) =>
    handler(String(url), init),
  );
  try {
    return await fn();
  } finally {
    stub.mock.restore();
  }
}

test('📄 GHCR Paginación: fetchPackageVersions recorre todas las páginas y envía el token en cada una', async () => {
  const seen = { urls: [] as string[], auth: [] as (string | null)[] };
  const versions = await withFetch(pagedApi(250, seen), () => fetchPackageVersions('tok', 'o', 'p'));

  assert.equal(versions.length, 250, 'debe devolver las 250 versiones, no solo la primera página');
  assert.equal(new Set(versions.map((v) => v.id)).size, 250, 'sin versiones duplicadas');
  assert.equal(seen.urls.length, 3, '250 versiones = 3 páginas de hasta 100');
  assert.ok(
    seen.auth.every((a) => a === 'Bearer tok'),
    'cada página debe llevar la autorización',
  );
});

test('📄 GHCR Paginación: un total múltiplo de la página no pide una página vacía de más', async () => {
  const seen = { urls: [] as string[], auth: [] as (string | null)[] };
  const versions = await withFetch(pagedApi(200, seen), () => fetchPackageVersions('tok', 'o', 'p'));

  assert.equal(versions.length, 200);
  assert.equal(seen.urls.length, 2);
});

test('📄 GHCR Paginación: una sola página sin Link se comporta como antes', async () => {
  const seen = { urls: [] as string[], auth: [] as (string | null)[] };
  const versions = await withFetch(pagedApi(40, seen), () => fetchPackageVersions('tok', 'o', 'p'));

  assert.equal(versions.length, 40);
  assert.equal(seen.urls.length, 1);
});

test('🔒 GHCR Paginación: un error en una página intermedia falla y no devuelve una lista parcial', async () => {
  const base = pagedApi(250, { urls: [], auth: [] });
  await withFetch(
    (url, init) => (url.includes('page=2') ? new Response('{"message":"boom"}', { status: 500 }) : base(url, init)),
    async () => {
      await assert.rejects(() => fetchPackageVersions('tok', 'o', 'p'), /500/);
    },
  );
});

test('🔒 GHCR Paginación: un 404 en una página posterior es un error, no un paquete inexistente', async () => {
  const base = pagedApi(250, { urls: [], auth: [] });
  await withFetch(
    (url, init) =>
      url.includes('page=2') ? new Response('{"message":"Not Found"}', { status: 404 }) : base(url, init),
    async () => {
      await assert.rejects(() => fetchPackageVersions('tok', 'o', 'p'), /404/);
    },
  );
});

test('🔒 GHCR Paginación: no sigue un Link hacia otro host (no filtra el token)', async () => {
  const seen = { urls: [] as string[], auth: [] as (string | null)[] };
  await withFetch(
    (url) => {
      seen.urls.push(url);
      return new Response('[]', {
        status: 200,
        headers: { link: '<https://evil.example.com/steal?page=2>; rel="next"' },
      });
    },
    async () => {
      await assert.rejects(() => fetchPackageVersions('tok', 'o', 'p'), /host|origen/i);
    },
  );
  assert.ok(
    seen.urls.every((u) => u.startsWith(`${API_ORIGIN}/`)),
    'nunca debe solicitar una URL fuera de api.github.com',
  );
});

test('🔒 GHCR Paginación: un Link que nunca termina se corta en el tope en lugar de purgar con datos incompletos', async () => {
  let calls = 0;
  await withFetch(
    () => {
      calls += 1;
      return new Response('[]', {
        status: 200,
        headers: { link: `<${API_ORIGIN}/users/o/packages/container/p/versions?page=${calls + 1}>; rel="next"` },
      });
    },
    async () => {
      await assert.rejects(() => fetchPackageVersions('tok', 'o', 'p'), /tope|páginas/i);
    },
  );
  assert.ok(calls <= MAX_VERSION_PAGES, `no debe pedir más de ${MAX_VERSION_PAGES} páginas (pidió ${calls})`);
});

test('📄 GHCR Paginación: applyGhcrRetention evalúa el historial completo, no solo las 100 más recientes', async () => {
  const logs = mock.method(console, 'log', () => undefined);
  try {
    const results = await withFetch(pagedApi(250, { urls: [], auth: [] }), () =>
      applyGhcrRetention({
        token: 'tok',
        owner: 'o',
        packages: ['p'],
        keepCount: 3,
        dryRun: true,
        protectedDigests: new Set(),
      }),
    );

    const [r] = results;
    assert.equal(r.totalVersions, 250);
    assert.equal(r.kept.length, 3);
    assert.equal(r.pruned.length, 247, 'con 250 imágenes de release y cupo 3 se purgan 247');
    assert.deepEqual(
      r.kept.map((v) => v.id).sort((a, b) => b - a),
      [250, 249, 248],
      'se conservan las 3 más recientes aunque estén en la última página',
    );
    assert.equal(retentionExitCode(results), 0);
  } finally {
    logs.mock.restore();
  }
});

// =============================================================================
// AUD-REL-GHCR-002: la ejecución manual no debe ser destructiva por defecto
// =============================================================================

test('🔒 GHCR Retention Workflow: la ejecución manual (workflow_dispatch) es dry-run por defecto', () => {
  for (const file of ['ghcr-retention.yaml', 'tag-retention.yaml']) {
    const parsed = yaml.load(fs.readFileSync(path.join(ROOT_DIR, '.github/workflows', file), 'utf-8')) as {
      on?: { workflow_dispatch?: { inputs?: { dry_run?: { type?: string; default?: unknown } } } };
    };
    const dryRun = parsed.on?.workflow_dispatch?.inputs?.dry_run;

    assert.ok(dryRun, `${file} debe declarar el input dry_run en workflow_dispatch`);
    assert.equal(dryRun.type, 'boolean');
    assert.equal(
      dryRun.default,
      true,
      `${file}: dry_run debe valer true por defecto; con false, lanzar el workflow sin parámetros purgaría de verdad`,
    );
  }
});
