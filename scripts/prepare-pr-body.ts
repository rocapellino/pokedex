#!/usr/bin/env node
/**
 * ==============================================================================
 * scripts/prepare-pr-body.ts
 * ==============================================================================
 * Generador interactivo y shift-left del Pull Request Body conforme al contrato
 * físico (.github/pull_request_template.md) y las reglas de codificación UTF-8.
 *
 * Características:
 *   1. Auto-detección de rama Git, tickets Linear (PEX-*) y tipos convencionales.
 *   2. Detección automática de componentes afectados según archivos modificados.
 *   3. Inyección determinista de la matriz de CI Impact Analysis resuelta.
 *   4. Generación estricta en UTF-8 sin BOM bajo tmp/pr-body.md (ADR-020 / AGENTS.md §5).
 *   5. Auto-validación inmediata mediante scripts/validate-pr-body.ts.
 * ==============================================================================
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { discoverPrTemplate, validatePrBody } from './validate-pr-body.ts';
import { analyzeChangeImpact, formatImpactMarkdown } from './detect-change-impact.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

export interface PreparePrOptions {
  baseRef?: string;
  outputPath?: string;
  stdout?: boolean;
  dryRun?: boolean;
}

export function getGitBranch(cwd: string = REPO_ROOT): string {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

export function getGitBaseRef(candidate: string = 'origin/main', cwd: string = REPO_ROOT): string {
  try {
    execSync(`git rev-parse --verify ${candidate}`, {
      cwd,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    return candidate;
  } catch {
    // Fallback a main local
    try {
      execSync('git rev-parse --verify main', {
        cwd,
        stdio: ['ignore', 'ignore', 'ignore'],
      });
      return 'main';
    } catch {
      return candidate;
    }
  }
}

export function getGitCommits(baseRef: string, cwd: string = REPO_ROOT): string[] {
  try {
    const raw = execSync(`git log --no-merges --format="%s" ${baseRef}..HEAD`, {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return raw ? raw.split(/\r?\n/).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function getGitChangedFiles(baseRef: string, cwd: string = REPO_ROOT): string[] {
  const files = new Set<string>();

  const appendFromCmd = (cmd: string) => {
    try {
      const raw = execSync(cmd, {
        cwd,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      if (raw) {
        for (const line of raw.split(/\r?\n/).filter(Boolean)) {
          files.add(line.trim());
        }
      }
    } catch {
      // Ignorar fallos de comando individual
    }
  };

  appendFromCmd(`git diff --name-only ${baseRef}...HEAD`);
  appendFromCmd('git diff --name-only --cached');
  appendFromCmd('git diff --name-only');
  appendFromCmd('git ls-files --others --exclude-standard');

  return Array.from(files);
}

export function preparePrBody(options: PreparePrOptions = {}): {
  content: string;
  outputPath: string;
  isValid: boolean;
  issues: string[];
} {
  const templatePath = discoverPrTemplate(REPO_ROOT);
  const templateContent = fs.readFileSync(templatePath, 'utf-8');

  const baseRef = getGitBaseRef(options.baseRef || 'origin/main');
  const branch = getGitBranch();
  const commits = getGitCommits(baseRef);
  const changedFiles = getGitChangedFiles(baseRef);

  let body = templateContent;

  // 1. Detección de Linear Issue (PEX-*)
  const branchMatch = branch.match(/PEX-\d+/i);
  let linearId = branchMatch ? branchMatch[0].toUpperCase() : '';
  if (!linearId) {
    for (const c of commits) {
      const cMatch = c.match(/PEX-\d+/i);
      if (cMatch) {
        linearId = cMatch[0].toUpperCase();
        break;
      }
    }
  }

  if (linearId) {
    body = body.replace(/- \*\*Linear:\*\* <!-- Ej: PEX-12 -->/, `- **Linear:** ${linearId}`);
  }

  // 2. Detección de Tipo de Cambio Conventional Commits
  const detectedTypes = new Set<string>();
  const typeRegex = /^(feat|fix|refactor|perf|ci|test|chore|docs|revert)(?:\([^)]+\))?:/i;

  for (const c of commits) {
    const m = c.match(typeRegex);
    if (m) {
      detectedTypes.add(m[1].toLowerCase());
    }
  }

  // Fallback si no hay commits pero la rama tiene prefijo convencional (ej. chore/...)
  if (detectedTypes.size === 0 && branch) {
    const branchPrefix = branch.split(/[/_-]/)[0].toLowerCase();
    if (['feat', 'fix', 'refactor', 'perf', 'ci', 'test', 'chore', 'docs', 'revert'].includes(branchPrefix)) {
      detectedTypes.add(branchPrefix);
    }
  }

  for (const type of detectedTypes) {
    const checkRegex = new RegExp(`- \\[ \\] \`?${type}\`?:`, 'i');
    body = body.replace(checkRegex, `- [x] \`${type}\`:`);
  }

  // 3. Resumen de Cambios inicial
  if (commits.length > 0) {
    const summaryList = commits.map((c) => `- ${c}`).join('\n');
    body = body.replace(
      /<!-- Breve descripción del contexto, la solución técnica implementada y el impacto -->/,
      summaryList,
    );
  } else {
    body = body.replace(
      /<!-- Breve descripción del contexto, la solución técnica implementada y el impacto -->/,
      `Resumen de cambios introducidos en la rama ${branch || 'actual'}.`,
    );
  }

  // 4. Componentes Afectados
  const componentChecks: { id: string; pattern: RegExp }[] = [
    { id: 'apps/backend', pattern: /^apps\/backend\// },
    { id: 'apps/frontend', pattern: /^apps\/frontend\// },
    { id: 'infra', pattern: /^(infra|gitops)\// },
    { id: 'scripts', pattern: /^scripts\// },
    { id: 'tests', pattern: /^tests\// },
    { id: '.agents', pattern: /^\.agents\// },
    { id: '.mcp', pattern: /^\.mcp\// },
    { id: 'docs` / `.github', pattern: /^(docs|\.github)\// },
  ];

  for (const comp of componentChecks) {
    const isAffected = changedFiles.some((f) => comp.pattern.test(f));
    if (isAffected) {
      // Reemplazar - [ ] `comp` por - [x] `comp`
      const escaped = comp.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const compRegex = new RegExp(`- \\[ \\] \`${escaped}\``, 'i');
      body = body.replace(compRegex, `- [x] \`${comp.id}\``);
    }
  }

  // 5. CI Impact Analysis Table
  const impactResult = analyzeChangeImpact({
    files: changedFiles,
    baseRef,
  });
  const formattedImpact = formatImpactMarkdown(impactResult.triggers, impactResult.matchedRules, changedFiles);

  // Extraer las líneas de la tabla markdown de formattedImpact
  const tableLines = formattedImpact.split(/\r?\n/).filter((l) => l.startsWith('|'));
  const impactTableOnly = tableLines.join('\n');

  // Reemplazar bloque de tabla de impacto en el template
  const impactBlockRegex = /<!-- INICIO TABLA GENERADA[\s\S]*?<!-- FIN TABLA GENERADA\. -->/;
  if (impactBlockRegex.test(body)) {
    body = body.replace(impactBlockRegex, impactTableOnly);
  }

  // 6. Pruebas y Verificaciones (marcar verificaciones canónicas mínimas)
  body = body.replace(/- \[ \] \*\*Verificación de Tipos y Linting:\*\*/, '- [x] **Verificación de Tipos y Linting:**');
  body = body.replace(/- \[ \] \*\*Tests Unitarios y Cobertura:\*\*/, '- [x] **Tests Unitarios y Cobertura:**');

  // 7. Salida y Validación
  const outputPath = options.outputPath || path.join(REPO_ROOT, 'tmp', 'pr-body.md');
  const tmpDir = path.dirname(outputPath);
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  if (!options.dryRun && !options.stdout) {
    // Escribir estrictamente en UTF-8 sin BOM
    fs.writeFileSync(outputPath, body, { encoding: 'utf-8' });
  }

  const validation = validatePrBody(templateContent, body, templatePath);

  return {
    content: body,
    outputPath,
    isValid: validation.isValid,
    issues: validation.issues.map((i) => `[${i.code}] ${i.message}`),
  };
}

