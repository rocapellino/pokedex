import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractRenderedApiImage,
  parseImmutableDigest,
  verifyImageDigestParity,
} from '../../scripts/verify-image-digest-parity.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

test('🔒 GitOps Parity: extractRenderedApiImage compila el Deployment mediante Helm y extrae la imagen del contenedor api', () => {
  const chartPath = path.join(ROOT_DIR, 'infra/helm/pokedex');
  const environments = [
    'gitops/environments/aws/values.yaml',
    'gitops/environments/proxmox/values.yaml',
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

test('🔒 GitOps Parity: verifyImageDigestParity certifica paridad 1:1 entre AWS, Proxmox y Helm Prod', () => {
  const chartPath = path.join(ROOT_DIR, 'infra/helm/pokedex');
  const results = verifyImageDigestParity({ chartPath });

  assert.strictEqual(results.length, 3, 'Debe evaluar exactamente 3 entornos');
  const [aws, proxmox, prod] = results;

  assert.strictEqual(aws.digest, proxmox.digest, 'AWS y Proxmox deben tener digests idénticos');
  assert.strictEqual(aws.digest, prod.digest, 'AWS y Helm Prod deben tener digests idénticos');
});

test('🔒 GitOps Parity: verifyImageDigestParity detecta discrepancias con digest publicado esperado', () => {
  const chartPath = path.join(ROOT_DIR, 'infra/helm/pokedex');
  const fakeDigest = 'sha256:0000000000000000000000000000000000000000000000000000000000000000';

  assert.throws(
    () => verifyImageDigestParity({ chartPath, publishedDigest: fakeDigest }),
    /Discrepancia entre la imagen publicada en CI y los manifiestos GitOps/
  );
});

test('🔒 Supply Chain: .github/workflows/ci.yml utiliza validación determinista por Helm AST en lugar de grep/awk', () => {
  const ciWorkflow = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/ci.yml'), 'utf-8');

  // Asegurar que no use grep -A 4 ni awk para extraer digests en CI
  assert.ok(
    !ciWorkflow.includes("grep -A 4 'pokedex-api'"),
    'ci.yml no debe utilizar grep -A 4 para extraer digests de GitOps'
  );

  // Asegurar que invoque el script determinista verify-image-digest-parity.ts con flag --strict
  assert.match(
    ciWorkflow,
    /verify-image-digest-parity\.ts.*--strict/,
    'ci.yml debe invocar scripts/verify-image-digest-parity.ts en modo estricto (--strict)'
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
