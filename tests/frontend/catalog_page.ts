/**
 * Página del catálogo para las pruebas de controladores del frontend.
 *
 * Monta el marcado REAL de `apps/frontend/index.html` en el JSDOM compartido (en lugar de esqueletos escritos a
 * mano, que se desfasaban de la página: un test podía pasar con IDs que ya no existen) y concentra el
 * arranque común: esperar a que el documento termine de cargar, servir un catálogo y crear Pokémon de prueba.
 *
 * Debe importarse ANTES que los módulos del frontend, igual que `mega_env.ts`, cuyo entorno reutiliza.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { Pokemon } from '../../apps/frontend/src/types.js';
import { ROOT_DIR } from '../helpers/repo.js';
import { dom } from './mega_env.js';

export { dom };
export const doc = dom.window.document;

const INDEX_HTML = fs.readFileSync(path.join(ROOT_DIR, 'apps/frontend/index.html'), 'utf-8');

/** Documento con el marcado de `index.html`, solo para extraer fragmentos. */
export const indexDoc = new dom.window.DOMParser().parseFromString(INDEX_HTML, 'text/html');

/**
 * Espera a que JSDOM termine la carga inicial (DOMContentLoaded y load). Los módulos del frontend registran ahí
 * sus manejadores; montar el DOM antes los ejecutaría sobre un documento a medio cargar.
 */
export async function documentReady(): Promise<void> {
  if (doc.readyState === 'complete') return;
  await new Promise<void>((resolve) => dom.window.addEventListener('load', () => resolve(), { once: true }));
}

/**
 * Monta el marcado real de `index.html` en el `body` de pruebas.
 *
 * Sin argumentos monta la página completa (sin `<script>`); con `selectors` monta solo esos fragmentos. `extraHtml`
 * se añade al final, para los contenedores que la prueba necesite y la página no declare.
 */
export function mountIndexPage(selectors?: string[], extraHtml = ''): void {
  if (selectors) {
    const fragment = selectors.map((selector) => indexDoc.querySelector(selector)?.outerHTML ?? '').join('');
    doc.body.innerHTML = `${fragment}${extraHtml}`;
    return;
  }
  const body = indexDoc.body.cloneNode(true) as HTMLElement;
  for (const script of body.querySelectorAll('script')) script.remove();
  doc.body.innerHTML = `${body.innerHTML}${extraHtml}`;
}

const REAL_FETCH = globalThis.fetch;

/**
 * Sirve `catalog` como respuesta de `fetch` (con `X-Total-Count`). Puede llamarse varias veces dentro de un
 * mismo archivo para cambiar el catálogo. Devuelve la función que restaura el `fetch` original: llamarla en
 * `after()`.
 */
export function serveCatalog(catalog: Pokemon[], total = catalog.length): () => void {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(catalog), { headers: { 'X-Total-Count': String(total) } })) as typeof fetch;
  return () => {
    globalThis.fetch = REAL_FETCH;
  };
}

/** Pokémon de prueba mínimo; `extra` sobrescribe cualquier campo. */
export const mk = (id: number, nombre: string, tipo: string, extra: Partial<Pokemon> = {}): Pokemon => ({
  id,
  nombre,
  tipo,
  tipos: [tipo],
  fuerza: 50,
  imagen: '',
  caracteristicas: { peso: 6, altura: 0.4, habitat: 'Bosque' },
  ...extra,
});
