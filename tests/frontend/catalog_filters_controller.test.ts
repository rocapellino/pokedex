import { dom } from './mega_env.js';
import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearAllFilters,
  handleGenerationChange,
  handleMegaFilterChange,
  handleSearch,
  hasActiveFilters,
  initInteractiveListeners,
  loadPokemons,
  toggleTypeFilter,
} from '../../apps/frontend/src/pokedex.js';
import type { MegaEvolution, Pokemon } from '../../apps/frontend/src/types.js';

const doc = dom.window.document;

const mega: MegaEvolution = {
  clave: 'charizard-mega-x',
  nombre: 'Mega-Charizard X',
  imagen: '',
  tipos: ['Fuego', 'Dragón'],
  habilidades: ['Garra Dura'],
  stats: { hp: 78, attack: 130, defense: 111, sp_attack: 130, sp_defense: 85, speed: 100 },
  peso: 110.5,
  altura: 1.7,
};

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
  mk(6, 'Charizard', ['Fuego', 'Volador'], { megaevoluciones: [mega] }),
  mk(16, 'Pidgey', ['Normal', 'Volador']),
  mk(25, 'Pikachu', ['Eléctrico']),
  mk(152, 'Chikorita', ['Planta']),
];

const originalFetch = globalThis.fetch;

const pills = () => [...doc.querySelectorAll<HTMLElement>('.type-pill')];
const pill = (type: string) => pills().find((p) => p.getAttribute('data-type') === type) as HTMLElement;
const names = () => [...doc.querySelectorAll('.pokemon-card')].map((c) => c.getAttribute('data-pokemon-id'));
const chips = () => [...doc.querySelectorAll('#activeFilterChips .filter-chip')].map((c) => c.textContent);
const summary = () => doc.getElementById('resultsSummary')?.textContent;
const clearBtn = () => doc.getElementById('btnClearFilters') as HTMLButtonElement;
const input = () => doc.getElementById('searchInput') as HTMLInputElement;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

