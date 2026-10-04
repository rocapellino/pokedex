import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractRenderedApiImage,
  extractRenderedImage,
  parseImmutableDigest,
  verifyImageDigestParity,
  clearRenderCache,
} from '../../scripts/verify-image-digest-parity.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

test('🔒 GitOps Parity: extractRenderedApiImage compila el Deployment mediante Helm y extrae la imagen del contenedor api', () => {
  const chartPath = path.join(ROOT_DIR, 'infra/helm/pokedex');
  const environments = [
    'gitops/environments/cloud/values.yaml',
    'gitops/environments/proxmox/values.yaml',
    'gitops/environments/proxmox-preprod/values.yaml',
    'infra/helm/pokedex/values.prod.yaml',
  ];

  for (const envFile of environments) {
    const fullPath = path.join(ROOT_DIR, envFile);
    const image = extractRenderedApiImage(chartPath, fullPath);

    assert.ok(image, `Debe extraer imagen válida para ${envFile}`);
    assert.match(image, /^ghcr\.io\/rocapellino\/pokedex-api@sha256:[a-f0-9]{64}$/, `La imagen renderizada en ${envFile} debe apuntar al registry y tener digest SHA256 inmutable`);
  }
});

test('🔒 GitOps Parity: parseImmutableDigest valida formato SHA256 y rechaza etiquetas mutables', () => {
  // Caso válido
  const validDigest = parseImmutableDigest('ghcr.io/rocapellino/pokedex-api@sha256:4113ac3d61577bd4eef013e80ec8f05ffcfa4c079b51a1dcec9d884dacc4ddbd');
  assert.strictEqual(validDigest, 'sha256:4113ac3d61577bd4eef013e80ec8f05ffcfa4c079b51a1dcec9d884dacc4ddbd');

  // Casos inválidos que deben fallar
  assert.throws(
    () => parseImmutableDigest('ghcr.io/rocapellino/pokedex-api:latest'),
    /Violación de seguridad de Supply Chain: La imagen '.*' no utiliza digest inmutable/
  );
  assert.throws(
    () => parseImmutableDigest('ghcr.io/rocapellino/pokedex-api:v1.9.5'),
    /Violación de seguridad de Supply Chain: La imagen '.*' no utiliza digest inmutable/
  );
  assert.throws(
    () => parseImmutableDigest('ghcr.io/rocapellino/pokedex-api@sha256:shortinvalid'),
    /Formato de digest SHA256 inválido/
  );
});

test('🔒 GitOps Parity: verifyImageDigestParity certifica paridad 1:1 entre Cloud, Proxmox, Preprod y Helm Prod', () => {
  const chartPath = path.join(ROOT_DIR, 'infra/helm/pokedex');
  const results = verifyImageDigestParity({ chartPath });

  assert.strictEqual(results.length, 4, 'Debe evaluar exactamente 4 entornos (incluido Proxmox Pre-prod)');
  const [cloud, proxmox, preprod, prod] = results;

  assert.strictEqual(cloud.digest, proxmox.digest, 'Cloud y Proxmox deben tener digests idénticos');
  assert.strictEqual(cloud.digest, preprod.digest, 'Cloud y Proxmox Pre-prod deben tener digests idénticos');
  assert.strictEqual(cloud.digest, prod.digest, 'Cloud y Helm Prod deben tener digests idénticos');
});

test('🔒 GitOps Parity: el gate estricto incluye Proxmox Pre-prod en el conjunto de paridad', () => {
  // Regresión: `proxmox-preprod` es parte de la ecuación documentada en
  // docs/architecture/GITOPS_PROMOTION_WORKFLOW.md. Si se excluyera de
  // DEFAULT_ENVIRONMENTS, un digest divergente en preprod pasaría el gate --strict
  // sin romper la integración (verificado empíricamente antes de este fix).
  const chartPath = path.join(ROOT_DIR, 'infra/helm/pokedex');
  const files = verifyImageDigestParity({ chartPath }).map((r) => r.valuesPath);

  assert.ok(
    files.includes('gitops/environments/proxmox-preprod/values.yaml'),
    'El gate de paridad DEBE validar también el entorno Proxmox Pre-prod'
  );
});

test('🔒 GitOps Parity: verifyImageDigestParity detecta discrepancias con digest publicado esperado', () => {
  const chartPath = path.join(ROOT_DIR, 'infra/helm/pokedex');
  const fakeDigest = 'sha256:0000000000000000000000000000000000000000000000000000000000000000';

  assert.throws(
    () => verifyImageDigestParity({ chartPath, publishedDigest: fakeDigest }),
    /Discrepancia entre la imagen publicada en CI y los manifiestos GitOps/
  );
});

