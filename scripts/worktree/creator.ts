import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { listWorktrees } from './manager.js';
import { generateCanonicalNaming, type TaskNamingInput, validateGitRef } from './naming.js';
import {
  assertNoEscapingSymlinks,
  isContainedWithin,
  isWithinCanonicalBase,
  normalizeForComparison,
  resolveCanonicalWorktreeBase,
  resolveMainRepoRoot,
  verifyWorktreePostCreation,
} from './resolver.js';

export interface CreateWorktreeOptions {
  baseBranch?: string; // Rama base para bifurcar (por defecto: 'main')
  cwd?: string;
  createNodeModulesJunction?: boolean; // Por defecto true en Windows para ahorrar espacio y tiempo
}

export interface CreatedWorktreeResult {
  path: string;
  branch: string;
  folderName: string;
  mainRepoRoot: string;
  canonicalBase: string;
}

export interface WorktreeRollbackReport {
  gitWorktreeRemoved: boolean;
  gitMetadataPruned: boolean;
  residualCleaned: boolean;
  residualPreservedForEvidence: boolean;
  errors: string[];
  stepsSummary: string;
}

export interface RollbackFileSystemOps {
  lstatSync?: (path: string, options?: { throwIfNoEntry?: boolean }) => fs.Stats | undefined;
  realpathSync?: (path: string) => string;
  rmSync?: (path: string, options?: { recursive?: boolean; force?: boolean }) => void;
  unlinkSync?: (path: string) => void;
  rmdirSync?: (path: string) => void;
}

/**
 * Ejecuta un rollback seguro del worktree ante un fallo de verificación post-creación.
 *
 * NOTA DE SEGURIDAD Y MODELO DE AMENAZAS (Mitigación TOCTOU):
 * Esta función aplica una defensa en profundidad y mitigación TOCTOU (Time-of-Check to Time-of-Use):
 * 1. Intenta retirar el worktree formalmente con Git (`git worktree remove --force`).
 * 2. Comprueba la identidad y contención estricta del destino en disco:
 *    - Si es un enlace simbólico o junction, elimina ÚNICAMENTE el enlace sin borrado recursivo.
 *    - Si es un directorio, verifica pre-lstat y realpath dentro de canonicalBase inmediatamente
 *      antes de rmSync(), seguido de post-verificación de ausencia.
 *    - Si no se puede probar que reside dentro de canonicalBase, PRESERVA la evidencia intacta
 *      y solicita inspección manual sin ejecutar un borrado indiscriminado.
 * 3. Purga metadatos huérfanos con `git worktree prune`.
 *
 * Límite técnico: Constituye una mitigación conservadora para minimizar la ventana entre
 * comprobación y borrado en Node.js estándar. No representa una primitiva atómica a nivel de kernel
 * (e.g. unlinkat/openat con O_NOFOLLOW), por lo que ante procesos locales hostiles con privilegios concurrentes
 * la estrategia de seguridad prioriza preservar la evidencia ante la menor anomalía detectada.
 */
