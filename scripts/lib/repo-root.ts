import path from 'node:path';

/**
 * Raíz del repositorio, resuelta desde la ubicación de este archivo y no desde el
 * directorio de trabajo: los scripts dan el mismo resultado ejecutados desde cualquier cwd.
 */
export const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
