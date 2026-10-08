import { dom } from './mega_env.js';
import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearAllFilters,
  handleGenerationChange,
  handleMegaFilterChange,
  handleSortChange,
  handleSortDirectionToggle,
  handleStatFilterChange,
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

const stats = (hp: number, speed: number) => ({
  stats: { hp, attack: 50, defense: 50, sp_attack: 50, sp_defense: 50, speed },
});

const catalog: Pokemon[] = [
  mk(4, 'Charmander', ['Fuego'], stats(39, 65)),
  mk(6, 'Charizard', ['Fuego', 'Volador'], { megaevoluciones: [mega], ...stats(78, 100) }),
  mk(16, 'Pidgey', ['Normal', 'Volador'], stats(40, 56)),
  mk(25, 'Pikachu', ['Eléctrico'], stats(35, 90)),
  mk(152, 'Chikorita', ['Planta'], stats(45, 45)),
];

const originalFetch = globalThis.fetch;

const box = (type: string) => doc.querySelector(`#typeFilterList input[value="${type}"]`) as HTMLInputElement;
const typeSummary = () => doc.getElementById('typeFilterSummary')?.textContent;
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
    <select id="sortFilter"><option value="id">Número</option><option value="name">Nombre</option><option value="speed">Velocidad</option></select>
    <button type="button" id="sortDirection">↑ Ascendente</button>
    <select id="statFilter"><option value="">Sin filtro</option><option value="speed">Velocidad</option><option value="total">Total</option></select>
    <input type="number" id="statMin">
    <div id="typeFilterField">
      <button type="button" id="typeFilterToggle" aria-expanded="false"><span id="typeFilterSummary">Cualquier tipo</span></button>
      <div id="typeFilterList" hidden>
        <label><input type="checkbox" value="Fuego">Fuego</label>
        <label><input type="checkbox" value="Volador">Volador</label>
        <label><input type="checkbox" value="Planta">Planta</label>
      </div>
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

const sortSelect = () => doc.getElementById('sortFilter') as HTMLSelectElement;
const statKey = () => doc.getElementById('statFilter') as HTMLSelectElement;
const statMin = () => doc.getElementById('statMin') as HTMLInputElement;

function setStat(key: string, min: string): void {
  statKey().value = key;
  statMin().value = min;
  handleStatFilterChange();
}

beforeEach(() => {
  clearAllFilters();
  sortSelect().value = 'id';
  handleSortChange();
});

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

test('🔎 Controlador: seleccionar varios tipos exige tenerlos todos y refleja la selección en el desplegable', () => {
  toggleTypeFilter('Fuego');
  assert.deepEqual(names(), ['4', '6']);
  assert.equal(box('Fuego').checked, true);
  assert.equal(box('Volador').checked, false);
  assert.equal(typeSummary(), 'Fuego');

  toggleTypeFilter('Volador');
  assert.deepEqual(names(), ['6']);
  assert.equal(summary(), '1 resultado de 5 Pokémon');
  assert.equal(clearBtn().hidden, false);
  assert.equal(hasActiveFilters(), true);
  assert.deepEqual(chips(), ['Fuego✕', 'Volador✕']);
  assert.equal(typeSummary(), 'Fuego, Volador');
});

