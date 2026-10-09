/**
 * Ejecución reproducible de Helm: binario local si existe; si no, contenedor
 * efímero con la misma imagen fijada por digest en `Taskfile.yaml` (`HELM_IMAGE`).
 *
 * Las rutas absolutas bajo la raíz del repo se traducen a `/repo` (montaje de solo lectura).
 * En CI (`CI=true`) no hay fallback silencioso: si no hay Helm, el error es explícito.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './repo-root.ts';

const ROOT_DIR = REPO_ROOT;
const MAX_BUFFER = 32 * 1024 * 1024;

type HelmRuntime = 'local' | 'docker' | 'none';

function probe(command: string, args: string[]): boolean {
  try {
    execFileSync(command, args, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Imagen de Helm fijada por digest en el Taskfile (SSOT de la versión). */
export function helmImage(): string {
  const taskfile = fs.readFileSync(path.join(ROOT_DIR, 'Taskfile.yaml'), 'utf-8');
  const match = taskfile.match(/HELM_IMAGE:\s*'?"?([^\s'"]+)/);
  if (!match) throw new Error('Taskfile.yaml debe definir HELM_IMAGE');
  return match[1];
}

let cachedRuntime: HelmRuntime | undefined;

/** Runtime disponible: Helm local, Docker con la imagen fijada, o ninguno. */
export function helmRuntime(): HelmRuntime {
  if (cachedRuntime) return cachedRuntime;
  if (probe('helm', ['version', '--short'])) cachedRuntime = 'local';
  else if (process.env.CI !== 'true' && probe('docker', ['info'])) cachedRuntime = 'docker';
  else cachedRuntime = 'none';
  return cachedRuntime;
}

export function isHelmAvailable(): boolean {
  return helmRuntime() !== 'none';
}

function toContainerPath(arg: string): string {
  const forward = ROOT_DIR.split('\\').join('/');
  return arg.split(ROOT_DIR).join('/repo').split(forward).join('/repo').split('\\').join('/');
}

/** Ejecuta `helm <args>` y devuelve stdout. Lanza si no hay runtime disponible. */
export function runHelm(args: string[]): string {
  const runtime = helmRuntime();
  if (runtime === 'none') {
    throw new Error('helm no disponible: instalarlo o, fuera de CI, iniciar Docker (imagen HELM_IMAGE del Taskfile)');
  }
  if (runtime === 'local') {
    return execFileSync('helm', args, { encoding: 'utf-8', maxBuffer: MAX_BUFFER });
  }
  const mapped = args.map((arg) =>
    arg.includes(ROOT_DIR) || arg.includes(ROOT_DIR.split('\\').join('/')) ? toContainerPath(arg) : arg,
  );
  return execFileSync('docker', ['run', '--rm', '-v', `${ROOT_DIR}:/repo:ro`, '-w', '/repo', helmImage(), ...mapped], {
    encoding: 'utf-8',
    maxBuffer: MAX_BUFFER,
  });
}
