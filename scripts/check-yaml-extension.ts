#!/usr/bin/env node
/**
 * =============================================================================
 * Gate de Gobernanza de Extensión YAML [CFG-002]
 * =============================================================================
 *
 * POLÍTICA: la extensión canónica para archivos YAML del monorepo es `.yaml`.
 * La extensión `.yml` queda PROHIBIDA para archivos nuevos y se tolera
 * únicamente el inventario de deuda técnica pre-existente, que se drena de
 * forma incremental mediante waves de refactor.
 *
 * Modos de evaluación:
 *   - Normal : falla si existe un `.yml` fuera del allowlist (deuda no registrada).
 *   - Strict : además falla si el allowlist quedó obsoleto (entradas ya
 *              renombradas), lo que obliga a drenar la lista en el mismo commit.
 *
 * Contrato CLI:
 *   --json     Emite el reporte estructurado en stdout.
 *   --strict   Activa el fail-closed sobre allowlist obsoleta.
 *
 * Beneficio de seguridad: al unificar la extensión, los globs de CI y las
 * allowlists de Gitleaks pueden usar rutas exactas en lugar de regex `\.ya?ml`,
 * reduciendo la superficie ambigua de los controles de secrets scanning.
 * =============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const args = process.argv.slice(2);
const isStrict = args.includes('--strict');
const isJson = args.includes('--json');

/**
 * Inventario de deuda técnica tolerada: archivos `.yml` pre-existentes.
 * Cada wave del refactor debe ACORTAR esta lista. Cualquier entrada que ya no
 * exista en disco invalida el allowlist en modo `--strict`.
 *
 * `.mega-linter.yml` es una excepción PERMANENTE: es el nombre de configuración
 * documentado por MegaLinter y se pasa explícitamente vía `MEGALINTER_CONFIG`.
 */
export const LEGACY_YML_ALLOWLIST: readonly string[] = Object.freeze([
  '.github/workflows/change-impact.yml',
  '.github/workflows/ci.yml',
  '.github/workflows/dr-simulation.yml',
  '.github/workflows/ghcr-retention.yml',
  '.github/workflows/github-security-linear-sync.yml',
  '.github/workflows/infra.yml',
  '.github/workflows/mega-linter.yml',
  '.github/workflows/performance-k6.yml',
  '.github/workflows/release-tag.yml',
  '.github/workflows/renovate-linear-sync.yml',
  '.github/workflows/security-code-scanning.yml',
  '.github/workflows/security-dast-zap.yml',
  '.github/workflows/security-gitleaks.yml',
  '.github/workflows/security-trivy.yml',
  '.github/workflows/sonar-linear-sync.yml',
  '.github/workflows/web.yml',
  '.mega-linter.yml',
  'Taskfile.yml',
  'docker-compose.dev.yml',
  'docker-compose.yml',
  'infra/ansible/inventories/lab/hosts.yml',
  'infra/ansible/inventories/proxmox/hosts.yml',
  'infra/ansible/playbooks/host_baseline.yml',
  'infra/ansible/playbooks/prepare_hosts.yml',
  'infra/ansible/playbooks/security_hardening.yml',
  'infra/ansible/playbooks/setup_bastion.yml',
  'infra/ansible/playbooks/setup_gdrive_backup.yml',
  'infra/ansible/playbooks/setup_k3s.yml',
  'infra/ansible/playbooks/setup_nodes.yml',
  'infra/ansible/playbooks/setup_pbs_backup_blueprint.yml',
  'infra/ansible/playbooks/setup_vault.yml',
  'infra/ansible/playbooks/validate_hosts.yml',
  'infra/ansible/requirements.yml',
  'infra/ansible/roles/base_os/tasks/main.yml',
  'infra/ansible/roles/container_runtime/tasks/main.yml',
  'infra/ansible/roles/firewall/tasks/main.yml',
  'infra/ansible/roles/firewall/vars/main.yml',
  'infra/ansible/roles/hardening/handlers/main.yml',
  'infra/ansible/roles/hardening/tasks/main.yml',
  'infra/ansible/roles/kubernetes_prerequisites/tasks/main.yml',
  'infra/monitoring/alerts.yml'
]);

