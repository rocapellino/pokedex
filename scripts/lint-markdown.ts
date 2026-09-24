/**
 * ==============================================================================
 * scripts/lint-markdown.ts
 * ==============================================================================
 * Script canónico para ejecutar el Markdown Quality Gate en el repositorio.
 *
 * Funcionalidades:
 *   - Valida archivos Markdown contra la configuración centralizada (.markdownlint.json).
 *   - Soporta validación de archivos específicos o de todo el repositorio.
 *   - Respeta exclusiones definidas en .markdownlintignore.
 *   - Auto-corrige errores cuando se especifica la bandera --fix.
 *   - Genera el reporte estandarizado obligatorio para los skills:
 *       Markdown validation: PASS | FAIL
 *       Files checked: N
 *       Initial MDxxx errors: N
 *       Fixed MDxxx errors: N
 *       Final MDxxx errors: N
 *
 * Uso CLI:
 *   node --experimental-strip-types scripts/lint-markdown.ts
 *   node --experimental-strip-types scripts/lint-markdown.ts path/to/file.md
 *   node --experimental-strip-types scripts/lint-markdown.ts --fix path/to/file.md
 *   node --experimental-strip-types scripts/lint-markdown.ts --fix
 * ==============================================================================
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lint as markdownlintPromise, readConfig } from 'markdownlint/promise';
import { applyFixes } from 'markdownlint';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

export interface LintOptions {
  fix?: boolean;
  configPath?: string;
  ignorePath?: string;
  files?: string[];
}

export interface LintReport {
  passed: boolean;
  filesChecked: number;
  initialErrors: number;
  fixedErrors: number;
  finalErrors: number;
  details: {
    fileName: string;
    lineNumber: number;
    ruleNames: string[];
    ruleDescription: string;
    errorDetail: string | null;
  }[];
}

/**
 * Lee y parsea patrones de exclusión de un archivo de ignore (tipo .gitignore)
 */
