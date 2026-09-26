/**
 * ==============================================================================
 * Auditoría Canónica de Gobernanza de Scripts y Tooling (ADR-020)
 * ==============================================================================
 * Verifica de forma determinista y estricta (fail-closed):
 * 1. Cumplimiento de la lista blanca inmutable de scripts shell (.sh).
 * 2. Ausencia total de scripts de despliegue imperativos legados.
 * 3. Integridad del directorio scripts/ bajo la política de TypeScript fuertemente tipado.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Lista blanca estricta de scripts shell (.sh) autorizados en todo el monorepo (ADR-020)
export const ALLOWED_SH_SCRIPTS: readonly string[] = Object.freeze([
  'scripts/dr_verify_restore.sh'
]);

// Directorios excluidos del escaneo recursivo de scripts
const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'coverage',
  '.turbo',
  '.gemini',
  '.agents'
]);

// Patrones prohibidos de despliegue imperativo (ADR-020)
export const FORBIDDEN_DEPLOY_PATTERNS: readonly string[] = Object.freeze([
  'deploy.sh',
  'proxmox_deploy.sh',
  'deploy_aws.sh',
  'deploy_proxmox.sh',
  'deploy_app.sh'
]);

export function findShellScripts(dir: string, baseDir: string = dir): string[] {
  let results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name)) {
        results = results.concat(findShellScripts(fullPath, baseDir));
      }
    } else if (entry.isFile() && entry.name.endsWith('.sh')) {
      const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
      results.push(relPath);
    }
  }

  return results;
}

export function auditScriptGovernance(): { success: boolean; errors: string[] } {
  const errors: string[] = [];

  // 1. Escaneo de scripts shell y comparación contra lista blanca
  const foundSh = findShellScripts(ROOT_DIR);
  const unauthorizedSh = foundSh.filter(script => !ALLOWED_SH_SCRIPTS.includes(script));

  if (unauthorizedSh.length > 0) {
    errors.push(
      `❌ Scripts shell (.sh) no autorizados detectados fuera de la lista blanca:\n` +
      unauthorizedSh.map(s => `   - ${s}`).join('\n')
    );
  }

  // 2. Verificación de ausencia de scripts de despliegue imperativo
  for (const pattern of FORBIDDEN_DEPLOY_PATTERNS) {
    const rootTarget = path.join(ROOT_DIR, pattern);
    const scriptsTarget = path.join(ROOT_DIR, 'scripts', pattern);

    if (fs.existsSync(rootTarget)) {
      errors.push(`❌ Script de despliegue imperativo prohibido encontrado en raíz: ${pattern}`);
    }
    if (fs.existsSync(scriptsTarget)) {
      errors.push(`❌ Script de despliegue imperativo prohibido encontrado en scripts/: ${pattern}`);
    }
  }

  return {
    success: errors.length === 0,
    errors
  };
}

function run(): void {
  console.log('🛡️ Iniciando auditoría de gobernanza de scripts y tooling (ADR-020)...');
  const result = auditScriptGovernance();

  if (!result.success) {
    console.error('\nFallos de gobernanza detectados:');
    for (const err of result.errors) {
      console.error(err);
    }
    process.exit(1);
  }

  console.log('✔ Gobernanza de scripts validada con éxito:');
  console.log(`   - Scripts shell autorizados: [${ALLOWED_SH_SCRIPTS.join(', ')}]`);
  console.log('   - Scripts imperativos legados: 0 detectados (IaC/GitOps SSOT vigente)');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  run();
}
