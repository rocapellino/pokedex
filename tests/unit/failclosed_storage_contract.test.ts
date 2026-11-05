import test from 'node:test';
import assert from 'node:assert/strict';
import { isPgConfigured, getDatabaseUrl, getPgSslConfig } from '../../apps/backend/src/services/postgres.js';
import { isRedisConfigured, getRedisUrl } from '../../apps/backend/src/services/cache.js';
import {
  getAllPokemons,
  getPokemonById,
  DatabaseUnavailableError,
} from '../../apps/backend/src/services/pokemon.repository.js';

test('🛡️ AUD-DB-FAILOPEN-001: isPgConfigured reconoce variables compuestas POSTGRES_*', () => {
  const prevUrl = process.env.DATABASE_URL;
  const prevHost = process.env.POSTGRES_HOST;
  const prevUser = process.env.POSTGRES_USER;
  const prevPass = process.env.POSTGRES_PASSWORD;
  const prevDb = process.env.POSTGRES_DB;

  try {
    delete process.env.DATABASE_URL;
    process.env.POSTGRES_HOST = 'postgres-svc';
    process.env.POSTGRES_USER = 'pokedex_user';
    process.env.POSTGRES_PASSWORD = 'secret_password';
    process.env.POSTGRES_DB = 'pokedex_db';

    assert.equal(
      isPgConfigured(),
      true,
      'Debe retornar true cuando las variables compuestas POSTGRES_* están presentes',
    );
    const dbUrl = getDatabaseUrl();
    assert.ok(dbUrl?.startsWith('postgresql://pokedex_user:secret_password@postgres-svc:5432/pokedex_db'));
  } finally {
    if (prevUrl) process.env.DATABASE_URL = prevUrl;
    else delete process.env.DATABASE_URL;
    if (prevHost) process.env.POSTGRES_HOST = prevHost;
    else delete process.env.POSTGRES_HOST;
    if (prevUser) process.env.POSTGRES_USER = prevUser;
    else delete process.env.POSTGRES_USER;
    if (prevPass) process.env.POSTGRES_PASSWORD = prevPass;
    else delete process.env.POSTGRES_PASSWORD;
    if (prevDb) process.env.POSTGRES_DB = prevDb;
    else delete process.env.POSTGRES_DB;
  }
});

test('🛡️ AUD-SEC-RLREDIS-001: isRedisConfigured reconoce REDIS_HOST además de REDIS_URL', () => {
  const prevUrl = process.env.REDIS_URL;
  const prevHost = process.env.REDIS_HOST;
  const prevPort = process.env.REDIS_PORT;

  try {
    delete process.env.REDIS_URL;
    process.env.REDIS_HOST = 'redis-cluster';
    process.env.REDIS_PORT = '6379';

    assert.equal(isRedisConfigured(), true, 'Debe retornar true cuando REDIS_HOST está configurado');
    const url = getRedisUrl();
    assert.equal(url, 'redis://redis-cluster:6379');
  } finally {
    if (prevUrl) process.env.REDIS_URL = prevUrl;
    else delete process.env.REDIS_URL;
    if (prevHost) process.env.REDIS_HOST = prevHost;
    else delete process.env.REDIS_HOST;
    if (prevPort) process.env.REDIS_PORT = prevPort;
    else delete process.env.REDIS_PORT;
  }
});

test('🛡️ AUD-DB-FAILOPEN-001: en producción getAllPokemons y getPokemonById fallan cerrado ante caída de BD', async () => {
  const prevEnv = process.env.NODE_ENV;
  const prevUrl = process.env.DATABASE_URL;

  try {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://user:pass@127.0.0.1:5432/pokedex';

    await assert.rejects(
      async () => {
        await getAllPokemons({ limit: 10 });
      },
      DatabaseUnavailableError,
      'getAllPokemons debe lanzar DatabaseUnavailableError en producción si la DB está configurada pero desconectada',
    );

    await assert.rejects(
      async () => {
        await getPokemonById(1);
      },
      DatabaseUnavailableError,
      'getPokemonById debe lanzar DatabaseUnavailableError en producción si la DB está configurada pero desconectada',
    );
  } finally {
    process.env.NODE_ENV = prevEnv;
    if (prevUrl) process.env.DATABASE_URL = prevUrl;
    else delete process.env.DATABASE_URL;
  }
});

test('🛡️ AUD-SEC-PGTLS-001: getPgSslConfig activa rejectUnauthorized: true por defecto en producción', () => {
  const prevEnv = process.env.NODE_ENV;
  const prevReject = process.env.DB_SSL_REJECT_UNAUTHORIZED;
  const prevSsl = process.env.DB_SSL;

  try {
    process.env.NODE_ENV = 'production';
    process.env.DB_SSL = 'true';
    delete process.env.DB_SSL_REJECT_UNAUTHORIZED;

    const sslConfig = getPgSslConfig('postgresql://user:pass@db.internal:5432/pokedex', process.env) as {
      rejectUnauthorized: boolean;
    };
    assert.ok(sslConfig, 'Debe retornar configuración SSL');
    assert.equal(sslConfig.rejectUnauthorized, true, 'rejectUnauthorized debe ser true por defecto para prevenir MiTM');
  } finally {
    process.env.NODE_ENV = prevEnv;
    if (prevReject) process.env.DB_SSL_REJECT_UNAUTHORIZED = prevReject;
    else delete process.env.DB_SSL_REJECT_UNAUTHORIZED;
    if (prevSsl) process.env.DB_SSL = prevSsl;
    else delete process.env.DB_SSL;
  }
});
