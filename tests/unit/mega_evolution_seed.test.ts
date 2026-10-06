import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planMegaEnrichment, canonicalJson } from '../../apps/backend/src/data/seed-catalog.js';
import {
  getPokemonById,
  listPersistedMegaEvolutions,
  savePokemon,
  setPokemonMegaEvolutions,
} from '../../apps/backend/src/services/pokemon.repository.js';
import type { MegaEvolution, Pokemon } from '../../apps/backend/src/types.js';

const mega = (clave: string, hp = 78): MegaEvolution => ({
  clave,
  nombre: `Mega ${clave}`,
  imagen: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/10034.png',
  tipos: ['Fuego', 'Dragón'],
  habilidades: ['Garra Dura'],
  stats: { hp, attack: 130, defense: 111, sp_attack: 130, sp_defense: 85, speed: 100 },
  peso: 110.5,
  altura: 1.7,
});

const entry = (id: number, megas?: MegaEvolution[]): Pokemon => ({
  id,
  nombre: `Mon${id}`,
  imagen: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/6.png',
  tipo: 'Fuego',
  caracteristicas: { peso: 1, altura: 1, fuerza: 50 },
  habilidades: ['A'],
  ...(megas ? { megaevoluciones: megas } : {}),
});

test('🧬 Seed: canonicalJson no depende del orden de las claves (jsonb de PostgreSQL las reordena)', () => {
  assert.equal(canonicalJson({ b: 1, a: { d: 2, c: 3 } }), canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
  assert.notEqual(canonicalJson({ a: 1 }), canonicalJson({ a: 2 }));
  assert.notEqual(canonicalJson([1, 2]), canonicalJson([2, 1]));
});

test('🧬 Seed: planMegaEnrichment actualiza solo filas existentes a las que les faltan megaevoluciones', () => {
  const catalog = [entry(6, [mega('charizard-mega-x')]), entry(9, [mega('blastoise-mega')]), entry(25)];
  const plan = planMegaEnrichment(catalog, new Map(), new Set([6, 9, 25]));

  assert.deepEqual(
    plan.map((p) => p.id),
    [6, 9],
  );
  assert.deepEqual(plan[0].megaevoluciones, [mega('charizard-mega-x')]);
});

test('🧬 Seed: no toca las filas que ya tienen las mismas megaevoluciones (idempotente)', () => {
  const catalog = [entry(6, [mega('charizard-mega-x')])];
  // Mismas megaevoluciones con otro orden de claves, como las devuelve jsonb.
  const reordered = JSON.parse(JSON.stringify(mega('charizard-mega-x')), (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).reverse()) : v,
  );

  assert.deepEqual(planMegaEnrichment(catalog, new Map([[6, [reordered]]]), new Set([6])), []);
});

test('🧬 Seed: actualiza las filas cuyas megaevoluciones cambiaron en el catálogo', () => {
  const catalog = [entry(6, [mega('charizard-mega-x', 80)])];
  const plan = planMegaEnrichment(catalog, new Map([[6, [mega('charizard-mega-x', 78)]]]), new Set([6]));

  assert.deepEqual(
    plan.map((p) => p.id),
    [6],
  );
});

test('🧬 Seed: ignora las entradas que no están persistidas (las inserta el seed completo)', () => {
  const catalog = [entry(6, [mega('charizard-mega-x')])];

  assert.deepEqual(planMegaEnrichment(catalog, new Map(), new Set()), []);
});

test('🧬 Seed: no borra megaevoluciones persistidas si el catálogo no trae ninguna', () => {
  const catalog = [entry(6)];

  assert.deepEqual(planMegaEnrichment(catalog, new Map([[6, [mega('charizard-mega-x')]]]), new Set([6])), []);
});

test('🧬 Repositorio: setPokemonMegaEvolutions modifica solo ese campo y conserva las ediciones', async () => {
  const id = 880001;
  await savePokemon({ ...entry(id), nombre: 'Editado por el admin', fuerza: 99 });

  const updated = await setPokemonMegaEvolutions(id, [mega('prueba-mega')]);
  const stored = await getPokemonById(id);

  assert.equal(updated, true);
  assert.equal(stored?.nombre, 'Editado por el admin');
  assert.equal(stored?.fuerza, 99);
  assert.deepEqual(stored?.megaevoluciones, [mega('prueba-mega')]);
});

test('🧬 Repositorio: setPokemonMegaEvolutions devuelve false si la entrada no existe', async () => {
  assert.equal(await setPokemonMegaEvolutions(880999, [mega('x-mega')]), false);
});

test('🧬 Repositorio: listPersistedMegaEvolutions devuelve solo las entradas que las tienen', async () => {
  const withMega = 880002;
  const withoutMega = 880003;
  await savePokemon(entry(withMega, [mega('otra-mega')]));
  await savePokemon(entry(withoutMega));

  const persisted = await listPersistedMegaEvolutions();

  assert.deepEqual(persisted.get(withMega), [mega('otra-mega')]);
  assert.equal(persisted.has(withoutMega), false);
});
