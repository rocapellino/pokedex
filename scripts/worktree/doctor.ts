import fs from 'node:fs';
import path from 'node:path';
import { inspectWorktreeStatus, listWorktrees, type WorktreeStatusDetails } from './manager.js';
import { resolveCanonicalWorktreeBase, resolveMainRepoRoot } from './resolver.js';

export interface DoctorFinding {
  code: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  worktreePath: string;
  message: string;
  remediation: string;
}

export interface DoctorReport {
  mainRepoRoot: string;
  canonicalBase: string;
  totalWorktrees: number;
  compliantWorktrees: number;
  nonCompliantWorktrees: number;
  prunableWorktrees: number;
  worktrees: {
    details: WorktreeStatusDetails;
    findings: DoctorFinding[];
  }[];
  globalFindings: DoctorFinding[];
  isValid: boolean;
}

/**
 * Superficie delimitada de automatización del repositorio auditada contra llamadas no gobernadas.
 * Cubre scripts ejecutables, automatizaciones de agentes/skills, pipelines de CI/CD,
 * infraestructura/IaC, definiciones de tareas (Makefiles, Justfiles, Taskfiles, package.json).
 */
export const GOVERNED_AUTOMATION_SURFACE_DIRS = ['scripts', '.agents', '.github', 'apps', 'infra', 'gitops'];

export const GOVERNED_AUTOMATION_FILENAMES =
  /^(Makefile|GNUmakefile|justfile|\.justfile|Taskfile(\.[a-z0-9_-]+)?(\.ya?ml|\.json|\.dist)?|package\.json)$/i;

export const GOVERNED_AUTOMATION_EXTENSIONS = /\.(ts|js|mjs|cjs|sh|bash|zsh|ya?ml|json|mk)$/i;

/**
 * Detecta llamadas o directivas desreguladas a 'git worktree add' en la superficie delimitada de
 * automatización del repositorio (scripts, skills, workflows, Taskfiles, Makefiles, Justfiles y configs).
 */
export function checkUngovernedWorktreeCalls(mainRoot: string): DoctorFinding[] {
  const findings: DoctorFinding[] = [];

  function isCodeOrConfig(filePath: string): boolean {
    const base = path.basename(filePath);
    return GOVERNED_AUTOMATION_FILENAMES.test(base) || GOVERNED_AUTOMATION_EXTENSIONS.test(base);
  }

  function checkFile(fullPath: string) {
    if (path.basename(fullPath) === 'worktree_governance.test.ts') {
      return;
    }

    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const lines = content.split(/\r?\n/);
      const isCode = isCodeOrConfig(fullPath);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/git\s+worktree\s+add/i.test(line)) {
          const lower = line.toLowerCase();
          if (
            lower.includes('prohib') ||
            lower.includes('impide') ||
            lower.includes('desregulad') ||
            lower.includes('no expone') ||
            lower.includes('no provee') ||
            line.includes('WT-REGRESSION')
          ) {
            continue;
          }

          if (isCode) {
            findings.push({
              code: 'WT-REGRESSION-UNGOVERNED-WORKTREE-CALL',
              severity: 'HIGH',
              worktreePath: fullPath,
              message: `Llamada no gobernada o instrucción directa a 'git worktree add' en línea ${i + 1}.`,
              remediation:
                'Migrar la operación a la CLI canónica `npm run worktree:create` o la API `scripts/worktree/creator.ts`.',
            });
          } else {
            // En archivos Markdown, solo alertar si es una instrucción de comando ejecutable
            if (/^\s*(```|`|\$|run:|command:)?\s*git\s+worktree\s+add/i.test(line)) {
              findings.push({
                code: 'WT-REGRESSION-UNGOVERNED-WORKTREE-CALL',
                severity: 'HIGH',
                worktreePath: fullPath,
                message: `Instrucción de ejecución directa a 'git worktree add' en línea ${i + 1}.`,
                remediation:
                  'Migrar la operación a la CLI canónica `npm run worktree:create` o la API `scripts/worktree/creator.ts`.',
              });
            }
          }
        }
      }
    } catch {
      // Ignorar archivos no legibles
    }
  }

  function scanDir(dir: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (
          entry.name === '.git' ||
          entry.name === 'node_modules' ||
          entry.name === 'dist' ||
          entry.name === 'tmp' ||
          entry.name === 'coverage' ||
          fullPath.includes(path.join('scripts', 'worktree'))
        ) {
          continue;
        }
        scanDir(fullPath);
      } else if (entry.isFile() && (isCodeOrConfig(entry.name) || /\.md$/i.test(entry.name))) {
        checkFile(fullPath);
      }
    }
  }

  for (const sDir of GOVERNED_AUTOMATION_SURFACE_DIRS) {
    scanDir(path.join(mainRoot, sDir));
  }

  // Escaneo exhaustivo de archivos de automatización y configuración en la raíz
  try {
    const rootEntries = fs.readdirSync(mainRoot, { withFileTypes: true });
    for (const entry of rootEntries) {
      if (entry.isFile()) {
        if (isCodeOrConfig(entry.name) || /\.md$/i.test(entry.name)) {
          checkFile(path.join(mainRoot, entry.name));
        }
      }
    }
  } catch {
    // Si no se puede leer la raíz, continuar
  }

  return findings;
}

