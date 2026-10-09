import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { initialPokemons } from '../../../apps/backend/src/data/initialPokemons.js';
import {
  connectPg,
  closePg,
  getPostgresVersion,
  isPgConnectedStatus,
  syncPokedexIdSequence,
} from '../../../apps/backend/src/services/postgres.js';
import {
  deletePokemon,
  getAllPokemons,
  getNextPokemonId,
  getPokemonById,
  listPersistedClassifications,
  listPersistedMegaEvolutions,
  listPersistedPokemonIds,
  savePokemon,
  setPokemonClassification,
  setPokemonMegaEvolutions,
} from '../../../apps/backend/src/services/pokemon.repository.js';
import type { MegaEvolution, Pokemon } from '../../../apps/backend/src/types.js';
import { createTestDatabase, postgresSkip, queryRows, type TestDatabase } from '../../helpers/services.js';

const makePokemon = (id: number, overrides: Partial<Pokemon> = {}): Pokemon => ({
  id,
  nombre: `Probamon ${id}`,
  imagen: 'https://example.test/probamon.png',
  tipo: 'Fuego',
  caracteristicas: { peso: 5, altura: 1, fuerza: 40 },
  habilidades: ['Llama'],
  ...overrides,
});

const mega: MegaEvolution = {
  clave: 'probamon-mega',
  nombre: 'Mega Probamon',
  imagen: 'https://example.test/mega.png',
  tipos: ['Fuego'],
  habilidades: ['Llama mayor'],
  stats: { hp: 1, attack: 2, defense: 3, sp_attack: 4, sp_defense: 5, speed: 6 },
  peso: 9,
  altura: 2,
};

