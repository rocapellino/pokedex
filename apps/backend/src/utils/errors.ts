/**
 * Extrae un mensaje legible de un valor capturado en un `catch` (tipado `unknown`).
 */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
