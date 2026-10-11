import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { listWorktrees } from './manager.js';
import { generateCanonicalNaming, type TaskNamingInput } from './naming.js';
import { isWithinCanonicalBase, resolveCanonicalWorktreeBase, resolveMainRepoRoot } from './resolver.js';

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

/**
 * Crea un worktree en la ubicación canónica siguiendo la nomenclatura oficial.
 */
export function createWorktree(input: TaskNamingInput, options: CreateWorktreeOptions = {}): CreatedWorktreeResult {
  const cwd = options.cwd || process.cwd();
  const mainRoot = resolveMainRepoRoot(cwd);
  const canonicalBase = resolveCanonicalWorktreeBase(cwd);

  // 1. Generar nomenclatura canónica
  const naming = generateCanonicalNaming(input);

  // 2. Resolver y validar ruta destino
  const targetPath = path.normalize(path.join(canonicalBase, naming.folderName));

  if (!isWithinCanonicalBase(targetPath, canonicalBase)) {
    throw new Error(
      `Violación de seguridad: la ruta destino '${targetPath}' escapa de la base canónica '${canonicalBase}'.`,
    );
  }

  // 3. Comprobar colisiones de directorio
  if (fs.existsSync(targetPath)) {
    throw new Error(`Colisión detectada: el directorio '${targetPath}' ya existe en el sistema de archivos.`);
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
    execSync(`git show-ref --verify --quiet refs/heads/${naming.branchName}`, {
      cwd: mainRoot,
      stdio: 'ignore',
    });
    branchExists = true;
  } catch {
    branchExists = false;
  }

  // 6. Asegurar directorio base canónico
  fs.mkdirSync(canonicalBase, { recursive: true });

  // 7. Ejecutar git worktree add
  const baseBranch = options.baseBranch || 'main';
  let cmd = '';
  if (branchExists) {
    cmd = `git worktree add "${targetPath}" "${naming.branchName}"`;
  } else {
    cmd = `git worktree add -b "${naming.branchName}" "${targetPath}" "${baseBranch}"`;
  }

  try {
    execSync(cmd, { cwd: mainRoot, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    throw new Error(`Error al crear worktree con '${cmd}': ${errorMsg}`);
  }

  // 8. Crear junction de node_modules si procede (Windows / entorno local con node_modules en main)
  const mainNodeModules = path.join(mainRoot, 'node_modules');
  const targetNodeModules = path.join(targetPath, 'node_modules');
  const shouldLink = options.createNodeModulesJunction !== false;

  if (shouldLink && fs.existsSync(mainNodeModules) && !fs.existsSync(targetNodeModules)) {
    try {
      // Usar junction en Windows para evitar requerir permisos de administrador
      if (process.platform === 'win32') {
        execSync(`cmd /c mklink /J "${targetNodeModules}" "${mainNodeModules}"`, {
          stdio: 'ignore',
        });
      }
    } catch {
      // Si falla la unión, el usuario o agente puede ejecutar npm install manualmente
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