test('🔎 Controlador: volver a elegir un tipo lo quita y "all" limpia la selección', () => {
  toggleTypeFilter('Fuego');
  toggleTypeFilter('fuego');
  assert.equal(names().length, catalog.length);
  assert.equal(box('Fuego').checked, false);
  assert.equal(typeSummary(), 'Cualquier tipo');

  toggleTypeFilter('Planta');
  toggleTypeFilter('all');
  assert.equal(names().length, catalog.length);
  assert.equal(box('Planta').checked, false);
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

const search = () => dom.window.location.search;

test('🔗 Controlador: los filtros se reflejan en la URL sin añadir entradas de historial', () => {
  const before = dom.window.history.length;
  toggleTypeFilter('Fuego');
  toggleTypeFilter('Volador');
  assert.equal(search(), '?tipo=fuego%2Cvolador');

  input().value = 'char';
  handleSearch();
  (doc.getElementById('megaFilter') as HTMLInputElement).checked = true;
  handleMegaFilterChange();
  assert.equal(search(), '?q=char&tipo=fuego%2Cvolador&mega=1');
  assert.equal(dom.window.history.length, before);

  clearAllFilters();
  assert.equal(search(), '');
});

test('🔗 Controlador: una URL con filtros se restaura al cargar el catálogo', async () => {
  dom.window.history.replaceState(null, '', '/?q=char&tipo=fuego&gen=1&mega=1');
  await loadPokemons();

  assert.deepEqual(names(), ['6']);
  assert.equal(input().value, 'char');
  assert.equal((doc.getElementById('generationFilter') as HTMLSelectElement).value, '1');
  assert.equal((doc.getElementById('megaFilter') as HTMLInputElement).checked, true);
  assert.equal(box('Fuego').checked, true);
  assert.equal(typeSummary(), 'Fuego');
  assert.equal(clearBtn().hidden, false);
});

test('🔗 Controlador: una URL manipulada se sanea y no rompe el catálogo', async () => {
  dom.window.history.replaceState(null, '', '/?q=%3Cscript%3E&tipo=__proto__,fuego&gen=99&mega=2');
  await loadPokemons();

  assert.deepEqual(chips(), ['Búsqueda: “<script>”✕', 'Fuego✕']);
  assert.equal(doc.querySelector('#activeFilterChips script'), null);
  assert.equal(search(), '?q=%3Cscript%3E&tipo=fuego');
});

test('📊 Controlador: ordenar reordena la grilla y se refleja en la URL', () => {
  sortSelect().value = 'speed';
  handleSortChange();
  assert.deepEqual(names(), ['6', '25', '4', '16', '152']);
  assert.equal(search(), '?orden=speed');

  sortSelect().value = 'name';
  handleSortChange();
  assert.deepEqual(names(), ['6', '4', '152', '16', '25']);

  sortSelect().value = 'id';
  handleSortChange();
  assert.equal(search(), '');
});

test('📊 Controlador: la estadística mínima filtra, crea un chip y se refleja en la URL', () => {
  setStat('speed', '90');
  assert.deepEqual(names(), ['6', '25']);
  assert.deepEqual(chips(), ['Velocidad ≥ 90✕']);
  assert.equal(search(), '?stat=speed&min=90');
  assert.equal(hasActiveFilters(), true);
  assert.equal(clearBtn().hidden, false);

  toggleTypeFilter('Volador');
  assert.deepEqual(names(), ['6']);
});

test('📊 Controlador: sin estadística o con mínimo 0 o inválido no se filtra', () => {
  setStat('speed', '0');
  assert.equal(names().length, catalog.length);
  setStat('', '90');
  assert.equal(names().length, catalog.length);
  setStat('speed', 'abc');
  assert.equal(names().length, catalog.length);
  assert.equal(hasActiveFilters(), false);
});

test('📊 Controlador: un mínimo enorme se acota al máximo permitido', () => {
  setStat('total', '99999');
  assert.deepEqual(names(), []);
  assert.match(chips()[0] ?? '', /Total ≥ 780/);
});

test('📊 Controlador: quitar el chip o limpiar restablece la estadística', () => {
  setStat('speed', '90');
  doc.querySelector<HTMLButtonElement>('#activeFilterChips .filter-chip-remove')?.click();
  assert.equal(names().length, catalog.length);
  assert.equal(statKey().value, '');
  assert.equal(statMin().value, '');

  setStat('speed', '90');
  clearBtn().click();
  assert.equal(statMin().value, '');
  assert.equal(names().length, catalog.length);
  assert.equal(search(), '');
});

test('📊 Controlador: escribir el mínimo se aplica con debounce', async () => {
  statKey().value = 'speed';
  statMin().value = '90';
  statMin().dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(names().length, catalog.length, 'aún no filtra antes del debounce');
  await wait(250);
  assert.deepEqual(names(), ['6', '25']);
});

test('📊 Controlador: orden y estadística se restauran desde la URL y una URL inválida se ignora', async () => {
  dom.window.history.replaceState(null, '', '/?stat=speed&min=60&orden=name');
  await loadPokemons();
  assert.deepEqual(names(), ['6', '4', '25']);
  assert.equal(sortSelect().value, 'name');
  assert.equal(statKey().value, 'speed');
  assert.equal(statMin().value, '60');
  assert.deepEqual(chips(), ['Velocidad ≥ 60✕', 'Orden: Nombre ↑✕']);

  dom.window.history.replaceState(null, '', '/?stat=poder&min=60&orden=__proto__');
  await loadPokemons();
  assert.equal(names().length, catalog.length);
  assert.equal(sortSelect().value, 'id');
  assert.equal(search(), '');
});

const dirButton = () => doc.getElementById('sortDirection') as HTMLButtonElement;

test('↕️ Controlador: el botón invierte el sentido, actualiza su texto y se refleja en la URL', () => {
  assert.equal(dirButton().textContent, '↑ Ascendente');

  dirButton().click();
  assert.deepEqual(names(), ['152', '25', '16', '6', '4']);
  assert.equal(dirButton().textContent, '↓ Descendente');
  assert.match(dirButton().getAttribute('aria-label') ?? '', /descendente/);
  assert.equal(search(), '?dir=desc');

  dirButton().click();
  assert.deepEqual(names(), ['4', '6', '16', '25', '152']);
  assert.equal(dirButton().textContent, '↑ Ascendente');
  assert.equal(search(), '');
});

test('↕️ Controlador: una estadística nace de mayor a menor y se puede invertir', () => {
  sortSelect().value = 'speed';
  handleSortChange();
  assert.deepEqual(names(), ['6', '25', '4', '16', '152']);
  assert.equal(dirButton().textContent, '↓ Descendente');
  assert.equal(search(), '?orden=speed');

  handleSortDirectionToggle();
  assert.deepEqual(names(), ['152', '16', '4', '25', '6']);
  assert.equal(dirButton().textContent, '↑ Ascendente');
  assert.equal(search(), '?orden=speed&dir=asc');
});

test('↕️ Controlador: cambiar de criterio vuelve al sentido natural del nuevo criterio', () => {
  sortSelect().value = 'speed';
  handleSortChange();
  handleSortDirectionToggle();
  assert.equal(dirButton().textContent, '↑ Ascendente');

  sortSelect().value = 'name';
  handleSortChange();
  assert.equal(dirButton().textContent, '↑ Ascendente', 'el nombre es ascendente por defecto');
  assert.deepEqual(names(), ['6', '4', '152', '16', '25']);
  assert.equal(search(), '?orden=name');

  handleSortDirectionToggle();
  sortSelect().value = 'speed';
  handleSortChange();
  assert.equal(dirButton().textContent, '↓ Descendente');
});

test('↕️ Controlador: "Limpiar filtros" conserva el criterio y el sentido elegidos', () => {
  sortSelect().value = 'name';
  handleSortChange();
  handleSortDirectionToggle();
  toggleTypeFilter('Fuego');

  clearAllFilters();
  assert.equal(sortSelect().value, 'name');
  assert.equal(dirButton().textContent, '↓ Descendente');
  assert.deepEqual(names(), ['25', '16', '152', '4', '6']);
  assert.equal(search(), '?orden=name&dir=desc');
});

test('↕️ Controlador: criterio y sentido se restauran desde la URL y un sentido inválido se ignora', async () => {
  dom.window.history.replaceState(null, '', '/?orden=speed&dir=asc');
  await loadPokemons();
  assert.equal(sortSelect().value, 'speed');
  assert.equal(dirButton().textContent, '↑ Ascendente');
  assert.deepEqual(names(), ['152', '16', '4', '25', '6']);

  dom.window.history.replaceState(null, '', '/?orden=speed&dir=sideways');
  await loadPokemons();
  assert.equal(dirButton().textContent, '↓ Descendente');
  assert.deepEqual(names(), ['6', '25', '4', '16', '152']);
  assert.equal(search(), '?orden=speed');
});
