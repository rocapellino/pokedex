/**
 * ==============================================================================
 * Contrato del Seed Job del Catálogo (ADR-030)
 * ==============================================================================
 * Pre-prod siembra el catálogo nacional completo con la misma imagen que la API.
 * El job anterior no podía funcionar: referenciaba un ConfigMap y un Secret con
 * nombres que el chart no crea, usaba una imagen sin publicar y corría como
 * PreSync, antes de que existiera el StatefulSet de PostgreSQL.
 * ==============================================================================
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CHART = path.join(ROOT_DIR, 'infra/helm/pokedex');
const CI_SECRETS = [
  'postgresql.auth.password=ci',
  'secrets.adminApiKey=ci',
  'secrets.adminSessionSecret=ci',
  'redis.auth.password=ci',
  'secrets.backupEncryptionKey=ci',
].map((s) => `--set ${s}`).join(' ');

type K8sDoc = { kind: string; metadata: { name: string; annotations?: Record<string, string> }; spec: any };

function render(valueFiles: string[]): K8sDoc[] {
  const files = valueFiles.map((f) => `-f "${path.join(ROOT_DIR, f)}"`).join(' ');
  const out = execSync(`helm template pokedex "${CHART}" ${files} ${CI_SECRETS}`, { encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024 });
  return (yaml.loadAll(out) as K8sDoc[]).filter(Boolean);
}

const seedJobOf = (docs: K8sDoc[]) => docs.find((d) => d.kind === 'Job' && d.metadata.name.endsWith('-db-seed'));

test('🌱 Seed Job: pre-prod siembra el catálogo completo con la imagen y el entorno de la API', () => {
  const docs = render(['gitops/environments/proxmox-preprod/values.yaml']);
  const job = seedJobOf(docs);
  assert.ok(job, 'pre-prod debe renderizar el Job de siembra');

  const seeder = job.spec.template.spec.containers[0];
  const api = docs.find((d) => d.kind === 'Deployment' && d.metadata.name === 'pokemon-api')!.spec.template.spec.containers[0];

  assert.equal(seeder.image, api.image, 'El seed job debe usar la misma imagen (y digest firmado) que la API');
  assert.match(seeder.image, /@sha256:[a-f0-9]{64}$/, 'La imagen del seed job debe fijarse por digest');
  assert.deepEqual(seeder.envFrom, api.envFrom, 'El seed job debe leer el mismo ConfigMap y Secret que la API');
  assert.deepEqual(seeder.command, ['node', 'dist/seed.cjs']);

  const env = Object.fromEntries((seeder.env as Array<{ name: string; value: string }>).map((e) => [e.name, e.value]));
  assert.equal(env.SEED_DATASET, 'full', 'pre-prod debe sembrar el catálogo completo');
  assert.equal(env.FORCE_SEED, 'false', 'pre-prod no debe reescribir ediciones del backoffice');
});

test('🌱 Seed Job: corre después de la sincronización, no antes de crear la base de datos', () => {
  const job = seedJobOf(render(['gitops/environments/proxmox-preprod/values.yaml']))!;
  const annotations = job.metadata.annotations ?? {};
  assert.equal(annotations['argocd.argoproj.io/hook'], 'PostSync');
  assert.equal(annotations['helm.sh/hook'], 'post-install,post-upgrade');
  assert.ok(annotations['argocd.argoproj.io/hook-delete-policy']?.includes('HookSucceeded'));
});

test('🌱 Seed Job: los demás entornos no siembran por defecto', () => {
  for (const valueFiles of [
    ['gitops/environments/proxmox/values.yaml'],
    ['infra/helm/pokedex/values.dev.yaml'],
    ['infra/helm/pokedex/values.prod.yaml'],
  ]) {
    assert.equal(seedJobOf(render(valueFiles)), undefined, `${valueFiles.join(' + ')} no debe renderizar el seed job`);
  }
});
