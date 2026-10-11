import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
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

  const stdout = execSync('git worktree list --porcelain', {
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
    const statusOut = execSync('git status --porcelain', {
      cwd: worktree.path,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    const statusLines = statusOut.split(/\r?\n/).filter((l) => l.trim().length > 0);
    for (const l of statusLines) {
      if (l.startsWith('??')) {
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
      // Comparar contra main
      const revListOut = execSync(`git rev-list --count main..${worktree.branch}`, {
        cwd: mainRoot,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      const count = parseInt(revListOut, 10);
      if (!Number.isNaN(count) && count === 0) {
        isMerged = true;
      }
    } catch {
      // Ignorar
    }

    try {
      // Comparar contra upstream remoto si existe
      const upstreamRev = execSync(`git rev-list --count @{u}..HEAD`, {
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

  const forceFlag = options.force ? '--force' : '';
  const cmd = `git worktree remove ${forceFlag} "${target.path}"`;

  try {
    execSync(cmd, { cwd: mainRoot, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    throw new Error(`Fallo al ejecutar '${cmd}': ${errorMsg}`);
  }

  return {
    success: true,
    message: `Worktree '${target.path}' eliminado exitosamente.`,
  };
}

/**
 * Ejecuta `git worktree prune` para limpiar referencias a directorios inexistentes.
 */
export function pruneWorktrees(cwd: string = process.cwd()): string {
  const mainRoot = resolveMainRepoRoot(cwd);
  return execSync('git worktree prune -v', {
    cwd: mainRoot,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}
