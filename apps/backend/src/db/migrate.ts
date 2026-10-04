import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { logger } from '../utils/logger.js';

export function getMigrationsFolder(): string {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.url) {
      return path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
    }
  } catch {
    // Fallback para entornos donde import.meta no esté definido
  }
  if (typeof __dirname !== 'undefined') {
    return path.resolve(__dirname, 'migrations');
  }
  return path.resolve(process.cwd(), 'apps/backend/src/db/migrations');
}

/** Columnas que crea la migración inicial; un esquema heredado debe tenerlas todas. */
export const BASELINE_REQUIRED_COLUMNS = ['id', 'nombre', 'tipo', 'data', 'updated_at'] as const;

interface Queryable {
  query<R = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: R[] }>;
}

export type BaselineOutcome = 'fresh' | 'tracked' | 'baselined';

/**
 * Registra la migración inicial como aplicada en bases creadas antes de Drizzle.
 *
 * Releases anteriores creaban `pokedex_entries` sin el journal
 * `drizzle.__drizzle_migrations`. Sobre esa base, `migrate()` reejecuta la
 * migración inicial (`CREATE TABLE` sin `IF NOT EXISTS`), falla y, como
 * `connectPg` es fail-closed (APPS-002), la API y el seed job no arrancan.
 *
 * Solo actúa si la tabla existe, el journal está vacío o no existe, y la tabla
 * tiene las columnas de la migración inicial. Si faltan columnas, el esquema no
 * es el esperado y se lanza un error en lugar de adivinar.
 */
export async function baselineLegacySchema(client: Queryable, migrationsFolder: string): Promise<BaselineOutcome> {
  const { rows: [state] } = await client.query<{ entries: string | null; journal: string | null }>(
    "SELECT to_regclass('public.pokedex_entries')::text AS entries, to_regclass('drizzle.__drizzle_migrations')::text AS journal"
  );
  if (!state?.entries) return 'fresh';

  if (state.journal) {
    const { rows: [tracked] } = await client.query<{ total: string }>('SELECT count(*)::text AS total FROM drizzle.__drizzle_migrations');
    if (Number(tracked?.total ?? 0) > 0) return 'tracked';
  }

  const { rows: columns } = await client.query<{ column_name: string }>(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pokedex_entries'"
  );
  const present = new Set(columns.map((c) => c.column_name));
  const missing = BASELINE_REQUIRED_COLUMNS.filter((c) => !present.has(c));
  if (missing.length > 0) {
    throw new Error(`[Migrations] pokedex_entries existe sin journal y no coincide con la migración inicial (faltan: ${missing.join(', ')})`);
  }

  const journal = JSON.parse(fs.readFileSync(path.join(migrationsFolder, 'meta', '_journal.json'), 'utf-8')) as {
    entries: Array<{ tag: string; when: number }>;
  };
  const initial = journal.entries[0];
  if (!initial) return 'fresh';
  const initialSql = fs.readFileSync(path.join(migrationsFolder, `${initial.tag}.sql`), 'utf-8');
  const hash = crypto.createHash('sha256').update(initialSql).digest('hex');

  await client.query('CREATE SCHEMA IF NOT EXISTS drizzle');
  await client.query('CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)');
  await client.query('INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)', [hash, initial.when]);
  logger.warn(`[Migrations] Esquema heredado sin journal: ${initial.tag} registrada como aplicada (baseline)`);
  return 'baselined';
}

export async function runMigrations(connectionString?: string): Promise<void> {
  const url = connectionString || process.env.DATABASE_URL;
  if (!url) {
    logger.warn('[Migrations] DATABASE_URL no configurado. Omitiendo migración.');
    return;
  }

  const pool = new pg.Pool({
    connectionString: url,
    max: 1,
    connectionTimeoutMillis: 5000,
  });

  const db = drizzle(pool);
  try {
    const migrationsFolder = getMigrationsFolder();
    await baselineLegacySchema(pool, migrationsFolder);
    logger.info(`[Migrations] Aplicando migraciones Drizzle desde ${migrationsFolder}...`);
    await migrate(db, { migrationsFolder });
    logger.info('[Migrations] Migraciones declarativas aplicadas con éxito');
  } finally {
    await pool.end();
  }
}

// Ejecución directa vía CLI (tsx src/db/migrate.ts o node dist/migrate.cjs)
const isCli = Boolean(
  process.argv[1] &&
  (process.argv[1].endsWith('migrate.ts') || process.argv[1].endsWith('migrate.cjs'))
);

if (isCli) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error('[Migrations] Error fatal ejecutando migraciones:', { error: err });
      process.exit(1);
    });
}