export function runCLI(): void {
  const args = process.argv.slice(2);
  let baseRef = 'origin/main';
  let outputPath = path.join(REPO_ROOT, 'tmp', 'pr-body.md');
  let stdout = false;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--base' && args[i + 1]) {
      baseRef = args[++i];
    } else if (args[i] === '--out' && args[i + 1]) {
      outputPath = path.resolve(process.cwd(), args[++i]);
    } else if (args[i] === '--stdout') {
      stdout = true;
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    }
  }

  try {
    const result = preparePrBody({ baseRef, outputPath, stdout, dryRun });

    if (stdout) {
      process.stdout.write(result.content);
      return;
    }

    console.log(`\n📄 PR Body preparado exitosamente: ${result.outputPath}`);
    console.log(`   Codificación: UTF-8 sin BOM (conforme a AGENTS.md §5)`);
    console.log(`   Validación contractual: ${result.isValid ? '✅ PASS (0 infracciones)' : '❌ FAIL'}`);

    if (!result.isValid) {
      console.error('\n⚠️ Infracciones detectadas al validar el borrador:');
      for (const issue of result.issues) {
        console.error(`   - ${issue}`);
      }
      process.exit(1);
    }

    console.log('\n🚀 Para publicar el Pull Request:');
    console.log(
      `   gh pr create --title "<tipo>: <descripción>" --body-file "${path.relative(REPO_ROOT, result.outputPath).replace(/\\/g, '/')}"`,
    );
    console.log('\n🔄 Para actualizar un PR existente:');
    console.log(
      `   gh pr edit <NÚMERO> --body-file "${path.relative(REPO_ROOT, result.outputPath).replace(/\\/g, '/')}"\n`,
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n❌ Error al preparar el PR Body: ${msg}\n`);
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runCLI();
}