test('🔒 Supply Chain: .github/workflows/ci.yaml utiliza validación determinista por Helm AST en lugar de grep/awk', () => {
  const ciWorkflow = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/ci.yaml'), 'utf-8');

  // Asegurar que no use grep -A 4 ni awk para extraer digests en CI
  assert.ok(
    !ciWorkflow.includes("grep -A 4 'pokedex-api'"),
    'ci.yaml no debe utilizar grep -A 4 para extraer digests de GitOps'
  );

  // Asegurar que invoque el script determinista verify-image-digest-parity.ts con flag --strict
  assert.match(
    ciWorkflow,
    /verify-image-digest-parity\.ts.*--strict/,
    'ci.yaml debe invocar scripts/verify-image-digest-parity.ts en modo estricto (--strict)'
  );
});

test('🔒 Supply Chain: extractRenderedApiImage en modo estricto (strict: true) falla sin fallback ante errores de Helm', () => {
  const chartPath = path.join(ROOT_DIR, 'infra/helm/pokedex');
  const validValues = path.join(ROOT_DIR, 'infra/helm/pokedex/values.prod.yaml');

  // Caso 1: Funciona normalmente con Helm válido en modo estricto
  const image = extractRenderedApiImage(chartPath, validValues, { strict: true });
  assert.match(image, /^ghcr\.io\/rocapellino\/pokedex-api@sha256:[a-f0-9]{64}$/);

  // Caso 2: Si el chart es inválido o no existe, en modo estricto NUNCA usa fallback a AST y lanza error
  assert.throws(
    () => extractRenderedApiImage(path.join(ROOT_DIR, 'non-existent-chart'), validValues, { strict: true }),
    /Ruta de Helm chart no encontrada/
  );
});

test('🔒 GitOps Parity: la caché de renderizado acelera llamadas consecutivas e invalida con clearRenderCache', () => {
  const chartPath = path.join(ROOT_DIR, 'infra/helm/pokedex');
  const validValues = path.join(ROOT_DIR, 'infra/helm/pokedex/values.prod.yaml');

  clearRenderCache();
  const startFresh = performance.now();
  const imageFresh = extractRenderedApiImage(chartPath, validValues, { strict: true });
  const durationFresh = performance.now() - startFresh;

  const startCached = performance.now();
  const imageCached = extractRenderedApiImage(chartPath, validValues, { strict: true });
  const durationCached = performance.now() - startCached;

  assert.strictEqual(imageCached, imageFresh, 'La imagen en caché debe ser idéntica a la recién renderizada');
  assert.ok(durationCached < 50, `La llamada en caché debe resolver en <50ms (tomó ${durationCached.toFixed(2)}ms, frente a ${durationFresh.toFixed(2)}ms inicial)`);

  clearRenderCache();
});

// Regresión (2026-10-03): la paridad solo cubría la imagen del API. El digest de
// pokedex-web podía divergir entre entornos sin que ningún gate lo detectara.
test('🔒 GitOps Parity: extractRenderedImage extrae también el contenedor web renderizado', () => {
  const chartPath = path.join(ROOT_DIR, 'infra/helm/pokedex');
  const values = path.join(ROOT_DIR, 'gitops/environments/proxmox/values.yaml');
  const image = extractRenderedImage(chartPath, values, 'web');
  assert.match(image, /^ghcr\.io\/rocapellino\/pokedex-web@sha256:[a-f0-9]{64}$/);
});

test('🔒 GitOps Parity: verifyImageDigestParity detecta divergencia del digest web entre entornos', () => {
  const chartPath = path.join(ROOT_DIR, 'infra/helm/pokedex');
  const tmp = fs.mkdtempSync(path.join(ROOT_DIR, 'tmp', 'parity-web-'));
  try {
    const source = fs.readFileSync(path.join(ROOT_DIR, 'gitops/environments/proxmox/values.yaml'), 'utf8');
    const webDigest = source.match(/web:[\s\S]*?digest:\s*"(sha256:[a-f0-9]{64})"/)?.[1];
    assert.ok(webDigest, 'El fixture debe contener un digest web');
    const diverged = source.replace(webDigest, `sha256:${'e'.repeat(64)}`);
    fs.writeFileSync(path.join(tmp, 'a.yaml'), source);
    fs.writeFileSync(path.join(tmp, 'b.yaml'), diverged);
    clearRenderCache();
    assert.throws(
      () =>
        verifyImageDigestParity({
          chartPath,
          environments: [
            { name: 'A', file: path.join(tmp, 'a.yaml') },
            { name: 'B', file: path.join(tmp, 'b.yaml') },
          ],
        }),
      /web/
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