export function safeRollbackWorktree(
  targetPath: string,
  canonicalBase: string,
  mainRoot: string,
  fsOps: RollbackFileSystemOps = {},
): WorktreeRollbackReport {
  const customLstat = fsOps.lstatSync || fs.lstatSync;
  const customRealpath = fsOps.realpathSync || fs.realpathSync;
  const customRm = fsOps.rmSync || fs.rmSync;
  const customUnlink = fsOps.unlinkSync || fs.unlinkSync;
  const customRmdir = fsOps.rmdirSync || fs.rmdirSync;

  const report: WorktreeRollbackReport = {
    gitWorktreeRemoved: false,
    gitMetadataPruned: false,
    residualCleaned: false,
    residualPreservedForEvidence: false,
    errors: [],
    stepsSummary: '',
  };

  const steps: string[] = [];

  // 1. Retirar formalmente el worktree con Git
  try {
    execFileSync('git', ['worktree', 'remove', '--force', targetPath], {
      cwd: mainRoot,
      stdio: 'ignore',
    });
    report.gitWorktreeRemoved = true;
    steps.push('git worktree remove: ÉXITO');
  } catch (gitErr: unknown) {
    const msg = gitErr instanceof Error ? gitErr.message : String(gitErr);
    report.errors.push(`git worktree remove falló: ${msg}`);
    steps.push('git worktree remove: FALLÓ');
  }

  // 2. Limpieza segura y validada del destino físico
  try {
    let lstat: fs.Stats | undefined;
    try {
      lstat = customLstat(targetPath, { throwIfNoEntry: false });
    } catch (lstatErr: unknown) {
      const msg = lstatErr instanceof Error ? lstatErr.message : String(lstatErr);
      report.errors.push(`error al inspeccionar destino '${targetPath}': ${msg}`);
      steps.push('limpieza residual: FALLÓ (inspección inaccesible)');
      report.residualPreservedForEvidence = true;
    }

    if (lstat) {
      if (lstat.isSymbolicLink()) {
        // Si es symlink o junction: eliminar estrictamente el enlace, NUNCA recursivo
        try {
          if (process.platform === 'win32') {
            try {
              customUnlink(targetPath);
            } catch {
              customRmdir(targetPath);
            }
          } else {
            customUnlink(targetPath);
          }
          report.residualCleaned = true;
          steps.push('limpieza residual: ÉXITO (enlace simbólico removido sin borrado recursivo)');
        } catch (unlinkErr: unknown) {
          const msg = unlinkErr instanceof Error ? unlinkErr.message : String(unlinkErr);
          report.errors.push(`no se pudo desvincular enlace simbólico residual: ${msg}`);
          steps.push('limpieza residual: FALLÓ al desvincular enlace');
        }
      } else if (lstat.isDirectory()) {
        // Es un directorio: comprobar identidad y contención estricta antes de borrar
        let safeToDelete = false;
        try {
          const preLstat = customLstat(targetPath);
          if (preLstat?.isSymbolicLink()) {
            // Si mutó a enlace simbólico justo antes de validar, abortar borrado recursivo
            safeToDelete = false;
          } else {
            const realTarget = customRealpath(targetPath);
            const realBase = customRealpath(canonicalBase);

            if (
              isContainedWithin(realBase, realTarget) &&
              normalizeForComparison(realBase) !== normalizeForComparison(realTarget)
            ) {
              safeToDelete = true;
            }
          }
        } catch {
          safeToDelete = false;
        }

        if (safeToDelete) {
          try {
            customRm(targetPath, { recursive: true, force: true });
            // Post-verificación síncrona: confirmar que el directorio ya no existe
            const postCheck = customLstat(targetPath, { throwIfNoEntry: false });
            if (!postCheck) {
              report.residualCleaned = true;
              steps.push('limpieza residual: ÉXITO (directorio verificado eliminado dentro de la base)');
            } else {
              report.errors.push(`el directorio '${targetPath}' aún persiste tras rmSync`);
              steps.push('limpieza residual: INCOMPLETA');
            }
          } catch (rmErr: unknown) {
            const msg = rmErr instanceof Error ? rmErr.message : String(rmErr);
            report.errors.push(`falló eliminación de directorio verificado: ${msg}`);
            steps.push('limpieza residual: FALLÓ al eliminar directorio');
          }
        } else {
          // PRESERVACIÓN DE EVIDENCIA: No se puede validar la ubicación de forma segura o mutó
          report.residualPreservedForEvidence = true;
          const warnMsg = `ADVERTENCIA DE SEGURIDAD: la ruta '${targetPath}' no se eliminó recursivamente porque su ubicación no pudo ser validada de forma segura dentro de '${canonicalBase}'. Se preserva la evidencia intacta para inspección manual.`;
          report.errors.push(warnMsg);
          steps.push('limpieza residual: OMITIDA (evidencia preservada para inspección manual)');
        }
      } else {
        // Archivo suelto
        try {
          customUnlink(targetPath);
          report.residualCleaned = true;
          steps.push('limpieza residual: ÉXITO (archivo residual eliminado)');
        } catch (unlErr: unknown) {
          const msg = unlErr instanceof Error ? unlErr.message : String(unlErr);
          report.errors.push(`falló eliminación de archivo residual: ${msg}`);
          steps.push('limpieza residual: FALLÓ');
        }
      }
    } else if (lstat === null || (lstat === undefined && report.errors.length === 0)) {
      report.residualCleaned = true;
      steps.push('limpieza residual: NO REQUERIDA (ruta no existe)');
    }
  } catch (fsErr: unknown) {
    const msg = fsErr instanceof Error ? fsErr.message : String(fsErr);
    report.errors.push(`excepción imprevista en limpieza del sistema de archivos: ${msg}`);
    steps.push('limpieza residual: FALLÓ por excepción inesperada');
  }

  // 3. Purgar metadatos de Git
  try {
    execFileSync('git', ['worktree', 'prune'], { cwd: mainRoot, stdio: 'ignore' });
    report.gitMetadataPruned = true;
    steps.push('git worktree prune: ÉXITO');
  } catch (pruneErr: unknown) {
    const msg = pruneErr instanceof Error ? pruneErr.message : String(pruneErr);
    report.errors.push(`git worktree prune falló: ${msg}`);
    steps.push('git worktree prune: FALLÓ');
  }

  report.stepsSummary = steps.join(' | ');
  return report;
}

/**
 * Crea un worktree en la ubicación canónica siguiendo la nomenclatura oficial.
 */
