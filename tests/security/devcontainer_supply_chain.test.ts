import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..', '..');

/**
 * Features cuya opción `version` puede seguir en `latest` porque instalan solo el cliente de
 * Docker: el daemon real es el del host (docker-outside-of-docker) y el lock ya fija la feature.
 */
const LATEST_ALLOWED = new Set(['ghcr.io/devcontainers/features/docker-outside-of-docker:1']);

interface DevcontainerConfig {
  image: string;
  features: Record<string, { version?: string; helm?: string }>;
}

function readJsonc<T>(relativePath: string): T {
  const raw = fs.readFileSync(path.join(ROOT_DIR, relativePath), 'utf-8');
  // Quita comentarios de línea completa (el archivo no los usa dentro de strings).
  const stripped = raw
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
  return JSON.parse(stripped) as T;
}

function toolVersion(tool: string): string {
  const line = fs
    .readFileSync(path.join(ROOT_DIR, '.tool-versions'), 'utf-8')
    .split('\n')
    .find((entry) => entry.startsWith(`${tool} `));
  assert.ok(line, `.tool-versions debe declarar '${tool}'`);
  return line.split(/\s+/)[1];
}

const config = readJsonc<DevcontainerConfig>('.devcontainer/devcontainer.json');

test('🛡️ DEVCONTAINER-001: Renovate vigila el devcontainer (imagen, features y lock)', () => {
  const renovate = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'renovate.json'), 'utf-8')) as {
    enabledManagers: string[];
  };
  assert.ok(
    renovate.enabledManagers.includes('devcontainer'),
    "DEVCONTAINER-001: 'devcontainer' debe estar en enabledManagers; sin él la imagen y las features nunca se actualizan",
  );
});

test('🛡️ DEVCONTAINER-002: la imagen base está fijada por digest SHA-256', () => {
  assert.match(
    config.image,
    /@sha256:[0-9a-f]{64}$/,
    'DEVCONTAINER-002: la imagen debe fijarse como tag@sha256:<digest>, igual que los Dockerfiles de apps/',
  );
});

test('🛡️ DEVCONTAINER-003: toda feature tiene entrada en el lock y versiones fijadas', () => {
  const lock = readJsonc<{ features: Record<string, { version: string; resolved: string; integrity: string }> }>(
    '.devcontainer/devcontainer-lock.json',
  );

  for (const [feature, options] of Object.entries(config.features)) {
    const locked = lock.features[feature];
    assert.ok(locked, `DEVCONTAINER-003: '${feature}' no está en devcontainer-lock.json`);
    assert.match(locked.resolved, /@sha256:[0-9a-f]{64}$/, `'${feature}' debe resolverse por digest en el lock`);
    assert.equal(locked.integrity, `sha256:${locked.resolved.split('@sha256:')[1]}`, `'${feature}': integrity != digest`);
    if (!LATEST_ALLOWED.has(feature)) {
      assert.notEqual(options.version, 'latest', `DEVCONTAINER-003: '${feature}' no debe usar version 'latest'`);
    }
  }
  for (const feature of Object.keys(lock.features)) {
    assert.ok(config.features[feature], `DEVCONTAINER-003: '${feature}' está en el lock pero no en devcontainer.json`);
  }
});

test('🛡️ DEVCONTAINER-004: kubectl y helm del devcontainer coinciden con .tool-versions', () => {
  const feature = config.features['ghcr.io/devcontainers/features/kubectl-helm-minikube:1'];
  assert.equal(feature.version, toolVersion('kubectl'), 'kubectl del devcontainer != .tool-versions');
  assert.equal(feature.helm, toolVersion('helm'), 'helm del devcontainer != .tool-versions');
});
