import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  LEGACY_SAMPLE_TEXTS,
  loadSeedCatalog,
  planSampleTextAlignment,
  planSeed,
  resolveSeedDataset,
  PRODUCTION_FORCE_SEED_TOKEN,
} from '../../apps/backend/src/data/seed-catalog.js';
import { initialPokemons } from '../../apps/backend/src/data/initialPokemons.js';
import {
  getPokemonById,
  listPersistedSampleTexts,
  savePokemon,
  setPokemonSampleTexts,
} from '../../apps/backend/src/services/pokemon.repository.js';
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
import { ROOT_DIR } from '../helpers/repo.js';

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
    assert.ok(
      nodes.some((n) => n.id === entry.id),
      `#${entry.id} debe figurar en su propia cadena`,
    );
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
  assert.deepEqual(
    plan.toSeed.map((p) => p.id),
    [tiny[1].id, tiny[2].id],
  );
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

// ------------------------------------------------------------------------------
// Alineación de textos entre la muestra y el catálogo completo
// ------------------------------------------------------------------------------

test('🌱 SeedCatalog: la muestra coincide con el catálogo completo en descripción, categoría y habilidades en español', () => {
  const fullById = new Map(fullCatalog.map((p) => [p.id, p]));
  for (const sample of initialPokemons) {
    const target = fullById.get(sample.id);
    assert.ok(target, `#${sample.id} debe existir en el catálogo completo`);
    assert.equal(
      sample.caracteristicas.descripcion,
      target.caracteristicas.descripcion,
      `#${sample.id} ${sample.nombre} descripción desalineada`,
    );
    assert.equal(
      sample.caracteristicas.categoria,
      target.caracteristicas.categoria,
      `#${sample.id} ${sample.nombre} categoría desalineada`,
    );
    assert.deepEqual(sample.habilidades, target.habilidades, `#${sample.id} ${sample.nombre} habilidades desalineadas`);
    assert.doesNotMatch(
      target.caracteristicas.categoria ?? '',
      /^(Grass Cat|Paradox)$/,
      `#${sample.id} ${sample.nombre} no debe caer a categoría en inglés`,
    );
    assert.doesNotMatch(
      target.caracteristicas.descripcion ?? '',
      /\b(the sweet scent|this pokémon resembles|this seems to be the iron serpent)\b/i,
      `#${sample.id} ${sample.nombre} no debe caer a descripción en inglés`,
    );
  }
});

test('🌱 SeedAlign: planSampleTextAlignment actualiza solo campos con valor heredado y respeta ediciones manuales', () => {
  const persisted = new Map([
    [
      1,
      {
        descripcion: LEGACY_SAMPLE_TEXTS.get(1)?.descripcion?.[0],
        categoria: 'Semilla',
        habilidades: ['Espesura', 'Clorofila'],
      },
    ],
    [
      25,
      {
        descripcion: 'Descripción editada manualmente en el backoffice',
        categoria: 'Ratón',
        habilidades: LEGACY_SAMPLE_TEXTS.get(25)?.habilidades?.[0]
          ? [...(LEGACY_SAMPLE_TEXTS.get(25)?.habilidades?.[0] ?? [])]
          : [],
      },
    ],
    [
      1007,
      {
        descripcion: LEGACY_SAMPLE_TEXTS.get(1007)?.descripcion?.[0],
        categoria: LEGACY_SAMPLE_TEXTS.get(1007)?.categoria?.[0],
        habilidades: ['Latido paleo'],
      },
    ],
  ]);

  const plan = planSampleTextAlignment(fullCatalog, persisted, new Set([1, 25, 1007]));
  const byId = new Map(plan.map((item) => [item.id, item]));

  // #1 Bulbasaur: solo cambió la descripción heredada
  assert.equal(
    byId.get(1)?.descripcion,
    'Desde que nace, crece alimentándose de los nutrientes que contiene la semilla de su lomo.',
  );
  assert.equal(byId.get(1)?.categoria, undefined);
  assert.equal(byId.get(1)?.habilidades, undefined);

  // #25 Pikachu: descripción editada a mano se conserva (undefined en el plan); habilidades heredadas sí se alinean
  assert.equal(byId.get(25)?.descripcion, undefined);
  assert.deepEqual(byId.get(25)?.habilidades, ['Electricidad Estática', 'Pararrayos']);

  // #1007 Koraidon: corrige tanto fallback en inglés como habilidad heredada
  assert.equal(byId.get(1007)?.categoria, 'Paradoja');
  assert.match(byId.get(1007)?.descripcion ?? '', /Rey Alado/);
  assert.deepEqual(byId.get(1007)?.habilidades, ['Latido Oricalco']);
});

test('🌱 SeedAlign: es idempotente sobre el catálogo ya alineado e ignora IDs no persistidos', () => {
  const alreadyAligned = new Map(
    initialPokemons.map((p) => [
      p.id,
      {
        descripcion: p.caracteristicas.descripcion,
        categoria: p.caracteristicas.categoria,
        habilidades: p.habilidades,
      },
    ]),
  );
  const existingIds = new Set(initialPokemons.map((p) => p.id));

  assert.deepEqual(planSampleTextAlignment(fullCatalog, alreadyAligned, existingIds), []);
  assert.deepEqual(
    planSampleTextAlignment(
      fullCatalog,
      new Map([[1, { descripcion: LEGACY_SAMPLE_TEXTS.get(1)?.descripcion?.[0] }]]),
      new Set(),
    ),
    [],
  );
});

test('🌱 Repositorio: setPokemonSampleTexts modifica solo los campos indicados y conserva las ediciones', async () => {
  const id = 882001;
  await savePokemon({
    id,
    nombre: 'Bulbasaur Editado',
    imagen: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/1.png',
    tipo: 'Planta',
    fuerza: 77,
    caracteristicas: {
      peso: 6.9,
      altura: 0.7,
      fuerza: 77,
      categoria: 'Categoría previa',
      descripcion: 'Descripción previa',
    },
    habilidades: ['Habilidad previa'],
  });

  const updated = await setPokemonSampleTexts({
    id,
    descripcion: 'Descripción canónica',
    habilidades: ['Espesura', 'Clorofila'],
  });
  const stored = await getPokemonById(id);
  const snapshot = (await listPersistedSampleTexts()).get(id);

  assert.equal(updated, true);
  assert.equal(stored?.nombre, 'Bulbasaur Editado');
  assert.equal(stored?.fuerza, 77);
  assert.equal(stored?.caracteristicas.categoria, 'Categoría previa', 'la categoría no incluida no se toca');
  assert.equal(stored?.caracteristicas.descripcion, 'Descripción canónica');
  assert.deepEqual(stored?.habilidades, ['Espesura', 'Clorofila']);
  assert.deepEqual(snapshot, {
    descripcion: 'Descripción canónica',
    categoria: 'Categoría previa',
    habilidades: ['Espesura', 'Clorofila'],
  });

  assert.equal(await setPokemonSampleTexts({ id: 882999, descripcion: 'No existe' }), false);
  assert.equal(await setPokemonSampleTexts({ id }), false);
});
