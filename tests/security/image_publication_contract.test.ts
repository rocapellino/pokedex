/**
 * ==============================================================================
 * Contrato de publicación de imágenes: lo que GitOps despliega lo publica CI
 * ==============================================================================
 *
 * Regresión (2026-10-03): ci.yaml construía solo apps/backend/Dockerfile y lo
 * publicaba como ghcr.io/rocapellino/pokedex, mientras GitOps desplegaba
 * pokedex-api y pokedex-web con digests sin cambios desde el 2026-09-23. La
 * imagen web no se publicaba nunca. Los gates de paridad solo comparaban los
 * entornos entre sí y seguían en verde.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const ROOT_DIR = process.cwd();
const ci = yaml.load(fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/ci.yaml'), 'utf8')) as {
  jobs: Record<string, { strategy?: { matrix?: { include?: Array<Record<string, string>> } }; steps: Array<Record<string, any>> }>;
};
const ciText = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/ci.yaml'), 'utf8');

const IMAGE_JOBS = ['build-docker', 'trivy-scan', 'publish'];

/** Repositorios de imagen de la aplicación que declaran los values de GitOps y Helm de producción. */
function deployedRepositories(): Set<string> {
  const files = [
    'gitops/environments/proxmox/values.yaml',
    'gitops/environments/proxmox-preprod/values.yaml',
    'gitops/environments/cloud/values.yaml',
    'infra/helm/pokedex/values.prod.yaml',
  ];
  const repos = new Set<string>();
  for (const file of files) {
    const values = yaml.load(fs.readFileSync(path.join(ROOT_DIR, file), 'utf8')) as Record<string, any>;
    for (const component of ['api', 'web']) {
      const repo = values[component]?.image?.repository;
      if (repo) repos.add(repo);
    }
  }
  return repos;
}

function matrixOf(job: string): Array<Record<string, string>> {
  return ci.jobs[job]?.strategy?.matrix?.include ?? [];
}

test('📦 Publicación: build, escaneo y publicación recorren las imágenes api y web', () => {
  for (const job of IMAGE_JOBS) {
    const components = matrixOf(job).map((entry) => entry.component).sort();
    assert.deepEqual(components, ['api', 'web'], `${job} debe tener matriz con api y web`);
  }
  const dockerfiles = Object.fromEntries(matrixOf('build-docker').map((e) => [e.component, e.dockerfile]));
  assert.equal(dockerfiles.api, './apps/backend/Dockerfile');
  assert.equal(dockerfiles.web, './apps/frontend/Dockerfile');
});

test('📦 Publicación: cada repositorio que GitOps despliega es publicado por CI', () => {
  const published = new Set(matrixOf('publish').map((entry) => `ghcr.io/rocapellino/${entry.image}`));
  for (const repo of deployedRepositories()) {
    assert.ok(published.has(repo), `GitOps despliega ${repo} pero ci.yaml no lo publica`);
  }
  const imageRefs = ciText.match(/IMAGE_REF:[^\n]+/g) ?? [];
  assert.equal(imageRefs.length, IMAGE_JOBS.length, 'Cada job de imagen debe declarar IMAGE_REF');
  const registry = (yaml.load(ciText) as { env: { REGISTRY: string } }).env.REGISTRY;
  for (const ref of imageRefs) {
    assert.equal(
      ref.replace(/^IMAGE_REF:\s*/, ''),
      `${registry}/\${{ github.repository_owner }}/\${{ matrix.image }}`,
      'IMAGE_REF debe ser <env.REGISTRY>/<owner>/<matrix.image>'
    );
  }
});

test('📦 Publicación: la imagen se publica con el SHA completo del commit para que la promoción la resuelva', () => {
  assert.match(ciText, /type=sha,format=long,prefix=/, 'metadata-action debe generar el tag con el SHA completo');
  assert.match(ciText, /docker push "\$\{IMAGE_REF\}:\$\{\{\s*github\.sha\s*\}\}"/, 'publish debe empujar explícitamente el tag del SHA');
});

test('📦 Publicación: el Helm Chart se publica una sola vez y la retención inline no purga digests fijados', () => {
  const helmPush = ci.jobs.publish.steps.find((step) => step.id === 'helm-push');
  assert.ok(helmPush, 'publish debe conservar el paso helm-push');
  assert.match(String(helmPush.if), /matrix\.component == 'api'/, 'El chart se publica solo en la pata api');
  assert.ok(
    !ciText.includes('dataaxiom/ghcr-cleanup-action'),
    'La retención la gobierna ghcr-retention.ts, que protege los digests fijados en GitOps'
  );
});
