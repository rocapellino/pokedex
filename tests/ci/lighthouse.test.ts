import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { MAX_PAGE_SIZE } from '../../apps/backend/src/utils/pagination.js';
import { analyzeChangeImpact } from '../../scripts/detect-change-impact.js';
import {
  CONTAINER_NAME,
  LOCAL_IMAGE,
  createApiServer,
  dockerRunArgs,
  localizeImages,
  resolveNginxImage,
} from '../../scripts/lighthouse-stack.js';
import { median, summarize, type Lhr } from '../../scripts/lighthouse-summary.js';
import { fetchAllPokemons } from '../../apps/frontend/src/shared/api.js';
import { ROOT_DIR as ROOT } from '../helpers/repo.js';

const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

const catalog = localizeImages(JSON.parse(read('apps/backend/src/data/pokemon-catalog.full.json'))) as unknown[];
const originalFetch = globalThis.fetch;
let base = '';
let server: ReturnType<typeof createApiServer>;

before(async () => {
  server = createApiServer(catalog as never[]);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  globalThis.fetch = originalFetch;
  server.close();
});

test('📈 Lighthouse: la API simulada pagina como el backend (máximo 100, X-Total-Count)', async () => {
  const first = await originalFetch(`${base}/pokemons?offset=0&limit=100`);
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('X-Total-Count'), String(catalog.length));
  assert.equal(((await first.json()) as unknown[]).length, MAX_PAGE_SIZE);

  const capped = await originalFetch(`${base}/pokemons?limit=100000`);
  assert.equal(((await capped.json()) as unknown[]).length, MAX_PAGE_SIZE, 'el límite no puede superar el del backend');

  const tail = await originalFetch(`${base}/pokemons?offset=${catalog.length - 5}&limit=100`);
  assert.equal(((await tail.json()) as unknown[]).length, 5);
});

test('📈 Lighthouse: la API simulada responde lo que la página consulta al cargar', async () => {
  const byId = await originalFetch(`${base}/pokemons/25`);
  assert.equal(byId.status, 200);
  assert.equal(((await byId.json()) as { nombre: string }).nombre, 'Pikachu');

  assert.equal((await originalFetch(`${base}/pokemons/999999`)).status, 404);
  assert.deepEqual(await (await originalFetch(`${base}/api/v1/auth/session`)).json(), { authenticated: false });
  assert.equal((await originalFetch(`${base}/no-existe`)).status, 404);
});

test('📈 Lighthouse: el catálogo completo carga de extremo a extremo (regresión: antes devolvía 404)', async () => {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) =>
    originalFetch(typeof input === 'string' ? `${base}${input}` : input, init)) as typeof fetch;

  const all = await fetchAllPokemons();

  assert.equal(all.length, catalog.length);
  assert.ok(all.length > 1000, 'el catálogo nacional tiene más de 1000 entradas');
});

test('📈 Lighthouse: las imágenes de la medición son locales, sin depender de GitHub', () => {
  const payload = JSON.stringify(catalog);
  const hosts = new Set(
    [...payload.matchAll(/"(https?:\/\/[^"]+)"/g)].map((match) => new URL(match[1] as string).hostname),
  );
  assert.ok(!hosts.has('raw.githubusercontent.com'), 'ninguna imagen debe apuntar al exterior');
  assert.ok(payload.includes(`"${LOCAL_IMAGE}"`));
  assert.ok(
    fs.existsSync(path.join(ROOT, 'apps/frontend/public', LOCAL_IMAGE)),
    `${LOCAL_IMAGE} debe existir en public/`,
  );
  assert.equal(localizeImages('https://example.com/a.png'), 'https://example.com/a.png', 'solo se reescribe GitHub');
});

test('📈 Lighthouse: nginx se resuelve desde el digest del Dockerfile y se monta en solo lectura', () => {
  const image = resolveNginxImage(read('apps/frontend/Dockerfile'));
  assert.match(image, /^nginx:[^@\s]+@sha256:[a-f0-9]{64}$/);
  assert.throws(() => resolveNginxImage('FROM node:22-alpine'), /No se pudo resolver/);

  const args = dockerRunArgs(image, '/tmp/default.conf', '/tmp/dist');
  assert.ok(args.includes('--add-host=api:host-gateway'), 'el upstream `api` debe apuntar al host');
  assert.ok(args.includes(CONTAINER_NAME));
  assert.equal(args.filter((a) => a.includes('readonly')).length, 2, 'configuración y dist en solo lectura');
  assert.equal(args.at(-1), image);
});

