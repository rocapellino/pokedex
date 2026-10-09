import { doc, documentReady, dom, mountIndexPage, serveCatalog } from './catalog_page.js';
import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearAllFilters,
  handleAbilityChange,
  hasActiveFilters,
  initInteractiveListeners,
  loadPokemons,
  toggleTypeFilter,
} from '../../apps/frontend/src/pokedex.js';
import type { Pokemon } from '../../apps/frontend/src/types.js';

const mk = (id: number, nombre: string, tipo: string, habilidades: string[]): Pokemon => ({
  id,
  nombre,
  tipo,
  tipos: [tipo],
  habilidades,
  fuerza: 50,
  imagen: '',
  caracteristicas: { peso: 6, altura: 0.4, habitat: 'Bosque' },
});

const catalog: Pokemon[] = [
  mk(4, 'Charmander', 'Fuego', ['Mar Llamas', 'Poder Solar']),
  mk(6, 'Charizard', 'Fuego', ['Mar Llamas', 'Poder Solar']),
  mk(25, 'Pikachu', 'Eléctrico', ['Electricidad Estática', 'Pararrayos']),
  mk(43, 'Oddish', 'Planta', ['Clorofila', 'Presión']),
  mk(150, 'Mewtwo', 'Psíquico', ['Presión', 'Ímpetu']),
];

let restoreFetch: () => void;

const names = () => [...doc.querySelectorAll('.pokemon-card')].map((c) => c.getAttribute('data-pokemon-id'));
const chips = () => [...doc.querySelectorAll('#activeFilterChips .filter-chip')].map((c) => c.textContent);
const input = () => doc.getElementById('abilityFilter') as HTMLInputElement;
const options = () => [...doc.querySelectorAll('#abilityOptions option')].map((o) => (o as HTMLOptionElement).value);
const panel = () => doc.getElementById('moreFilters') as HTMLElement;
const count = () => doc.getElementById('moreFiltersCount') as HTMLElement;
const search = () => dom.window.location.search;

function type(value: string): void {
  input().value = value;
  input().dispatchEvent(new dom.window.Event('input', { bubbles: true }));
}

before(async () => {
  await documentReady();
  mountIndexPage();
  restoreFetch = serveCatalog(catalog);

  await loadPokemons();
  initInteractiveListeners();
});

beforeEach(() => {
  clearAllFilters();
  panel().hidden = true;
});

after(() => {
  restoreFetch();
});

test('🧪 Habilidad: el autocompletado lista cada habilidad del catálogo una vez y ordenadas', () => {
  assert.deepEqual(options(), [
    'Clorofila',
    'Electricidad Estática',
    'Ímpetu',
    'Mar Llamas',
    'Pararrayos',
    'Poder Solar',
    'Presión',
  ]);
});

test('🧪 Habilidad: escribir o elegir una habilidad completa filtra, crea un chip y viaja en la URL', () => {
  type('Presión');
  assert.deepEqual(names(), ['43', '150']);
  assert.deepEqual(chips(), ['Habilidad: Presión✕']);
  assert.equal(search(), '?hab=presion');
  assert.equal(hasActiveFilters(), true);
});

test('🧪 Habilidad: ignora tildes y mayúsculas y normaliza el campo al nombre real', () => {
  type('presion');
  assert.deepEqual(names(), ['43', '150']);
  assert.equal(input().value, 'Presión');

  type('IMPETU');
  assert.deepEqual(names(), ['150']);
  assert.equal(input().value, 'Ímpetu');
});

test('🧪 Habilidad: un texto parcial o desconocido no filtra y marca el campo como no válido', () => {
  type('Pres');
  assert.equal(names().length, catalog.length);
  assert.equal(input().getAttribute('aria-invalid'), 'true');
  assert.equal(search(), '');
  assert.equal(hasActiveFilters(), false);

  type('Presión');
  assert.equal(input().hasAttribute('aria-invalid'), false);
  assert.deepEqual(names(), ['43', '150']);

  type('Presión2');
  assert.equal(names().length, catalog.length, 'al dejar de coincidir se retira el filtro');
  assert.equal(input().getAttribute('aria-invalid'), 'true');
});

test('🧪 Habilidad: vaciar el campo quita el filtro y no lo marca como inválido', () => {
  type('Mar Llamas');
  assert.deepEqual(names(), ['4', '6']);

  type('');
  assert.equal(names().length, catalog.length);
  assert.equal(input().hasAttribute('aria-invalid'), false);
  assert.equal(search(), '');
});

test('🧪 Habilidad: se combina con otros filtros', () => {
  type('Presión');
  toggleTypeFilter('Fuego');
  assert.deepEqual(names(), []);
  toggleTypeFilter('Fuego');
  assert.deepEqual(names(), ['43', '150']);
});

test('🧪 Habilidad: el chip y "Limpiar filtros" restablecen el campo', () => {
  type('Mar Llamas');
  doc.querySelector<HTMLButtonElement>('#activeFilterChips .filter-chip-remove')?.click();
  assert.equal(input().value, '');
  assert.equal(names().length, catalog.length);
  assert.equal(search(), '');

  type('Mar Llamas');
  (doc.getElementById('btnClearFilters') as HTMLButtonElement).click();
  assert.equal(input().value, '');
  assert.equal(names().length, catalog.length);
});

test('🧪 Habilidad: cuenta como filtro avanzado en el panel', () => {
  assert.equal(count().hidden, true);
  type('Presión');
  assert.equal(count().hidden, false);
  assert.equal(count().textContent, '1');
  assert.equal(doc.getElementById('filtersToggle')?.getAttribute('aria-label'), 'Filtros, 1 activos');
});

test('🧪 Habilidad: se restaura desde la URL (abre el panel) y una habilidad desconocida se ignora', async () => {
  dom.window.history.replaceState(null, '', '/?hab=poder+solar');
  await loadPokemons();
  assert.deepEqual(names(), ['4', '6']);
  assert.equal(input().value, 'Poder Solar');
  assert.equal(!panel().hidden, true, 'un filtro oculto debe verse');
  assert.deepEqual(chips(), ['Habilidad: Poder Solar✕']);

  panel().hidden = true;
  dom.window.history.replaceState(null, '', '/?hab=__proto__');
  await loadPokemons();
  assert.equal(names().length, catalog.length);
  assert.equal(input().value, '');
  assert.equal(!panel().hidden, false);
  assert.equal(search(), '');
});

test('🧪 Habilidad: escribir sin cambiar el resultado no vuelve a pintar la grilla', () => {
  type('Presión');
  const grid = doc.getElementById('pokemonGrid') as HTMLElement;
  const firstCard = grid.querySelector('.pokemon-card');

  handleAbilityChange();
  assert.equal(grid.querySelector('.pokemon-card'), firstCard, 'las tarjetas siguen siendo las mismas');
});