before(async () => {
  await wait(20);

  doc.body.innerHTML = `
    <input id="searchInput">
    <select id="generationFilter">
      <option value="all">Todas</option>
      <option value="1">Gen I</option>
      <option value="2">Gen II</option>
    </select>
    <input type="checkbox" id="megaFilter">
    <div id="typePillsContainer">
      <button class="type-pill active" data-type="all" aria-pressed="true">Todos</button>
      <button class="type-pill" data-type="Fuego" aria-pressed="false">Fuego</button>
      <button class="type-pill" data-type="Volador" aria-pressed="false">Volador</button>
      <button class="type-pill" data-type="Planta" aria-pressed="false">Planta</button>
    </div>
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

test('🔎 Controlador: sin filtros muestra todo el catálogo y oculta "Limpiar filtros"', () => {
  assert.equal(names().length, catalog.length);
  assert.equal(summary(), '5 resultados de 5 Pokémon');
  assert.equal(clearBtn().hidden, true);
  assert.equal(hasActiveFilters(), false);
  assert.deepEqual(chips(), []);
});

test('🔎 Controlador: seleccionar varios tipos exige tenerlos todos y actualiza aria-pressed', () => {
  toggleTypeFilter('Fuego');
  assert.deepEqual(names(), ['4', '6']);
  assert.equal(pill('Fuego').getAttribute('aria-pressed'), 'true');
  assert.equal(pill('all').getAttribute('aria-pressed'), 'false');

  toggleTypeFilter('Volador');
  assert.deepEqual(names(), ['6']);
  assert.equal(summary(), '1 resultado de 5 Pokémon');
  assert.equal(clearBtn().hidden, false);
  assert.equal(hasActiveFilters(), true);
  assert.deepEqual(chips(), ['Fuego✕', 'Volador✕']);
});

test('🔎 Controlador: volver a pulsar un tipo lo quita y "Todos" limpia la selección', () => {
  toggleTypeFilter('Fuego');
  toggleTypeFilter('fuego');
  assert.equal(names().length, catalog.length);
  assert.equal(pill('all').getAttribute('aria-pressed'), 'true');

  toggleTypeFilter('Planta');
  toggleTypeFilter('all');
  assert.equal(names().length, catalog.length);
  assert.equal(pill('Planta').classList.contains('active'), false);
});

test('🔎 Controlador: el chip de un tipo lo quita al pulsar su ✕', () => {
  toggleTypeFilter('Fuego');
  toggleTypeFilter('Volador');
  doc.querySelector<HTMLButtonElement>('#activeFilterChips .filter-chip-remove')?.click();
  assert.deepEqual(names(), ['6', '16']);
  assert.equal(
    doc.querySelector('#activeFilterChips .filter-chip-remove')?.getAttribute('aria-label'),
    'Quitar filtro Volador',
  );
});

test('🔎 Controlador: búsqueda, generación y megaevolución generan chips y se quitan desde ellos', () => {
  input().value = '  char ';
  handleSearch();
  assert.deepEqual(names(), ['4', '6']);

  const select = doc.getElementById('generationFilter') as HTMLSelectElement;
  select.value = '2';
  handleGenerationChange();
  assert.deepEqual(names(), []);
  assert.match(doc.getElementById('pokemonGrid')?.textContent ?? '', /No se encontraron Pokémon/);

  select.value = 'all';
  handleGenerationChange();
  const checkbox = doc.getElementById('megaFilter') as HTMLInputElement;
  checkbox.checked = true;
  handleMegaFilterChange();
  assert.deepEqual(names(), ['6']);
  assert.equal(chips().length, 2);
  assert.match(chips()[0] ?? '', /Búsqueda: “char”/);
  assert.match(chips()[1] ?? '', /Con megaevolución/);

  // Quitar cada chip desde su ✕ restablece el control asociado.
  const removeAll = () => doc.querySelectorAll<HTMLButtonElement>('#activeFilterChips .filter-chip-remove');
  removeAll()[1]?.click();
  assert.equal(checkbox.checked, false);
  removeAll()[0]?.click();
  assert.equal(input().value, '');
  assert.equal(names().length, catalog.length);
});

test('🔎 Controlador: el chip de generación restablece el selector', () => {
  const select = doc.getElementById('generationFilter') as HTMLSelectElement;
  select.value = '1';
  handleGenerationChange();
  assert.equal(chips().length, 1);
  assert.match(chips()[0] ?? '', /Gen I/);

  doc.querySelector<HTMLButtonElement>('#activeFilterChips .filter-chip-remove')?.click();
  assert.equal(select.value, 'all');
  assert.equal(names().length, catalog.length);
});

test('🔎 Controlador: "Limpiar filtros" restablece todos los controles', () => {
  toggleTypeFilter('Fuego');
  input().value = 'char';
  handleSearch();
  (doc.getElementById('megaFilter') as HTMLInputElement).checked = true;
  handleMegaFilterChange();
  assert.deepEqual(names(), ['6']);

  clearBtn().click();
  assert.equal(input().value, '');
  assert.equal((doc.getElementById('megaFilter') as HTMLInputElement).checked, false);
  assert.equal((doc.getElementById('generationFilter') as HTMLSelectElement).value, 'all');
  assert.equal(names().length, catalog.length);
  assert.equal(clearBtn().hidden, true);
});

test('🔎 Controlador: el estado vacío ofrece limpiar los filtros', () => {
  toggleTypeFilter('Planta');
  toggleTypeFilter('Volador');
  assert.deepEqual(names(), []);
  assert.equal(summary(), '0 resultados de 5 Pokémon');

  doc.getElementById('btnClearFiltersEmpty')?.click();
  assert.equal(names().length, catalog.length);
  assert.equal(hasActiveFilters(), false);
});

test('🔎 Controlador: la búsqueda escrita se aplica con debounce y un solo evento input', async () => {
  input().value = 'pika';
  input().dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(names().length, catalog.length, 'aún no filtra antes del debounce');

  await wait(250);
  assert.deepEqual(names(), ['25']);

  input().value = 'chik';
  input().dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  input().value = 'chari';
  input().dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await wait(250);
  assert.deepEqual(names(), ['6']);
});
