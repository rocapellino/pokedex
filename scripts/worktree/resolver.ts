import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Resuelve la raíz del repositorio Git principal (no la del worktree vinculado).
 *
 * Si se ejecuta desde un worktree vinculado, `git rev-parse --git-common-dir`
 * devuelve la ruta absoluta o relativa al directorio `.git` común (ej. `C:/.../pokedex/.git`).
 * A partir de allí, el directorio padre de ese `.git` es el checkout principal canónico.
 *
 * Si no está disponible Git o falla, retrocede buscando recursivamente un `.git` que sea directorio.
 */
export function resolveMainRepoRoot(cwd: string = process.cwd()): string {
  try {
    const rawCommonDir = execSync('git rev-parse --path-format=absolute --git-common-dir', {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    if (rawCommonDir && fs.existsSync(rawCommonDir)) {
      const normalized = path.normalize(rawCommonDir);
      // Si el common-dir termina en .git, el directorio padre es la raíz principal
      if (path.basename(normalized) === '.git') {
        return path.dirname(normalized);
      }
      return normalized;
    }
  } catch {
    // Fallback manual recorriendo hacia arriba
  }

  let curr = path.resolve(cwd);
  while (curr !== path.dirname(curr)) {
    const gitPath = path.join(curr, '.git');
    if (fs.existsSync(gitPath)) {
      const stat = fs.statSync(gitPath);
      if (stat.isDirectory()) {
        return curr;
      }
    }
    curr = path.dirname(curr);
  }

  throw new Error(`No se pudo resolver la raíz principal del repositorio Git desde: ${cwd}`);
}

/**
 * Nombre canónico del repositorio derivado de la raíz principal (ej. 'pokedex').
 */
export function resolveRepoSlug(mainRepoRoot: string): string {
  return path.basename(mainRepoRoot);
}

/**
 * Directorio base canónico para todos los worktrees de este repositorio.
 * Estructura fija: `<directorio-padre-del-repo>/.worktrees/<slug-del-repo>/`
 * Ejemplo: Si el repo está en `C:/Users/.../Git/pokedex`, la base será:
 * `C:/Users/.../Git/.worktrees/pokedex/`
 */
export function resolveCanonicalWorktreeBase(cwd: string = process.cwd()): string {
  const mainRoot = resolveMainRepoRoot(cwd);
  const slug = resolveRepoSlug(mainRoot);
  const parentDir = path.dirname(mainRoot);
  return path.normalize(path.join(parentDir, '.worktrees', slug));
}

/**
 * Valida que una ruta resuelta resida estrictamente dentro del directorio base canónico.
 * Previene ataques de path traversal.
 */
export function isWithinCanonicalBase(targetPath: string, baseDir: string): boolean {
  const normalizedTarget = path.resolve(targetPath);
  const normalizedBase = path.resolve(baseDir);

  if (normalizedTarget === normalizedBase) {
    return false;
  }

  const relative = path.relative(normalizedBase, normalizedTarget);
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}
