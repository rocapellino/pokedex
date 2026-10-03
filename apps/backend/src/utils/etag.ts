import crypto from 'node:crypto';

/**
 * Calcula un ETag HTTP determinista y seguro a partir de cualquier estructura de datos.
 * Emplea SHA-256 truncado a 16 caracteres hexadecimales entrecomillados.
 */
export function calculateETag(data: unknown): string {
  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(data))
    .digest('hex')
    .substring(0, 16);
  return `"${hash}"`;
}
