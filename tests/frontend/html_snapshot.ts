import type { TestContext } from 'node:test';

/**
 * Los hooks de pre-commit recortan los espacios finales y fijan el salto de línea final de los archivos;
 * la comparación los ignora para que la instantánea sea estable (no cambia el HTML).
 */
export const normalizeHtml = (html: string): string => html.replace(/[ \t]+$/gm, '').replace(/\n+$/, '');

/**
 * Compara el HTML con la instantánea nativa de `node:test` (archivo `<test>.snapshot` junto al test).
 * Se serializa como texto plano para que la instantánea sea legible y revisable en el diff.
 * Regenerar de forma deliberada con `npm run test:snapshots:update`.
 */
export function assertHtmlSnapshot(t: TestContext, html: unknown): void {
  t.assert.snapshot(normalizeHtml(String(html)), { serializers: [(value: unknown) => String(value)] });
}
