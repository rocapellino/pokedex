#!/usr/bin/env node
/**
 * ==============================================================================
 * Auditoría Estática de Rotación de Secretos y Arquitectura Dual (ADR-022)
 * ==============================================================================
 * Valida de forma automatizada y fail-closed la taxonomía y garantías de rotación:
 *
 * 1. Estructura Agnóstica en Templates Helm:
 *    - api-deployment.yaml y web-deployment.yaml soportan deploymentAnnotations.
 *    - externalsecret.yaml parametriza refreshInterval.
 *    - configmap.yaml no contiene contraseñas ni claves confidenciales.
 *
 * 2. Entorno Cloud Enterprise (AWS EKS):
 *    - Reloader = REQUIRED (reloader.enabled: true, reloader.auto: true o annotations).
 *    - ExternalSecrets = REQUIRED con ClusterSecretStore 'aws-secrets-manager'.
 *    - refreshInterval <= 24h.
 *
 * 3. Entorno On-Premise Lean (Proxmox VE K3s):
 *    - Reloader = FORBIDDEN (reloader.enabled: false para footprint < 1GB y menor RBAC).
 *    - rollout restart = REQUIRED (scripts/k8s-rollout-restart.ts operativo y formalizado).
 *    - ExternalSecrets = REQUIRED con ClusterSecretStore 'vault-backend'.
 *    - refreshInterval <= 24h.
 *
 * 4. Gobernanza Global de Frescura:
 *    - Todos los manifiestos con refreshInterval (values.yaml, values.prod.yaml, etc.)
 *      deben cumplir <= 24h.
 * ==============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

interface AuditResult {
  check: string;
  passed: boolean;
  details?: string;
}

const results: AuditResult[] = [];

function check(title: string, fn: () => void) {
  try {
    fn();
    results.push({ check: title, passed: true });
    console.log(`  ✔ [PASS] ${title}`);
  } catch (error: any) {
    results.push({ check: title, passed: false, details: error.message });
    console.error(`  ✖ [FAIL] ${title}: ${error.message}`);
  }
}

function parseRefreshIntervalHours(content: string, filename: string): number {
  const match = content.match(/refreshInterval:\s*["']?(\d+(?:\.\d+)?)\s*(s|m|h|d)["']?/i);
  if (!match) {
    throw new Error(`${filename} no define externalSecrets.refreshInterval`);
  }
  const val = Number.parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  let hours = val;
  if (unit === 's') hours = val / 3600;
  else if (unit === 'm') hours = val / 60;
  else if (unit === 'h') hours = val;
  else if (unit === 'd') hours = val * 24;

  if (hours > 24) {
    throw new Error(`${filename} define refreshInterval de ${val}${unit} (${hours}h), superando el máximo permitido de 24h`);
  }
  return hours;
}

console.log('================================================================');
console.log('🛡️ Auditoría de Gobernanza: Rotación Dual de Secretos (ADR-022)');
console.log('   - AWS (Cloud Enterprise) : Reloader = REQUIRED');
console.log('   - Proxmox VE (On-Prem)   : Reloader = FORBIDDEN | rollout restart = REQUIRED');
console.log('   - Todos los entornos     : ESO refreshInterval <= 24h');
console.log('================================================================\n');

// 1. Validar soporte estructural en templates Helm
check('Templates Helm: api-deployment.yaml soporta inyección de deploymentAnnotations', () => {
  const file = path.join(ROOT_DIR, 'infra/helm/pokedex/templates/api-deployment.yaml');
  const content = fs.readFileSync(file, 'utf-8');
  if (!content.includes('with .Values.api.deploymentAnnotations')) {
    throw new Error('api-deployment.yaml debe incluir bloque with .Values.api.deploymentAnnotations');
  }
});

check('Templates Helm: web-deployment.yaml soporta inyección de deploymentAnnotations', () => {
  const file = path.join(ROOT_DIR, 'infra/helm/pokedex/templates/web-deployment.yaml');
  const content = fs.readFileSync(file, 'utf-8');
  if (!content.includes('with .Values.web.deploymentAnnotations')) {
    throw new Error('web-deployment.yaml debe incluir bloque with .Values.web.deploymentAnnotations');
  }
});

check('Templates Helm: externalsecret.yaml parametriza refreshInterval', () => {
  const file = path.join(ROOT_DIR, 'infra/helm/pokedex/templates/externalsecret.yaml');
  const content = fs.readFileSync(file, 'utf-8');
  if (!content.includes('.Values.externalSecrets.refreshInterval')) {
    throw new Error('externalsecret.yaml debe parametrizar refreshInterval');
  }
});

check('Templates Helm: configmap.yaml no contiene contraseñas ni claves confidenciales', () => {
  const file = path.join(ROOT_DIR, 'infra/helm/pokedex/templates/configmap.yaml');
  const content = fs.readFileSync(file, 'utf-8');
  const forbidden = ['PASSWORD', 'ADMIN_API_KEY', 'SESSION_SECRET', 'BACKUP_ENCRYPTION_KEY'];
  for (const key of forbidden) {
    if (content.includes(key)) {
      throw new Error(`configmap.yaml contiene clave confidencial prohibida: ${key}`);
    }
  }
});

// 2. AWS Cloud Enterprise: Reloader = REQUIRED, ESO = REQUIRED, refreshInterval <= 24h
check('AWS Cloud GitOps: Reloader = REQUIRED (reloader.enabled: true)', () => {
  const file = path.join(ROOT_DIR, 'gitops/environments/aws/values.yaml');
  const content = fs.readFileSync(file, 'utf-8');
  const hasReloaderBlock = content.includes('reloader:\n  enabled: true') || content.includes('reloader:\r\n  enabled: true');
  if (!hasReloaderBlock) {
    throw new Error('gitops/environments/aws/values.yaml debe declarar reloader.enabled: true (Reloader es obligatorio en Cloud)');
  }
  const hasAuto = content.includes('reloader.stakater.com/auto: "true"') || content.includes('auto: true');
  if (!hasAuto) {
    throw new Error('gitops/environments/aws/values.yaml debe configurar recarga automática (auto: true o anotación stakater)');
  }
});

check('AWS Cloud GitOps: ESO = REQUIRED con ClusterSecretStore aws-secrets-manager y refreshInterval <= 24h', () => {
  const file = path.join(ROOT_DIR, 'gitops/environments/aws/values.yaml');
  const content = fs.readFileSync(file, 'utf-8');
  if (!content.includes('enabled: true')) {
    throw new Error('AWS values.yaml debe tener externalSecrets habilitado');
  }
  if (!content.includes('name: "aws-secrets-manager"')) {
    throw new Error('AWS values.yaml debe referenciar aws-secrets-manager');
  }
  const hours = parseRefreshIntervalHours(content, 'gitops/environments/aws/values.yaml');
  if (hours > 24) {
    throw new Error(`refreshInterval en AWS supera 24h: ${hours}h`);
  }
});

// 3. Proxmox VE Lean: Reloader = FORBIDDEN, rollout restart = REQUIRED, ESO = REQUIRED
check('Proxmox On-Prem GitOps: Reloader = FORBIDDEN (reloader.enabled: false para perfil Lean)', () => {
  const file = path.join(ROOT_DIR, 'gitops/environments/proxmox/values.yaml');
  const content = fs.readFileSync(file, 'utf-8');
  const isReloaderDisabled = content.includes('reloader:\n  enabled: false') || content.includes('reloader:\r\n  enabled: false');
  if (!isReloaderDisabled) {
    throw new Error('gitops/environments/proxmox/values.yaml debe tener reloader.enabled: false (Reloader prohibido en perfil Lean)');
  }
  if (content.includes('reloader:\n  enabled: true') || content.includes('reloader:\r\n  enabled: true')) {
    throw new Error('gitops/environments/proxmox/values.yaml tiene reloader.enabled: true, violando el perfil Lean de Proxmox');
  }
});

check('Proxmox On-Prem GitOps: rollout restart = REQUIRED (mecanismo de recarga sin Stakater)', () => {
  const rolloutScript = path.join(ROOT_DIR, 'scripts/k8s-rollout-restart.ts');
  if (!fs.existsSync(rolloutScript)) {
    throw new Error('scripts/k8s-rollout-restart.ts debe existir para soportar rollout restart en Proxmox');
  }
  const scriptContent = fs.readFileSync(rolloutScript, 'utf-8');
  if (!scriptContent.includes('rollout') || !scriptContent.includes('restart')) {
    throw new Error('scripts/k8s-rollout-restart.ts debe implementar lógica de rollout restart progresivo');
  }
  if (!scriptContent.includes('validateProxmoxSecretArchitecture')) {
    throw new Error('scripts/k8s-rollout-restart.ts debe exportar validateProxmoxSecretArchitecture');
  }
});

check('Proxmox On-Prem GitOps: ESO = REQUIRED con ClusterSecretStore vault-backend y refreshInterval <= 24h', () => {
  const file = path.join(ROOT_DIR, 'gitops/environments/proxmox/values.yaml');
  const content = fs.readFileSync(file, 'utf-8');
  if (!content.includes('name: "vault-backend"')) {
    throw new Error('Proxmox values.yaml debe referenciar vault-backend');
  }
  const hours = parseRefreshIntervalHours(content, 'gitops/environments/proxmox/values.yaml');
  if (hours > 24) {
    throw new Error(`refreshInterval en Proxmox supera 24h: ${hours}h`);
  }
});

// 4. Proxmox VE Pre-prod (LXC 800): Reloader = FORBIDDEN, ESO = vault-backend-preprod (Opción A)
check('Proxmox Pre-prod GitOps (LXC 800): Reloader = FORBIDDEN (reloader.enabled: false)', () => {
  const file = path.join(ROOT_DIR, 'gitops/environments/proxmox-preprod/values.yaml');
  if (!fs.existsSync(file)) {
    throw new Error('gitops/environments/proxmox-preprod/values.yaml debe existir bajo Opción A');
  }
  const content = fs.readFileSync(file, 'utf-8');
  const isReloaderDisabled = content.includes('reloader:\n  enabled: false') || content.includes('reloader:\r\n  enabled: false');
  if (!isReloaderDisabled) {
    throw new Error('gitops/environments/proxmox-preprod/values.yaml debe tener reloader.enabled: false');
  }
});

check('Proxmox Pre-prod GitOps (LXC 800): ESO conectado a vault-backend-preprod y clave pokedex/preprod', () => {
  const file = path.join(ROOT_DIR, 'gitops/environments/proxmox-preprod/values.yaml');
  const content = fs.readFileSync(file, 'utf-8');
  if (!content.includes('name: "vault-backend-preprod"')) {
    throw new Error('Pre-prod values.yaml debe referenciar vault-backend-preprod');
  }
  if (!content.includes('key: "pokedex/preprod"')) {
    throw new Error('Pre-prod values.yaml debe mapear key: pokedex/preprod');
  }
  const hours = parseRefreshIntervalHours(content, 'gitops/environments/proxmox-preprod/values.yaml');
  if (hours > 24) {
    throw new Error(`refreshInterval en Pre-prod supera 24h: ${hours}h`);
  }
});

check('Proxmox Pre-prod GitOps (LXC 800): Application app-proxmox-preprod.yaml declarada en ArgoCD', () => {
  const appFile = path.join(ROOT_DIR, 'gitops/apps/app-proxmox-preprod.yaml');
  if (!fs.existsSync(appFile)) {
    throw new Error('gitops/apps/app-proxmox-preprod.yaml debe existir en el árbol GitOps de ArgoCD');
  }
  const content = fs.readFileSync(appFile, 'utf-8');
  if (!content.includes('name: pokedex-preprod')) {
    throw new Error('app-proxmox-preprod.yaml debe nombrar la app pokedex-preprod');
  }
  if (!content.includes('gitops/environments/proxmox-preprod/values.yaml')) {
    throw new Error('app-proxmox-preprod.yaml debe cargar values de proxmox-preprod');
  }
});

// 4. Gobernanza Global de Frescura en valores base (refreshInterval <= 24h)
check('Gobernanza Global: values.prod.yaml define refreshInterval <= 24h', () => {
  const file = path.join(ROOT_DIR, 'infra/helm/pokedex/values.prod.yaml');
  const content = fs.readFileSync(file, 'utf-8');
  const hours = parseRefreshIntervalHours(content, 'infra/helm/pokedex/values.prod.yaml');
  if (hours > 24) {
    throw new Error(`refreshInterval en values.prod.yaml supera 24h: ${hours}h`);
  }
});

check('Gobernanza Global: values.yaml define refreshInterval <= 24h', () => {
  const file = path.join(ROOT_DIR, 'infra/helm/pokedex/values.yaml');
  const content = fs.readFileSync(file, 'utf-8');
  const hours = parseRefreshIntervalHours(content, 'infra/helm/pokedex/values.yaml');
  if (hours > 24) {
    throw new Error(`refreshInterval en values.yaml supera 24h: ${hours}h`);
  }
});

// Resumen final
console.log('\n----------------------------------------------------------------');
const failed = results.filter(r => !r.passed);
if (failed.length > 0) {
  console.error(`❌ Auditoría fallida: ${failed.length} de ${results.length} verificaciones no pasaron.`);
  process.exit(1);
} else {
  console.log(`✅ Auditoría exitosa: ${results.length}/${results.length} controles de la arquitectura dual (AWS Reloader / Proxmox Rollout) en cumplimiento estricto.`);
  process.exit(0);
}
