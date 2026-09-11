import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import type pg from 'pg';
import * as schema from './schema.js';

export * from './schema.js';
export { runMigrations } from './migrate.js';

export type AppDatabase = NodePgDatabase<typeof schema>;

export function createDrizzleClient(pool: pg.Pool): AppDatabase {
  return drizzle(pool, { schema });
}
