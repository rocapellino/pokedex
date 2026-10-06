import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initialPokemons, sampleBasePokemons } from '../../apps/backend/src/data/initialPokemons.js';
import { loadSeedCatalog } from '../../apps/backend/src/data/seed-catalog.js';
import { buildSampleMegas, SAMPLE_MEGAS_OUTPUT, serializeSampleMegas } from '../../scripts/generate-pokemon-catalog.js';
import { TYPE_COLORS } from '../../apps/frontend/src/shared/constants.js';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const full = loadSeedCatalog('full');
const allMegas = full.flatMap((entry) => (entry.megaevoluciones ?? []).map((mega) => ({ entry, mega })));

test('🧬 Catálogo: incluye las megaevoluciones de PokeAPI (clásicas y de Leyendas Z-A)', () => {
  assert.ok(allMegas.length >= 90, `solo hay ${allMegas.length} megaevoluciones`);

  const byId = new Map(full.map((entry) => [entry.id, entry]));
  const claves = (id: number) => byId.get(id)?.megaevoluciones?.map((m) => m.clave);

  assert.deepEqual(claves(6), ['charizard-mega-x', 'charizard-mega-y']);
  assert.deepEqual(claves(150), ['mewtwo-mega-x', 'mewtwo-mega-y']);
  assert.deepEqual(claves(3), ['venusaur-mega']);
  assert.equal(claves(678)?.length, 2, 'Meowstic: macho y hembra');
  assert.equal(claves(978)?.length, 3, 'Tatsugiri: tres formas');
  assert.deepEqual(claves(36), ['clefable-mega'], 'una de Leyendas Z-A');
});

test('🧬 Catálogo: las megaevoluciones no tienen número de Pokédex propio ni entradas independientes', () => {
  // El catálogo sigue siendo de 1025 especies con IDs contiguos: ninguna mega es una entrada más.
  assert.equal(full.length, 1025);
  for (const [index, entry] of full.entries()) assert.equal(entry.id, index + 1);
  for (const { mega } of allMegas) {
    assert.equal('id' in mega, false, `${mega.clave} no debe tener id`);
  }
  assert.equal(
    full.some((entry) => /^Mega-/.test(entry.nombre)),
    false,
    'ninguna entrada base se llama Mega-*',
  );
});

test('🧬 Catálogo: claves únicas, nombres Mega-* y pocas formas por especie', () => {
  const claves = allMegas.map(({ mega }) => mega.clave);
  assert.equal(new Set(claves).size, claves.length, 'claves repetidas');

  for (const { entry, mega } of allMegas) {
    assert.match(mega.clave, /(^|-)mega(-|$)/, mega.clave);
    assert.match(mega.nombre, /^Mega-/, `${mega.clave}: ${mega.nombre}`);
    assert.ok((entry.megaevoluciones?.length ?? 0) <= 3, `${entry.nombre} tiene demasiadas formas`);
  }
});

test('🧬 Catálogo: cada megaevolución trae arte oficial, tipos conocidos y las seis estadísticas', () => {
  for (const { mega } of allMegas) {
    assert.match(mega.imagen, /^https:\/\/raw\.githubusercontent\.com\/PokeAPI\/sprites\//, mega.clave);
    for (const tipo of mega.tipos) {
      assert.ok(tipo in TYPE_COLORS, `${mega.clave}: tipo sin color en el frontend: ${tipo}`);
    }
    for (const key of ['hp', 'attack', 'defense', 'sp_attack', 'sp_defense', 'speed'] as const) {
      assert.ok(Number.isInteger(mega.stats[key]) && (mega.stats[key] as number) > 0, `${mega.clave}.${key}`);
    }
  }
});

test('🧬 Catálogo: la megaevolución cambia algo respecto a la forma base (tipos, habilidades o estadísticas)', () => {
  for (const { entry, mega } of allMegas) {
    const base = entry.stats;
    const sameStats = Object.keys(mega.stats).every((k) => mega.stats[k] === base?.[k]);
    const sameTypes = JSON.stringify(mega.tipos) === JSON.stringify(entry.tipos);
    const sameAbilities = JSON.stringify(mega.habilidades) === JSON.stringify(entry.habilidades);
    assert.ok(!(sameStats && sameTypes && sameAbilities), `${mega.clave} es idéntica a la forma base`);
  }
});

test('🧬 Muestra: las megaevoluciones de la muestra de desarrollo coinciden con el catálogo completo', () => {
  const expected = buildSampleMegas(
    full,
    sampleBasePokemons.map((p) => p.id),
  );

  const file = path.join(ROOT_DIR, SAMPLE_MEGAS_OUTPUT);
  assert.equal(
    fs.readFileSync(file, 'utf-8').replace(/\r\n/g, '\n'),
    serializeSampleMegas(expected),
    'sample-megaevoluciones.json desactualizado: ejecute `npx tsx scripts/generate-pokemon-catalog.ts --sync-sample-megas`',
  );
});

test('🧬 Muestra: initialPokemons adjunta las megaevoluciones y deja el resto intacto', () => {
  const charizard = initialPokemons.find((p) => p.id === 6);
  assert.deepEqual(
    charizard?.megaevoluciones?.map((m) => m.clave),
    ['charizard-mega-x', 'charizard-mega-y'],
  );

  const pikachu = initialPokemons.find((p) => p.id === 25);
  assert.equal(pikachu?.megaevoluciones, undefined, 'Pikachu no tiene megaevolución');

  assert.equal(initialPokemons.length, sampleBasePokemons.length);
  const base = sampleBasePokemons.find((p) => p.id === 6);
  const { megaevoluciones: _megas, ...rest } = charizard as NonNullable<typeof charizard>;
  assert.deepEqual(rest, base);
});
