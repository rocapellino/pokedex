#!/usr/bin/env node
// ==============================================================================
// Script de Gobernanza y Validación Automática de Higiene en Archivos .ignore
// Arquitectura de Calidad Continua & Configuration Hygiene [CFG-001]
// ==============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

interface IgnoreFileCheck {
  file: string;
  totalLines: number;
  activeRules: number;
  duplicates: string[];
  trailingWhitespaceLines: number[];
  securityRulesPresent: string[];
  securityRulesMissing: string[];
  unjustifiedRules: string[];
  obsoleteRules: string[];
  valid: boolean;
}

const args = process.argv.slice(2);
const isStrict = args.includes('--strict');
const isFix = args.includes('--fix');
const isJson = args.includes('--json');

const CODE_EXTENSIONS = new Set([
  '.ts', '.js', '.mjs', '.cjs', '.py', '.sh', '.json', '.yaml', '.yml', '.md', '.txt', '.log', '.map'
]);

/**
 * Determina si una ruta corresponde a un archivo de configuración/exclusión de tipo .ignore.
 */
function isIgnoreFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  if (CODE_EXTENSIONS.has(ext)) return false;

  const base = path.basename(filePath).toLowerCase();
  return base.endsWith('ignore') || base.startsWith('.ignore') || base.endsWith('.ignore');
}

/**
 * Descubre dinámicamente todos los archivos de exclusión e ignore versionados en el repositorio.
 */
function discoverIgnoreFiles(): string[] {
  try {
    const raw = execSync('git ls-files', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
    const files = raw.trim().split(/\r?\n/).filter(f => f && isIgnoreFile(f));
    if (files.length > 0) return files;
  } catch {
    // Fallback si git no está disponible
  }

  // Fallback mediante escaneo recursivo en el filesystem
  const discovered: string[] = [];
  function scanDir(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(full);
      } else {
        const rel = path.relative(process.cwd(), full).replace(/\\/g, '/');
        if (isIgnoreFile(rel)) {
          discovered.push(rel);
        }
      }
    }
  }
  scanDir(process.cwd());
  return discovered;
}

/**
 * Requisitos de seguridad obligatorios por tipo de archivo
 */
const REQUIRED_SECURITY_PATTERNS: Record<string, string[]> = {
  '.gitignore': ['.env', '.pem', '.key', 'node_modules', '/tmp/'],
  '.dockerignore': ['.env', 'node_modules', '.git', '/tmp/'],
  'apps/backend/.dockerignore': ['.env', 'node_modules', '.git', '/tmp/'],
  'apps/frontend/.dockerignore': ['.env', 'node_modules', '.git', '/tmp/'],
};

/**
 * Herramientas formalmente retiradas del repositorio cuya presencia indica residuos obsoletos
 */
const RETIRED_TOOLS = ['Jenkinsfile', '.travis.yml', '.circleci'];

function checkIgnoreFile(relPath: string): IgnoreFileCheck {
  const fullPath = path.resolve(relPath);
  const result: IgnoreFileCheck = {
    file: relPath,
    totalLines: 0,
    activeRules: 0,
    duplicates: [],
    trailingWhitespaceLines: [],
    securityRulesPresent: [],
    securityRulesMissing: [],
    unjustifiedRules: [],
    obsoleteRules: [],
    valid: true,
  };

  if (!fs.existsSync(fullPath)) {
    result.valid = false;
    return result;
  }

  const rawContent = fs.readFileSync(fullPath, 'utf-8');
  const lines = rawContent.split(/\r?\n/);
  result.totalLines = lines.length;

  const seenRules = new Set<string>();
  const activeLines: { lineNum: number; rule: string; hasCommentAbove: boolean }[] = [];
  let blockCommented = false;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const rawLine = lines[i];

    // Verificar trailing whitespace (excepto saltos CRLF limpios)
    if (/[ \t]+$/.test(rawLine)) {
      result.trailingWhitespaceLines.push(lineNum);
    }

    const trimmed = rawLine.trim();

    if (!trimmed) {
      blockCommented = false;
      continue;
    }

    if (trimmed.startsWith('#')) {
      blockCommented = true;
      continue;
    }

    // Regla activa
    result.activeRules++;
    activeLines.push({ lineNum, rule: trimmed, hasCommentAbove: blockCommented });

    // Detección de duplicados
    if (seenRules.has(trimmed)) {
      result.duplicates.push(trimmed);
    } else {
      seenRules.add(trimmed);
    }

    // Detección de residuos obsoletos
    if (RETIRED_TOOLS.includes(trimmed)) {
      result.obsoleteRules.push(trimmed);
    }

    // Para archivos de excepción de seguridad (.gitleaksignore, .trivyignore), cada bloque debe estar documentado
    if (relPath === '.gitleaksignore' || relPath.endsWith('.trivyignore')) {
      if (!blockCommented) {
        result.unjustifiedRules.push(trimmed);
      }
    }
  }

  // Verificar patrones de seguridad requeridos
  const requiredPatterns = REQUIRED_SECURITY_PATTERNS[relPath];
  if (requiredPatterns) {
    for (const pattern of requiredPatterns) {
      const match = Array.from(seenRules).some(r => r.includes(pattern) || r.startsWith(pattern));
      if (match) {
        result.securityRulesPresent.push(pattern);
      } else {
        result.securityRulesMissing.push(pattern);
      }
    }
  }

  // Evaluación de validez
  if (
    result.duplicates.length > 0 ||
    result.securityRulesMissing.length > 0 ||
    result.unjustifiedRules.length > 0 ||
    (isStrict && (result.trailingWhitespaceLines.length > 0 || result.obsoleteRules.length > 0))
  ) {
    result.valid = false;
  }

  return result;
}

