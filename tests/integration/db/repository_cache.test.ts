import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Pokemon } from '../../../apps/backend/src/types.js';
import { createTestDatabase, queryRows, redisUrlFor, servicesSkip, type TestDatabase } from '../../helpers/services.js';

type Postgres = typeof import('../../../apps/backend/src/services/postgres.js');
type Cache = typeof import('../../../apps/backend/src/services/cache.js');
type Repository = typeof import('../../../apps/backend/src/services/pokemon.repository.js');

const makePokemon = (id: number, overrides: Partial<Pokemon> = {}): Pokemon => ({
  id,
  nombre: `Cachemon ${id}`,
  imagen: 'https://example.test/cachemon.png',
  tipo: 'Planta',
  caracteristicas: { peso: 3, altura: 1, fuerza: 30 },
  habilidades: ['Latigazo'],
  ...overrides,
});

describe('🔁 Repositorio con PostgreSQL y caché Redis reales', { skip: servicesSkip }, () => {
  let database: TestDatabase;
  let postgres: Postgres;
  let cache: Cache;
  let repository: Repository;
  const previousEnv = {
    DATABASE_URL: process.env.DATABASE_URL,
    POSTGRES_HOST: process.env.POSTGRES_HOST,
    REDIS_URL: process.env.REDIS_URL,
  };

  /** Cambia la base a espaldas del repositorio, como lo haría otro pod o el seed job. */
  const renameBehindTheBack = (id: number, nombre: string) =>
    queryRows(
      database.url,
      "UPDATE pokedex_entries SET nombre = $2::varchar, data = jsonb_set(data, '{nombre}', to_jsonb($2::varchar)) WHERE id = $1",
      [id, nombre],
    );

  before(async () => {
    database = await createTestDatabase();
    process.env.DATABASE_URL = database.url;
    delete process.env.POSTGRES_HOST;
    // cache.ts lee REDIS_URL al cargarse: se fija antes de importar cualquier módulo del backend.
    process.env.REDIS_URL = redisUrlFor('repositoryCache');
    postgres = await import('../../../apps/backend/src/services/postgres.js');
    cache = await import('../../../apps/backend/src/services/cache.js');
    repository = await import('../../../apps/backend/src/services/pokemon.repository.js');

    assert.equal(await cache.connectRedis(), true);
    assert.equal(await postgres.connectPg(), true);
    await cache.getRedisClient()?.flushdb();
  });

  after(async () => {
    await cache.getRedisClient()?.flushdb();
    await cache.closeRedis();
    await postgres.closePg();
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await database.drop();
  });

  test('el listado se sirve de la caché hasta que una escritura la invalida', async () => {
    await repository.savePokemon(makePokemon(5101));
    const options = { search: 'Cachemon 5101', limit: 10 };

    const first = await repository.getAllPokemons(options);
    assert.equal(first.pokemons[0]?.nombre, 'Cachemon 5101');

    const version = (await cache.getRedisClient()?.get('pokedex:list_version')) ?? '1';
    const cacheKey = `pokedex:list:v${version}:all:cachemon 5101:10:0`;
    // setex del repositorio es asíncrono y no se espera: se aguarda a que la clave aparezca.
    await waitFor(async () => (await cache.getRedisClient()?.exists(cacheKey)) === 1, 'la clave del listado en Redis');
    const ttl = (await cache.getRedisClient()?.ttl(cacheKey)) ?? 0;
    assert.ok(ttl > 0 && ttl <= 60, `el listado se cachea 60 s como máximo (TTL ${ttl})`);

    await renameBehindTheBack(5101, 'Cachemon 5101 editado');
    const cached = await repository.getAllPokemons(options);
    assert.equal(cached.pokemons[0]?.nombre, 'Cachemon 5101', 'mientras no se invalide, se sirve la copia en caché');

    await repository.savePokemon(makePokemon(5102));
    const fresh = await repository.getAllPokemons({ search: 'Cachemon 5101', limit: 10 });
    assert.equal(
      fresh.pokemons[0]?.nombre,
      'Cachemon 5101 editado',
      'guardar otro ítem avanza la versión y fuerza a releer',
    );
  });

  test('un ítem se cachea al leerlo y borrarlo o guardarlo lo desaloja', async () => {
    await repository.savePokemon(makePokemon(5103));
    const redis = cache.getRedisClient();
    assert.ok(redis);

    assert.equal((await repository.getPokemonById(5103))?.nombre, 'Cachemon 5103');
    await waitFor(async () => (await redis.exists('pokedex:item:5103')) === 1, 'la clave del ítem en Redis');
    const ttl = await redis.ttl('pokedex:item:5103');
    assert.ok(ttl > 60 && ttl <= 300, `el ítem se cachea 5 min como máximo (TTL ${ttl})`);

    await renameBehindTheBack(5103, 'Editado fuera');
    assert.equal((await repository.getPokemonById(5103))?.nombre, 'Cachemon 5103', 'copia en caché');

    await repository.savePokemon(makePokemon(5103, { nombre: 'Guardado de nuevo' }));
    assert.equal(await redis.exists('pokedex:item:5103'), 0, 'guardar desaloja la clave del ítem');
    assert.equal((await repository.getPokemonById(5103))?.nombre, 'Guardado de nuevo');

    assert.equal(await repository.deletePokemon(5103), true);
    assert.equal(await redis.exists('pokedex:item:5103'), 0, 'borrar desaloja la clave del ítem');
    assert.equal(await repository.getPokemonById(5103), null);
  });

  test('si Redis se cae, el repositorio sigue sirviendo desde PostgreSQL', async () => {
    await repository.savePokemon(makePokemon(5104));
    await cache.closeRedis();

    assert.equal(cache.isCacheConnected(), false);
    assert.equal((await repository.getPokemonById(5104))?.nombre, 'Cachemon 5104');
    const list = await repository.getAllPokemons({ search: 'Cachemon 5104' });
    assert.equal(list.total, 1);
    await assert.doesNotReject(repository.savePokemon(makePokemon(5104, { nombre: 'Sin caché' })));
    assert.equal((await repository.getPokemonById(5104))?.nombre, 'Sin caché');
  });
});

async function waitFor(condition: () => Promise<boolean>, what: string, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(`${what} no apareció en ${timeoutMs} ms`);
}
