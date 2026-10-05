import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  connectRedis,
  closeRedis,
  isCacheConnected,
  getRedisClient,
  invalidateCache,
  consumeDistributedRateLimit,
  setRevokedJti,
  isJtiRevokedInRedis,
} from '../../apps/backend/src/services/cache.js';

test('⚡ CacheService [Unit]: estado desconectado por defecto y no-op seguro', async () => {
  // Aseguramos estado cerrado
  await closeRedis();

  assert.equal(isCacheConnected(), false);
  assert.equal(getRedisClient(), null);

  // InvalidateCache no debe lanzar excepciones sin conexión
  await assert.doesNotReject(async () => {
    await invalidateCache();
    await invalidateCache(25);
  });
});

test('⚡ CacheService [Unit]: rate limiter distribuido retorna null (fallback) sin Redis', async () => {
  await closeRedis();

  const rateLimitResult = await consumeDistributedRateLimit('192.168.1.100', 10, 60000);
  assert.equal(rateLimitResult, null, 'Debe retornar null para que el middleware use rate limit en memoria');
});

test('⚡ CacheService [Unit]: operaciones de revocación de JTI retornan falsy/null sin conexión', async () => {
  await closeRedis();

  // setRevokedJti retorna false
  const setResult = await setRevokedJti('0123456789abcdef0123456789abcdef', 3600);
  assert.equal(setResult, false);

  // jti vacío retorna false de inmediato
  const emptySetResult = await setRevokedJti('', 3600);
  assert.equal(emptySetResult, false);

  // isJtiRevokedInRedis retorna null (indica que Redis no está disponible)
  const isRevokedResult = await isJtiRevokedInRedis('0123456789abcdef0123456789abcdef');
  assert.equal(isRevokedResult, null);

  // jti vacío retorna null
  const emptyRevokedResult = await isJtiRevokedInRedis('');
  assert.equal(emptyRevokedResult, null);
});

test('⚡ CacheService [Unit]: connectRedis sin variables de entorno retorna false inmediatamente', async () => {
  const origUrl = process.env.REDIS_URL;
  const origHost = process.env.REDIS_HOST;

  try {
    delete process.env.REDIS_URL;
    delete process.env.REDIS_HOST;

    const connected = await connectRedis();
    assert.equal(connected, false);
    assert.equal(isCacheConnected(), false);
  } finally {
    if (origUrl) process.env.REDIS_URL = origUrl;
    if (origHost) process.env.REDIS_HOST = origHost;
  }
});

test('⚡ CacheService [Unit]: closeRedis es idempotente y seguro ante invocaciones repetidas', async () => {
  await assert.doesNotReject(async () => {
    await closeRedis();
    await closeRedis();
    await closeRedis();
  });
  assert.equal(isCacheConnected(), false);
  assert.equal(getRedisClient(), null);
});