/**
 * Corrige automáticamente duplicados y trailing whitespace si se invoca con --fix
 */
function fixIgnoreFile(relPath: string) {
  const fullPath = path.resolve(relPath);
  const rawContent = fs.readFileSync(fullPath, 'utf-8');
  const lines = rawContent.split(/\r?\n/);

  const seenRules = new Set<string>();
  const cleanedLines: string[] = [];

  for (const rawLine of lines) {
    const withoutTrailing = rawLine.replace(/[ \t]+$/, '');
    const trimmed = withoutTrailing.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      cleanedLines.push(withoutTrailing);
      continue;
    }

    if (seenRules.has(trimmed)) {
      continue; // Descartar duplicado
    }

    seenRules.add(trimmed);
    cleanedLines.push(withoutTrailing);
  }

  fs.writeFileSync(fullPath, cleanedLines.join('\n') + '\n', 'utf-8');
}

// ------------------------------------------------------------------------------
// Ejecución Principal
// ------------------------------------------------------------------------------

const ignoreFiles = discoverIgnoreFiles();
let hasErrors = false;
const reports: IgnoreFileCheck[] = [];

if (isFix) {
  console.log('🧹 [Configuration Hygiene] Ejecutando corrección automática (--fix)...');
  for (const file of ignoreFiles) {
    fixIgnoreFile(file);
  }
}

for (const file of ignoreFiles) {
  const report = checkIgnoreFile(file);
  reports.push(report);
  if (!report.valid) {
    hasErrors = true;
  }
}

if (isJson) {
  console.log(JSON.stringify({ files: reports, valid: !hasErrors }, null, 2));
  process.exit(hasErrors ? 1 : 0);
}

console.log('\n==============================================================================');
console.log('📋 Pokédex Configuration Hygiene Gate: Auditoría de Archivos .ignore');
console.log('==============================================================================');
console.log(`Archivos evaluados: ${reports.length} | Modo Estricto: ${isStrict ? 'Activado' : 'Desactivado'}\n`);

for (const r of reports) {
  const statusIcon = r.valid ? '✔' : '✖';
  console.log(`${statusIcon} ${r.file} (${r.activeRules} reglas activas, ${r.totalLines} líneas)`);

  if (r.securityRulesPresent.length > 0) {
    console.log(`   🛡️  Reglas de seguridad verificadas: ${r.securityRulesPresent.join(', ')}`);
  }

  if (r.securityRulesMissing.length > 0) {
    console.log(`   ✖  REGLAS CRÍTICAS FALTANTES: ${r.securityRulesMissing.join(', ')}`);
  }

  if (r.duplicates.length > 0) {
    console.log(`   ⚠  Reglas duplicadas encontradas: ${r.duplicates.join(', ')}`);
  }

  if (r.unjustifiedRules.length > 0) {
    console.log(`   ✖  Excepciones de seguridad sin justificar: ${r.unjustifiedRules.join(', ')}`);
  }

  if (r.obsoleteRules.length > 0) {
    console.log(`   ⚠  Reglas residuales de herramientas retiradas: ${r.obsoleteRules.join(', ')}`);
  }

  if (r.trailingWhitespaceLines.length > 0) {
    console.log(`   ⚠  Líneas con espacios al final: ${r.trailingWhitespaceLines.length}`);
  }
}

console.log('\n------------------------------------------------------------------------------');
if (hasErrors) {
  console.error('❌ Configuration Hygiene Gate: Se detectaron violaciones en archivos de exclusión.');
  console.error('   Ejecute "npm run lint:ignore:fix" para reparar duplicados y formato.');
  process.exit(1);
} else {
  console.log('✨ Configuration Hygiene Gate: Todos los archivos .ignore cumplen los estándares de gobernanza.');
  process.exit(0);
}
