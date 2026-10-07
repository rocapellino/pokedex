import { dom } from './mega_env.js';
import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearAllFilters,
  handleClassFilterChange,
  handleStatFilterChange,
  hasActiveFilters,
  initInteractiveListeners,
  loadPokemons,
} from '../../apps/frontend/src/pokedex.js';
import type { Pokemon } from '../../apps/frontend/src/types.js';

const doc = dom.window.document;

const mk = (id: number, nombre: string, tipo: string, extra: Partial<Pokemon> = {}): Pokemon => ({
  id,
  nombre,
  tipo,
  tipos: [tipo],
  fuerza: 50,
  imagen: '',
  caracteristicas: { peso: 6, altura: 0.4, habitat: 'Bosque' },
  ...extra,
});

const catalog: Pokemon[] = [
  mk(25, 'Pikachu', 'Eléctrico'),
  mk(145, 'Zapdos', 'Eléctrico', { clasificacion: 'legendario' }),
  mk(150, 'Mewtwo', 'Psíquico', { clasificacion: 'legendario' }),
  mk(151, 'Mew', 'Psíquico', { clasificacion: 'mitico' }),
];

const originalFetch = globalThis.fetch;

const names = () => [...doc.querySelectorAll('.pokemon-card')].map((c) => c.getAttribute('data-pokemon-id'));
const chips = () => [...doc.querySelectorAll('#activeFilterChips .filter-chip')].map((c) => c.textContent);
const select = () => doc.getElementById('classFilter') as HTMLSelectElement;
const search = () => dom.window.location.search;

function choose(value: string): void {
  select().value = value;
  handleClassFilterChange();
}

before(async () => {
  await new Promise((resolve) => setTimeout(resolve, 20));

  doc.body.innerHTML = `
    <input id="searchInput">
    <select id="generationFilter"><option value="all">Todas</option></select>
    <input type="checkbox" id="megaFilter">
    <select id="sortFilter"><option value="id">Número</option></select>
    <details id="moreFilters">
      <summary><span>Más filtros</span><span id="moreFiltersCount" hidden></span></summary>
      <select id="classFilter">
        <option value="">Todas</option>
        <option value="legendario">Legendarios</option>
        <option value="mitico">Míticos</option>
        <option value="especial">Legendarios y míticos</option>
      </select>
      <select id="statFilter"><option value="">Sin filtro</option><option value="speed">Velocidad</option></select>
      <input type="number" id="statMin">
    </details>
    <div id="typePillsContainer"><button class="type-pill active" data-type="all" aria-pressed="true">Todos</button></div>
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

beforeEach(() => clearAllFilters());

after(() => {
  globalThis.fetch = originalFetch;
});

test('🌟 Controlador: sin clasificación se muestra todo el catálogo', () => {
  assert.deepEqual(names(), ['25', '145', '150', '151']);
  assert.equal(hasActiveFilters(), false);
});

test('🌟 Controlador: filtra por legendarios, míticos o ambos', () => {
  choose('legendario');
  assert.deepEqual(names(), ['145', '150']);

  choose('mitico');
  assert.deepEqual(names(), ['151']);

  choose('especial');
  assert.deepEqual(names(), ['145', '150', '151']);

  choose('');
  assert.deepEqual(names(), ['25', '145', '150', '151']);
});

test('🌟 Controlador: la clasificación crea un chip y viaja en la URL', () => {
  choose('mitico');
  assert.deepEqual(chips(), ['Míticos✕']);
  assert.equal(search(), '?clase=mitico');
  assert.equal(hasActiveFilters(), true);

  choose('especial');
  assert.deepEqual(chips(), ['Legendarios y míticos✕']);
});

test('🌟 Controlador: el chip y "Limpiar filtros" restablecen el selector', () => {
  choose('legendario');
  doc.querySelector<HTMLButtonElement>('#activeFilterChips .filter-chip-remove')?.click();
  assert.equal(select().value, '');
  assert.equal(names().length, catalog.length);
  assert.equal(search(), '');

  choose('legendario');
  (doc.getElementById('btnClearFilters') as HTMLButtonElement).click();
  assert.equal(select().value, '');
  assert.equal(names().length, catalog.length);
});

test('🌟 Controlador: la clasificación se restaura desde la URL y un valor inválido se ignora', async () => {
  dom.window.history.replaceState(null, '', '/?clase=legendario');
  await loadPokemons();
  assert.deepEqual(names(), ['145', '150']);
  assert.equal(select().value, 'legendario');

  dom.window.history.replaceState(null, '', '/?clase=__proto__');
  await loadPokemons();
  assert.equal(names().length, catalog.length);
  assert.equal(select().value, '');
  assert.equal(search(), '');
});

test('🌟 Controlador: las tarjetas de especies especiales muestran su insignia', () => {
  choose('especial');
  const badges = [...doc.querySelectorAll('.pokemon-card .class-badge')].map((b) => b.textContent);
  assert.deepEqual(badges, ['Legendario', 'Legendario', 'Mítico']);
});

const panel = () => doc.getElementById('moreFilters') as HTMLDetailsElement;
const count = () => doc.getElementById('moreFiltersCount') as HTMLElement;
const summary = () => doc.querySelector('#moreFilters > summary') as HTMLElement;

test('📂 Panel: el contador y el nombre accesible reflejan los filtros avanzados activos', () => {
  assert.equal(count().hidden, true);
  assert.equal(summary().getAttribute('aria-label'), 'Más filtros');

  choose('legendario');
  assert.equal(count().hidden, false);
  assert.equal(count().textContent, '1');
  assert.equal(summary().getAttribute('aria-label'), 'Más filtros, 1 activos');

  (doc.getElementById('statFilter') as HTMLSelectElement).value = 'speed';
  (doc.getElementById('statMin') as HTMLInputElement).value = '90';
  handleStatFilterChange();
  assert.equal(count().textContent, '2');
  assert.equal(summary().getAttribute('aria-label'), 'Más filtros, 2 activos');

  clearAllFilters();
  assert.equal(count().hidden, true);
  assert.equal(summary().getAttribute('aria-label'), 'Más filtros');
});

test('📂 Panel: un filtro avanzado en la URL abre el panel y sin filtros avanzados no se fuerza', async () => {
  panel().open = false;
  dom.window.history.replaceState(null, '', '/?tipo=psiquico');
  await loadPokemons();
  assert.equal(panel().open, false, 'filtros visibles no abren el panel');
  assert.equal(count().hidden, true);

  dom.window.history.replaceState(null, '', '/?clase=mitico');
  await loadPokemons();
  assert.equal(panel().open, true, 'un filtro oculto debe verse');
  assert.equal(count().textContent, '1');

  panel().open = false;
  dom.window.history.replaceState(null, '', '/?stat=speed&min=90');
  await loadPokemons();
  assert.equal(panel().open, true);
});

test('📂 Panel: cambiar un filtro no abre ni cierra el panel por su cuenta', () => {
  panel().open = false;
  choose('especial');
  assert.equal(panel().open, false);

  panel().open = true;
  clearAllFilters();
  assert.equal(panel().open, true, 'limpiar filtros respeta la elección de la persona');
});
