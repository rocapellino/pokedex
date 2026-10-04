import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadSeedCatalog,
  planSeed,
  resolveSeedDataset,
  PRODUCTION_FORCE_SEED_TOKEN,
} from '../../apps/backend/src/data/seed-catalog.js';
import { initialPokemons } from '../../apps/backend/src/data/initialPokemons.js';
import { syncPokedexIdSequence } from '../../apps/backend/src/services/postgres.js';
import type { EvolutionNode, Pokemon } from '../../apps/backend/src/types.js';
import { TYPE_COLORS } from '../../apps/frontend/src/shared/constants.js';
import {
  assertCatalogValid,
  normalizeFlavorText,
  serializeCatalog,
  stripGenusPrefix,
  stripGenusSuffixEn,
  TYPE_NAMES_ES,
} from '../../scripts/generate-pokemon-catalog.js';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fullCatalog = loadSeedCatalog('full');

// ------------------------------------------------------------------------------
// Selección del dataset (SEED_DATASET)
// ------------------------------------------------------------------------------

test('🌱 SeedCatalog: SEED_DATASET vacío usa la muestra y acepta full sin distinguir mayúsculas', () => {
  assert.equal(resolveSeedDataset(undefined), 'sample');
  assert.equal(resolveSeedDataset('  '), 'sample');
  assert.equal(resolveSeedDataset('FULL'), 'full');
  assert.equal(resolveSeedDataset('sample'), 'sample');
});

test('🌱 SeedCatalog: un SEED_DATASET desconocido falla en lugar de degradar a otro dataset', () => {
  assert.throws(() => resolveSeedDataset('completo'), /SEED_DATASET inválido/);
});

test('🌱 SeedCatalog: sample es la muestra curada y full el catálogo nacional', () => {
  assert.equal(loadSeedCatalog('sample'), initialPokemons);
  assert.equal(fullCatalog.length, 1025, 'El catálogo completo debe cubrir las 1025 especies de PokeAPI');
});

// ------------------------------------------------------------------------------
// Contrato del dataset completo
// ------------------------------------------------------------------------------

test('🌱 SeedCatalog: el catálogo completo tiene IDs contiguos y supera el validador del backend', () => {
  assert.doesNotThrow(() => assertCatalogValid(fullCatalog));
});

test('🌱 SeedCatalog: todos los tipos del catálogo tienen color en el frontend', () => {
  const tipos = new Set(fullCatalog.flatMap((p) => p.tipos ?? [p.tipo]));
  for (const tipo of tipos) {
    assert.ok(tipo in TYPE_COLORS, `El tipo '${tipo}' no existe en TYPE_COLORS del frontend`);
  }
  assert.deepEqual([...tipos].sort(), Object.values(TYPE_NAMES_ES).sort());
});

test('🌱 SeedCatalog: las evoluciones referencian especies del propio catálogo e incluyen a la entrada', () => {
  const ids = new Set(fullCatalog.map((p) => p.id));
  for (const entry of fullCatalog) {
    const nodes = entry.evoluciones as EvolutionNode[];
    assert.ok(Array.isArray(nodes) && nodes.length > 0, `#${entry.id} debe declarar su cadena evolutiva`);
    assert.ok(nodes.some((n) => n.id === entry.id), `#${entry.id} debe figurar en su propia cadena`);
    for (const node of nodes) {
      assert.ok(ids.has(node.id), `#${entry.id}: la evolución ${node.id} no existe en el catálogo`);
    }
  }
});

test('🌱 SeedCatalog: las imágenes apuntan al artwork oficial de PokeAPI por HTTPS', () => {
  for (const entry of fullCatalog) {
    assert.match(entry.imagen, /^https:\/\/raw\.githubusercontent\.com\/PokeAPI\/sprites\//, `#${entry.id}`);
  }
});

test('🌱 SeedCatalog: el archivo versionado coincide con la serialización canónica (una entrada por línea)', () => {
  const file = fs.readFileSync(path.join(ROOT_DIR, 'apps/backend/src/data/pokemon-catalog.full.json'), 'utf-8');
  assert.equal(file.replace(/\r\n/g, '\n'), serializeCatalog(fullCatalog as Pokemon[]));
});

// ------------------------------------------------------------------------------
// Plan de siembra
// ------------------------------------------------------------------------------

const tiny = initialPokemons.slice(0, 3);

test('🌱 SeedPlan: sin FORCE_SEED solo inserta los IDs ausentes', () => {
  const plan = planSeed(tiny, new Set([tiny[0].id]), { isProduction: true });
  assert.equal(plan.mode, 'insert-missing');
  assert.deepEqual(plan.toSeed.map((p) => p.id), [tiny[1].id, tiny[2].id]);
});

test('🌱 SeedPlan: con el catálogo completo persistido no hay nada que sembrar', () => {
  const plan = planSeed(tiny, new Set(tiny.map((p) => p.id)), { isProduction: false });
  assert.equal(plan.toSeed.length, 0);
});

test('🌱 SeedPlan: FORCE_SEED=true reescribe todo fuera de producción', () => {
  const plan = planSeed(tiny, new Set(tiny.map((p) => p.id)), { forceSeed: 'true', isProduction: false });
  assert.equal(plan.mode, 'force-sync');
  assert.equal(plan.toSeed.length, tiny.length);
});

test('🌱 SeedPlan: en producción FORCE_SEED=true queda bloqueado y solo inserta faltantes', () => {
  const plan = planSeed(tiny, new Set([tiny[0].id]), { forceSeed: 'true', isProduction: true });
  assert.equal(plan.mode, 'insert-missing');
  assert.ok(plan.blockedForce?.includes(PRODUCTION_FORCE_SEED_TOKEN));
  assert.equal(plan.toSeed.length, 2);
});

test('🌱 SeedPlan: en producción el token de confirmación habilita la reescritura', () => {
  const plan = planSeed(tiny, new Set(), { forceSeed: PRODUCTION_FORCE_SEED_TOKEN, isProduction: true });
  assert.equal(plan.mode, 'force-sync');
  assert.equal(plan.blockedForce, undefined);
});

// ------------------------------------------------------------------------------
// Secuencia de IDs tras la siembra
// ------------------------------------------------------------------------------

test('🌱 SeedJob: sincroniza pokedex_id_seq después de insertar IDs explícitos', () => {
  const seedSource = fs.readFileSync(path.join(ROOT_DIR, 'apps/backend/src/seed.ts'), 'utf-8');
  const saveIndex = seedSource.indexOf('await savePokemon(');
  const syncIndex = seedSource.indexOf('await syncPokedexIdSequence()');
  assert.ok(saveIndex > 0 && syncIndex > saveIndex, 'seed.ts debe resincronizar la secuencia después de sembrar');
});

test('🌱 SeedJob: syncPokedexIdSequence es un no-op sin PostgreSQL conectado', async () => {
  await assert.doesNotReject(syncPokedexIdSequence());
});

// ------------------------------------------------------------------------------
// Helpers del generador
// ------------------------------------------------------------------------------

test('🌱 Generator: normaliza el flavor text y las categorías', () => {
  assert.equal(normalizeFlavorText('Lanza\fllamas\npor la­cola.'), 'Lanza llamas por la cola.');
  assert.equal(stripGenusPrefix('Pokémon Semilla'), 'Semilla');
  assert.equal(stripGenusSuffixEn('Big Horn Pokémon'), 'Big Horn');
});
