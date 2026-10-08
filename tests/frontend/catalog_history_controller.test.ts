import { dom } from './mega_env.js';
import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearAllFilters,
  handleClassFilterChange,
  handleMegaFilterChange,
  handleSortChange,
  handleSortDirectionToggle,
  initInteractiveListeners,
  loadPokemons,
  toggleTypeFilter,
} from '../../apps/frontend/src/pokedex.js';
import { commitFiltersToUrl, urlMatchesFilters } from '../../apps/frontend/src/shared/filter-history.js';
import { parseFilterParams } from '../../apps/frontend/src/shared/filter-url.js';
import type { Pokemon } from '../../apps/frontend/src/types.js';

const doc = dom.window.document;
const win = dom.window;

const mk = (id: number, nombre: string, tipos: string[], extra: Partial<Pokemon> = {}): Pokemon => ({
  id,
  nombre,
  tipo: tipos[0],
  tipos,
  fuerza: 50,
  imagen: '',
  caracteristicas: { peso: 6, altura: 0.4, habitat: 'Bosque' },
  ...extra,
});

const catalog: Pokemon[] = [
  mk(4, 'Charmander', ['Fuego']),
  mk(6, 'Charizard', ['Fuego', 'Volador']),
  mk(16, 'Pidgey', ['Normal', 'Volador']),
  mk(25, 'Pikachu', ['Eléctrico']),
  mk(150, 'Mewtwo', ['Psíquico'], { clasificacion: 'legendario' }),
];

const originalFetch = globalThis.fetch;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const search = () => win.location.search;
const entries = () => win.history.length;
const ids = () => [...doc.querySelectorAll('.pokemon-card')].map((c) => c.getAttribute('data-pokemon-id'));
const chips = () => [...doc.querySelectorAll('#activeFilterChips .filter-chip')].map((c) => c.firstChild?.textContent);
const input = () => doc.getElementById('searchInput') as HTMLInputElement;
const classSelect = () => doc.getElementById('classFilter') as HTMLSelectElement;
const sortSelect = () => doc.getElementById('sortFilter') as HTMLSelectElement;
const mega = () => doc.getElementById('megaFilter') as HTMLInputElement;

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
  await wait(20);

  doc.body.innerHTML = `
    <input id="searchInput">
    <select id="generationFilter"><option value="all">Todas</option></select>
    <input type="checkbox" id="megaFilter">
    <select id="sortFilter">
      <option value="id">Número de Pokédex</option>
      <option value="speed">Velocidad</option>
    </select>
    <button type="button" id="sortDirection"></button>
    <select id="classFilter">
      <option value="">Todas</option>
      <option value="legendario">Legendarios</option>
    </select>
    <select id="statFilter"><option value="">Sin filtro</option><option value="speed">Velocidad</option></select>
    <input type="number" id="statMin">
    <div id="typePillsContainer"></div>
    <div id="activeFilters">
      <p id="resultsSummary"></p><ul id="activeFilterChips"></ul>
      <button id="btnClearFilters" hidden>Limpiar filtros</button>
    </div>
    <div id="pokemonGrid"></div><div id="paginationBar" class="hidden"></div><div id="toastContainer"></div>`;

  globalThis.fetch = (async () =>
    new Response(JSON.stringify(catalog), { headers: { 'X-Total-Count': String(catalog.length) } })) as typeof fetch;

  await loadPokemons();
  initInteractiveListeners();
});

beforeEach(() => {
  clearAllFilters();
  (
    doc.querySelector('#activeFilterChips button[aria-label^="Quitar filtro Orden"]') as HTMLButtonElement | null
  )?.click();
  win.history.replaceState(null, '', '/');
});

after(() => {
  globalThis.fetch = originalFetch;
});

test('⏪ Historial: cada cambio discreto de filtro crea una entrada', () => {
  const start = entries();

  toggleTypeFilter('Fuego');
  assert.equal(entries(), start + 1);

  mega().checked = true;
  handleMegaFilterChange();
  assert.equal(entries(), start + 2);

  classSelect().value = 'legendario';
  handleClassFilterChange();
  assert.equal(entries(), start + 3);

  sortSelect().value = 'speed';
  handleSortChange();
  assert.equal(entries(), start + 4);

  handleSortDirectionToggle();
  assert.equal(entries(), start + 5);
  assert.equal(search(), '?tipo=fuego&mega=1&clase=legendario&orden=speed&dir=asc');
});

test('⏪ Historial: «Limpiar filtros» crea una sola entrada', () => {
  toggleTypeFilter('Fuego');
  toggleTypeFilter('Volador');
  const before = entries();

  clearAllFilters();

  assert.equal(entries(), before + 1);
  assert.equal(search(), '');
});

