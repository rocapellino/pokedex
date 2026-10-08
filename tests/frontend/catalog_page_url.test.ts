import { dom } from './mega_env.js';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyFilters,
  changePage,
  initInteractiveListeners,
  loadPokemons,
  restoreFiltersFromUrl,
  toggleTypeFilter,
} from '../../apps/frontend/src/pokedex.js';
import type { Pokemon } from '../../apps/frontend/src/types.js';

/**
 * La página del catálogo viaja en la URL (`?pagina=`): recargar o compartir el enlace conserva la
 * página, «atrás» y «adelante» la recorren y cualquier cambio de filtros vuelve a la primera. Antes
 * `filter-url.ts` solo guardaba filtros y recargar en la página 3 devolvía a la 1.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const INDEX = fs.readFileSync(path.join(ROOT, 'apps/frontend/index.html'), 'utf-8');
const doc = dom.window.document;
const win = dom.window;
const indexDoc = new win.DOMParser().parseFromString(INDEX, 'text/html');

const mk = (id: number): Pokemon => ({
  id,
  nombre: `Pokemon ${id}`,
  tipo: 'Normal',
  tipos: ['Normal'],
  fuerza: 10,
  imagen: '',
  caracteristicas: { peso: 1, altura: 1, habitat: 'x' },
});
const catalog = Array.from({ length: 100 }, (_, i) => mk(i + 1));
const realFetch = globalThis.fetch;

const firstId = (): string | null => doc.querySelector('.pokemon-card')?.getAttribute('data-pokemon-id') ?? null;
// jsdom no implementa `innerText` (lo asigna como propiedad corriente), que es lo que escribe el catálogo.
const pageInfo = (): string => (doc.getElementById('pageInfo') as HTMLElement | null)?.innerText ?? '';
const search = (): string => win.location.search;
const entries = (): number => win.history.length;

/** Simula abrir o recargar la página con esa query string. */
function openWith(query: string): void {
  win.history.replaceState(null, '', `/${query}`);
  applyFilters('replace', restoreFiltersFromUrl());
}

/** jsdom recorre el historial de forma asíncrona: se espera al `popstate` que dispara. */
function traverse(direction: 'back' | 'forward'): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`No hubo popstate tras history.${direction}()`)), 2000);
    win.addEventListener(
      'popstate',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
    win.history[direction]();
  });
}

before(async () => {
  await new Promise((resolve) => setTimeout(resolve, 20));
  const fragment = ['#pokemonGrid', '#paginationBar', '#pageAnnouncer']
    .map((selector) => indexDoc.querySelector(selector)?.outerHTML ?? '')
    .join('');
  doc.body.innerHTML = `${fragment}<div id="typePillsContainer"></div><div id="toastContainer"></div>`;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(catalog), { headers: { 'X-Total-Count': '100' } })) as typeof fetch;
  await loadPokemons();
  initInteractiveListeners();
  // jsdom no implementa `scrollIntoView`, que usa el cambio de página.
  (doc.getElementById('pokemonGrid') as HTMLElement).scrollIntoView = () => undefined;
});

after(() => {
  globalThis.fetch = realFetch;
});

test('📄 Página en la URL: abrir con ?pagina=2 muestra la segunda página', () => {
  openWith('?pagina=2');
  assert.equal(firstId(), '49');
  assert.match(pageInfo(), /Página 2 de 3/);
  assert.equal(search(), '?pagina=2');
});

test('📄 Página en la URL: una página inexistente se ajusta a la última y normaliza la URL', () => {
  openWith('?pagina=99');
  assert.match(pageInfo(), /Página 3 de 3/);
  assert.equal(search(), '?pagina=3');
});

test('📄 Página en la URL: un valor inválido vuelve a la primera y limpia la URL', () => {
  openWith('?pagina=abc');
  assert.match(pageInfo(), /Página 1 de 3/);
  assert.equal(search(), '');
});

test('📄 Página en la URL: cambiar de página crea una entrada y «atrás» y «adelante» la recorren', async () => {
  openWith('');
  const start = entries();

  changePage(1);
  assert.equal(search(), '?pagina=2');
  assert.equal(entries(), start + 1);

  changePage(1);
  assert.equal(search(), '?pagina=3');

  await traverse('back');
  assert.match(pageInfo(), /Página 2 de 3/);
  assert.equal(firstId(), '49');
  assert.equal(search(), '?pagina=2');

  await traverse('back');
  assert.match(pageInfo(), /Página 1 de 3/);
  assert.equal(search(), '');

  await traverse('forward');
  assert.match(pageInfo(), /Página 2 de 3/);
});

test('📄 Página en la URL: cambiar un filtro vuelve a la primera página y quita el parámetro', () => {
  openWith('?pagina=3');
  toggleTypeFilter('Normal');
  assert.match(pageInfo(), /Página 1 de 3/);
  assert.equal(search(), '?tipo=normal');
});
