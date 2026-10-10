import { randomBytes } from 'node:crypto';
import pg from 'pg';

/**
 * Servicios reales (PostgreSQL y Redis) para las pruebas de integración de `tests/integration/db/`.
 *
 * Las suites son opt-in, igual que `RULESET_LIVE_CHECK`: sin las variables siguientes se omiten con un motivo
 * explícito y `npm test` sigue funcionando sin Docker. El job `sonarcloud` de CI (que ejecuta la suite con cobertura) las
 * define y levanta los servicios con las mismas imágenes (por digest) que `docker-compose.yaml`;
 * `tests/ci/db_integration_services.test.ts` impide que esa configuración se pierda sin que nadie lo note.
 *
 * Local, con las imágenes del compose (el puerto 55432 y el 56379 son arbitrarios):
 *
 *   docker run -d --rm --name pokedex-test-pg -e POSTGRES_PASSWORD=pokedex_test -p 55432:5432 postgres:16-alpine
 *   docker run -d --rm --name pokedex-test-redis -p 56379:6379 redis:7-alpine
 *   POKEDEX_TEST_DATABASE_URL=postgresql://postgres:pokedex_test@127.0.0.1:55432/postgres \
 *   POKEDEX_TEST_REDIS_URL=redis://127.0.0.1:56379 npm run test:integration:db
 *
 * Aislamiento: cada suite crea su propia base de datos (nombre aleatorio) y la elimina al terminar, así que
 * pueden correr en paralelo sobre el mismo servidor. Redis no admite eso: cada suite usa una base lógica
 * propia (`REDIS_SLOTS`) y no debe compartirla con otra.
 */

const ADMIN_DATABASE_URL = process.env.POKEDEX_TEST_DATABASE_URL;
const REDIS_BASE_URL = process.env.POKEDEX_TEST_REDIS_URL;

/** Valor para la opción `skip` de `describe`: `false` si hay PostgreSQL, o el motivo de la omisión. */
export const postgresSkip: string | false = ADMIN_DATABASE_URL
  ? false
  : 'requiere POKEDEX_TEST_DATABASE_URL (PostgreSQL real; lo define el job de CI)';

/** Valor para la opción `skip` de `describe`: `false` si hay Redis, o el motivo de la omisión. */
export const redisSkip: string | false = REDIS_BASE_URL
  ? false
  : 'requiere POKEDEX_TEST_REDIS_URL (Redis real; lo define el job de CI)';

/** Para las suites que necesitan ambos servicios a la vez. */
export const servicesSkip: string | false = postgresSkip || redisSkip;

/** Base lógica de Redis reservada por suite. Los números no pueden repetirse. */
export const REDIS_SLOTS = {
  cache: 1,
  repositoryCache: 2,
} as const;

export type RedisSlot = keyof typeof REDIS_SLOTS;

export function redisUrlFor(slot: RedisSlot): string {
  if (!REDIS_BASE_URL) throw new Error('POKEDEX_TEST_REDIS_URL no está definida');
  const url = new URL(REDIS_BASE_URL);
  url.pathname = `/${REDIS_SLOTS[slot]}`;
  return url.toString();
}

export interface TestDatabase {
  /** Cadena de conexión de la base recién creada. */
  url: string;
  /** Elimina la base, cerrando las conexiones que sigan abiertas. */
  drop: () => Promise<void>;
}

/** Crea una base de datos vacía con nombre aleatorio en el servidor de pruebas. */
export async function createTestDatabase(): Promise<TestDatabase> {
  if (!ADMIN_DATABASE_URL) throw new Error('POKEDEX_TEST_DATABASE_URL no está definida');
  // El nombre es hexadecimal generado aquí, por lo que puede interpolarse en el DDL sin riesgo de inyección.
  const name = `pokedex_t_${randomBytes(6).toString('hex')}`;
  const admin = new pg.Client({ connectionString: ADMIN_DATABASE_URL });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${name}`);
  } finally {
    await admin.end();
  }

  const url = new URL(ADMIN_DATABASE_URL);
  url.pathname = `/${name}`;
  return {
    url: url.toString(),
    drop: async () => {
      const cleaner = new pg.Client({ connectionString: ADMIN_DATABASE_URL });
      await cleaner.connect();
      try {
        await cleaner.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      } finally {
        await cleaner.end();
      }
    },
  };
}

/** Ejecuta una consulta puntual contra una base y devuelve las filas (para verificar el estado real). */
export async function queryRows<R extends Record<string, unknown> = Record<string, unknown>>(
  connectionString: string,
  text: string,
  params: unknown[] = [],
): Promise<R[]> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const result = await client.query(text, params);
    return result.rows as R[];
  } finally {
    await client.end();
  }
}
