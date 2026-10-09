import { dom } from './mega_env.js';
import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { applyFilters, changePage, initInteractiveListeners, loadPokemons } from '../../apps/frontend/src/pokedex.js';
import { pageAnnouncement } from '../../apps/frontend/src/shared/page-focus.js';
import type { Pokemon } from '../../apps/frontend/src/types.js';
import { ROOT_DIR as ROOT } from '../helpers/repo.js';

/**
 * Tras cambiar de página, el foco, la vista y el anuncio deben seguir al contenido nuevo. Antes el
 * botón enfocado quedaba `disabled` en la última (y en la primera) página y el foco caía en BODY, el
 * desplazamiento era un `scrollTo` fijo de 350 px (a ~1.000 px de las tarjetas en pantallas estrechas)
 * y un lector de pantalla no recibía ninguna señal de que el catálogo había cambiado.
 */
const INDEX = fs.readFileSync(path.join(ROOT, 'apps/frontend/index.html'), 'utf-8');
const doc = dom.window.document;
const indexDoc = new dom.window.DOMParser().parseFromString(INDEX, 'text/html');

const mk = (id: number): Pokemon => ({
  id,
  nombre: `Pokemon ${id}`,
  tipo: 'Normal',
  fuerza: 10,
  imagen: '',
  caracteristicas: { peso: 1, altura: 1, habitat: 'x' },
});
const catalogOf = (n: number): Pokemon[] => Array.from({ length: n }, (_, i) => mk(i + 1));
const realFetch = globalThis.fetch;

const grid = (): HTMLElement => doc.getElementById('pokemonGrid') as HTMLElement;
const announcer = (): string => doc.getElementById('pageAnnouncer')?.textContent?.trim() ?? '';

const scrollTo: unknown[] = [];
const intoView: unknown[] = [];
const win = dom.window as unknown as { scrollTo: (o: unknown) => void; matchMedia?: unknown };
win.scrollTo = (o: unknown) => {
  scrollTo.push(o);
};
const setReducedMotion = (reduce: boolean | undefined): void => {
  win.matchMedia = reduce === undefined ? undefined : () => ({ matches: reduce });
};

before(async () => {
  await new Promise((resolve) => setTimeout(resolve, 20));
  const fragment = ['#pokemonGrid', '#paginationBar', '#pageAnnouncer']
    .map((selector) => indexDoc.querySelector(selector)?.outerHTML ?? '')
    .join('');
  doc.body.innerHTML = `${fragment}<div id="toastContainer"></div>`;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(catalogOf(100)), { headers: { 'X-Total-Count': '100' } })) as typeof fetch;
  await loadPokemons();
  initInteractiveListeners();
  // jsdom no implementa `scrollIntoView`: se sustituye por un espía en el contenedor del catálogo.
  grid().scrollIntoView = ((o: unknown) => {
    intoView.push(o);
  }) as unknown as HTMLElement['scrollIntoView'];
});

beforeEach(() => {
  scrollTo.length = 0;
  intoView.length = 0;
  setReducedMotion(undefined);
});

after(() => {
  globalThis.fetch = realFetch;
});

test('♿ Estructura: el catálogo se puede enfocar por programa y el anunciador es una región viva oculta', () => {
  const g = indexDoc.getElementById('pokemonGrid');
  assert.equal(g?.getAttribute('tabindex'), '-1');
  assert.ok(g?.getAttribute('aria-label')?.trim(), 'el catálogo necesita un nombre accesible');
  const a = indexDoc.getElementById('pageAnnouncer');
  assert.equal(a?.getAttribute('role'), 'status');
  assert.equal(a?.getAttribute('aria-live'), 'polite');
  assert.ok(a?.classList.contains('sr-only'), 'se anuncia pero no se ve');
});

test('♿ Texto del anuncio: página, total y Pokémon mostrados', () => {
  assert.equal(pageAnnouncement(2, 3, 48), 'Página 2 de 3, 48 Pokémon');
  assert.equal(pageAnnouncement(1, 1, 1), 'Página 1 de 1, 1 Pokémon');
});

test('♿ Al avanzar de página el foco pasa al catálogo y se anuncia la página', () => {
  doc.getElementById('btnNextPage')?.focus();
  changePage(1);
  assert.equal(doc.activeElement, grid(), 'el foco sigue al contenido nuevo');
  assert.equal(announcer(), 'Página 2 de 3, 48 Pokémon');
});

test('♿ En la última página el foco no cae en BODY aunque "Siguiente" quede deshabilitado', () => {
  doc.getElementById('btnNextPage')?.focus();
  changePage(1);
  assert.equal((doc.getElementById('btnNextPage') as HTMLButtonElement).disabled, true);
  assert.notEqual(doc.activeElement, doc.body, 'antes el foco se perdía aquí');
  assert.equal(doc.activeElement, grid());
  assert.equal(announcer(), 'Página 3 de 3, 4 Pokémon', 'la última página solo tiene 4 Pokémon');
});

test('♿ Al volver a la primera página el foco tampoco se pierde', () => {
  doc.getElementById('btnPrevPage')?.focus();
  changePage(-1);
  changePage(-1);
  assert.equal((doc.getElementById('btnPrevPage') as HTMLButtonElement).disabled, true);
  assert.equal(doc.activeElement, grid());
  assert.equal(announcer(), 'Página 1 de 3, 48 Pokémon');
});

test('♿ La vista va al propio catálogo, no a una cifra fija de píxeles', () => {
  changePage(1);
  assert.equal(scrollTo.length, 0, 'ya no se usa window.scrollTo con 350');
  assert.equal(intoView.length, 1);
  assert.equal((intoView[0] as { block?: string }).block, 'start');
  changePage(-1);
});

test('♿ El desplazamiento es suave salvo que el usuario pida movimiento reducido', () => {
  setReducedMotion(false);
  changePage(1);
  assert.equal((intoView.at(-1) as { behavior?: string }).behavior, 'smooth');
  setReducedMotion(true);
  changePage(-1);
  assert.equal((intoView.at(-1) as { behavior?: string }).behavior, 'auto');
});

test('♿ Un cambio de página imposible (antes de la primera) no mueve el foco ni anuncia nada', () => {
  assert.equal(
    (doc.getElementById('btnPrevPage') as HTMLButtonElement).disabled,
    true,
    'se parte de la primera página',
  );
  const other = doc.createElement('input');
  doc.body.append(other);
  other.focus();
  const announced = announcer();
  changePage(-1);
  assert.equal(doc.activeElement, other);
  assert.equal(announcer(), announced);
  other.remove();
});

test('♿ Refiltrar no mueve el foco ni toca el anuncio de página', () => {
  const search = doc.createElement('input');
  doc.body.append(search);
  search.focus();
  const announced = announcer();
  applyFilters();
  assert.equal(doc.activeElement, search, 'el foco se queda en el control que el usuario usa');
  assert.equal(announcer(), announced);
  search.remove();
});
