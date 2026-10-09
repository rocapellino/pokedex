/**
 * ==============================================================================
 * Promoción de digests de imagen en GitOps (update-image-digests.ts)
 * ==============================================================================
 *
 * Regresión (2026-10-03): la fase promote de release-tag.yaml solo movía la
 * versión y el targetRevision. Los digests de pokedex-api y pokedex-web no se
 * promovían nunca, así que cada release desplegaba el chart nuevo con imágenes
 * del 2026-09-23. El PR de promoción debe fijar los digests de las imágenes
 * construidas para el mismo commit, verificadas con Cosign.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yaml from 'js-yaml';
import { IMAGE_VALUES_FILES, applyImageDigests, replaceComponentDigest } from '../../scripts/update-image-digests.ts';
import { ROOT_DIR } from '../helpers/repo.js';

const API = `sha256:${'a'.repeat(64)}`;
const WEB = `sha256:${'b'.repeat(64)}`;
const OLD_API = `sha256:${'1'.repeat(64)}`;
const OLD_WEB = `sha256:${'2'.repeat(64)}`;

const VALUES = [
  'global:',
  '  namespace: pokemon-app',
  'api:',
  '  image:',
  '    repository: ghcr.io/rocapellino/pokedex-api',
  `    digest: "${OLD_API}" # SHA256 digest pinning inmutable (SSOT)`,
  'web:',
  '  image:',
  '    repository: ghcr.io/rocapellino/pokedex-web',
  `    digest: "${OLD_WEB}" # SHA256 digest pinning inmutable (SSOT)`,
  'backup:',
  '  image:',
  `    digest: "sha256:${'3'.repeat(64)}"`,
  '',
].join('\n');

test('🧬 Promoción: reemplaza solo el digest del componente y conserva comentario y otros bloques', () => {
  const updated = replaceComponentDigest(VALUES, 'api', API);
  assert.match(updated, new RegExp(`digest: "${API}" # SHA256 digest pinning inmutable \\(SSOT\\)`));
  assert.ok(updated.includes(OLD_WEB), 'El digest web no debe cambiar');
  assert.ok(updated.includes(`sha256:${'3'.repeat(64)}`), 'Otros bloques con digest no deben cambiar');
  assert.equal(updated.split('\n').length, VALUES.split('\n').length);
});

test('🧬 Promoción: conserva finales de línea CRLF', () => {
  const crlf = VALUES.replace(/\n/g, '\r\n');
  const updated = replaceComponentDigest(crlf, 'web', WEB);
  assert.ok(updated.includes(`digest: "${WEB}" # SHA256 digest pinning inmutable (SSOT)\r\n`));
  assert.equal(updated.split('\r\n').length, crlf.split('\r\n').length);
});

test('🧬 Promoción: rechaza digests mutables o mal formados y bloques ausentes', () => {
  assert.throws(() => replaceComponentDigest(VALUES, 'api', 'latest'), /sha256/);
  assert.throws(() => replaceComponentDigest(VALUES, 'api', 'sha256:abc'), /sha256/);
  assert.throws(() => replaceComponentDigest('global:\n  x: 1\n', 'api', API), /api/);
});

test('🧬 Promoción: applyImageDigests actualiza api y web en todos los values de despliegue', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'image-digests-'));
  try {
    for (const file of IMAGE_VALUES_FILES) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), VALUES);
    }
    const changed = applyImageDigests({ api: API, web: WEB }, root);
    assert.deepEqual([...changed].sort(), [...IMAGE_VALUES_FILES].sort());
    for (const file of IMAGE_VALUES_FILES) {
      const values = yaml.load(fs.readFileSync(path.join(root, file), 'utf8')) as Record<string, any>;
      assert.equal(values.api.image.digest, API);
      assert.equal(values.web.image.digest, WEB);
    }
    assert.deepEqual(applyImageDigests({ api: API, web: WEB }, root), [], 'Una segunda aplicación es idempotente');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('🧬 Promoción: los values reales tienen un digest api y uno web reemplazables', () => {
  for (const file of IMAGE_VALUES_FILES) {
    const content = fs.readFileSync(path.join(ROOT_DIR, file), 'utf8');
    for (const component of ['api', 'web'] as const) {
      assert.doesNotThrow(() => replaceComponentDigest(content, component, API), `${file}: ${component}`);
    }
  }
});

test('🧬 Promoción: release-tag fija digests verificados con Cosign en el PR de promoción', () => {
  const workflowText = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/release-tag.yaml'), 'utf8');
  const workflow = yaml.load(workflowText) as {
    permissions: Record<string, string>;
    jobs: Record<string, { steps: Array<Record<string, any>> }>;
  };
  const steps = Object.values(workflow.jobs).flatMap((job) => job.steps);

  assert.equal(
    workflow.permissions.packages,
    'read',
    'release-tag necesita packages: read para resolver digests en GHCR',
  );

  const resolve = steps.find((step) => step.id === 'image-digests');
  assert.ok(resolve, 'Debe existir el paso image-digests en la fase promote');
  assert.match(String(resolve.if), /phase == 'promote'/);
  const run = String(resolve.run);
  assert.match(
    run,
    /REPO="ghcr\.io\/\$\{GITHUB_REPOSITORY_OWNER\}\/pokedex-\$\{component\}"/,
    'Debe resolver pokedex-api y pokedex-web',
  );
  assert.match(run, /for component in api web; do/);
  assert.match(run, /REF="\$\{REPO\}:\$\{GITHUB_SHA\}"/, 'Debe resolver la imagen construida para el mismo commit');
  assert.match(run, /cosign verify/, 'Debe verificar la firma antes de fijar el digest');
  assert.match(run, /ci\.yaml@refs\/heads\/main/, 'La identidad de firma debe ser ci.yaml en main (igual que Kyverno)');

  const promote = steps.find((step) => String(step.name).includes('Crear Pull Request Atómico'));
  assert.ok(promote);
  const promoteRun = String(promote.run);
  assert.match(promoteRun, /scripts\/update-image-digests\.ts --api "\$\{API_DIGEST\}" --web "\$\{WEB_DIGEST\}"/);
  assert.match(promoteRun, /git add [^\n]*gitops\/environments\/[^\n]*infra\/helm\/pokedex\/values\.prod\.yaml/);
  // La paridad entre entornos la certifica el CI del propio PR de promoción
  // (tests/security/gitops_image_parity.test.ts).
});

test('🧬 Promoción: el script corre en release-tag sin npm ci (solo módulos nativos)', () => {
  const source = fs.readFileSync(path.join(ROOT_DIR, 'scripts/update-image-digests.ts'), 'utf8');
  const imports = [...source.matchAll(/^import .* from '([^']+)';/gm)].map((m) => m[1]);
  assert.ok(imports.length > 0);
  for (const specifier of imports) {
    assert.match(specifier, /^node:/, `release-tag no instala dependencias: ${specifier} no está disponible`);
  }
});