// Directorios excluidos del escaneo recursivo de filesystem
const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', '.turbo', '.agents']);

/**
 * Descubre de forma determinista todos los archivos `.yml` versionados.
 * Prefiere `git ls-files` (fuente de verdad del repositorio) y degrada a
 * escaneo recursivo de filesystem si git no está disponible.
 */
export function discoverLegacyYmlFiles(rootDir: string = process.cwd()): string[] {
  try {
    const raw = execSync('git ls-files', {
      cwd: rootDir,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    });
    const tracked = raw
      .split(/\r?\n/)
      .map((f) => f.trim().replace(/\\/g, '/'))
      .filter((f) => f.toLowerCase().endsWith('.yml'));
    if (tracked.length > 0) return tracked.sort();
  } catch {
    // Fallback al escaneo de filesystem
  }

  const discovered: string[] = [];
  const scanDir = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(full);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.yml')) {
        discovered.push(path.relative(rootDir, full).replace(/\\/g, '/'));
      }
    }
  };
  scanDir(rootDir);
  return discovered.sort();
}

export interface YamlExtensionReport {
  found: string[];
  allowlisted: string[];
  undeclared: string[];
  staleEntries: string[];
  totalFound: number;
  valid: boolean;
}

export function auditYamlExtensions(rootDir: string = process.cwd()): YamlExtensionReport {
  const found = discoverLegacyYmlFiles(rootDir);
  const allowlist = new Set(LEGACY_YML_ALLOWLIST);

  const allowlisted = found.filter((f) => allowlist.has(f));
  const undeclared = found.filter((f) => !allowlist.has(f));
  const staleEntries = LEGACY_YML_ALLOWLIST.filter((f) => !found.includes(f)).sort();

  const valid = undeclared.length === 0 && (!isStrict || staleEntries.length === 0);

  return { found, allowlisted, undeclared, staleEntries, totalFound: found.length, valid };
}

// ------------------------------------------------------------------------------
// Ejecución Principal
// ------------------------------------------------------------------------------

const report = auditYamlExtensions();

if (isJson) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.valid ? 0 : 1);
}

console.log('\n==============================================================================');
console.log('📋 Pokédex YAML Extension Gate: [.yaml canónico / .yml heredado]');
console.log('==============================================================================');
console.log(`Archivos .yml detectados: ${report.totalFound} | Modo Estricto: ${isStrict ? 'Activado' : 'Desactivado'}\n`);

if (report.undeclared.length > 0) {
  console.error('✖ Archivos .yml NO declarados en la deuda técnica tolerada:');
  for (const file of report.undeclared) console.error(`   - ${file}`);
  console.error('\n   Renombre a .yaml y actualice las referencias, o justifique la excepción');
  console.error('   en LEGACY_YML_ALLOWLIST (scripts/check-yaml-extension.ts).');
}

if (report.staleEntries.length > 0) {
  console.log(`${isStrict ? '✖' : '⚠'} Entradas obsoletas en LEGACY_YML_ALLOWLIST (ya renombradas a .yaml):`);
  for (const file of report.staleEntries) console.log(`   - ${file}`);
  if (isStrict) console.error('\n   Drene el allowlist: elimine las entradas ya migradas.');
}

console.log('\n------------------------------------------------------------------------------');
if (report.valid) {
  console.log('✨ YAML Extension Gate: la política de extensión se cumple.');
  console.log(`   - Deuda tolerada: ${report.allowlisted.length} archivo(s) .yml`);
  console.log('   - Extensión canónica para archivos nuevos: .yaml');
  process.exit(0);
} else {
  console.error('❌ YAML Extension Gate: se detectaron violaciones de la convención de extensión.');
  process.exit(1);
}

