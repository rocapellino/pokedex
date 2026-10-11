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

export interface AutomationAuditCoverage {
  isComplete: boolean;
  scannedFilesCount: number;
  unreadableFiles: { path: string; error: string }[];
}

export interface AutomationAuditResult {
  findings: DoctorFinding[];
  coverage: AutomationAuditCoverage;
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
  auditCoverage: AutomationAuditCoverage;
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
 * Audita exhaustivamente la superficie delimitada de automatización del repositorio.
 * Registra explícitamente cualquier archivo que no pueda leerse para advertir si la auditoría
 * fue completa o parcial, diferenciando entre «sin infracciones» y «auditoría incompleta».
 */
export function auditAutomationSurface(mainRoot: string): AutomationAuditResult {
  const findings: DoctorFinding[] = [];
  const unreadableFiles: { path: string; error: string }[] = [];
  let scannedFilesCount = 0;

  function isCodeOrConfig(filePath: string): boolean {
    const base = path.basename(filePath);
    return GOVERNED_AUTOMATION_FILENAMES.test(base) || GOVERNED_AUTOMATION_EXTENSIONS.test(base);
  }

  function checkFile(fullPath: string) {
    if (path.basename(fullPath) === 'worktree_governance.test.ts') {
      return;
    }

    let content: string;
    try {
      content = fs.readFileSync(fullPath, 'utf-8');
      scannedFilesCount++;
    } catch (readErr: unknown) {
      const errMsg = readErr instanceof Error ? readErr.message : String(readErr);
      unreadableFiles.push({ path: fullPath, error: errMsg });
      findings.push({
        code: 'WT-AUDIT-UNREADABLE-FILE',
        severity: 'MEDIUM',
        worktreePath: fullPath,
        message: `No se pudo leer el archivo de automatización '${fullPath}' durante la auditoría: ${errMsg}.`,
        remediation:
          'Verificar permisos, codificación y disponibilidad del archivo para asegurar una auditoría de gobernanza completa.',
      });
      return;
    }

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
  }

  function scanDir(dir: string, isTopLevelSurfaceDir = false) {
    let stat: fs.Stats | undefined;
    try {
      stat = fs.statSync(dir, { throwIfNoEntry: false });
    } catch (accessErr: unknown) {
      const errMsg = accessErr instanceof Error ? accessErr.message : String(accessErr);
      unreadableFiles.push({ path: dir, error: errMsg });
      findings.push({
        code: 'WT-AUDIT-UNREADABLE-DIR',
        severity: 'MEDIUM',
        worktreePath: dir,
        message: `No se pudo acceder al directorio de automatización '${dir}' por error de permisos o E/S: ${errMsg}.`,
        remediation: 'Verificar permisos y accesibilidad del directorio para permitir una auditoría completa.',
      });
      return;
    }

    if (!stat) {
      // La ruta no existe físicamente (ENOENT genuino)
      return;
    }

    if (!stat.isDirectory()) {
      if (isTopLevelSurfaceDir) {
        unreadableFiles.push({ path: dir, error: 'La ruta configurada no es un directorio' });
        findings.push({
          code: 'WT-AUDIT-UNREADABLE-DIR',
          severity: 'MEDIUM',
          worktreePath: dir,
          message: `La ruta de automatización '${dir}' existe pero no es un directorio válido.`,
          remediation: 'Verificar la estructura de directorios del repositorio.',
        });
      }
      return;
    }

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (readDirErr: unknown) {
      const errMsg = readDirErr instanceof Error ? readDirErr.message : String(readDirErr);
      unreadableFiles.push({ path: dir, error: errMsg });
      findings.push({
        code: 'WT-AUDIT-UNREADABLE-DIR',
        severity: 'MEDIUM',
        worktreePath: dir,
        message: `No se pudo listar el directorio de automatización '${dir}': ${errMsg}.`,
        remediation: 'Verificar permisos y accesibilidad del directorio para permitir una auditoría completa.',
      });
      return;
    }

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
    scanDir(path.join(mainRoot, sDir), true);
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
  } catch (rootErr: unknown) {
    const errMsg = rootErr instanceof Error ? rootErr.message : String(rootErr);
    unreadableFiles.push({ path: mainRoot, error: errMsg });
    findings.push({
      code: 'WT-AUDIT-UNREADABLE-DIR',
      severity: 'HIGH',
      worktreePath: mainRoot,
      message: `No se pudo leer el directorio raíz del repositorio '${mainRoot}': ${errMsg}.`,
      remediation: 'Verificar permisos y accesibilidad del directorio raíz para permitir la auditoría de gobernanza.',
    });
  }

  return {
    findings,
    coverage: {
      isComplete: unreadableFiles.length === 0,
      scannedFilesCount,
      unreadableFiles,
    },
  };
}

/**
 * Detecta llamadas o directivas desreguladas a 'git worktree add' en la superficie delimitada de
 * automatización del repositorio (scripts, skills, workflows, Taskfiles, Makefiles, Justfiles y configs).
 */
export function checkUngovernedWorktreeCalls(mainRoot: string): DoctorFinding[] {
  return auditAutomationSurface(mainRoot).findings;
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

  // Comprobar regresiones y cobertura de auditoría en la superficie de automatización
  const auditResult = auditAutomationSurface(mainRoot);
  globalFindings.push(...auditResult.findings);

  const hasHighSeverityRegression = auditResult.findings.some(
    (f) => f.severity === 'HIGH' || f.severity === 'CRITICAL',
  );
  const isValid =
    nonCompliantCount === 0 && prunableCount === 0 && !hasHighSeverityRegression && auditResult.coverage.isComplete;

  return {
    mainRepoRoot: mainRoot,
    canonicalBase,
    totalWorktrees: registered.length,
    compliantWorktrees: compliantCount,
    nonCompliantWorktrees: nonCompliantCount,
    prunableWorktrees: prunableCount,
    worktrees: reports,
    globalFindings,
    auditCoverage: auditResult.coverage,
    isValid,
  };
}
