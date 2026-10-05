/**
 * Extrae un mensaje legible de un valor capturado en un `catch` (tipado `unknown`).
 */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Devuelve el código HTTP de un error capturado si lo expone (p. ej. `ApiError`).
 */
export function errorStatus(err: unknown): number | undefined {
  if (typeof err === 'object' && err !== null && 'status' in err) {
    const { status } = err as { status: unknown };
    return typeof status === 'number' ? status : undefined;
  }
  return undefined;
}
