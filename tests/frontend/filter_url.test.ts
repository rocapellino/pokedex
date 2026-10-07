import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseFilterParams,
  serializeFilterParams,
  EMPTY_FILTER_STATE,
} from '../../apps/frontend/src/shared/filter-url.js';

test('🔗 URL: sin parámetros devuelve el estado vacío', () => {
  assert.deepEqual(parseFilterParams(''), EMPTY_FILTER_STATE);
  assert.equal(serializeFilterParams({ ...EMPTY_FILTER_STATE, types: [] }), '');
});

test('🔗 URL: lee búsqueda, tipos, generación y megaevolución', () => {
  assert.deepEqual(parseFilterParams('?q=char&tipo=fuego,volador&gen=1&mega=1'), {
    searchQuery: 'char',
    types: ['Fuego', 'Volador'],
    generation: '1',
    onlyWithMega: true,
  });
});

test('🔗 URL: los tipos se resuelven sin tildes ni mayúsculas y sin duplicados', () => {
  assert.deepEqual(parseFilterParams('?tipo=ELECTRICO,electrico,Dragon').types, ['Eléctrico', 'Dragón']);
});

test('🔗 URL: descarta valores desconocidos o fuera de rango', () => {
  const state = parseFilterParams('?tipo=pizza,,fuego&gen=10&mega=yes');
  assert.deepEqual(state.types, ['Fuego']);
  assert.equal(state.generation, 'all');
  assert.equal(state.onlyWithMega, false);
  assert.equal(parseFilterParams('?gen=0').generation, 'all');
  assert.equal(parseFilterParams('?gen=abc').generation, 'all');
});

test('🔗 URL: acota la longitud de la búsqueda y recorta espacios', () => {
  assert.equal(parseFilterParams(`?q=${'a'.repeat(500)}`).searchQuery.length, 80);
  assert.equal(parseFilterParams('?q=%20%20pika%20').searchQuery, 'pika');
});

test('🔗 URL: serializar y volver a leer conserva el estado', () => {
  const state = { searchQuery: 'dragón azul', types: ['Eléctrico', 'Dragón'], generation: '3', onlyWithMega: true };
  const search = serializeFilterParams(state);
  assert.equal(search, '?q=drag%C3%B3n+azul&tipo=electrico%2Cdragon&gen=3&mega=1');
  assert.deepEqual(parseFilterParams(search), state);
});

test('🔗 URL: solo serializa los filtros activos', () => {
  assert.equal(serializeFilterParams({ ...EMPTY_FILTER_STATE, types: [], generation: '2' }), '?gen=2');
  assert.equal(serializeFilterParams({ ...EMPTY_FILTER_STATE, types: [], searchQuery: '   ' }), '');
});
