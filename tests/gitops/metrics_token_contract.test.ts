/**
 * ==============================================================================
 * Contrato del token de /metrics en pre-prod (AUD-SEC-OBS-001)
 * ==============================================================================
 * La API exige `METRICS_BEARER_TOKEN` en /metrics cuando la variable existe. En pre-prod el valor
 * llega por ESO desde Vault (`pokedex/preprod`); sin la entrada en el ExternalSecret el Pod no lo
 * recibe y /metrics queda abierto. El Alloy ya lo envía desde su propio Secret en `monitoring`.
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

interface ExternalSecretDoc {
  kind: string;
  spec: { data?: Array<{ secretKey: string; remoteRef: { key: string; property: string } }> };
}

function renderPreprod(): ExternalSecretDoc[] {
  const values = path.join(ROOT_DIR, 'gitops/environments/proxmox-preprod/values.yaml');
  const out = runHelm(['template', 'pokedex', CHART, '-f', values, ...CI_SECRETS]);
  return (yaml.loadAll(out) as ExternalSecretDoc[]).filter(Boolean);
}

test('🔐 AUD-SEC-OBS-001: pre-prod sincroniza METRICS_BEARER_TOKEN desde Vault al Secret de la API', () => {
  const externalSecret = renderPreprod().find((d) => d.kind === 'ExternalSecret');
  assert.ok(externalSecret, 'pre-prod debe renderizar el ExternalSecret');

  const entry = externalSecret.spec.data?.find((d) => d.secretKey === 'METRICS_BEARER_TOKEN');
  assert.ok(entry, 'Sin METRICS_BEARER_TOKEN en el ExternalSecret la API no exige el token en /metrics');
  assert.equal(entry.remoteRef.key, 'pokedex/preprod', 'Debe leer la misma ruta de Vault que el resto de secretos');
  assert.equal(entry.remoteRef.property, 'METRICS_BEARER_TOKEN');
});
