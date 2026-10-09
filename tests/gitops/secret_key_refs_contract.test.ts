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
import { renderChart } from '../helpers/helm-render.js';

type Doc = { kind: string; metadata: { name: string }; spec?: unknown };
interface SecretKeyRef {
  name: string;
  key: string;
  optional?: boolean;
}

function render(valueFile: string): Doc[] {
  return renderChart([valueFile]) as unknown as Doc[];
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
