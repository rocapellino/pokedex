import { dom } from './mega_env.js';
import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearAllFilters,
  handleSortChange,
  handleSortDirectionToggle,
  hasActiveFilters,
  initInteractiveListeners,
  loadPokemons,
} from '../../apps/frontend/src/pokedex.js';
import type { Pokemon } from '../../apps/frontend/src/types.js';

const doc = dom.window.document;

const mk = (id: number, nombre: string, speed: number): Pokemon => ({
  id,
  nombre,
  tipo: 'Normal',
  tipos: ['Normal'],
  fuerza: 50,
  imagen: '',
  stats: { hp: 40, attack: 40, defense: 40, sp_attack: 40, sp_defense: 40, speed },
  caracteristicas: { peso: 6, altura: 0.4, habitat: 'Bosque' },
});

const catalog: Pokemon[] = [mk(1, 'Bulbasaur', 45), mk(2, 'Ivysaur', 60), mk(3, 'Venusaur', 80)];

const originalFetch = globalThis.fetch;

const ids = () => [...doc.querySelectorAll('.pokemon-card')].map((c) => c.getAttribute('data-pokemon-id'));
const chips = () => [...doc.querySelectorAll('#activeFilterChips .filter-chip')].map((c) => c.firstChild?.textContent);
const sortSelect = () => doc.getElementById('sortFilter') as HTMLSelectElement;
const search = () => dom.window.location.search;

function chooseSort(value: string): void {
  sortSelect().value = value;
  handleSortChange();
}

function removeChip(label: string): void {
  const button = doc.querySelector(
    `#activeFilterChips button[aria-label="Quitar filtro ${label}"]`,
  ) as HTMLButtonElement;
  assert.ok(button, `existe el botón para quitar «${label}»`);
  button.click();
}

before(async () => {
  await new Promise((resolve) => setTimeout(resolve, 20));

  doc.body.innerHTML = `
    <input id="searchInput">
    <select id="generationFilter"><option value="all">Todas</option></select>
    <input type="checkbox" id="megaFilter">
    <select id="sortFilter">
      <option value="id">Número de Pokédex</option>
      <option value="name">Nombre</option>
      <option value="speed">Velocidad</option>
    </select>
    <button type="button" id="sortDirection"></button>
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

// El orden no se restablece con «Limpiar filtros»: se devuelve al natural quitando su chip.
beforeEach(() => {
  clearAllFilters();
  (
    doc.querySelector('#activeFilterChips button[aria-label^="Quitar filtro Orden"]') as HTMLButtonElement | null
  )?.click();
  dom.window.history.replaceState(null, '', '/');
});

after(() => {
  globalThis.fetch = originalFetch;
});

test('🔀 Chip de orden: el orden natural no muestra chip', () => {
  assert.deepEqual(chips(), []);
  assert.equal(search(), '');
});

test('🔀 Chip de orden: cambiar de criterio muestra «Orden: criterio ↓» con el sentido natural de la estadística', () => {
  chooseSort('speed');

  assert.deepEqual(chips(), ['Orden: Velocidad ↓']);
  assert.deepEqual(ids(), ['3', '2', '1']);
});

test('🔀 Chip de orden: invertir el sentido del orden natural también lo muestra', () => {
  handleSortDirectionToggle();

  assert.deepEqual(chips(), ['Orden: Número de Pokédex ↓']);
  assert.deepEqual(ids(), ['3', '2', '1']);
});

test('🔀 Chip de orden: la flecha sigue al sentido y se oculta al volver al natural del criterio', () => {
  chooseSort('speed');
  handleSortDirectionToggle();
  assert.deepEqual(chips(), ['Orden: Velocidad ↑']);

  handleSortDirectionToggle();
  assert.deepEqual(chips(), ['Orden: Velocidad ↓']);
});

test('🔀 Chip de orden: su ✕ restablece criterio, sentido, control, grilla y URL', () => {
  chooseSort('speed');
  handleSortDirectionToggle();
  assert.equal(search(), '?orden=speed&dir=asc');

  removeChip('Orden: Velocidad ↑');

  assert.equal(sortSelect().value, 'id');
  assert.deepEqual(chips(), []);
  assert.deepEqual(ids(), ['1', '2', '3']);
  assert.equal(search(), '');
});

test('🔀 Chip de orden: «Limpiar filtros» conserva el orden y su chip, y no cuenta como filtro', () => {
  chooseSort('name');
  handleSortDirectionToggle();

  assert.equal(hasActiveFilters(), false);
  assert.equal((doc.getElementById('btnClearFilters') as HTMLButtonElement).hidden, true);

  clearAllFilters();

  assert.deepEqual(chips(), ['Orden: Nombre ↓']);
  assert.equal(sortSelect().value, 'name');
});

test('🔀 Chip de orden: se restaura desde la URL y convive con los chips de filtros', async () => {
  dom.window.history.replaceState(null, '', '/?q=saur&orden=speed&dir=asc');
  await loadPokemons();

  assert.deepEqual(chips(), ['Búsqueda: “saur”', 'Orden: Velocidad ↑']);
  assert.deepEqual(ids(), ['1', '2', '3']);
});
