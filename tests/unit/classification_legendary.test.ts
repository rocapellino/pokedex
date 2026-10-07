import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyPokemonUpdates, buildPokemonFromPayload } from '../../apps/backend/src/controllers/pokemon-mapper.js';
import { initialPokemons } from '../../apps/backend/src/data/initialPokemons.js';
import { loadSeedCatalog, planClassificationEnrichment } from '../../apps/backend/src/data/seed-catalog.js';
import {
  getPokemonById,
  listPersistedClassifications,
  savePokemon,
  setPokemonClassification,
} from '../../apps/backend/src/services/pokemon.repository.js';
import {
  assertCatalogValid,
  classificationOf,
  enrichCatalogWithClassification,
  type PokeApiLike,
} from '../../scripts/generate-pokemon-catalog.js';
import type { Pokemon } from '../../apps/backend/src/types.js';

const entry = (id: number, extra: Partial<Pokemon> = {}): Pokemon => ({
  id,
  nombre: `Mon${id}`,
  imagen: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/6.png',
  tipo: 'Psíquico',
  caracteristicas: { peso: 1, altura: 1, fuerza: 50 },
  habilidades: ['A'],
  ...extra,
});

const full = loadSeedCatalog('full');

// ---- Generador -------------------------------------------------------------------------------

test('🌟 Generador: classificationOf distingue legendario, mítico y ninguno (el mítico prevalece)', () => {
  assert.equal(classificationOf({ is_legendary: true, is_mythical: false }), 'legendario');
  assert.equal(classificationOf({ is_legendary: false, is_mythical: true }), 'mitico');
  assert.equal(classificationOf({ is_legendary: true, is_mythical: true }), 'mitico');
  assert.equal(classificationOf({ is_legendary: false, is_mythical: false }), undefined);
  assert.equal(classificationOf({}), undefined);
});

test('🌟 Generador: enrichCatalogWithClassification añade el campo solo a quien aplica y corrige valores previos', async () => {
  const flags: Record<number, { is_legendary: boolean; is_mythical: boolean }> = {
    1: { is_legendary: false, is_mythical: false },
    2: { is_legendary: true, is_mythical: false },
    3: { is_legendary: false, is_mythical: true },
    4: { is_legendary: false, is_mythical: false },
  };
  const api: PokeApiLike = {
    async get<T>(url: string): Promise<T> {
      const id = Number(url.split('/').pop());
      return { id, ...flags[id] } as T;
    },
  };
  const catalog = [entry(1), entry(2), entry(3), entry(4, { clasificacion: 'legendario' })];

  const enriched = await enrichCatalogWithClassification(catalog, api);

  assert.deepEqual(
    enriched.map((e) => e.clasificacion),
    [undefined, 'legendario', 'mitico', undefined],
  );
  assert.equal('clasificacion' in enriched[0], false, 'las especies normales salen sin el campo');
  assert.equal('clasificacion' in enriched[3], false, 'un valor obsoleto se retira');
  assert.equal(enriched[1].nombre, 'Mon2', 'el resto de la entrada no se toca');
  assert.equal(catalog[3].clasificacion, 'legendario', 'la entrada original no se muta');
});

test('🌟 Generador: assertCatalogValid rechaza una clasificación desconocida', () => {
  assert.throws(
    () => assertCatalogValid([entry(1, { clasificacion: 'raro' as never })]),
    /clasificación inválida \(raro\)/,
  );
  assert.doesNotThrow(() => assertCatalogValid([entry(1, { clasificacion: 'mitico' })]));
});

// ---- Catálogo versionado ---------------------------------------------------------------------

test('🌟 Catálogo: clasifica a los legendarios y míticos conocidos y no a los demás', () => {
  const byId = new Map(full.map((e) => [e.id, e.clasificacion]));

  for (const id of [144, 145, 146, 150, 249, 250, 384, 483, 487, 643, 644, 716, 717, 888, 889, 1007, 1008]) {
    assert.equal(byId.get(id), 'legendario', `#${id}`);
  }
  for (const id of [151, 251, 385, 489, 490, 491, 492, 493, 494, 647, 648, 649, 719, 720, 721, 807, 1025]) {
    assert.equal(byId.get(id), 'mitico', `#${id}`);
  }
  for (const id of [1, 6, 25, 133, 143, 149, 248, 373, 445]) {
    assert.equal(byId.get(id), undefined, `#${id}`);
  }
});

