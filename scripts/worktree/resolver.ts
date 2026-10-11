import { execFileSync } from 'node:child_process';
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
    const rawCommonDir = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
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
  const canonicalBase = path.normalize(path.join(parentDir, '.worktrees', slug));

  // Si canonicalBase existe, verificar que no sea un enlace simbólico que escape de parentDir
  const lstat = fs.lstatSync(canonicalBase, { throwIfNoEntry: false });
  if (lstat) {
    try {
      const realCanonical = fs.realpathSync(canonicalBase);
      const realParent = fs.realpathSync(parentDir);
      const normParent = process.platform === 'win32' ? realParent.toLowerCase() : realParent;
      const normCanonical = process.platform === 'win32' ? realCanonical.toLowerCase() : realCanonical;
      const rel = path.relative(normParent, normCanonical);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new Error(
          `Violación de seguridad: la base canónica '${canonicalBase}' es un enlace que resuelve fuera de '${parentDir}'.`,
        );
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('Violación de seguridad')) {
        throw err;
      }
    }
  }

  return canonicalBase;
}

/**
 * Valida que una ruta resuelta resida estrictamente dentro del directorio base canónico.
 * Previene ataques de path traversal léxico y desvíos mediante enlaces simbólicos (symlinks / junctions).
 */
export function isWithinCanonicalBase(targetPath: string, baseDir: string): boolean {
  const normalizedTarget = path.resolve(targetPath);
  const normalizedBase = path.resolve(baseDir);

  if (normalizedTarget === normalizedBase) {
    return false;
  }

  // 1. Verificación léxica de contención
  const relative = path.relative(normalizedBase, normalizedTarget);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return false;
  }

  // 2. Verificación de enlaces simbólicos mediante realpath
  // Resolver la ruta real de baseDir si existe, o de su ancestro existente más cercano
  let realBase = normalizedBase;
  if (fs.existsSync(normalizedBase)) {
    try {
      realBase = fs.realpathSync(normalizedBase);
    } catch {
      return false;
    }
  } else {
    let ancestor = path.dirname(normalizedBase);
    while (!fs.existsSync(ancestor) && ancestor !== path.dirname(ancestor)) {
      ancestor = path.dirname(ancestor);
    }
    if (fs.existsSync(ancestor)) {
      try {
        realBase = fs.realpathSync(ancestor);
      } catch {
        return false;
      }
    }
  }

  // Encontrar el componente existente más profundo de targetPath
  let checkPath = normalizedTarget;
  let entryFound = false;

  while (checkPath !== path.dirname(checkPath)) {
    const lstat = fs.lstatSync(checkPath, { throwIfNoEntry: false });
    if (lstat) {
      entryFound = true;
      break;
    }
    checkPath = path.dirname(checkPath);
  }

  if (entryFound) {
    try {
      const realCheck = fs.realpathSync(checkPath);
      const normRealBase = process.platform === 'win32' ? realBase.toLowerCase() : realBase;
      const normRealCheck = process.platform === 'win32' ? realCheck.toLowerCase() : realCheck;
      const relReal = path.relative(normRealBase, normRealCheck);
      if (relReal.startsWith('..') || path.isAbsolute(relReal)) {
        return false;
      }
    } catch {
      // Si falla realpath (por ejemplo un enlace roto o inaccesible), se rechaza por seguridad
      return false;
    }
  }

  return true;
}
