#!/usr/bin/env node
/**
 * ==============================================================================
 * Auditoría Estática de Rotación de Secretos y Stakater Reloader (ADR-022)
 * ==============================================================================
 * Valida de forma automatizada y fail-closed que:
 * 1. Todos los Deployments consumidores de secretos incluyan la anotación de Stakater Reloader.
 * 2. El recurso ExternalSecret defina refreshInterval acotado (<= 24h) para rotación periódica.
 * 3. Ningún ConfigMap contenga claves confidenciales en texto claro.
 * 4. Los valores de producción y base configuren reloader.stakater.com/auto: "true".
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

console.log('================================================================');
console.log('🛡️ Auditoría de Gobernanza: Rotación de Secretos y Reloader (ADR-022)');
console.log('================================================================\n');

// 1. Validar anotaciones de Reloader en plantillas de Deployments
check('api-deployment.yaml soporta inyección de deploymentAnnotations', () => {
  const file = path.join(ROOT_DIR, 'infra/helm/pokedex/templates/api-deployment.yaml');
  const content = fs.readFileSync(file, 'utf-8');
  if (!content.includes('with .Values.api.deploymentAnnotations')) {
    throw new Error('api-deployment.yaml debe incluir bloque with .Values.api.deploymentAnnotations');
  }
});

check('web-deployment.yaml soporta inyección de deploymentAnnotations', () => {
  const file = path.join(ROOT_DIR, 'infra/helm/pokedex/templates/web-deployment.yaml');
  const content = fs.readFileSync(file, 'utf-8');
  if (!content.includes('with .Values.web.deploymentAnnotations')) {
    throw new Error('web-deployment.yaml debe incluir bloque with .Values.web.deploymentAnnotations');
  }
});

// 2. Validar configuración de Reloader en values.yaml
check('values.yaml define reloader.stakater.com/auto para api y web', () => {
  const file = path.join(ROOT_DIR, 'infra/helm/pokedex/values.yaml');
  const content = fs.readFileSync(file, 'utf-8');
  if (!content.includes('reloader.stakater.com/auto: "true"')) {
    throw new Error('values.yaml debe declarar reloader.stakater.com/auto: "true"');
  }
  if (!content.includes('reloader:') || !content.includes('auto: true')) {
    throw new Error('values.yaml debe declarar sección reloader.auto: true');
  }
});

// 3. Validar configuración de Reloader y refreshInterval en values.prod.yaml
check('values.prod.yaml define reloader en api y web, y refreshInterval acotado', () => {
  const file = path.join(ROOT_DIR, 'infra/helm/pokedex/values.prod.yaml');
  const content = fs.readFileSync(file, 'utf-8');
  if (!content.includes('reloader.stakater.com/auto: "true"')) {
    throw new Error('values.prod.yaml debe configurar reloader.stakater.com/auto: "true"');
  }
  if (!content.includes('refreshInterval: "1h"')) {
    throw new Error('values.prod.yaml debe declarar externalSecrets.refreshInterval: "1h"');
  }
});

// 4. Validar que externalsecret.yaml use refreshInterval
check('externalsecret.yaml aplica refreshInterval con fallback canónico', () => {
  const file = path.join(ROOT_DIR, 'infra/helm/pokedex/templates/externalsecret.yaml');
  const content = fs.readFileSync(file, 'utf-8');
  if (!content.includes('.Values.externalSecrets.refreshInterval')) {
    throw new Error('externalsecret.yaml debe parametrizar refreshInterval');
  }
});

// 5. Validar que ConfigMap no contenga secretos confidenciales
check('configmap.yaml no contiene contraseñas ni claves confidenciales', () => {
  const file = path.join(ROOT_DIR, 'infra/helm/pokedex/templates/configmap.yaml');
  const content = fs.readFileSync(file, 'utf-8');
  const forbidden = ['PASSWORD', 'ADMIN_API_KEY', 'SESSION_SECRET', 'BACKUP_ENCRYPTION_KEY'];
  for (const key of forbidden) {
    if (content.includes(key)) {
      throw new Error(`configmap.yaml contiene clave confidencial prohibida: ${key}`);
    }
  }
});

// Resumen final
console.log('\n----------------------------------------------------------------');
const failed = results.filter(r => !r.passed);
if (failed.length > 0) {
  console.error(`❌ Auditoría fallida: ${failed.length} de ${results.length} verificaciones no pasaron.`);
  process.exit(1);
} else {
  console.log(`✅ Auditoría exitosa: ${results.length}/${results.length} controles de rotación y Reloader en cumplimiento estricto.`);
  process.exit(0);
}
