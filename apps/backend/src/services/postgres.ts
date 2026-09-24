// ==============================================================================
// Módulo de Conexión y Gestión de Persistencia Relacional (PostgreSQL + Drizzle)
// ==============================================================================
import pg from 'pg';
import { sql, count } from 'drizzle-orm';
import { initialPokemons } from '../data/initialPokemons.js';
import { logger } from '../utils/logger.js';
import { pokedexEntries, createDrizzleClient, AppDatabase, runMigrations } from '../db/index.js';

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL || (
  process.env.POSTGRES_HOST && process.env.POSTGRES_USER && process.env.POSTGRES_PASSWORD && process.env.POSTGRES_DB
    ? `postgresql://${encodeURIComponent(process.env.POSTGRES_USER)}:${encodeURIComponent(process.env.POSTGRES_PASSWORD)}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT || 5432}/${process.env.POSTGRES_DB}`
    : undefined
);

let pgPool: pg.Pool | null = null;
let drizzleDb: AppDatabase | null = null;
let isPgConnected = false;
let lastKnownPgCount: number | null = null;

export async function connectPg(): Promise<boolean> {
  if (!DATABASE_URL) return false;
  try {
    if (!pgPool) {
      const isProduction = process.env.NODE_ENV === 'production';
      const isLoopback = DATABASE_URL.includes('localhost') || DATABASE_URL.includes('127.0.0.1');
      const isSslExplicitlyRequired = process.env.DB_SSL === 'true' || DATABASE_URL.includes('sslmode=require');
      const shouldUseSsl = isSslExplicitlyRequired || (isProduction && process.env.DB_SSL !== 'false' && !isLoopback);

      const sslConfig = shouldUseSsl
        ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true' }
        : undefined;

      pgPool = new Pool({
        connectionString: DATABASE_URL,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
        ssl: sslConfig,
      });

      pgPool.on('error', (err) => {
        logger.error('[Storage: PostgreSQL Error] Idle client error', { error: err.message });
        isPgConnected = false;
      });

      drizzleDb = createDrizzleClient(pgPool);
    }

    const client = await pgPool.connect();
    try {
      if (!drizzleDb) {
        drizzleDb = createDrizzleClient(pgPool);
      }

      // Aplicar migraciones declarativas versionadas (Drizzle ORM como única fuente de verdad)
      try {
        await runMigrations(DATABASE_URL);
      } catch (migErr: any) {
        logger.warn('[Storage: PostgreSQL] Aviso al verificar/aplicar migraciones Drizzle:', { error: migErr?.message });
      }

      const [countRow] = await drizzleDb.select({ total: count() }).from(pokedexEntries);
      const countTotal = Number(countRow?.total ?? 0);

      if (countTotal === 0) {
        logger.info('[Storage: PostgreSQL] Sembrando catálogo inicial de Pokémon...');
        for (const p of initialPokemons) {
          await drizzleDb
            .insert(pokedexEntries)
            .values({
              id: p.id,
              nombre: p.nombre,
              tipo: p.tipo,
              data: p,
            })
            .onConflictDoNothing({ target: pokedexEntries.id });
        }
        lastKnownPgCount = initialPokemons.length;
      } else {
        lastKnownPgCount = countTotal;
      }

      await client.query(`
        SELECT setval('pokedex_id_seq', GREATEST((SELECT COALESCE(MAX(id), 1008) FROM pokedex_entries), 1008), true);
      `);
      isPgConnected = true;
      logger.info('[Storage: PostgreSQL] Conectado, Drizzle ORM activo, tabla y secuencia pokedex_id_seq sincronizadas');
      return true;
    } finally {
      client.release();
    }
  } catch (err: any) {
    logger.warn(`[Storage: PostgreSQL] No disponible (${err.message}). Operando con almacén en memoria`);
    isPgConnected = false;
    return false;
  }
}

export function isPgConnectedStatus(): boolean {
  return isPgConnected;
}

export function isPgConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getDrizzleDb(): AppDatabase | null {
  return isPgConnected ? drizzleDb : null;
}

export function getPgPool(): pg.Pool | null {
  return pgPool;
}

export function getLastKnownPgCount(): number | null {
  return lastKnownPgCount;
}

export function incrementPgCount(): void {
  if (lastKnownPgCount !== null) {
    lastKnownPgCount++;
  }
}

export function decrementPgCount(): void {
  if (lastKnownPgCount !== null && lastKnownPgCount > 0) {
    lastKnownPgCount--;
  }
}

/**
 * Consulta y parsea la versión activa de PostgreSQL para endpoints de diagnóstico.
 * Si PostgreSQL no está conectado, retorna null.
 */
export async function getPostgresVersion(): Promise<string | null> {
  if (!isPgConnected || !drizzleDb) return null;
  try {
    const res = await drizzleDb.execute<{ version: string }>(sql`SELECT version()`);
    const raw = (res.rows[0]?.version as string) || '';
    const match = raw.match(/^PostgreSQL\s+\S+/);
    return match ? match[0] : (raw || null);
  } catch {
    return null;
  }
}

export async function closePg(): Promise<void> {
  if (pgPool) {
    try {
      await pgPool.end();
      logger.info('[Storage: PostgreSQL] Pool de conexiones cerrado limpiamente');
    } catch (err: any) {
      logger.warn('[Storage: PostgreSQL] Error al cerrar pool', { error: err?.message || String(err) });
    } finally {
      pgPool = null;
      drizzleDb = null;
      isPgConnected = false;
    }
  }
}
