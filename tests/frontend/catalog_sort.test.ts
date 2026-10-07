import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultSortDirection,
  getStatValue,
  isSortDirection,
  isSortKey,
  isStatKey,
  sortPokemons,
} from '../../apps/frontend/src/shared/catalog-sort.js';
import { matchesCatalogFilters, type CatalogFilters } from '../../apps/frontend/src/shared/catalog-filters.js';
import type { Pokemon } from '../../apps/frontend/src/types.js';

const mk = (id: number, nombre: string, stats?: Pokemon['stats']): Pokemon => ({
  id,
  nombre,
  tipo: 'Normal',
  stats,
});

const six = (hp: number, speed: number) => ({
  hp,
  attack: 50,
  defense: 50,
  sp_attack: 50,
  sp_defense: 50,
  speed,
});

const slow = mk(3, 'Ábaco', six(100, 20));
const fast = mk(1, 'Zubat', six(40, 130));
const mid = mk(2, 'Meowth', six(70, 90));
const noStats = mk(4, 'Missingno');
const list = [slow, noStats, fast, mid];

test('📊 Orden: getStatValue devuelve la estadística o el total, y undefined si faltan datos', () => {
  assert.equal(getStatValue(fast, 'speed'), 130);
  assert.equal(getStatValue(fast, 'total'), 40 + 50 * 4 + 130);
  assert.equal(getStatValue(noStats, 'speed'), undefined);
  assert.equal(getStatValue(mk(5, 'Parcial', { hp: 10 }), 'total'), undefined);
  assert.equal(getStatValue(mk(6, 'Inválido', { ...six(10, 10), hp: -1 }), 'hp'), undefined);
});

test('📊 Orden: por número y por nombre (con tildes, sin mutar la entrada)', () => {
  assert.deepEqual(
    sortPokemons(list, 'id').map((p) => p.id),
    [1, 2, 3, 4],
  );
  assert.deepEqual(
    sortPokemons(list, 'name').map((p) => p.nombre),
    ['Ábaco', 'Meowth', 'Missingno', 'Zubat'],
  );
  assert.deepEqual(
    list.map((p) => p.id),
    [3, 4, 1, 2],
  );
});

test('📊 Orden: por estadística va de mayor a menor y deja al final a quien no tiene datos', () => {
  assert.deepEqual(
    sortPokemons(list, 'speed').map((p) => p.id),
    [1, 2, 3, 4],
  );
  assert.deepEqual(
    sortPokemons(list, 'hp').map((p) => p.id),
    [3, 2, 1, 4],
  );
  assert.deepEqual(
    sortPokemons(list, 'total').map((p) => p.id),
    [1, 2, 3, 4],
  );
});

test('📊 Orden: los empates se desempatan por número', () => {
  const a = mk(9, 'A', six(50, 50));
  const b = mk(7, 'B', six(50, 50));
  assert.deepEqual(
    sortPokemons([a, b], 'hp').map((p) => p.id),
    [7, 9],
  );
  assert.deepEqual(
    sortPokemons([mk(8, 'X'), mk(5, 'Y')], 'speed').map((p) => p.id),
    [5, 8],
  );
});

test('📊 Orden: reconoce solo claves válidas', () => {
  assert.equal(isSortKey('speed'), true);
  assert.equal(isSortKey('name'), true);
  assert.equal(isSortKey('poder'), false);
  assert.equal(isStatKey('total'), true);
  assert.equal(isStatKey('name'), false);
});

test('📊 Filtro: la estadística mínima excluye a quien no llega o no tiene datos', () => {
  const base: CatalogFilters = { searchQuery: '', types: [], generation: 'all', onlyWithMega: false };
  const speed90 = { ...base, minStat: { key: 'speed', min: 90 } } as CatalogFilters;

  assert.equal(matchesCatalogFilters(fast, speed90), true);
  assert.equal(matchesCatalogFilters(mid, speed90), true, 'el mínimo es inclusivo');
  assert.equal(matchesCatalogFilters(slow, speed90), false);
  assert.equal(matchesCatalogFilters(noStats, speed90), false);
  assert.equal(matchesCatalogFilters(noStats, { ...base, minStat: null }), true);
  assert.equal(matchesCatalogFilters(slow, { ...base, minStat: { key: 'total', min: 300 } }), true);
});

test('↕️ Orden: el sentido natural es ascendente para número y nombre y descendente para estadísticas', () => {
  assert.equal(defaultSortDirection('id'), 'asc');
  assert.equal(defaultSortDirection('name'), 'asc');
  for (const key of ['total', 'hp', 'attack', 'defense', 'sp_attack', 'sp_defense', 'speed'] as const) {
    assert.equal(defaultSortDirection(key), 'desc', key);
  }
  assert.equal(isSortDirection('asc'), true);
  assert.equal(isSortDirection('desc'), true);
  assert.equal(isSortDirection('up'), false);
});

test('↕️ Orden: sin sentido explícito usa el natural (no cambia el comportamiento anterior)', () => {
  assert.deepEqual(
    sortPokemons(list, 'speed').map((p) => p.id),
    sortPokemons(list, 'speed', 'desc').map((p) => p.id),
  );
  assert.deepEqual(
    sortPokemons(list, 'name').map((p) => p.id),
    sortPokemons(list, 'name', 'asc').map((p) => p.id),
  );
});

test('↕️ Orden: invertir número y nombre', () => {
  assert.deepEqual(
    sortPokemons(list, 'id', 'desc').map((p) => p.id),
    [4, 3, 2, 1],
  );
  assert.deepEqual(
    sortPokemons(list, 'name', 'desc').map((p) => p.nombre),
    ['Zubat', 'Missingno', 'Meowth', 'Ábaco'],
  );
});

test('↕️ Orden: invertir una estadística la deja de menor a mayor y el dato ausente sigue al final', () => {
  assert.deepEqual(
    sortPokemons(list, 'speed', 'asc').map((p) => p.id),
    [3, 2, 1, 4],
  );
  assert.deepEqual(
    sortPokemons(list, 'hp', 'asc').map((p) => p.id),
    [1, 2, 3, 4],
  );
  assert.equal(sortPokemons(list, 'total', 'asc').at(-1)?.id, 4);
  assert.equal(sortPokemons(list, 'total', 'desc').at(-1)?.id, 4);
});

test('↕️ Orden: los empates se desempatan por número ascendente en cualquier sentido', () => {
  const a = mk(9, 'A', six(50, 50));
  const b = mk(7, 'B', six(50, 50));
  assert.deepEqual(
    sortPokemons([a, b], 'hp', 'asc').map((p) => p.id),
    [7, 9],
  );
  assert.deepEqual(
    sortPokemons([a, b], 'hp', 'desc').map((p) => p.id),
    [7, 9],
  );
  const sameName = [mk(9, 'Igual'), mk(7, 'Igual')];
  assert.deepEqual(
    sortPokemons(sameName, 'name', 'desc').map((p) => p.id),
    [7, 9],
  );
});