export function createWorktree(input: TaskNamingInput, options: CreateWorktreeOptions = {}): CreatedWorktreeResult {
  const cwd = options.cwd || process.cwd();
  const mainRoot = resolveMainRepoRoot(cwd);
  const canonicalBase = resolveCanonicalWorktreeBase(cwd);

  // 1. Generar nomenclatura canónica
  const naming = generateCanonicalNaming(input);

  // Validar rama base recibida (previene inyección de opciones y sintaxis Git inválida)
  const baseBranch = options.baseBranch ? validateGitRef(options.baseBranch, 'baseBranch') : 'main';

  // 2. Resolver y validar ruta destino
  const targetPath = path.normalize(path.join(canonicalBase, naming.folderName));

  if (!isWithinCanonicalBase(targetPath, canonicalBase)) {
    throw new Error(
      `Violación de seguridad: la ruta destino '${targetPath}' escapa de la base canónica '${canonicalBase}'.`,
    );
  }

  // 3. Comprobar colisiones de directorio o enlaces existentes
  if (fs.existsSync(targetPath) || fs.lstatSync(targetPath, { throwIfNoEntry: false })) {
    throw new Error(`Colisión detectada: el directorio o enlace '${targetPath}' ya existe en el sistema de archivos.`);
  }

  // 4. Comprobar colisiones con worktrees registrados
  const existingWts = listWorktrees(cwd);
  const wtPathCollision = existingWts.find(
    (w) => path.resolve(w.path).toLowerCase() === path.resolve(targetPath).toLowerCase(),
  );
  if (wtPathCollision) {
    throw new Error(`Colisión detectada: ya existe un worktree registrado en '${targetPath}'.`);
  }

  const wtBranchCollision = existingWts.find((w) => w.branch === naming.branchName);
  if (wtBranchCollision) {
    throw new Error(
      `Colisión detectada: la rama '${naming.branchName}' ya está asignada al worktree '${wtBranchCollision.path}'.`,
    );
  }

  // 5. Comprobar si la rama existe localmente en Git
  let branchExists = false;
  try {
    execFileSync('git', ['show-ref', '--verify', '--quiet', `refs/heads/${naming.branchName}`], {
      cwd: mainRoot,
      stdio: 'ignore',
    });
    branchExists = true;
  } catch {
    branchExists = false;
  }

  // 6. Asegurar directorio base canónico y verificar ausencia de desvíos tras mkdir
  fs.mkdirSync(canonicalBase, { recursive: true });
  assertNoEscapingSymlinks(canonicalBase, path.dirname(mainRoot));

  // 7. Ejecutar git worktree add de forma segura sin shell
  const gitArgs = ['worktree', 'add'];
  if (branchExists) {
    gitArgs.push(targetPath, naming.branchName);
  } else {
    gitArgs.push('-b', naming.branchName, targetPath, baseBranch);
  }

  try {
    execFileSync('git', gitArgs, { cwd: mainRoot, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    throw new Error(`Error al crear worktree con 'git ${gitArgs.join(' ')}': ${errorMsg}`);
  }

  // 8. Mitigación TOCTOU: Verificación post-creación con rollback seguro e informado si se detecta compromiso
  try {
    verifyWorktreePostCreation(targetPath, canonicalBase, mainRoot);
  } catch (postErr: unknown) {
    const rollback = safeRollbackWorktree(targetPath, canonicalBase, mainRoot);
    const postMsg = postErr instanceof Error ? postErr.message : String(postErr);

    const isFullyRecovered =
      rollback.gitWorktreeRemoved &&
      rollback.gitMetadataPruned &&
      rollback.residualCleaned &&
      !rollback.residualPreservedForEvidence &&
      rollback.errors.length === 0;
    const statusLabel = isFullyRecovered ? 'rollback completado' : 'rollback parcial / manual requerido';

    const errLines = [
      `Violación de seguridad post-creación detectada (${statusLabel}): ${postMsg}`,
      `Estado del rollback: [${rollback.stepsSummary}]`,
    ];
    if (rollback.errors.length > 0) {
      errLines.push(`Detalles: ${rollback.errors.join('; ')}`);
    }

    throw new Error(errLines.join('\n'));
  }

  // 9. Crear junctions de node_modules si procede (Windows / entorno local con node_modules en main)
  const shouldLink = options.createNodeModulesJunction !== false;

  if (shouldLink && process.platform === 'win32') {
    const junctionCandidates = [
      { src: path.join(mainRoot, 'node_modules'), dest: path.join(targetPath, 'node_modules') },
      {
        src: path.join(mainRoot, 'apps', 'backend', 'node_modules'),
        dest: path.join(targetPath, 'apps', 'backend', 'node_modules'),
      },
      {
        src: path.join(mainRoot, 'apps', 'frontend', 'node_modules'),
        dest: path.join(targetPath, 'apps', 'frontend', 'node_modules'),
      },
    ];

    for (const candidate of junctionCandidates) {
      if (fs.existsSync(candidate.src) && !fs.existsSync(candidate.dest)) {
        try {
          fs.mkdirSync(path.dirname(candidate.dest), { recursive: true });
          fs.symlinkSync(candidate.src, candidate.dest, 'junction');
        } catch {
          // Si falla la unión, el usuario o agente puede ejecutar npm install manualmente
        }
      }
    }
  }

  return {
    path: targetPath,
    branch: naming.branchName,
    folderName: naming.folderName,
    mainRepoRoot: mainRoot,
    canonicalBase,
  };
}
