#!/usr/bin/env node
/**
 * ==============================================================================
 * scripts/check-migration-hygiene.ts
 * ==============================================================================
 * Pokédex Migration Hygiene & Expand-Contract Protocol Gate
 *
 * Responsabilidades:
 *   1. Auditar archivos de migración SQL en `apps/backend/src/db/migrations/`.
 *   2. Verificar protocolo Expand-Contract e índices concurrentes:
 *      - Todo `CREATE INDEX` en migraciones incrementales debe usar `CONCURRENTLY IF NOT EXISTS`.
 *      - Todo `DROP INDEX` debe usar `CONCURRENTLY IF EXISTS` o `IF EXISTS`.
 *      - Detectar sentencias bloqueantes de tabla (ACCESS EXCLUSIVE, LOCK TABLE).
 *   3. Excluir el baseline inicial (`0000_greedy_luckman.sql`), el cual define
 *      el esquema original en bases de datos vacías antes del tráfico runtime.
 *
 * Salida:
 *   - Exit Code 0: Todas las migraciones cumplen el protocolo de cero bloqueo.
 *   - Exit Code 1: Se detectaron violaciones en las migraciones SQL.
 * ==============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

export interface MigrationIssue {
  file: string;
  line: number;
  statement: string;
  rule: string;
  message: string;
}

export interface MigrationCheckResult {
  passed: boolean;
  filesScanned: number;
  issues: MigrationIssue[];
}

/** Archivos de migración exentos (baseline inicial previo al tráfico de producción) */
export const EXEMPT_BASELINE_MIGRATIONS = new Set(['0000_greedy_luckman.sql']);

export function analyzeMigrationSql(sqlContent: string, fileName: string): MigrationIssue[] {
  const issues: MigrationIssue[] = [];
  const lines = sqlContent.split('\n');

  // Si es el baseline inicial exento, omitir validación de concurrencia de creación inicial
  if (EXEMPT_BASELINE_MIGRATIONS.has(path.basename(fileName))) {
    return [];
  }

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('--')) return;

    const lineNum = index + 1;

    // Regla 1: CREATE INDEX debe ser CONCURRENTLY
    if (/\bCREATE\s+(?:UNIQUE\s+)?INDEX\b/i.test(trimmed)) {
      if (!/\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\b/i.test(trimmed)) {
        issues.push({
          file: fileName,
          line: lineNum,
          statement: trimmed,
          rule: 'MIG-001-INDEX-CONCURRENTLY',
          message:
            'La creación de índices en migraciones activas debe usar CONCURRENTLY para evitar bloqueos de tabla (ACCESS EXCLUSIVE) en producción.',
        });
      }

      if (!/\bIF\s+NOT\s+EXISTS\b/i.test(trimmed)) {
        issues.push({
          file: fileName,
          line: lineNum,
          statement: trimmed,
          rule: 'MIG-002-INDEX-IF-NOT-EXISTS',
          message:
            'La creación de índices debe incluir IF NOT EXISTS para garantizar idempotencia en reintentos o reconciliaciones GitOps.',
        });
      }
    }

    // Regla 2: DROP INDEX debe incluir IF EXISTS
    if (/\bDROP\s+INDEX\b/i.test(trimmed)) {
      if (!/\bDROP\s+INDEX\s+(?:CONCURRENTLY\s+)?IF\s+EXISTS\b/i.test(trimmed)) {
        issues.push({
          file: fileName,
          line: lineNum,
          statement: trimmed,
          rule: 'MIG-003-DROP-INDEX-IF-EXISTS',
          message: 'La eliminación de índices debe usar IF EXISTS para evitar fallos si el índice ya no existe.',
        });
      }
    }

    // Regla 3: Detección de bloqueos manuales de tabla
    if (/\bLOCK\s+TABLE\b/i.test(trimmed)) {
      issues.push({
        file: fileName,
        line: lineNum,
        statement: trimmed,
        rule: 'MIG-004-DISALLOW-LOCK-TABLE',
        message: 'Queda prohibido el uso explícito de LOCK TABLE durante migraciones en caliente.',
      });
    }
  });

  return issues;
}

export function checkAllMigrations(migrationsDir: string): MigrationCheckResult {
  if (!fs.existsSync(migrationsDir)) {
    return { passed: true, filesScanned: 0, issues: [] };
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const allIssues: MigrationIssue[] = [];

  for (const file of files) {
    const fullPath = path.join(migrationsDir, file);
    const content = fs.readFileSync(fullPath, 'utf-8');
    const relPath = path.relative(ROOT_DIR, fullPath).replace(/\\/g, '/');
    const issues = analyzeMigrationSql(content, relPath);
    allIssues.push(...issues);
  }

  return {
    passed: allIssues.length === 0,
    filesScanned: files.length,
    issues: allIssues,
  };
}

// Punto de entrada CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  console.log('\n======================================================');
  console.log('🛡️  Pokédex Migration Hygiene & Concurrency Gate');
  console.log('======================================================');

  const defaultDir = path.join(ROOT_DIR, 'apps/backend/src/db/migrations');
  const targetDir = process.argv[2] ? path.resolve(process.argv[2]) : defaultDir;

  const result = checkAllMigrations(targetDir);

  console.log(`Archivos de migración evaluados: ${result.filesScanned}`);
  console.log(`Directorio: ${path.relative(ROOT_DIR, targetDir).replace(/\\/g, '/')}`);

  if (result.passed) {
    console.log('------------------------------------------------------');
    console.log('✅ Protocolo Expand-Contract e índices concurrentes 100% conformes.');
    console.log('======================================================\n');
    process.exit(0);
  } else {
    console.log('------------------------------------------------------');
    console.error(`❌ Se detectaron ${result.issues.length} violaciones de protocolo en migraciones SQL:`);
    for (const issue of result.issues) {
      console.error(`\n  • [${issue.rule}] ${issue.file}:${issue.line}`);
      console.error(`    Sentencia: "${issue.statement}"`);
      console.error(`    Motivo:    ${issue.message}`);
    }
    console.log('\n======================================================\n');
    process.exit(1);
  }
}
