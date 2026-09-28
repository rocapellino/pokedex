#!/usr/bin/env node
/**
 * =============================================================================
 * Contrato de Integridad de Referencias YAML [DOC-002]
 * =============================================================================
 *
 * Tras la migración de extensión, la documentación puede seguir citando nombres
 * de archivo `.yml` que ya no existen en disco. Esas referencias obsoletas no
 * rompen ningún pipeline, pero inducen errores a cualquier agente o persona que
 * lea la documentación para localizar un archivo real.
 *
 * Este script descubre los archivos YAML reales del repositorio y clasifica
 * cada referencia `.yml` encontrada en la documentación:
 *
 *   - REAL      → el archivo existe en disco.
 *   - EXCEPCION → la referencia es legítima (ver EXCEPTIONS).
 *   - OBSOLETA  → cita un archivo `.yml` propio que ya no existe. Falla.
 *
 * Modo `--fix` reescribe únicamente las referencias OBSOLETA, preservando
 * las excepciones y los archivos reales.
 *
 * Fail-closed: cualquier referencia obsoleta hace salir con codigo 1, de modo
 * que el gate de CI la detecte antes de que llegue a `main`.
 * =============================================================================
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

/** Excepciones legitimas: referencias .yml que NO son obsoletas. */
const EXCEPTIONS: { pattern: RegExp; reason: string }[] = [
  { pattern: /\.mega-linter\.yml\b/, reason: 'Excepcion permanente: nombre de config impuesto por MegaLinter' },
  { pattern: /\.travis\.yml\b/, reason: 'Nombre historico literal de herramienta retirada' },
  { pattern: /sigstore\/gitsign\/\.github\/workflows\/release\.yml/, reason: 'Claim criptografico upstream (Gitsign)' },
  { pattern: /deploy_proxmox\.yml|deploy_app\.yml|docker-compose\.prod\.yml/, reason: 'Archivos RETIRADOS citados como referencia historica' },
  { pattern: /\*\.yml/, reason: 'Patron glob generico (documentacion de convenciones)' },
  { pattern: /Taskfile\.yml|taskfile\.yml/, reason: 'Nombre alterno soportado por go-task' },
  { pattern: /playbooks\/\*\.yml/, reason: 'Globs historicos citados en laWave 1 (fail-open ya resuelto)' },
  { pattern: /Taskfile\.yml` a `Taskfile\.yaml|busca `Taskfile\.yml`/, reason: 'Documenta la resolucion de nombres de go-task' },
  { pattern: /ci\.yml` a `ci\.yaml|ci\.yml@refs\/heads\/main`/, reason: 'Documenta el cambio de identidad OIDC (Wave 3)' },
];

/** Directorios cuyo contenido es evidencia historica inmutable. */
const IMMUTABLE = ['docs/audits/'];

/** Rutas donde una referencia .yml a un archivo propio esta obsoleta. */
const SCANNED = ['docs/', 'README.md', 'SECURITY.md', 'AGENTS.md', '.agents/', 'apps/', 'infra/'];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(md|ts)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const files: string[] = [];
for (const target of SCANNED) {
  const p = path.join(ROOT, target);
  if (!fs.existsSync(p)) continue;
  if (fs.statSync(p).isDirectory()) walk(p, files);
  else files.push(p);
}

const realYml = new Set(
  execSync('git ls-files', { encoding: 'utf-8' })
    .split('\n')
    .map((f) => f.trim())
    .filter((f) => f.toLowerCase().endsWith('.yml'))
);

interface Row { file: string; line: number; text: string; verdict: string; rawLine: string }

const rows: Row[] = [];

for (const file of files) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  if (IMMUTABLE.some((p) => rel.startsWith(p))) continue;

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

const byVerdict = new Map<string, Row[]>();
for (const r of rows) {
  const key = r.verdict.split(':')[0];
  byVerdict.set(key, [...(byVerdict.get(key) ?? []), r]);
}

console.log(`Archivos .yml reales en el repo: ${[...realYml].join(', ')}`);
console.log(`Referencias .yml encontradas: ${rows.length}`);
console.log('');

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

// Modo --fix: reescribe SOLO las referencias marcadas como OBSOLETA. Las
// excepciones y los archivos .yml reales quedan intactos.
if (process.argv.includes('--fix')) {
  const byFile = new Map<string, Row[]>();
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
