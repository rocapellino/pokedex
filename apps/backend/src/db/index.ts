import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type pg from 'pg';
import * as schema from './schema.js';

export * from './schema.js';
export { runMigrations } from './migrate.js';

export type AppDatabase = NodePgDatabase<typeof schema>;

/**
 * Opciones de inicialización para Drizzle ORM sobre Node-Postgres.
 * En modo transacción de PgBouncer (pool_mode=transaction), las sentencias
 * preparadas persistentes entre transacciones no son seguras. Drizzle ejecuta
 * consultas parametrizadas ad-hoc transparentes sin registrar sentencias preparadas de sesión.
 */
export interface DrizzleClientOptions {
  logger?: boolean;
}

export function createDrizzleClient(pool: pg.Pool, options?: DrizzleClientOptions): AppDatabase {
  return drizzle(pool, { schema, logger: options?.logger });
}