/**
 * Ejecuta un diagnóstico exhaustivo de todos los worktrees registrados y del entorno de gobernanza.
 */
export function runWorktreeDoctor(cwd: string = process.cwd()): DoctorReport {
  const mainRoot = resolveMainRepoRoot(cwd);
  const canonicalBase = resolveCanonicalWorktreeBase(cwd);
  const registered = listWorktrees(cwd);

  const globalFindings: DoctorFinding[] = [];
  const reports: DoctorReport['worktrees'] = [];

  let compliantCount = 0;
  let nonCompliantCount = 0;
  let prunableCount = 0;

  for (const wt of registered) {
    const findings: DoctorFinding[] = [];
    const status = inspectWorktreeStatus(wt, mainRoot);

    if (wt.isPrunable) {
      prunableCount++;
      findings.push({
        code: 'WT-PRUNABLE',
        severity: 'LOW',
        worktreePath: wt.path,
        message: `El directorio del worktree ya no existe físicamente (${wt.pruneReason || 'prunable'}).`,
        remediation: 'Ejecutar `npm run worktree:prune` para limpiar los metadatos huérfanos de Git.',
      });
    }

    if (!wt.isCompliant && !wt.isMainCheckout) {
      nonCompliantCount++;
      findings.push({
        code: 'WT-NON-CANONICAL-LOCATION',
        severity: 'HIGH',
        worktreePath: wt.path,
        message: `El worktree se encuentra fuera del directorio base canónico: ${canonicalBase}`,
        remediation: 'Migrar o planificar el retiro de este worktree hacia la ubicación canónica aprobada.',
      });
    } else if (!wt.isMainCheckout) {
      compliantCount++;
    }

    if (status.hasUncommittedChanges) {
      findings.push({
        code: 'WT-DIRTY-CHANGES',
        severity: 'MEDIUM',
        worktreePath: wt.path,
        message: 'El worktree contiene modificaciones sin confirmar en su working tree.',
        remediation: 'Realizar commit, stash o descartar cambios antes de limpiar o abandonar la tarea.',
      });
    }

    if (status.untrackedFilesCount > 0) {
      findings.push({
        code: 'WT-UNTRACKED-FILES',
        severity: 'LOW',
        worktreePath: wt.path,
        message: `El worktree contiene ${status.untrackedFilesCount} archivos sin seguimiento.`,
        remediation: 'Revisar archivos no rastreados y añadirlos a .gitignore o eliminarlos.',
      });
    }

    if (status.isMergedIntoMain && !wt.isMainCheckout && !status.hasUncommittedChanges) {
      findings.push({
        code: 'WT-MERGED-CANDIDATE',
        severity: 'INFO',
        worktreePath: wt.path,
        message: "La rama de este worktree ya está 100% integrada en 'main'.",
        remediation: 'El worktree es candidato a limpieza segura con `npm run worktree:cleanup -- --target <path>`.',
      });
    }

    reports.push({
      details: status,
      findings,
    });
  }

  // Comprobar si el directorio base canónico existe
  if (!fs.existsSync(canonicalBase)) {
    globalFindings.push({
      code: 'WT-CANONICAL-BASE-MISSING',
      severity: 'INFO',
      worktreePath: canonicalBase,
      message: `El directorio base canónico '${canonicalBase}' no existe aún (se creará automáticamente en la primera tarea).`,
      remediation: 'No se requiere acción inmediata.',
    });
  }

  // Comprobar regresiones de llamadas desreguladas en scripts y skills
  const regressionFindings = checkUngovernedWorktreeCalls(mainRoot);
  globalFindings.push(...regressionFindings);

  const isValid = nonCompliantCount === 0 && prunableCount === 0 && regressionFindings.length === 0;

  return {
    mainRepoRoot: mainRoot,
    canonicalBase,
    totalWorktrees: registered.length,
    compliantWorktrees: compliantCount,
    nonCompliantWorktrees: nonCompliantCount,
    prunableWorktrees: prunableCount,
    worktrees: reports,
    globalFindings,
    isValid,
  };
}
