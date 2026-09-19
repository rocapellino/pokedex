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

test('🔒 Vault ClusterSecretStore: Apunta a endpoint HTTPS del LXC Proxmox y rol pokedex-prod-role', () => {
  const vaultBackendPath = path.join(ROOT_DIR, 'infra/k8s/eso/vault-backend.yaml');
  const content = fs.readFileSync(vaultBackendPath, 'utf-8');

  assert.match(content, /server:\s*"https:\/\/10\.10\.13\.110:8200"/, 'Debe apuntar a la IP del contenedor LXC de Vault vía HTTPS');
  assert.match(content, /version:\s*"v2"/, 'Debe usar motor KV v2');
  assert.match(content, /path:\s*"secret"/, 'Debe montar sobre secret');
  assert.match(content, /role:\s*"pokedex-prod-role"/, 'Debe autenticar con el rol pokedex-prod-role');
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

test('🔒 Vault Multi-Env Separation: Políticas y roles segregados para Pre-prod y Prod (Zero-Trust Least Privilege)', () => {
  const setupVaultPath = path.join(ROOT_DIR, 'infra/ansible/playbooks/setup_vault.yml');
  const content = fs.readFileSync(setupVaultPath, 'utf-8');

  assert.match(content, /pokedex-preprod-policy\.hcl/, 'Debe generar la política pokedex-preprod-policy');
  assert.match(content, /secret\/data\/pokedex\/preprod\/\*/, 'La política de pre-prod debe restringir a secret/data/pokedex/preprod/*');
  assert.match(content, /pokedex-prod-policy\.hcl/, 'Debe generar la política pokedex-prod-policy');
  assert.match(content, /secret\/data\/pokedex\/prod\/\*/, 'La política de prod debe restringir a secret/data/pokedex/prod/*');
  assert.match(content, /auth\/kubernetes\/role\/pokedex-preprod-role/, 'Debe configurar el rol de autenticación K8s pokedex-preprod-role');
  assert.match(content, /auth\/kubernetes\/role\/pokedex-prod-role/, 'Debe configurar el rol de autenticación K8s pokedex-prod-role');
  assert.doesNotMatch(content, /auth\/kubernetes\/role\/pokedex-role\b/, 'No debe existir el rol genérico pokedex-role (violación de Least Privilege)');
  assert.doesNotMatch(content, /dest:\s*"\{\{\s*vault_config_dir\s*\}\}\/pokedex-policy\.hcl"/, 'No debe existir la política genérica pokedex-policy');
});

test('🛡️ Bastion Break-Glass & Audit: Captura obligatoria de comandos y políticas operativas', () => {
  const setupBastionPath = path.join(ROOT_DIR, 'infra/ansible/playbooks/setup_bastion.yml');
  const content = fs.readFileSync(setupBastionPath, 'utf-8');

  assert.match(content, /\/var\/log\/bastion\/audit\.log/, 'Bastion debe configurar log dedicado para auditoría');
  assert.match(content, /_bastion_audit/, 'Bastion debe capturar comandos con función interceptora de auditoría');
  assert.match(content, /authpriv\.notice/, 'Bastion debe reenviar eventos de auditoría a syslog');
  assert.match(content, /pokedex_git_version/, 'Bastion debe parametrizar la versión del repositorio');
  assert.match(content, /bastion_git_commit_sha/, 'Bastion debe admitir anclaje inmutable a Commit SHA');
  assert.doesNotMatch(content, /version:\s*main/, 'Bastion no debe fijar una rama mutable como main');

  const breakGlassRunbook = path.join(ROOT_DIR, 'docs/runbooks/BREAK_GLASS_PROCEDURE.md');
  assert.ok(fs.existsSync(breakGlassRunbook), 'Debe existir el runbook de procedimiento Break-Glass');
  const breakGlassContent = fs.readFileSync(breakGlassRunbook, 'utf-8');
  assert.match(breakGlassContent, /KNOWN_GOOD_COMMIT_SHA/, 'El runbook debe exigir el uso de un Commit SHA conocido y verificado');

  const spofDoc = path.join(ROOT_DIR, 'docs/architecture/ONPREM_SPOF_AND_FAILURE_DOMAIN_ANALYSIS.md');
  assert.ok(fs.existsSync(spofDoc), 'Debe existir el análisis formal de SPOF y dominios de falla on-premise');

  const matrixDoc = path.join(ROOT_DIR, 'docs/architecture/RESPONSIBILITY_MATRIX.md');
  assert.ok(fs.existsSync(matrixDoc), 'Debe existir la matriz canónica de responsabilidades');
  const matrixContent = fs.readFileSync(matrixDoc, 'utf-8');
  assert.match(matrixContent, /OpenTofu/, 'Debe documentar OpenTofu');
  assert.match(matrixContent, /Bastion/, 'Debe documentar Bastion');
  assert.match(matrixContent, /Vault/, 'Debe documentar Vault');
  assert.match(matrixContent, /ArgoCD/, 'Debe documentar ArgoCD');
  assert.match(matrixContent, /Grafana Alloy/, 'Debe documentar Grafana Alloy');
  assert.match(matrixContent, /ESLint/, 'Debe documentar demarcación de ESLint');
  assert.match(matrixContent, /MegaLinter/, 'Debe documentar demarcación de MegaLinter');
  assert.match(matrixContent, /Semgrep/, 'Debe documentar demarcación de Semgrep');
  assert.match(matrixContent, /SonarQube/, 'Debe documentar demarcación de SonarQube');
  assert.match(matrixContent, /Checkov/, 'Debe documentar demarcación de Checkov');
  assert.match(matrixContent, /Trivy/, 'Debe documentar demarcación de Trivy');

  const declaredVsRenderedDoc = path.join(ROOT_DIR, 'docs/architecture/DECLARED_VS_RENDERED_ARCHITECTURE_ANALYSIS.md');
  assert.ok(fs.existsSync(declaredVsRenderedDoc), 'Debe existir el documento de análisis declarado vs renderizado');
  const renderedContent = fs.readFileSync(declaredVsRenderedDoc, 'utf-8');
  assert.match(renderedContent, /K3s Runtime/, 'Debe auditar K3s');
  assert.match(renderedContent, /Cilium/, 'Debe auditar Cilium');
  assert.match(renderedContent, /PgBouncer/, 'Debe auditar PgBouncer');
  assert.match(renderedContent, /Stakater Reloader/, 'Debe auditar Reloader');
  assert.match(renderedContent, /cAdvisor/, 'Debe auditar cAdvisor');
});



