import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { redisSkip, redisUrlFor } from '../../helpers/services.js';

type CacheModule = typeof import('../../../apps/backend/src/services/cache.js');

describe('🟥 Caché y coordinación distribuida sobre Redis real', { skip: redisSkip }, () => {
  let cache: CacheModule;
  const previousRedisUrl = process.env.REDIS_URL;

  before(async () => {
    // El módulo lee REDIS_URL al cargarse: hay que fijarla antes del import dinámico.
    process.env.REDIS_URL = redisUrlFor('cache');
    cache = await import('../../../apps/backend/src/services/cache.js');
    assert.equal(await cache.connectRedis(), true, 'connectRedis debe responder al ping');
    await cache.getRedisClient()?.flushdb();
  });

  after(async () => {
    await cache.getRedisClient()?.flushdb();
    await cache.closeRedis();
    if (previousRedisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = previousRedisUrl;
  });

  test('conectar deja el cliente disponible y cerrar lo retira', async () => {
    assert.equal(cache.isCacheConnected(), true);
    assert.ok(cache.getRedisClient());
  });

  test('un jti revocado se reconoce, caduca con su TTL y uno desconocido figura como válido', async () => {
    assert.equal(await cache.isJtiRevokedInRedis('jti-desconocido'), false);

    assert.equal(await cache.setRevokedJti('jti-revocado', 30), true);
    assert.equal(await cache.isJtiRevokedInRedis('jti-revocado'), true);
    const ttl = await cache.getRedisClient()?.ttl('revoked:jti-revocado');
    assert.ok(ttl !== undefined && ttl > 0 && ttl <= 30, `el TTL debe ser positivo y no superar 30 s (fue ${ttl})`);

    // Un TTL no positivo no puede dejar la clave sin caducidad: se fuerza a 1 s como mínimo.
    assert.equal(await cache.setRevokedJti('jti-ttl-cero', 0), true);
    assert.equal(await cache.getRedisClient()?.ttl('revoked:jti-ttl-cero'), 1);

    assert.equal(await cache.setRevokedJti('', 30), false, 'un jti vacío no se registra');
  });

  test('el limitador distribuido cuenta, rechaza al superar el límite y fija la ventana', async () => {
    const key = 'test:limitador';
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await cache.consumeDistributedRateLimit(key, 3, 60_000));

    assert.deepEqual(
      results.map((r) => r?.allowed),
      [true, true, true, false],
    );
    assert.deepEqual(
      results.map((r) => r?.remaining),
      [2, 1, 0, 0],
    );
    assert.ok((results[3]?.retryAfterSeconds ?? 0) > 0 && (results[3]?.retryAfterSeconds ?? 0) <= 60);

    const pttl = await cache.getRedisClient()?.pttl(`ratelimit:${key}`);
    assert.ok(pttl !== undefined && pttl > 0 && pttl <= 60_000, 'la ventana debe tener caducidad');

    const other = await cache.consumeDistributedRateLimit('test:otro-cliente', 3, 60_000);
    assert.equal(other?.allowed, true, 'cada clave lleva su propio contador');
  });

  test('invalidateCache borra la clave del ítem y avanza la versión de los listados', async () => {
    const redis = cache.getRedisClient();
    assert.ok(redis);
    await redis.set('pokedex:item:42', '{"id":42}');
    await redis.del('pokedex:list_version');

    await cache.invalidateCache(42);
    assert.equal(await redis.exists('pokedex:item:42'), 0);
    assert.equal(await redis.get('pokedex:list_version'), '1');

    await cache.invalidateCache();
    assert.equal(await redis.get('pokedex:list_version'), '2', 'sin id solo avanza la versión');
  });

  test('tras cerrar la conexión las operaciones degradan sin lanzar', async () => {
    await cache.closeRedis();

    assert.equal(cache.isCacheConnected(), false);
    assert.equal(cache.getRedisClient(), null);
    assert.equal(
      await cache.consumeDistributedRateLimit('x', 1, 1000),
      null,
      'señala al llamador usar la ventana local',
    );
    assert.equal(
      await cache.isJtiRevokedInRedis('x'),
      null,
      'null indica que no se puede afirmar nada (fail-closed arriba)',
    );
    assert.equal(await cache.setRevokedJti('x', 10), false);
    await assert.doesNotReject(cache.invalidateCache(1));

    assert.equal(await cache.connectRedis(), true, 'la conexión puede restablecerse');
  });
});
