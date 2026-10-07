import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesCatalogFilters, type CatalogFilters } from '../../apps/frontend/src/shared/catalog-filters.js';
import type { Pokemon } from '../../apps/frontend/src/types.js';

const base: CatalogFilters = { searchQuery: '', types: [], generation: 'all', onlyWithMega: false };

const charizard: Pokemon = {
  id: 6,
  nombre: 'Charizard',
  imagen: '',
  tipo: 'Fuego',
  tipos: ['Fuego', 'Volador'],
  habilidades: ['Mar Llamas'],
  caracteristicas: { habitat: 'Montañas' },
};
const charmander: Pokemon = {
  ...charizard,
  id: 4,
  nombre: 'Charmander',
  tipos: ['Fuego'],
  habilidades: ['Poder Solar'],
};
const pidgey: Pokemon = { ...charizard, id: 16, nombre: 'Pidgey', tipo: 'Normal', tipos: ['Normal', 'Volador'] };

test('🔎 Filtros: sin tipos seleccionados no se restringe por tipo', () => {
  assert.equal(matchesCatalogFilters(charizard, base), true);
});

test('🔎 Filtros: varios tipos exigen que el Pokémon los tenga todos', () => {
  const fuegoVolador = { ...base, types: ['Fuego', 'Volador'] };
  assert.equal(matchesCatalogFilters(charizard, fuegoVolador), true);
  assert.equal(matchesCatalogFilters(charmander, fuegoVolador), false);
  assert.equal(matchesCatalogFilters(pidgey, fuegoVolador), false);
});

test('🔎 Filtros: el tipo ignora tildes y mayúsculas y reconoce el tipo secundario', () => {
  assert.equal(matchesCatalogFilters(charizard, { ...base, types: ['volador'] }), true);
  assert.equal(matchesCatalogFilters(pidgey, { ...base, types: ['VOLADOR'] }), true);
  assert.equal(matchesCatalogFilters(charmander, { ...base, types: ['Volador'] }), false);
});

test('🔎 Filtros: la búsqueda cubre nombre, habilidad, hábitat e ID sin distinguir tildes', () => {
  assert.equal(matchesCatalogFilters(charizard, { ...base, searchQuery: 'MONTANAS' }), true);
  assert.equal(matchesCatalogFilters(charizard, { ...base, searchQuery: 'llamas' }), true);
  assert.equal(matchesCatalogFilters(charizard, { ...base, searchQuery: 'volador' }), true);
  assert.equal(matchesCatalogFilters(charizard, { ...base, searchQuery: '6' }), true);
  assert.equal(matchesCatalogFilters(charizard, { ...base, searchQuery: 'zzz' }), false);
});

test('🔎 Filtros: tipos, búsqueda y generación se combinan', () => {
  const filters = { ...base, types: ['Fuego'], searchQuery: 'char', generation: '1' };
  assert.equal(matchesCatalogFilters(charmander, filters), true);
  assert.equal(matchesCatalogFilters(charmander, { ...filters, generation: '2' }), false);
  assert.equal(matchesCatalogFilters(pidgey, filters), false);
});

test('🔎 Filtros: el índice normalizado en caché no vuelve obsoleto el resultado entre llamadas', () => {
  assert.equal(matchesCatalogFilters(charizard, { ...base, searchQuery: 'char' }), true);
  assert.equal(matchesCatalogFilters(charizard, { ...base, searchQuery: 'pidg' }), false);
  assert.equal(matchesCatalogFilters(charizard, { ...base, searchQuery: 'char' }), true);
});

test('🌟 Filtros: la clasificación distingue legendarios, míticos y ambos', () => {
  const legendary: Pokemon = { ...charizard, id: 150, nombre: 'Mewtwo', clasificacion: 'legendario' };
  const mythical: Pokemon = { ...charizard, id: 151, nombre: 'Mew', clasificacion: 'mitico' };
  const common = charizard;

  const only = (clasificacion: CatalogFilters['clasificacion']) => ({ ...base, clasificacion });

  assert.deepEqual(
    [legendary, mythical, common].map((p) => matchesCatalogFilters(p, only('legendario'))),
    [true, false, false],
  );
  assert.deepEqual(
    [legendary, mythical, common].map((p) => matchesCatalogFilters(p, only('mitico'))),
    [false, true, false],
  );
  assert.deepEqual(
    [legendary, mythical, common].map((p) => matchesCatalogFilters(p, only('especial'))),
    [true, true, false],
  );
  assert.equal(matchesCatalogFilters(common, only(null)), true);
  assert.equal(matchesCatalogFilters(common, base), true);
});

test('🌟 Filtros: un valor de clasificación inválido en los datos no cuenta como legendario', () => {
  const forged = { ...charizard, clasificacion: 'raro' } as unknown as Pokemon;
  assert.equal(matchesCatalogFilters(forged, { ...base, clasificacion: 'especial' }), false);
});