describe('🐘 Repositorio de Pokémon sobre PostgreSQL real', { skip: postgresSkip }, () => {
  let database: TestDatabase;
  const previousEnv = {
    DATABASE_URL: process.env.DATABASE_URL,
    POSTGRES_HOST: process.env.POSTGRES_HOST,
  };

  before(async () => {
    database = await createTestDatabase();
    process.env.DATABASE_URL = database.url;
    delete process.env.POSTGRES_HOST;
    assert.equal(await connectPg(), true, 'connectPg debe conectar y migrar la base vacía');
  });

  after(async () => {
    await closePg();
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await database.drop();
  });

  test('conectar migra la base y siembra el catálogo inicial', async () => {
    assert.equal(isPgConnectedStatus(), true);
    const [row] = await queryRows<{ total: string }>(
      database.url,
      'SELECT count(*)::text AS total FROM pokedex_entries',
    );
    assert.equal(row.total, String(initialPokemons.length));
    assert.match((await getPostgresVersion()) ?? '', /^PostgreSQL 16/);
  });

  test('getAllPokemons pagina en orden de id y reporta el total real', async () => {
    const firstPage = await getAllPokemons({ limit: 5, offset: 0 });
    assert.equal(firstPage.total, initialPokemons.length);
    assert.equal(firstPage.pokemons.length, 5);
    const ids = firstPage.pokemons.map((p) => p.id);
    assert.deepEqual(
      ids,
      [...ids].sort((a, b) => a - b),
    );

    const secondPage = await getAllPokemons({ limit: 5, offset: 5 });
    assert.ok(Math.min(...secondPage.pokemons.map((p) => p.id)) > Math.max(...ids), 'las páginas no se solapan');

    const beyond = await getAllPokemons({ limit: 5, offset: initialPokemons.length + 100 });
    assert.deepEqual(beyond.pokemons, []);
    assert.equal(beyond.total, initialPokemons.length, 'el total no depende de la página pedida');
  });

  test('el listado se ordena por id aunque las filas se hayan insertado en otro orden', async () => {
    // Sin ORDER BY, PostgreSQL devuelve las filas en el orden físico de inserción: aquí, 6002 antes que 6001.
    await savePokemon(makePokemon(6002, { nombre: 'Ordenmon B', tipo: 'Sinclasificar' }));
    await savePokemon(makePokemon(6001, { nombre: 'Ordenmon A', tipo: 'Sinclasificar' }));

    const { pokemons } = await getAllPokemons({ search: 'Ordenmon' });
    assert.deepEqual(
      pokemons.map((p) => p.id),
      [6001, 6002],
    );
  });

  test('el filtro por tipo ignora mayúsculas y el de búsqueda acepta fragmentos del nombre', async () => {
    const sample = initialPokemons[0];
    const expectedByType = initialPokemons.filter((p) => p.tipo.toLowerCase() === sample.tipo.toLowerCase()).length;

    const byType = await getAllPokemons({ type: sample.tipo.toUpperCase(), limit: 2000 });
    assert.equal(byType.total, expectedByType);
    assert.ok(byType.pokemons.every((p) => p.tipo.toLowerCase() === sample.tipo.toLowerCase()));

    const fragment = sample.nombre.slice(1, 4);
    const bySearch = await getAllPokemons({ search: fragment.toUpperCase(), limit: 2000 });
    assert.ok(bySearch.pokemons.some((p) => p.id === sample.id));
    assert.ok(bySearch.pokemons.every((p) => p.nombre.toLowerCase().includes(fragment.toLowerCase())));

    const combined = await getAllPokemons({ type: sample.tipo, search: sample.nombre, limit: 2000 });
    assert.ok(combined.pokemons.some((p) => p.id === sample.id));
    assert.ok(combined.total <= Math.min(byType.total, bySearch.total), 'ambos filtros se combinan con AND');

    const none = await getAllPokemons({ search: 'zzz-no-existe-zzz' });
    assert.deepEqual(none, { total: 0, pokemons: [] });
  });

  test('savePokemon inserta y luego actualiza la misma fila (upsert) en la base', async () => {
    await savePokemon(makePokemon(5001));
    let rows = await queryRows<{ nombre: string; tipo: string; nombre_json: string }>(
      database.url,
      "SELECT nombre, tipo, data->>'nombre' AS nombre_json FROM pokedex_entries WHERE id = 5001",
    );
    assert.deepEqual(rows, [{ nombre: 'Probamon 5001', tipo: 'Fuego', nombre_json: 'Probamon 5001' }]);

    await savePokemon(makePokemon(5001, { nombre: 'Renombrado', tipo: 'Agua' }));
    rows = await queryRows(
      database.url,
      "SELECT nombre, tipo, data->>'nombre' AS nombre_json FROM pokedex_entries WHERE id = 5001",
    );
    assert.deepEqual(rows, [{ nombre: 'Renombrado', tipo: 'Agua', nombre_json: 'Renombrado' }]);

    assert.equal((await getPokemonById(5001))?.nombre, 'Renombrado');
  });

  test('deletePokemon borra la fila y devuelve false si ya no existe', async () => {
    await savePokemon(makePokemon(5002));
    assert.equal(await deletePokemon(5002), true);
    assert.equal(await deletePokemon(5002), false);
    assert.equal(await getPokemonById(5002), null);
    assert.deepEqual(await queryRows(database.url, 'SELECT id FROM pokedex_entries WHERE id = 5002'), []);
  });

  test('getNextPokemonId usa la secuencia y syncPokedexIdSequence la alinea con los IDs explícitos', async () => {
    const first = await getNextPokemonId();
    const second = await getNextPokemonId();
    assert.ok(first > 1008, 'los IDs nuevos van después del catálogo inicial');
    assert.equal(second, first + 1);

    // El seed job inserta IDs explícitos por encima de la secuencia: sin sincronizar, el siguiente colisionaría.
    await savePokemon(makePokemon(7000));
    await syncPokedexIdSequence();
    assert.ok((await getNextPokemonId()) > 7000);
  });

  test('las megaevoluciones y la clasificación se fijan con jsonb_set sin pisar el resto de la entrada', async () => {
    await savePokemon(makePokemon(5003, { habilidades: ['Intacta'] }));

    assert.equal(await setPokemonMegaEvolutions(5003, [mega]), true);
    assert.equal(await setPokemonClassification(5003, 'mitico'), true);

    const [row] = await queryRows<{ data: Pokemon }>(database.url, 'SELECT data FROM pokedex_entries WHERE id = 5003');
    assert.equal(row.data.nombre, 'Probamon 5003');
    assert.deepEqual(row.data.habilidades, ['Intacta'], 'los demás campos se conservan');
    assert.deepEqual(row.data.megaevoluciones, [mega]);
    assert.equal(row.data.clasificacion, 'mitico');

    assert.deepEqual((await listPersistedMegaEvolutions()).get(5003), [mega]);
    assert.equal((await listPersistedClassifications()).get(5003), 'mitico');
    assert.ok((await listPersistedPokemonIds()).has(5003));

    assert.equal(await setPokemonMegaEvolutions(9_999_999, [mega]), false);
    assert.equal(await setPokemonClassification(9_999_999, 'legendario'), false);
  });

  test('sin conexión y con DATABASE_URL configurada, las escrituras fallan cerradas', async () => {
    await closePg();
    assert.equal(isPgConnectedStatus(), false);

    await assert.rejects(savePokemon(makePokemon(5004)), /PostgreSQL\) no disponible para escritura/);
    await assert.rejects(deletePokemon(1), /no disponible para eliminación/);
    await assert.rejects(setPokemonClassification(1, 'legendario'), /no disponible para escritura/);
  });
});
