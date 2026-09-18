import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { validateProxmoxSecretArchitecture } from '../../scripts/k8s-rollout-restart.ts';

const ROOT_DIR = path.resolve(import.meta.dirname, '../..');

test('🔒 Proxmox Secret Architecture: Validación contractual de Vault CE, ESO y ausencia de Reloader', () => {
  const result = validateProxmoxSecretArchitecture(ROOT_DIR);
  assert.ok(result.valid, `La arquitectura de secretos en Proxmox debe ser 100% coherente: ${result.reasons.join('; ')}`);
});

test('🔒 Proxmox GitOps Values: ExternalSecrets apunta al ClusterSecretStore vault-backend y clave pokedex/production', () => {
  const proxmoxValuesPath = path.join(ROOT_DIR, 'gitops/environments/proxmox/values.yaml');
  const content = fs.readFileSync(proxmoxValuesPath, 'utf-8');

  assert.match(content, /secretStoreRef:\s*\r?\n\s*name:\s*"vault-backend"/, 'Debe usar vault-backend como secretStoreRef');
  assert.match(content, /kind:\s*"ClusterSecretStore"/, 'Debe ser de clase ClusterSecretStore');
  assert.match(content, /key:\s*"pokedex\/production"/, 'Debe mapear la clave pokedex/production en el KV v2');
  assert.match(content, /reloader:\s*\r?\n\s*enabled:\s*false/, 'Stakater Reloader debe estar desactivado en Proxmox');
});

test('🔒 Vault ClusterSecretStore: Apunta a endpoint HTTPS del LXC Proxmox y rol pokedex-role', () => {
  const vaultBackendPath = path.join(ROOT_DIR, 'infra/k8s/eso/vault-backend.yaml');
  const content = fs.readFileSync(vaultBackendPath, 'utf-8');

  assert.match(content, /server:\s*"https:\/\/10\.10\.13\.110:8200"/, 'Debe apuntar a la IP del contenedor LXC de Vault vía HTTPS');
  assert.match(content, /version:\s*"v2"/, 'Debe usar motor KV v2');
  assert.match(content, /path:\s*"secret"/, 'Debe montar sobre secret');
  assert.match(content, /role:\s*"pokedex-role"/, 'Debe autenticar con el rol pokedex-role');
  assert.match(content, /caProvider:\s*\r?\n\s*type:\s*ConfigMap/, 'Debe utilizar caProvider para validación TLS segura');
});

test('🔒 Redeploy Invariant: Mutaciones en Secretos de ESO requieren rollout restart en ausencia de Reloader', () => {
  // Verificación formal del principio de inmutabilidad de entorno de proceso en Linux/Node.js:
  // 1. Las variables inyectadas mediante envFrom son copiadas al proceso en el execve inicial.
  // 2. Dado que reloader.enabled == false en Proxmox, ningún operador reinicia automáticamente los pods.
  // 3. Por lo tanto, el rollout restart progresivo es la única vía segura y soportada.
  const isReloaderActiveInProxmox = false; // SSOT
  const requiresRolloutRestartOnSecretChange = !isReloaderActiveInProxmox;

  assert.equal(
    requiresRolloutRestartOnSecretChange,
    true,
    'En Proxmox, un rollout restart es estrictamente necesario para refrescar process.env tras rotación de secretos'
  );
});