test('⏪ Historial: reaplicar el mismo estado no añade entradas', () => {
  toggleTypeFilter('Fuego');
  const before = entries();

  handleMegaFilterChange();
  handleClassFilterChange();

  assert.equal(entries(), before);
});

test('⏪ Historial: escribir en el buscador reescribe la entrada actual en vez de crear una por letra', async () => {
  const start = entries();

  for (const text of ['c', 'ch', 'cha', 'char']) {
    input().value = text;
    input().dispatchEvent(new win.Event('input', { bubbles: true }));
    await wait(5);
  }
  await wait(250);

  assert.equal(search(), '?q=char');
  assert.equal(entries(), start);
});

test('⏪ Historial: el mínimo de estadística también reescribe la entrada mientras se escribe', async () => {
  const select = doc.getElementById('statFilter') as HTMLSelectElement;
  select.value = 'speed';
  select.dispatchEvent(new win.Event('change', { bubbles: true }));
  const before = entries();

  const min = doc.getElementById('statMin') as HTMLInputElement;
  for (const text of ['1', '10', '100']) {
    min.value = text;
    min.dispatchEvent(new win.Event('input', { bubbles: true }));
    await wait(5);
  }
  await wait(250);

  assert.equal(search(), '?stat=speed&min=100');
  assert.equal(entries(), before);
});

test('⏪ Historial: «atrás» y «adelante» deshacen y rehacen los filtros con controles y chips sincronizados', async () => {
  toggleTypeFilter('Fuego');
  toggleTypeFilter('Volador');
  mega().checked = true;
  handleMegaFilterChange();
  assert.deepEqual(ids(), []);

  await traverse('back');
  assert.equal(search(), '?tipo=fuego%2Cvolador');
  assert.equal(mega().checked, false);
  assert.deepEqual(ids(), ['6']);
  assert.deepEqual(chips(), ['Fuego', 'Volador']);

  await traverse('back');
  assert.equal(search(), '?tipo=fuego');
  assert.deepEqual(ids(), ['4', '6']);
  assert.deepEqual(chips(), ['Fuego']);

  await traverse('forward');
  assert.equal(search(), '?tipo=fuego%2Cvolador');
  assert.deepEqual(ids(), ['6']);
});

test('⏪ Historial: «atrás» devuelve el orden y su chip', async () => {
  sortSelect().value = 'speed';
  handleSortChange();
  assert.deepEqual(chips(), ['Orden: Velocidad ↓']);

  await traverse('back');

  assert.equal(sortSelect().value, 'id');
  assert.deepEqual(chips(), []);
  assert.equal(search(), '');
});

test('⏪ Historial: «atrás» cancela una escritura pendiente del buscador', async () => {
  toggleTypeFilter('Fuego');
  input().value = 'pika';
  input().dispatchEvent(new win.Event('input', { bubbles: true }));

  await traverse('back');
  await wait(250);

  assert.equal(input().value, '');
  assert.equal(search(), '');
  assert.deepEqual(chips(), []);
});

test('⏪ Historial: una URL de historial manipulada se sanea reescribiendo, sin crear entradas', async () => {
  win.history.pushState(null, '', '/?tipo=__proto__,fuego&gen=99');
  const before = entries();

  win.dispatchEvent(new win.PopStateEvent('popstate'));

  assert.equal(search(), '?tipo=fuego');
  assert.deepEqual(chips(), ['Fuego']);
  assert.equal(entries(), before);
});

test('⏪ Historial: un cambio de ancla no vuelve a pintar el catálogo', () => {
  toggleTypeFilter('Fuego');
  const card = doc.querySelector('.pokemon-card');

  win.history.pushState(null, '', `/${search()}#paginacion`);
  win.dispatchEvent(new win.PopStateEvent('popstate'));

  assert.equal(doc.querySelector('.pokemon-card'), card);
});

test('⏪ filter-history: commitFiltersToUrl respeta el modo y conserva ruta y ancla', () => {
  win.history.replaceState(null, '', '/catalogo#top');
  const state = parseFilterParams('?tipo=fuego');
  const before = entries();

  commitFiltersToUrl(state, 'replace');
  assert.equal(`${win.location.pathname}${win.location.search}${win.location.hash}`, '/catalogo?tipo=fuego#top');
  assert.equal(entries(), before);
  assert.equal(urlMatchesFilters(state), true);

  commitFiltersToUrl(parseFilterParams('?tipo=agua'), 'push');
  assert.equal(win.location.search, '?tipo=agua');
  assert.equal(win.location.hash, '#top');
  assert.equal(entries(), before + 1);
  assert.equal(urlMatchesFilters(state), false);
});
