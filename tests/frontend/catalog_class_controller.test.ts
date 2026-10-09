import { doc, documentReady, dom, mk, mountIndexPage, serveCatalog } from './catalog_page.js';
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

const catalog: Pokemon[] = [
  mk(25, 'Pikachu', 'Eléctrico'),
  mk(145, 'Zapdos', 'Eléctrico', { clasificacion: 'legendario' }),
  mk(150, 'Mewtwo', 'Psíquico', { clasificacion: 'legendario' }),
  mk(151, 'Mew', 'Psíquico', { clasificacion: 'mitico' }),
];

let restoreFetch: () => void;

const names = () => [...doc.querySelectorAll('.pokemon-card')].map((c) => c.getAttribute('data-pokemon-id'));
const chips = () => [...doc.querySelectorAll('#activeFilterChips .filter-chip')].map((c) => c.textContent);
const select = () => doc.getElementById('classFilter') as HTMLSelectElement;
const search = () => dom.window.location.search;

function choose(value: string): void {
  select().value = value;
  handleClassFilterChange();
}

before(async () => {
  await documentReady();
  mountIndexPage();
  restoreFetch = serveCatalog(catalog);

  await loadPokemons();
  initInteractiveListeners();
});

beforeEach(() => clearAllFilters());

after(() => restoreFetch());

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

const panel = () => doc.getElementById('moreFilters') as HTMLElement;
const count = () => doc.getElementById('moreFiltersCount') as HTMLElement;
const summary = () => doc.getElementById('filtersToggle') as HTMLElement;

test('📂 Panel: el contador y el nombre accesible reflejan los filtros avanzados activos', () => {
  assert.equal(count().hidden, true);
  assert.equal(summary().getAttribute('aria-label'), 'Filtros');

  choose('legendario');
  assert.equal(count().hidden, false);
  assert.equal(count().textContent, '1');
  assert.equal(summary().getAttribute('aria-label'), 'Filtros, 1 activos');

  (doc.getElementById('statFilter') as HTMLSelectElement).value = 'speed';
  (doc.getElementById('statMin') as HTMLInputElement).value = '90';
  handleStatFilterChange();
  assert.equal(count().textContent, '2');
  assert.equal(summary().getAttribute('aria-label'), 'Filtros, 2 activos');

  clearAllFilters();
  assert.equal(count().hidden, true);
  assert.equal(summary().getAttribute('aria-label'), 'Filtros');
});

test('📂 Panel: un filtro avanzado en la URL abre el panel y sin filtros avanzados no se fuerza', async () => {
  panel().hidden = true;
  dom.window.history.replaceState(null, '', '/?q=pika');
  await loadPokemons();
  assert.equal(!panel().hidden, false, 'la búsqueda está fuera del panel y no lo abre');
  assert.equal(count().hidden, true);

  dom.window.history.replaceState(null, '', '/?clase=mitico');
  await loadPokemons();
  assert.equal(!panel().hidden, true, 'un filtro oculto debe verse');
  assert.equal(count().textContent, '1');

  panel().hidden = true;
  dom.window.history.replaceState(null, '', '/?stat=speed&min=90');
  await loadPokemons();
  assert.equal(!panel().hidden, true);
});

test('📂 Panel: cambiar un filtro no abre ni cierra el panel por su cuenta', () => {
  panel().hidden = true;
  choose('especial');
  assert.equal(!panel().hidden, false);

  panel().hidden = false;
  clearAllFilters();
  assert.equal(!panel().hidden, true, 'limpiar filtros respeta la elección de la persona');
});

test('📂 Panel: generación, megaevolución y tipos también cuentan y abren el panel al venir de la URL', async () => {
  for (const [query, expected] of [
    ['?gen=1', '1'],
    ['?mega=1', '1'],
    ['?tipo=fuego', '1'],
    ['?tipo=fuego,volador', '1'],
    ['?gen=2&mega=1&tipo=fuego,volador&clase=mitico', '4'],
  ] as const) {
    panel().hidden = true;
    dom.window.history.replaceState(null, '', `/${query}`);
    await loadPokemons();
    assert.equal(!panel().hidden, true, `${query} debe abrir el panel`);
    assert.equal(count().textContent, expected, query);
    assert.equal(summary().getAttribute('aria-label'), `Filtros, ${expected} activos`);
  }
});
