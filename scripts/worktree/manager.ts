import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { validateGitRef } from './naming.js';
import { isWithinCanonicalBase, resolveCanonicalWorktreeBase, resolveMainRepoRoot } from './resolver.js';

export interface RegisteredWorktree {
  path: string;
  head: string;
  branch?: string;
  isBare: boolean;
  isPrunable: boolean;
  pruneReason?: string;
  isMainCheckout: boolean;
  isCompliant: boolean;
}

export interface WorktreeStatusDetails {
  worktree: RegisteredWorktree;
  hasUncommittedChanges: boolean;
  untrackedFilesCount: number;
  hasUnpushedCommits: boolean;
  unpushedCommitsCount: number;
  isMergedIntoMain: boolean;
  isClean: boolean;
  isAbandoned: boolean;
}

/**
 * Obtiene la lista completa de worktrees registrados por Git usando `git worktree list --porcelain`.
 */
export function listWorktrees(cwd: string = process.cwd()): RegisteredWorktree[] {
  const mainRoot = resolveMainRepoRoot(cwd);
  const baseDir = resolveCanonicalWorktreeBase(cwd);

  const stdout = execFileSync('git', ['worktree', 'list', '--porcelain'], {
    cwd: mainRoot,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });

  const lines = stdout.split(/\r?\n/);
  const worktrees: RegisteredWorktree[] = [];
  let current: Partial<RegisteredWorktree> = {};

  for (const line of lines) {
    if (!line.trim()) {
      if (current.path) {
        finalizeWorktreeEntry(current, worktrees, mainRoot, baseDir);
        current = {};
      }
      continue;
    }

    if (line.startsWith('worktree ')) {
      current.path = path.normalize(line.slice(9).trim());
    } else if (line.startsWith('HEAD ')) {
      current.head = line.slice(5).trim();
    } else if (line.startsWith('branch ')) {
      const ref = line.slice(7).trim();
      current.branch = ref.replace(/^refs\/heads\//, '');
    } else if (line === 'bare') {
      current.isBare = true;
    } else if (line === 'prunable') {
      current.isPrunable = true;
    } else if (line.startsWith('prunable ')) {
      current.isPrunable = true;
      current.pruneReason = line.slice(9).trim();
    }
  }

  if (current.path) {
    finalizeWorktreeEntry(current, worktrees, mainRoot, baseDir);
  }

  return worktrees;
}

function finalizeWorktreeEntry(
  entry: Partial<RegisteredWorktree>,
  list: RegisteredWorktree[],
  mainRoot: string,
  baseDir: string,
) {
  const wtPath = entry.path || '';
  const isMain = path.resolve(wtPath).toLowerCase() === path.resolve(mainRoot).toLowerCase();
  const compliant = isMain || isWithinCanonicalBase(wtPath, baseDir);

  list.push({
    path: wtPath,
    head: entry.head || '',
    branch: entry.branch,
    isBare: Boolean(entry.isBare),
    isPrunable: Boolean(entry.isPrunable),
    pruneReason: entry.pruneReason,
    isMainCheckout: isMain,
    isCompliant: compliant,
  });
}

/**
 * Inspecciona el estado detallado de un worktree:
 * cambios sin confirmar, archivos sin seguimiento, commits no publicados y merge con main.
 */
export function inspectWorktreeStatus(worktree: RegisteredWorktree, mainRoot: string): WorktreeStatusDetails {
  if (!fs.existsSync(worktree.path) || worktree.isPrunable) {
    return {
      worktree,
      hasUncommittedChanges: false,
      untrackedFilesCount: 0,
      hasUnpushedCommits: false,
      unpushedCommitsCount: 0,
      isMergedIntoMain: false,
      isClean: false,
      isAbandoned: true,
    };
  }

  // 1. Cambios sin confirmar y archivos untracked
  let hasUncommitted = false;
  let untrackedCount = 0;
  try {
    const statusOut = execFileSync('git', ['status', '--porcelain'], {
      cwd: worktree.path,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    const managedJunctionRels = ['node_modules', 'apps/backend/node_modules', 'apps/frontend/node_modules'];
    const statusLines = statusOut.split(/\r?\n/).filter((l) => l.trim().length > 0);
    for (const l of statusLines) {
      if (l.startsWith('??')) {
        const relRaw = l.slice(3).trim().replace(/\/+$/, '').replace(/\\/g, '/');
        const matchedJunction = managedJunctionRels.find((jRel) => relRaw === jRel || relRaw.startsWith(`${jRel}/`));
        if (matchedJunction) {
          const candidatePath = path.join(worktree.path, matchedJunction);
          const lstat = fs.lstatSync(candidatePath, { throwIfNoEntry: false });
          if (lstat?.isSymbolicLink()) {
            continue;
          }
        }
        untrackedCount++;
      } else {
        hasUncommitted = true;
      }
    }
  } catch {
    // Si falla status, asumimos que no está limpio
    hasUncommitted = true;
  }

  // 2. Commits no integrados / publicados
  let unpushedCommitsCount = 0;
  let isMerged = false;

  if (worktree.branch) {
    try {
      validateGitRef(worktree.branch, 'worktree.branch');
      // Comparar contra main
      const revListOut = execFileSync('git', ['rev-list', '--count', `main..${worktree.branch}`], {
        cwd: mainRoot,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      const count = parseInt(revListOut, 10);
      if (!Number.isNaN(count) && count === 0) {
        isMerged = true;
      }
    } catch {
      // Ignorar si falla la comparación o si la ref no existe
    }

    try {
      // Comparar contra upstream remoto si existe
      const upstreamRev = execFileSync('git', ['rev-list', '--count', '@{u}..HEAD'], {
        cwd: worktree.path,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      const uCount = parseInt(upstreamRev, 10);
      if (!Number.isNaN(uCount)) {
        unpushedCommitsCount = uCount;
      }
    } catch {
      // Si no tiene upstream pero tiene commits no mergeados a main:
      if (!isMerged) {
        unpushedCommitsCount = 1;
      }
    }
  }

  const isClean = !hasUncommitted && untrackedCount === 0;

  return {
    worktree,
    hasUncommittedChanges: hasUncommitted,
    untrackedFilesCount: untrackedCount,
    hasUnpushedCommits: unpushedCommitsCount > 0,
    unpushedCommitsCount,
    isMergedIntoMain: isMerged,
    isClean,
    isAbandoned: false,
  };
}

/**
 * Desvincula de forma segura los enlaces simbólicos o junctions de `node_modules` creados
 * dentro de un worktree (sin ejecutar borrado recursivo sobre el destino).
 * Esto evita que `git worktree remove` falle en Windows por directorios ignorados o deje junctions huérfanas.
 */
export function unlinkWorktreeNodeModulesJunctions(worktreePath: string): void {
  const candidates = [
    path.join(worktreePath, 'apps', 'backend', 'node_modules'),
    path.join(worktreePath, 'apps', 'frontend', 'node_modules'),
    path.join(worktreePath, 'node_modules'),
  ];

  for (const candidate of candidates) {
    try {
      const lstat = fs.lstatSync(candidate, { throwIfNoEntry: false });
      if (lstat?.isSymbolicLink()) {
        if (process.platform === 'win32') {
          try {
            fs.unlinkSync(candidate);
          } catch {
            fs.rmdirSync(candidate);
          }
        } else {
          fs.unlinkSync(candidate);
        }
      }
    } catch {
      // Ignorar si no existe o no puede desvincularse previamente
    }
  }
}

/**
 * Elimina de forma segura un worktree mediante `git worktree remove`.
 * Bloquea la eliminación si contiene cambios sin confirmar o commits no publicados, salvo `force: true`.
 */
export function removeWorktreeSafely(
  targetIdentifier: string,
  options: { force?: boolean; cwd?: string } = {},
): { success: boolean; message: string } {
  const cwd = options.cwd || process.cwd();
  const mainRoot = resolveMainRepoRoot(cwd);
  const worktrees = listWorktrees(cwd);

  const target = worktrees.find(
    (w) =>
      path.resolve(w.path).toLowerCase() === path.resolve(targetIdentifier).toLowerCase() ||
      w.branch === targetIdentifier ||
      path.basename(w.path) === targetIdentifier,
  );

  if (!target) {
    throw new Error(`No se encontró ningún worktree registrado que coincida con: ${targetIdentifier}`);
  }

  if (target.isMainCheckout) {
    throw new Error('Prohibido eliminar el checkout principal del repositorio.');
  }

  const status = inspectWorktreeStatus(target, mainRoot);

  if (!options.force) {
    if (status.hasUncommittedChanges) {
      throw new Error(
        `El worktree '${target.path}' tiene cambios sin confirmar. Limpie o guarde su trabajo, o use --force.`,
      );
    }
    if (status.untrackedFilesCount > 0) {
      throw new Error(
        `El worktree '${target.path}' contiene ${status.untrackedFilesCount} archivos sin seguimiento. Use --force si desea descartarlos.`,
      );
    }
    if (status.hasUnpushedCommits && !status.isMergedIntoMain) {
      throw new Error(
        `El worktree '${target.path}' tiene commits no publicados ni integrados en 'main'. Use --force si desea descartarlos.`,
      );
    }
  }

  // Desvincular junctions de node_modules antes de invocar git worktree remove
  unlinkWorktreeNodeModulesJunctions(target.path);

  const gitArgs = ['worktree', 'remove'];
  if (options.force) {
    gitArgs.push('--force');
  }
  gitArgs.push(target.path);

  try {
    execFileSync('git', gitArgs, { cwd: mainRoot, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err: unknown) {
    // En Windows, `git worktree remove` puede desregistrar exitosamente el worktree en `.git/worktrees/`
    // y borrar todos los archivos rastreados, pero fallar con `Permission denied` o `Directory not empty`
    // en el `rmdir` final del contenedor. Comprobamos si ya fue desregistrado de Git:
    const remaining = listWorktrees(mainRoot);
    const stillRegistered = remaining.some(
      (w) => path.resolve(w.path).toLowerCase() === path.resolve(target.path).toLowerCase(),
    );

    if (stillRegistered) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      throw new Error(`Fallo al ejecutar 'git ${gitArgs.join(' ')}': ${errorMsg}`);
    }

    // Si Git ya lo desregistró, limpiar de forma segura cualquier carpeta contenedora vacía/residual
    try {
      unlinkWorktreeNodeModulesJunctions(target.path);
      const lstat = fs.lstatSync(target.path, { throwIfNoEntry: false });
      if (lstat && !lstat.isSymbolicLink() && lstat.isDirectory()) {
        fs.rmSync(target.path, { recursive: true, force: true });
      }
    } catch {
      // Si el descriptor de directorio sigue retenido por el proceso host en Windows, Git ya lo desregistró
    }
  }

  return {
    success: true,
    message: `Worktree '${target.path}' eliminado exitosamente.`,
  };
}

/**
 * Limpia de forma segura todos los worktrees registrados que se encuentren fuera de la base canónica.
 * Respeta las mismas garantías de seguridad que `removeWorktreeSafely` (no elimina worktrees con
 * trabajo pendiente salvo `force: true`).
 */
export function cleanupNonCanonicalWorktrees(options: { force?: boolean; cwd?: string } = {}): {
  removed: string[];
  skipped: { path: string; reason: string }[];
} {
  const cwd = options.cwd || process.cwd();
  const worktrees = listWorktrees(cwd);
  const nonCanonical = worktrees.filter((w) => !w.isMainCheckout && !w.isCompliant);

  const removed: string[] = [];
  const skipped: { path: string; reason: string }[] = [];

  for (const wt of nonCanonical) {
    try {
      removeWorktreeSafely(wt.path, options);
      removed.push(wt.path);
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      skipped.push({ path: wt.path, reason });
    }
  }

  return { removed, skipped };
}

/**
 * Ejecuta `git worktree prune` para limpiar referencias a directorios inexistentes.
 */
export function pruneWorktrees(cwd: string = process.cwd()): string {
  const mainRoot = resolveMainRepoRoot(cwd);
  return execFileSync('git', ['worktree', 'prune', '-v'], {
    cwd: mainRoot,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}