export function parseIgnorePatterns(ignorePath: string): string[] {
  if (!fs.existsSync(ignorePath)) {
    return [];
  }
  const content = fs.readFileSync(ignorePath, 'utf8');
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

/**
 * Descubre recursivamente todos los archivos .md a partir de un directorio
 */
export function findMarkdownFiles(dir: string, baseDir: string = dir, ignorePatterns: string[] = []): string[] {
  let results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  const defaultIgnored = new Set(['node_modules', '.git', 'dist', 'coverage', '.turbo', '.gemini']);

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');

    if (defaultIgnored.has(entry.name)) {
      continue;
    }

    // Verificar contra patrones de ignore
    const isIgnored = ignorePatterns.some((pattern) => {
      const cleanPattern = pattern.replace(/\/$/, '');
      return relPath === cleanPattern || relPath.startsWith(`${cleanPattern}/`) || entry.name === cleanPattern;
    });

    if (isIgnored) {
      continue;
    }

    if (entry.isDirectory()) {
      results = results.concat(findMarkdownFiles(fullPath, baseDir, ignorePatterns));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Ejecuta la validación de archivos Markdown con reporte contractual
 */
export async function lintMarkdown(options: LintOptions = {}): Promise<LintReport> {
  const configPath = options.configPath || path.join(ROOT_DIR, '.markdownlint.json');
  const ignorePath = options.ignorePath || path.join(ROOT_DIR, '.markdownlintignore');

  let config: Record<string, unknown> = {};
  if (fs.existsSync(configPath)) {
    config = (await readConfig(configPath)) as Record<string, unknown>;
  }

  const ignorePatterns = parseIgnorePatterns(ignorePath);

  let targetFiles: string[] = [];
  if (options.files && options.files.length > 0) {
    for (const f of options.files) {
      const resolved = path.resolve(ROOT_DIR, f);
      if (fs.existsSync(resolved)) {
        const stat = fs.statSync(resolved);
        if (stat.isDirectory()) {
          targetFiles = targetFiles.concat(findMarkdownFiles(resolved, ROOT_DIR, ignorePatterns));
        } else if (resolved.endsWith('.md')) {
          targetFiles.push(resolved);
        }
      }
    }
  } else {
    targetFiles = findMarkdownFiles(ROOT_DIR, ROOT_DIR, ignorePatterns);
  }

  // Eliminar duplicados
  targetFiles = Array.from(new Set(targetFiles));

  if (targetFiles.length === 0) {
    return {
      passed: true,
      filesChecked: 0,
      initialErrors: 0,
      fixedErrors: 0,
      finalErrors: 0,
      details: [],
    };
  }

  // 1. Lint Inicial
  const initialResults = await markdownlintPromise({
    files: targetFiles,
    config,
  });

  let initialErrorCount = 0;
  for (const file of targetFiles) {
    initialErrorCount += (initialResults[file] || []).length;
  }

  let fixedErrorCount = 0;
  let finalResults = initialResults;

  // 2. Si se solicitó --fix, aplicar arreglos automáticos y re-evaluar
  if (options.fix && initialErrorCount > 0) {
    for (const file of targetFiles) {
      const errors = initialResults[file] || [];
      if (errors.length > 0) {
        const content = fs.readFileSync(file, 'utf8');
        const fixedContent = applyFixes(content, errors);
        if (fixedContent !== content) {
          fs.writeFileSync(file, fixedContent, 'utf8');
        }
      }
    }

    // Re-evaluar tras aplicar fixes
    finalResults = await markdownlintPromise({
      files: targetFiles,
      config,
    });

    let remainingAfterFix = 0;
    for (const file of targetFiles) {
      remainingAfterFix += (finalResults[file] || []).length;
    }
    fixedErrorCount = Math.max(0, initialErrorCount - remainingAfterFix);
  }

  // 3. Compilar resultados finales
  const details: LintReport['details'] = [];
  let finalErrorCount = 0;

  for (const file of targetFiles) {
    const errors = finalResults[file] || [];
    finalErrorCount += errors.length;
    for (const err of errors) {
      details.push({
        fileName: path.relative(ROOT_DIR, file).replace(/\\/g, '/'),
        lineNumber: err.lineNumber,
        ruleNames: err.ruleNames,
        ruleDescription: err.ruleDescription,
        errorDetail: err.errorDetail ?? null,
      });
    }
  }

  return {
    passed: finalErrorCount === 0,
    filesChecked: targetFiles.length,
    initialErrors: initialErrorCount,
    fixedErrors: fixedErrorCount,
    finalErrors: finalErrorCount,
    details,
  };
}

// Ejecución CLI directa
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('lint-markdown.ts')) {
  (async () => {
    const rawArgs = process.argv.slice(2);
    const isFix = rawArgs.includes('--fix');
    const fileArgs = rawArgs.filter((arg) => !arg.startsWith('--'));

    const report = await lintMarkdown({
      fix: isFix,
      files: fileArgs.length > 0 ? fileArgs : undefined,
    });

    // Formato contractual requerido por Requirement 13
    console.log(`Markdown validation: ${report.passed ? 'PASS' : 'FAIL'}`);
    console.log(`Files checked: ${report.filesChecked}`);
    console.log(`Initial MDxxx errors: ${report.initialErrors}`);
    console.log(`Fixed MDxxx errors: ${report.fixedErrors}`);
    console.log(`Final MDxxx errors: ${report.finalErrors}`);

    if (!report.passed) {
      console.error('\n❌ Violaciones de Markdownlint detectadas:');
      for (const err of report.details) {
        const rule = err.ruleNames.join('/');
        const detail = err.errorDetail ? ` [${err.errorDetail}]` : '';
        console.error(`  - ${err.fileName}:${err.lineNumber} ${rule}: ${err.ruleDescription}${detail}`);
      }
      process.exit(1);
    }
  })().catch((err) => {
    console.error('Error fatal al ejecutar lint-markdown:', err);
    process.exit(1);
  });
}
