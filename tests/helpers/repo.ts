import path from 'node:path';

/**
 * Raíz del repositorio, resuelta desde la ubicación de este archivo y no desde el
 * directorio de trabajo, para que las suites funcionen ejecutadas desde cualquier cwd.
 */
export const ROOT_DIR = path.resolve(import.meta.dirname, '../..');
