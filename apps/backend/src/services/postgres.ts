// ==============================================================================
// Módulo de Conexión y Gestión de Persistencia Relacional (PostgreSQL + Drizzle)
// ==============================================================================
import pg from 'pg';
import { sql, count } from 'drizzle-orm';
import { initialPokemons } from '../data/initialPokemons.js';
import { logger } from '../utils/logger.js';
import { errorMessage } from '../utils/errors.js';
import { pokedexEntries, createDrizzleClient, type AppDatabase, runMigrations } from '../db/index.js';

const { Pool } = pg;

export function getDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL || (
    process.env.POSTGRES_HOST && process.env.POSTGRES_USER && process.env.POSTGRES_PASSWORD && process.env.POSTGRES_DB
      ? `postgresql://${encodeURIComponent(process.env.POSTGRES_USER)}:${encodeURIComponent(process.env.POSTGRES_PASSWORD)}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT || 5432}/${process.env.POSTGRES_DB}`
      : undefined
  );
}

const POKEDEX_ID_SEQUENCE_SYNC_SQL =
  "SELECT setval('pokedex_id_seq', GREATEST((SELECT COALESCE(MAX(id), 1008) FROM pokedex_entries), 1008), true)";

let pgPool: pg.Pool | null = null;
let drizzleDb: AppDatabase | null = null;
let isPgConnected = false;
let lastKnownPgCount: number | null = null;
let migrationRunner: (url: string) => Promise<void> = runMigrations;

export function setMigrationRunnerForTest(runner?: (url: string) => Promise<void>): void {
  migrationRunner = runner || runMigrations;
}

export function setPgPoolForTest(pool: pg.Pool | null): void {
  pgPool = pool;
}

export function setDrizzleDbForTest(db: AppDatabase | null): void {
  drizzleDb = db;
}

/**
 * Error sentinel de fallo de migraciones [APPS-002].
 *
 * Existe para distinguir "la base de datos no responde" (que sí admite fallback
 * a memoria) de "las migraciones no se pudieron aplicar" (que NO lo admite en
 * produccion). Sin esta distincion, el `catch` externo degradaba a memoria en
 * ambos casos: el servicio arrancaba en verde con un esquema distinto al
 * declarado y perdiendo cualquier escritura previa.
 *
 * En produccion este error debe propagarse hasta `initStorage()` y de ahi al
 * arranque de `server.ts`, que termina el proceso con codigo distinto de cero
 * para que el orquestador no marque el pod como listo. Fail-closed explicito.
 *
 * En desarrollo se mantiene el comportamiento tolerante (warn + fallback) para
 * no bloquear el ciclo de iteracion local.
 */
export class MigrationFailedError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'MigrationFailedError';
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

/** True solo en produccion. Mismo criterio que `startup-env-check.ts`. */
export function isProductionEnv(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Decide si el pool usa TLS: obligatorio si DB_SSL=true o sslmode=require, y por
 * defecto en producción salvo DB_SSL=false o destino loopback.
 */
export function shouldUsePgSsl(dbUrl: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const isProduction = env.NODE_ENV === 'production';
  const isLoopback = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1');
  const isSslExplicitlyRequired = env.DB_SSL === 'true' || dbUrl.includes('sslmode=require');
  return isSslExplicitlyRequired || (isProduction && env.DB_SSL !== 'false' && !isLoopback);
}

export async function connectPg(): Promise<boolean> {
  const dbUrl = getDatabaseUrl();
  if (!dbUrl) return false;
  try {
    if (!pgPool) {
      const shouldUseSsl = shouldUsePgSsl(dbUrl);

      const sslConfig = shouldUseSsl
        ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true' }
        : undefined;

      pgPool = new Pool({
        connectionString: dbUrl,
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
        await migrationRunner(dbUrl);
      } catch (migErr) {
        // [APPS-002] Contrato por ambiente:
        //   - produccion: fail-closed. Un esquema no migrado NO es un almacén
        //     degradado, es un almacén con otra forma de datos. Continuar en
        //     memoria enmascararia el fallo y perderia las escrituras previas.
        //   - desarrollo/test: tolerante, para no bloquear la iteracion local.
        if (isProductionEnv()) {
          throw new MigrationFailedError(
            '[Storage: PostgreSQL] Las migraciones Drizzle fallaron. ' +
              'Arranque abortado (fail-closed) para no operar con un esquema distinto al declarado.',
            { cause: migErr }
          );
        }
        logger.warn('[Storage: PostgreSQL] Aviso al verificar/aplicar migraciones Drizzle:', { error: errorMessage(migErr) });
      }

      const [countRow] = await drizzleDb.select({ total: count() }).from(pokedexEntries);
      const countTotal = Number(countRow?.total ?? 0);

      if (countTotal === 0) {
        // [APPS-002] En producción orquestada, la población del catálogo es responsabilidad
        // exclusiva del Seed Job (infra/helm/pokedex/templates/seed-job.yaml) o de la tarea
        // `npm run seed`. Auto-sembrar en el arranque de la API productiva genera condiciones de
        // carrera cuando múltiples réplicas escalan (HPA).
        // En desarrollo local o suites de test, se mantiene el auto-seed para agilidad.
        const shouldAutoSeed = !isProductionEnv() || process.env.AUTO_SEED === 'true';

        if (shouldAutoSeed) {
          logger.info('[Storage: PostgreSQL] Sembrando catálogo inicial de Pokémon (auto-seed)...');
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
          logger.info(
            '[Storage: PostgreSQL] Base de datos vacía detectada en producción. ' +
              'Población de catálogo delegada al K8s Seed Job o `npm run seed`.'
          );
          lastKnownPgCount = 0;
        }
      } else {
        lastKnownPgCount = countTotal;
      }

      await client.query(POKEDEX_ID_SEQUENCE_SYNC_SQL);
      isPgConnected = true;
      logger.info('[Storage: PostgreSQL] Conectado, Drizzle ORM activo, tabla y secuencia pokedex_id_seq sincronizadas');
      return true;
    } finally {
      client.release();
    }
  } catch (err) {
    // [APPS-002] El sentinel de migraciones NUNCA se degrada a memoria: seria
    // exactamente el fallo que este cambio evita (arrancar "sano" con un
    // esquema distinto al declarado). Se re-lanza para que `initStorage()`
    // rechace y el arranque de `server.ts` termine el proceso.
    if (err instanceof MigrationFailedError) {
      isPgConnected = false;
      throw err;
    }
    logger.warn(`[Storage: PostgreSQL] No disponible (${errorMessage(err)}). Operando con almacén en memoria`);
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
/**
 * Alinea `pokedex_id_seq` con el mayor ID persistido (mínimo 1008).
 *
 * `connectPg()` la ejecuta al arrancar, pero el seed job inserta IDs explícitos
 * después de conectarse: con el catálogo completo (IDs hasta 1025) la secuencia
 * quedaría por debajo y el próximo Pokémon creado colisionaría con uno sembrado.
 */
export async function syncPokedexIdSequence(): Promise<void> {
  if (!isPgConnected || !drizzleDb) return;
  await drizzleDb.execute(sql.raw(POKEDEX_ID_SEQUENCE_SYNC_SQL));
}

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
    } catch (err) {
      logger.warn('[Storage: PostgreSQL] Error al cerrar pool', { error: errorMessage(err) });
    } finally {
      pgPool = null;
      drizzleDb = null;
      isPgConnected = false;
    }
  }
}
