#!/usr/bin/env node
/**
 * =============================================================================
 * Gate Canónico de Gobernanza de Extensión y Referencias YAML [CFG-002, DOC-002]
 * =============================================================================
 *
 * POLÍTICA: la extensión canónica para archivos YAML del monorepo es `.yaml`.
 * La extensión `.yml` queda PROHIBIDA para archivos nuevos y se tolera
 * únicamente el inventario de deuda técnica pre-existente (hoy vacío).
 *
 * Este script unifica dos verificaciones de gobernanza YAML:
 *
 * 1. AUDITORÍA DE NOMBRES DE ARCHIVO FÍSICOS (CFG-002):
 *    - `node scripts/check-yaml-extension.ts`: Falla si existe un `.yml` no declarado.
 *    - `--strict`: Falla si el allowlist tiene entradas obsoletas (ya renombradas).
 *    - `--json`: Emite el reporte estructurado en stdout.
 *
 * 2. INTEGRIDAD DE REFERENCIAS EN DOCUMENTACIÓN Y CÓDIGO (DOC-002):
 *    - `--refs`: Escanea referencias textuales a archivos `.yml` en markdown/workflows
 *      y falla (exit 1) si apuntan a archivos que ya no existen (obsoletas).
 *    - `--refs --fix`: Reescribe automáticamente las referencias obsoletas a `.yaml`.
 * =============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const isStrict = args.includes('--strict');
const isJson = args.includes('--json');
const isRefsMode = args.includes('--refs');
const isFixMode = args.includes('--fix');

// -----------------------------------------------------------------------------
// SECCIÓN 1: Deuda Técnica y Excepciones Permitidas
// -----------------------------------------------------------------------------
export const LEGACY_YML_ALLOWLIST: readonly string[] = Object.freeze([]);

export const EXCEPTIONS: { pattern: RegExp; reason: string }[] = [
  { pattern: /\.travis\.yml\b/, reason: 'Nombre historico literal de herramienta retirada' },
  { pattern: /sigstore\/gitsign\/\.github\/workflows\/release\.yml/, reason: 'Claim criptografico upstream (Gitsign)' },
  {
    pattern: /deploy_proxmox\.yml|deploy_app\.yml|docker-compose\.prod\.yml/,
    reason: 'Archivos RETIRADOS citados como referencia historica',
  },
  { pattern: /\*\.yml/, reason: 'Patron glob generico (documentacion de convenciones)' },
  { pattern: /Taskfile\.yml|taskfile\.yml/, reason: 'Nombre alterno soportado por go-task' },
  { pattern: /playbooks\/\*\.yml/, reason: 'Globs historicos citados en laWave 1 (fail-open ya resuelto)' },
  {
    pattern: /Taskfile\.yml` a `Taskfile\.yaml|busca `Taskfile\.yml`/,
    reason: 'Documenta la resolucion de nombres de go-task',
  },
  {
    pattern: /ci\.yml` a `ci\.yaml|ci\.yml@refs\/heads\/main`/,
    reason: 'Documenta el cambio de identidad OIDC (Wave 3)',
  },
];

const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', '.turbo', '.agents', '.terraform', '.tofu']);
const IMMUTABLE_DIRS = ['docs/audits/'];

// -----------------------------------------------------------------------------
// SECCIÓN 2: Lógica de Auditoría de Archivos Físicos (.yml vs .yaml)
// -----------------------------------------------------------------------------
export function discoverLegacyYmlFiles(rootDir: string = ROOT): string[] {
  try {
    const raw = execSync('git ls-files', {
      cwd: rootDir,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
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

export function auditYamlExtensions(rootDir: string = ROOT): YamlExtensionReport {
  const found = discoverLegacyYmlFiles(rootDir);
  const allowlist = new Set(LEGACY_YML_ALLOWLIST);

  const allowlisted = found.filter((f) => allowlist.has(f));
  const undeclared = found.filter((f) => !allowlist.has(f));
  const staleEntries = LEGACY_YML_ALLOWLIST.filter((f) => !found.includes(f)).sort();

  const valid = undeclared.length === 0 && (!isStrict || staleEntries.length === 0);

  return { found, allowlisted, undeclared, staleEntries, totalFound: found.length, valid };
}

// -----------------------------------------------------------------------------
// SECCIÓN 3: Lógica de Auditoría de Referencias Textuales (--refs)
// -----------------------------------------------------------------------------
const SCANNED_REF_PATHS = ['docs/', 'README.md', 'SECURITY.md', 'AGENTS.md', '.agents/', 'apps/', 'infra/', '.github/'];

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDED_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, out);
    } else if (/\.(md|ts|ya?ml)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

interface RefRow {
  file: string;
  line: number;
  text: string;
  verdict: string;
  rawLine: string;
}

function runReferencesAudit(): void {
  const files: string[] = [];
  for (const target of SCANNED_REF_PATHS) {
    const p = path.join(ROOT, target);
    if (!fs.existsSync(p)) continue;
    if (fs.statSync(p).isDirectory()) walkFiles(p, files);
    else files.push(p);
  }

  const realYml = new Set(
    execSync('git ls-files', { encoding: 'utf-8' })
      .split('\n')
      .map((f) => f.trim())
      .filter((f) => f.toLowerCase().endsWith('.yml')),
  );

  const rows: RefRow[] = [];

  for (const file of files) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    if (IMMUTABLE_DIRS.some((p) => rel.startsWith(p))) continue;

    const lines = fs.readFileSync(file, 'utf-8').split('\n');
    lines.forEach((text, i) => {
      const matches = text.match(/[A-Za-z0-9_.*/-]+\.yml\b/g);
      if (!matches) return;
      for (const m of matches) {
        const exc = EXCEPTIONS.find((e) => e.pattern.test(m));
        let verdict: string;
        if (exc) verdict = `EXCEPCION: ${exc.reason}`;
        else if (realYml.has(m)) verdict = 'REAL';
        else verdict = 'OBSOLETA';
        rows.push({ file: rel, line: i + 1, text: m, verdict, rawLine: text });
      }
    });
  }

  const byVerdict = new Map<string, RefRow[]>();
  for (const r of rows) {
    const key = r.verdict.split(':')[0];
    byVerdict.set(key, [...(byVerdict.get(key) ?? []), r]);
  }

  console.log(`Archivos .yml reales en el repo: ${[...realYml].join(', ')}`);
  console.log(`Referencias .yml encontradas: ${rows.length}\n`);

  for (const [verdict, list] of [...byVerdict].sort()) {
    console.log(`=== ${verdict} (${list.length}) ===`);
    const limit = verdict === 'OBSOLETA' ? 200 : 8;
    for (const r of list.slice(0, limit)) {
      console.log(`  ${r.file}:${r.line}  ${r.text}`);
    }
    if (list.length > limit) console.log(`  ... +${list.length - limit}`);
    console.log('');
  }

  const obsolete = byVerdict.get('OBSOLETA') ?? [];
  console.log(`RESUMEN: obsoletas=${obsolete.length}`);

  if (isFixMode) {
    const byFile = new Map<string, RefRow[]>();
    for (const r of obsolete) byFile.set(r.file, [...(byFile.get(r.file) ?? []), r]);

    let changed = 0;
    for (const [rel, list] of byFile) {
      const full = path.join(ROOT, rel);
      let content = fs.readFileSync(full, 'utf-8');
      for (const r of list) {
        const updated = r.rawLine.replace(r.text, r.text.replace(/\.yml$/, '.yaml'));
        content = content.split(r.rawLine).join(updated);
        changed++;
      }
      fs.writeFileSync(full, content, 'utf-8');
      console.log(`  FIX ${rel} (${list.length})`);
    }
    console.log(`Referencias corregidas: ${changed} en ${byFile.size} archivos.`);
  } else if (obsolete.length > 0) {
    console.error('\nDOC-002: referencias a archivos .yml obsoletas detectadas.');
    console.error('   Renombre las referencias a .yaml o documente la excepcion en EXCEPTIONS.');
    process.exit(1);
  }
}

// -----------------------------------------------------------------------------
// SECCIÓN 4: Despacho Principal según Flags CLI
// -----------------------------------------------------------------------------
if (isRefsMode) {
  runReferencesAudit();
  process.exit(0);
}

const report = auditYamlExtensions();

if (isJson) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.valid ? 0 : 1);
}

console.log('\n==============================================================================');
console.log('📋 Pokédex YAML Extension Gate: [.yaml canónico / .yml heredado]');
console.log('==============================================================================');
console.log(
  `Archivos .yml detectados: ${report.totalFound} | Modo Estricto: ${isStrict ? 'Activado' : 'Desactivado'}\n`,
);

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