test('🌟 Catálogo: solo usa valores válidos y reparte un número razonable de cada clase', () => {
  const classes = full.map((e) => e.clasificacion).filter(Boolean);
  assert.ok(classes.every((c) => c === 'legendario' || c === 'mitico'));
  assert.ok(classes.filter((c) => c === 'legendario').length >= 60);
  assert.ok(classes.filter((c) => c === 'mitico').length >= 20);
  assert.equal(full.length, 1025, 'el catálogo sigue siendo de 1025 especies');
});

test('🌟 Catálogo: la muestra de desarrollo coincide con el catálogo completo', () => {
  const fullById = new Map(full.map((e) => [e.id, e.clasificacion]));
  for (const p of initialPokemons) {
    assert.equal(p.clasificacion, fullById.get(p.id), `#${p.id} ${p.nombre}`);
  }
  assert.ok(initialPokemons.some((p) => p.clasificacion === 'legendario'));
});

// ---- Seed ------------------------------------------------------------------------------------

test('🌟 Seed: planClassificationEnrichment actualiza solo filas existentes que no la tienen', () => {
  const catalog = [entry(150, { clasificacion: 'legendario' }), entry(151, { clasificacion: 'mitico' }), entry(25)];
  const plan = planClassificationEnrichment(catalog, new Map(), new Set([150, 151, 25]));

  assert.deepEqual(plan, [
    { id: 150, clasificacion: 'legendario' },
    { id: 151, clasificacion: 'mitico' },
  ]);
});

test('🌟 Seed: es idempotente, corrige valores distintos e ignora entradas no persistidas', () => {
  const catalog = [entry(150, { clasificacion: 'legendario' }), entry(151, { clasificacion: 'mitico' })];

  assert.deepEqual(planClassificationEnrichment(catalog, new Map([[150, 'legendario']]), new Set([150])), []);
  assert.deepEqual(planClassificationEnrichment(catalog, new Map([[151, 'legendario']]), new Set([151])), [
    { id: 151, clasificacion: 'mitico' },
  ]);
  assert.deepEqual(planClassificationEnrichment(catalog, new Map(), new Set()), []);
});

test('🌟 Seed: no borra una clasificación persistida si el catálogo no trae ninguna', () => {
  assert.deepEqual(planClassificationEnrichment([entry(150)], new Map([[150, 'legendario']]), new Set([150])), []);
});

// ---- Repositorio -----------------------------------------------------------------------------

test('🌟 Repositorio: setPokemonClassification modifica solo ese campo y conserva las ediciones', async () => {
  const id = 881001;
  await savePokemon(entry(id, { nombre: 'Editado por el admin', fuerza: 99 }));

  assert.equal(await setPokemonClassification(id, 'legendario'), true);
  const stored = await getPokemonById(id);

  assert.equal(stored?.clasificacion, 'legendario');
  assert.equal(stored?.nombre, 'Editado por el admin');
  assert.equal(stored?.fuerza, 99);
});

test('🌟 Repositorio: setPokemonClassification devuelve false si la entrada no existe', async () => {
  assert.equal(await setPokemonClassification(881999, 'mitico'), false);
});

test('🌟 Repositorio: listPersistedClassifications devuelve solo las entradas clasificadas', async () => {
  await savePokemon(entry(881002, { clasificacion: 'mitico' }));
  await savePokemon(entry(881003));

  const persisted = await listPersistedClassifications();

  assert.equal(persisted.get(881002), 'mitico');
  assert.equal(persisted.has(881003), false);
});

// ---- Mapper / API ----------------------------------------------------------------------------

test('🌟 API: editar un Pokémon conserva su clasificación y el cliente no puede cambiarla', () => {
  const existing = entry(150, { clasificacion: 'legendario', tipos: ['Psíquico'] });

  assert.equal(applyPokemonUpdates(existing, { nombre: 'Mewtwo Editado' }).clasificacion, 'legendario');
  assert.equal(applyPokemonUpdates(existing, { clasificacion: 'mitico' }).clasificacion, 'legendario');
  assert.equal('clasificacion' in applyPokemonUpdates(entry(25), { clasificacion: 'mitico' }), false);
});

test('🌟 API: crear un Pokémon ignora una clasificación enviada por el cliente', () => {
  const created = buildPokemonFromPayload(999, {
    nombre: 'Falso Legendario',
    tipo: 'Psíquico',
    clasificacion: 'legendario',
  });
  assert.equal(created.nombre, 'Falso Legendario');
  assert.equal(created.clasificacion, undefined);
});
