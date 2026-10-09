/**
 * ==============================================================================
 * Toda clave de Secret que un workload exige debe sincronizarla el ExternalSecret
 * ==============================================================================
 * El CronJob de copia a Google Drive exige `GDRIVE_TOKEN` en `pokemon-secrets` (`optional: false`), pero
 * la lista por defecto del ExternalSecret no la sincronizaba: el pod quedaba en CreateContainerConfigError
 * y, con `concurrencyPolicy: Forbid`, ese Job atascado bloqueaba todas las ejecuciones siguientes. Se
 * detectó en pre-prod con 3,5 días sin copia externa.
 * ==============================================================================
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { runHelm } from '../../scripts/lib/helm.js';
import yaml from 'js-yaml';
import { ROOT_DIR } from '../helpers/repo.js';

const CHART = path.join(ROOT_DIR, 'infra/helm/pokedex');
const CI_SECRETS = [
  'postgresql.auth.password=ci',
  'secrets.adminApiKey=ci',
  'secrets.adminSessionSecret=ci',
  'redis.auth.password=ci',
  'secrets.backupEncryptionKey=ci',
].flatMap((s) => ['--set', s]);

type Doc = { kind: string; metadata: { name: string }; spec?: unknown };
interface SecretKeyRef {
  name: string;
  key: string;
  optional?: boolean;
}

function render(valueFile: string): Doc[] {
  const out = runHelm(['template', 'pokedex', CHART, '-f', path.join(ROOT_DIR, valueFile), ...CI_SECRETS]);
  return (yaml.loadAll(out) as Doc[]).filter(Boolean);
}

/** Recorre el documento y devuelve todos los `secretKeyRef` (env y envFrom explícitos). */
function collectSecretKeyRefs(node: unknown, found: SecretKeyRef[] = []): SecretKeyRef[] {
  if (Array.isArray(node)) {
    for (const item of node) collectSecretKeyRefs(item, found);
  } else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === 'secretKeyRef' && value && typeof value === 'object') found.push(value as SecretKeyRef);
      else collectSecretKeyRefs(value, found);
    }
  }
  return found;
}

for (const environment of ['proxmox-preprod']) {
  test(`🔐 Secretos: en ${environment} el ExternalSecret sincroniza cada clave obligatoria que exigen los workloads`, () => {
    const docs = render(`gitops/environments/${environment}/values.yaml`);
    const externalSecret = docs.find((d) => d.kind === 'ExternalSecret') as
      | { spec: { target: { name: string }; data: Array<{ secretKey: string }> } }
      | undefined;
    assert.ok(externalSecret, `${environment} debe renderizar el ExternalSecret`);

    const synced = new Set(externalSecret.spec.data.map((d) => d.secretKey));
    const target = externalSecret.spec.target.name;

    const missing = docs
      .flatMap((doc) => collectSecretKeyRefs(doc).map((ref) => ({ workload: `${doc.kind}/${doc.metadata.name}`, ref })))
      .filter(({ ref }) => ref.name === target && ref.optional !== true && !synced.has(ref.key))
      .map(({ workload, ref }) => `${workload} exige ${target}/${ref.key}`);

    assert.deepEqual(
      missing,
      [],
      'Estas claves son obligatorias (optional: false) y el ExternalSecret no las sincroniza: el pod no arrancará',
    );
  });
}
