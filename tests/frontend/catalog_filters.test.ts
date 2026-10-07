import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  collectAbilities,
  listAbilities,
  matchesCatalogFilters,
  type CatalogFilters,
} from '../../apps/frontend/src/shared/catalog-filters.js';
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

test('🧪 Habilidades: listAbilities lee listas, textos separados por comas y datos ausentes', () => {
  assert.deepEqual(listAbilities({ ...charizard, habilidades: ['Mar Llamas', ' Poder Solar '] }), [
    'Mar Llamas',
    'Poder Solar',
  ]);
  assert.deepEqual(listAbilities({ ...charizard, habilidades: 'Mar Llamas, Poder Solar,, ' }), [
    'Mar Llamas',
    'Poder Solar',
  ]);
  assert.deepEqual(listAbilities({ ...charizard, habilidades: undefined }), []);
  assert.deepEqual(listAbilities({ ...charizard, habilidades: [] }), []);
});

test('🧪 Habilidades: collectAbilities devuelve las distintas, sin duplicados por tildes o mayúsculas y ordenadas', () => {
  const list: Pokemon[] = [
    { ...charizard, id: 1, habilidades: ['Presión', 'Ímpetu'] },
    { ...charizard, id: 2, habilidades: ['presion', 'Absorbe Agua'] },
    { ...charizard, id: 3, habilidades: 'Ímpetu, Zafarrancho' },
    { ...charizard, id: 4, habilidades: undefined },
  ];
  assert.deepEqual(collectAbilities(list), ['Absorbe Agua', 'Ímpetu', 'Presión', 'Zafarrancho']);
  assert.deepEqual(collectAbilities([]), []);
});

test('🧪 Habilidades: el filtro exige la habilidad exacta, sin tildes ni mayúsculas', () => {
  const only = (habilidad: string | null) => ({ ...base, habilidad });

  assert.equal(matchesCatalogFilters(charizard, only('Mar Llamas')), true);
  assert.equal(matchesCatalogFilters(charizard, only('mar llamas')), true);
  assert.equal(matchesCatalogFilters(charizard, only('MAR LLAMAS')), true);
  assert.equal(matchesCatalogFilters(charizard, only('Mar')), false, 'una parte no es la habilidad');
  assert.equal(matchesCatalogFilters(charmander, only('Mar Llamas')), false);
  assert.equal(matchesCatalogFilters(charmander, only('Poder Solar')), true);
  assert.equal(matchesCatalogFilters(charizard, only(null)), true);
  assert.equal(matchesCatalogFilters(charizard, base), true);
  assert.equal(matchesCatalogFilters({ ...charizard, habilidades: undefined }, only('Mar Llamas')), false);
});

test('🧪 Habilidades: funciona con habilidades en texto y se combina con otros filtros', () => {
  const asText: Pokemon = { ...charizard, habilidades: 'Mar Llamas, Poder Solar' };
  assert.equal(matchesCatalogFilters(asText, { ...base, habilidad: 'Poder Solar' }), true);
  assert.equal(matchesCatalogFilters(asText, { ...base, habilidad: 'Poder Solar', types: ['Volador'] }), true);
  assert.equal(matchesCatalogFilters(asText, { ...base, habilidad: 'Poder Solar', types: ['Planta'] }), false);
});