test('📈 Lighthouse: lighthouserc.json mide la aplicación real y no un servidor estático', () => {
  const { ci } = JSON.parse(read('lighthouserc.json')) as {
    ci: {
      collect: Record<string, unknown> & { url: string[]; numberOfRuns: number; startServerCommand: string };
      assert: { assertions: Record<string, [string, Record<string, number>]> };
      upload: { target: string };
    };
  };

  assert.equal(ci.collect.staticDistDir, undefined, 'staticDistDir sirve sin API: el catálogo daría 404');
  assert.deepEqual(
    ci.collect.url.map((u) => new URL(u).pathname),
    ['/', '/backoffice'],
  );
  assert.ok(ci.collect.numberOfRuns >= 5, 'la mediana de 5 ejecuciones amortigua la variabilidad del runner');
  assert.equal(ci.collect.startServerCommand, 'npx tsx scripts/lighthouse-stack.ts');
  assert.ok(fs.existsSync(path.join(ROOT, 'scripts/lighthouse-stack.ts')));

  assert.equal(
    ci.assert.assertions['errors-in-console']?.[0],
    'error',
    'un error de consola es una regresión funcional',
  );
  assert.equal(ci.assert.assertions['categories:accessibility']?.[0], 'error');
  assert.equal(ci.assert.assertions['categories:seo']?.[0], 'error', 'el SEO es determinista y debe bloquear');
  assert.equal(
    ci.assert.assertions['uses-text-compression']?.[0],
    'error',
    'protege contra retirar el gzip de nginx sin darse cuenta',
  );
  assert.notEqual(ci.upload.target, 'temporary-public-storage', 'los informes no se publican en un servicio externo');
  assert.equal(ci.upload.target, 'filesystem');
});

test('📈 Lighthouse: los presupuestos de rendimiento bloquean y respetan la línea base de CI', () => {
  const { ci } = JSON.parse(read('lighthouserc.json')) as {
    ci: { assert: { assertions: Record<string, [string, Record<string, number>]> } };
  };
  const a = ci.assert.assertions;

  // Línea base medida en el runner tras el gzip (mediana de 5, peor ejecución entre paréntesis):
  // Performance 97 (95); FCP 1,27 s (1,35); LCP 1,80 s (2,32); CLS 0,002; TBT 183 ms (227).
  assert.deepEqual(a['categories:performance'], ['error', { minScore: 0.9 }], 'mínimo 0,90 sobre un peor caso de 0,95');
  assert.deepEqual(a['largest-contentful-paint'], ['error', { maxNumericValue: 2500 }]);
  assert.deepEqual(a['first-contentful-paint'], ['error', { maxNumericValue: 2000 }]);
  assert.deepEqual(a['cumulative-layout-shift'], ['error', { maxNumericValue: 0.25 }]);
  // El TBT depende de la CPU del runner (su índice de rendimiento varió de 1.800 a 2.500): solo se vigila.
  assert.equal(a['total-blocking-time']?.[0], 'warn');
});

test('📈 Lighthouse: el workflow publica el resumen y los informes como artefacto', () => {
  const workflow = read('.github/workflows/web.yaml');
  assert.match(workflow, /scripts\/lighthouse-summary\.ts/);
  assert.match(workflow, /GITHUB_STEP_SUMMARY/);
  assert.match(workflow, /actions\/upload-artifact@[a-f0-9]{40}/, 'la acción se fija por SHA completo');
  assert.match(workflow, /path: \.lighthouseci/);

  // `.lighthouseci` es un directorio oculto: upload-artifact lo excluye salvo con include-hidden-files,
  // y con `ignore` el paso terminaba en verde sin subir nada (verificado en el log del PR #616).
  const upload = workflow.slice(workflow.indexOf('actions/upload-artifact@'));
  assert.match(upload, /include-hidden-files: true/, 'sin esto el artefacto queda vacío');
  assert.match(upload, /if-no-files-found: (warn|error)/, 'la ausencia de informes no puede pasar en silencio');
});

test('📈 Lighthouse: los archivos de la medición están clasificados y no disparan fail-closed', () => {
  const files = ['lighthouserc.json', 'scripts/lighthouse-stack.ts', 'scripts/lighthouse-summary.ts'];
  for (const file of files) {
    const result = analyzeChangeImpact({ files: [file], configPath: path.join(ROOT, '.github/ci-impact.yaml') });
    assert.equal(result.isUnknown, false, `${file} debe estar clasificado en .github/ci-impact.yaml`);
    assert.equal(result.triggers.frontend, true, `${file} debe activar el dominio frontend`);
  }
});

test('📈 Lighthouse: el resumen calcula la mediana por URL y tolera la ausencia de informes', () => {
  const run = (perf: number, lcp: number): Lhr => ({
    finalDisplayedUrl: 'http://localhost:8080/',
    categories: {
      performance: { score: perf },
      accessibility: { score: 1 },
      'best-practices': { score: 1 },
      seo: { score: 0.9 },
    },
    audits: {
      'first-contentful-paint': { numericValue: 1200 },
      'largest-contentful-paint': { numericValue: lcp },
      'cumulative-layout-shift': { numericValue: 0.012 },
      'total-blocking-time': { numericValue: 90 },
      'total-byte-weight': { numericValue: 102_400 },
    },
  });

  const table = summarize([run(0.5, 4000), run(0.9, 2000), run(0.7, 3000)]);
  assert.match(table, /\| `\/` \| 3 \| 70 \| 100 \| 100 \| 90 \| 1\.2 s \| 3\.0 s \| 0\.012 \| 90 ms \| 100 KiB \|/);
  assert.match(summarize([]), /No se encontraron informes/);
  assert.ok(Number.isNaN(median([])));
});
