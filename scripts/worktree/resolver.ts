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
 * Normaliza una ruta para comparación determinista de rutas según el sistema operativo.
 */
function normalizeForComparison(p: string): string {
  const resolved = path.resolve(p);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/**
 * Valida si child reside dentro de parent o coincide con parent.
 */
function isContainedWithin(parent: string, child: string): boolean {
  const normParent = normalizeForComparison(parent);
  const normChild = normalizeForComparison(child);
  if (normParent === normChild) {
    return true;
  }
  const rel = path.relative(normParent, normChild);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Verifica que cada componente de ruta existente desde approvedRoot hasta targetPath
 * resida físicamente dentro de approvedRoot y no contenga enlaces simbólicos rotos,
 * inaccesibles o que desvíen la ruta fuera del directorio aprobado.
 */
export function assertNoEscapingSymlinks(targetPath: string, approvedRoot: string): void {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedRoot = path.resolve(approvedRoot);

  if (!isContainedWithin(resolvedRoot, resolvedTarget)) {
    throw new Error(
      `Violación de seguridad: la ruta destino '${resolvedTarget}' escapa léxicamente de '${resolvedRoot}'.`,
    );
  }

  let realRoot: string;
  try {
    realRoot = fs.realpathSync(resolvedRoot);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Violación de seguridad: no se pudo resolver el directorio raíz aprobado '${resolvedRoot}': ${msg}`,
    );
  }

  const relative = path.relative(resolvedRoot, resolvedTarget);
  if (!relative) {
    return;
  }

  const segments = relative.split(path.sep).filter(Boolean);
  let current = resolvedRoot;

  for (const seg of segments) {
    current = path.join(current, seg);
    const lstat = fs.lstatSync(current, { throwIfNoEntry: false });

    if (lstat) {
      let realCurrent: string;
      try {
        realCurrent = fs.realpathSync(current);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(
          `Violación de seguridad: el componente '${current}' contiene un enlace simbólico roto o inaccesible: ${msg}`,
        );
      }

      if (!isContainedWithin(realRoot, realCurrent)) {
        throw new Error(
          `Violación de seguridad: el componente '${current}' es un enlace simbólico que resuelve en '${realCurrent}', fuera de la ubicación aprobada '${resolvedRoot}'.`,
        );
      }
    }
  }
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
  const worktreesDir = path.normalize(path.join(parentDir, '.worktrees'));
  const canonicalBase = path.normalize(path.join(worktreesDir, slug));

  // Validar toda la cadena de componentes existente entre parentDir y canonicalBase:
  // Rechazar enlaces simbólicos rotos, inaccesibles o que desvíen fuera de parentDir
  assertNoEscapingSymlinks(canonicalBase, parentDir);

  return canonicalBase;
}

/**
 * Valida que una ruta resuelta resida estrictamente dentro del directorio base canónico.
 * Previene ataques de path traversal léxico y desvíos mediante enlaces simbólicos (symlinks / junctions)
 * en cualquier nivel de la jerarquía de directorios.
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

  // 2. Si baseDir reside bajo un directorio padre .worktrees, validar la jerarquía completa
  // desde el directorio padre superior (parentDir) para prevenir escapes en .worktrees
  const parentOfBase = path.dirname(normalizedBase);
  if (path.basename(parentOfBase) === '.worktrees') {
    const parentOfWorktrees = path.dirname(parentOfBase);
    if (fs.existsSync(parentOfWorktrees)) {
      try {
        assertNoEscapingSymlinks(normalizedTarget, parentOfWorktrees);
      } catch {
        return false;
      }
    }
  }

  // 3. Verificación de componentes existentes bajo baseDir
  let realBase: string;
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
    } else {
      return false;
    }
  }

  // Validar cada componente existente a lo largo de targetPath
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
      if (!isContainedWithin(realBase, realCheck)) {
        return false;
      }
    } catch {
      // Si falla realpath (por ejemplo un enlace roto o inaccesible), se rechaza por seguridad
      return false;
    }
  }

  return true;
}
