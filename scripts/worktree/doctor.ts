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
 * Detecta llamadas o directivas desreguladas a 'git worktree add' en scripts y skills,
 * asegurando que no existan regresiones de gobernanza en el repositorio.
 */
export function checkUngovernedWorktreeCalls(mainRoot: string): DoctorFinding[] {
  const findings: DoctorFinding[] = [];
  const searchDirs = [path.join(mainRoot, 'scripts'), path.join(mainRoot, '.agents', 'skills')];

  function scanDir(dir: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '.git' || fullPath.includes(path.join('scripts', 'worktree'))) {
          continue;
        }
        scanDir(fullPath);
      } else if (entry.isFile() && /\.(ts|js|mjs|sh|bash|md)$/i.test(entry.name)) {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const lines = content.split(/\r?\n/);
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (
              /git\s+worktree\s+add/i.test(line) &&
              !line.toLowerCase().includes('prohib') &&
              !line.toLowerCase().includes('impide') &&
              !line.includes('WT-REGRESSION')
            ) {
              findings.push({
                code: 'WT-REGRESSION-UNGOVERNED-WORKTREE-CALL',
                severity: 'HIGH',
                worktreePath: fullPath,
                message: `Llamada no gobernada o directiva directa a 'git worktree add' en línea ${i + 1}.`,
                remediation:
                  'Migrar la operación a la CLI canónica `npm run worktree:create` o la API `scripts/worktree/creator.ts`.',
              });
            }
          }
        } catch {
          // Ignorar archivos no legibles
        }
      }
    }
  }

  for (const sDir of searchDirs) {
    scanDir(sDir);
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
