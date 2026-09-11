// ==============================================================================
// Capa de Acceso a Datos & Caching (PostgreSQL & Redis) con Drizzle ORM & Fallback
// ==============================================================================
import pg from 'pg';
import { Redis } from 'ioredis';
import { eq, ilike, and, asc, count, sql } from 'drizzle-orm';
import { Pokemon } from '../types.js';
import { initialPokemons } from '../data/initialPokemons.js';
import { logger } from '../utils/logger.js';
import { pokedexEntries, createDrizzleClient, AppDatabase } from '../db/index.js';

const { Pool } = pg;

// ------------------------------------------------------------------------------
// 1. Configuración de Conexiones
// ------------------------------------------------------------------------------
const DATABASE_URL = process.env.DATABASE_URL || (
  process.env.POSTGRES_HOST && process.env.POSTGRES_USER && process.env.POSTGRES_PASSWORD && process.env.POSTGRES_DB
    ? `postgresql://${encodeURIComponent(process.env.POSTGRES_USER)}:${encodeURIComponent(process.env.POSTGRES_PASSWORD)}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT || 5432}/${process.env.POSTGRES_DB}`
    : undefined
);
const REDIS_URL = process.env.REDIS_URL || (
  process.env.REDIS_HOST
    ? `redis://${process.env.REDIS_PASSWORD ? `:${encodeURIComponent(process.env.REDIS_PASSWORD)}@` : ''}${process.env.REDIS_HOST}:${process.env.REDIS_PORT || 6379}`
    : undefined
);

let pgPool: pg.Pool | null = null;
let drizzleDb: AppDatabase | null = null;
let redisClient: Redis | null = null;

let isPgConnected = false;
let isRedisConnected = false;
let lastKnownPgCount: number | null = null;

// Almacén en memoria sincronizado como fallback resiliente
const memoryMap = new Map<number, Pokemon>();
for (const p of initialPokemons) {
  memoryMap.set(p.id, JSON.parse(JSON.stringify(p)));
}
let inMemorySequence = initialPokemons.reduce((max, p) => Math.max(max, p.id), 1008);

// ------------------------------------------------------------------------------
// 2. Inicialización de Clientes & Reconexión Resiliente
// ------------------------------------------------------------------------------
let heartbeatTimer: NodeJS.Timeout | null = null;

async function connectPg(): Promise<boolean> {
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
      // Garantizar esquema base y secuencia de manera declarativa/idempotente
      await client.query(`
        CREATE TABLE IF NOT EXISTS pokedex_entries (
          id INT PRIMARY KEY,
          nombre VARCHAR(100) NOT NULL,
          tipo VARCHAR(50) NOT NULL,
          data JSONB NOT NULL,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_pokedex_tipo ON pokedex_entries(tipo);
        CREATE INDEX IF NOT EXISTS idx_pokedex_nombre ON pokedex_entries(nombre);
        CREATE SEQUENCE IF NOT EXISTS pokedex_id_seq START WITH 1009;
      `);

      if (!drizzleDb) {
        drizzleDb = createDrizzleClient(pgPool);
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

async function connectRedis(): Promise<boolean> {
  if (!REDIS_URL) return false;
  try {
    if (!redisClient) {
      redisClient = new Redis(REDIS_URL, {
        maxRetriesPerRequest: 1,
        lazyConnect: true,
        connectTimeout: 2000,
        retryStrategy: () => null,
      });

      redisClient.on('connect', () => {
        isRedisConnected = true;
        logger.info('[Cache: Redis] Conexión activa a Redis');
      });

      redisClient.on('error', () => {
        isRedisConnected = false;
      });

      redisClient.on('close', () => {
        isRedisConnected = false;
      });

      await redisClient.connect();
    }

    await redisClient.ping();
    isRedisConnected = true;
    return true;
  } catch (err: any) {
    logger.warn(`[Cache: Redis] No disponible (${err.message}). Caching en memoria desactivado`);
    if (redisClient) {
      try { redisClient.disconnect(); } catch {}
      redisClient = null;
    }
    isRedisConnected = false;
    return false;
  }
}

export function startStorageHeartbeat(intervalMs = 5000): void {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(async () => {
    if (DATABASE_URL && !isPgConnected) {
      await connectPg();
    }
    if (REDIS_URL && !isRedisConnected) {
      await connectRedis();
    }
  }, intervalMs);

  if (heartbeatTimer.unref) {
    heartbeatTimer.unref();
  }
}

export function stopStorageHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

export async function initStorage(): Promise<void> {
  await Promise.all([connectPg(), connectRedis()]);
  startStorageHeartbeat();
}

// ------------------------------------------------------------------------------
// 3. Operaciones CRUD (Drizzle ORM con Fallback Resiliente a Memoria)
// ------------------------------------------------------------------------------

export async function getAllPokemons(options: {
  limit?: number;
  offset?: number;
  type?: string;
  search?: string;
} = {}): Promise<{ total: number; pokemons: Pokemon[] }> {
  const { limit = 20, offset = 0, type, search } = options;

  // 1. Intentar consultar caché de Redis para listados
  const listCacheKey = `pokedex:list:${(type || 'all').toLowerCase()}:${(search || 'all').toLowerCase()}:${limit}:${offset}`;
  if (isRedisConnected && redisClient) {
    try {
      const cached = await redisClient.get(listCacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {
      // Degradar silenciosamente ante fallo de lectura de Redis
    }
  }

  let resultData: { total: number; pokemons: Pokemon[] } | null = null;

  // 2. Intentar consultar PostgreSQL vía Drizzle ORM
  if (isPgConnected && drizzleDb) {
    try {
      const conditions = [];
      if (type) {
        conditions.push(ilike(pokedexEntries.tipo, type));
      }
      if (search) {
        conditions.push(ilike(pokedexEntries.nombre, `%${search}%`));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [countRow] = await drizzleDb
        .select({ total: count() })
        .from(pokedexEntries)
        .where(whereClause);
      const total = Number(countRow?.total ?? 0);

      const rows = await drizzleDb
        .select({ data: pokedexEntries.data })
        .from(pokedexEntries)
        .where(whereClause)
        .orderBy(asc(pokedexEntries.id))
        .limit(limit)
        .offset(offset);

      const pokemons = rows.map(r => r.data);
      resultData = { total, pokemons };
    } catch (err) {
      logger.error('[Storage: PostgreSQL Error] Fallback a memoria', { error: err });
    }
  }

  // 3. Fallback a Memoria si PostgreSQL no respondió
  if (!resultData) {
    let list = Array.from(memoryMap.values());
    if (type) {
      list = list.filter(p => p.tipo.toLowerCase() === type.toLowerCase() || p.tipos?.some(t => t.toLowerCase() === type.toLowerCase()));
    }
    if (search) {
      list = list.filter(p => p.nombre.toLowerCase().includes(search.toLowerCase()));
    }
    list.sort((a, b) => a.id - b.id);
    const total = list.length;
    const pokemons = list.slice(offset, offset + limit);
    resultData = { total, pokemons };
  }

  // 4. Poblar caché de Redis con TTL de 60 segundos
  if (isRedisConnected && redisClient && resultData) {
    redisClient.setex(listCacheKey, 60, JSON.stringify(resultData)).catch(() => {});
  }

  return resultData;
}

export async function getPokemonById(id: number): Promise<Pokemon | null> {
  // Intentar caché de Redis primero
  const cacheKey = `pokedex:item:${id}`;
  if (isRedisConnected && redisClient) {
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {
      // Ignorar error de lectura de cache
    }
  }

  // Consultar PostgreSQL vía Drizzle ORM
  if (isPgConnected && drizzleDb) {
    try {
      const [entry] = await drizzleDb
        .select({ data: pokedexEntries.data })
        .from(pokedexEntries)
        .where(eq(pokedexEntries.id, id))
        .limit(1);

      if (entry) {
        const item = entry.data;
        // Guardar en caché Redis por 5 minutos
        if (isRedisConnected && redisClient) {
          redisClient.setex(cacheKey, 300, JSON.stringify(item)).catch(() => {});
        }
        return item;
      }
      return null;
    } catch (err) {
      logger.error('[Storage: PostgreSQL Error] Fallback a memoria para getById', { error: err });
    }
  }

  // Fallback a Memoria
  const found = memoryMap.get(id) || null;
  if (found && isRedisConnected && redisClient) {
    redisClient.setex(cacheKey, 300, JSON.stringify(found)).catch(() => {});
  }
  return found;
}

export function isWritableStorageAvailable(): boolean {
  if (Boolean(process.env.DATABASE_URL)) {
    return isPgConnected && pgPool !== null && drizzleDb !== null;
  }
  return true;
}

export async function savePokemon(pokemon: Pokemon): Promise<void> {
  // Fail-Closed: si PostgreSQL está configurado pero desconectado, rechazar la escritura para evitar pérdida de datos
  if (Boolean(process.env.DATABASE_URL) && (!isPgConnected || !pgPool || !drizzleDb)) {
    throw new Error('Almacenamiento persistente (PostgreSQL) no disponible para escritura. Operación cancelada.');
  }

  // 1. Guardar primero en PostgreSQL vía Drizzle ORM (Source of Truth)
  if (isPgConnected && drizzleDb) {
    await drizzleDb
      .insert(pokedexEntries)
      .values({
        id: pokemon.id,
        nombre: pokemon.nombre,
        tipo: pokemon.tipo,
        data: pokemon,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .onConflictDoUpdate({
        target: pokedexEntries.id,
        set: {
          nombre: pokemon.nombre,
          tipo: pokemon.tipo,
          data: pokemon,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        },
      });

    if (lastKnownPgCount !== null && !memoryMap.has(pokemon.id)) {
      lastKnownPgCount++;
    }
  }

  // 2. Actualizar réplica en memoria y caché tras éxito en BD (o si BD está ausente en modo local)
  memoryMap.set(pokemon.id, pokemon);
  await invalidateCache(pokemon.id);
}

export async function deletePokemon(id: number): Promise<boolean> {
  // Fail-Closed: si PostgreSQL está configurado pero desconectado, rechazar eliminación
  if (Boolean(process.env.DATABASE_URL) && (!isPgConnected || !pgPool || !drizzleDb)) {
    throw new Error('Almacenamiento persistente (PostgreSQL) no disponible para eliminación. Operación cancelada.');
  }

  let deleted = false;

  // 1. Eliminar primero en PostgreSQL vía Drizzle ORM (Source of Truth)
  if (isPgConnected && drizzleDb) {
    const deletedRows = await drizzleDb
      .delete(pokedexEntries)
      .where(eq(pokedexEntries.id, id))
      .returning({ id: pokedexEntries.id });

    deleted = deletedRows.length > 0;
    if (deleted && lastKnownPgCount !== null && lastKnownPgCount > 0) {
      lastKnownPgCount--;
    }
  } else {
    deleted = memoryMap.has(id);
  }

  // 2. Si la eliminación en BD fue exitosa, remover de memoria y desalojar caché
  if (deleted) {
    memoryMap.delete(id);
    await invalidateCache(id);
  }

  return deleted;
}

export async function getNextPokemonId(): Promise<number> {
  if (isPgConnected && drizzleDb) {
    try {
      const res = await drizzleDb.execute<{ next_id: string }>(
        sql`SELECT nextval('pokedex_id_seq') AS next_id`
      );
      if (res.rows.length > 0) {
        return Number.parseInt(res.rows[0].next_id, 10);
      }
    } catch (err) {
      logger.warn('[Storage: PostgreSQL Error] Fallback a cálculo en memoria para getNextPokemonId', { error: err });
    }
  }

  inMemorySequence = Math.max(
    inMemorySequence,
    Array.from(memoryMap.keys()).reduce((max, id) => Math.max(max, id), 1008)
  ) + 1;
  return inMemorySequence;
}

// ------------------------------------------------------------------------------
// 4. Utilidades de Caché & Salud
// ------------------------------------------------------------------------------

export async function invalidateCache(id?: number): Promise<void> {
  if (!isRedisConnected || !redisClient) return;

  try {
    const keysToDelete: string[] = [];
    if (id !== undefined) {
      keysToDelete.push(`pokedex:item:${id}`);
    }

    // Escanear y borrar claves de listados de forma no bloqueante con SCAN
    let cursor = '0';
    do {
      const [nextCursor, matchedKeys] = await redisClient.scan(
        cursor,
        'MATCH',
        'pokedex:list:*',
        'COUNT',
        50
      );
      cursor = nextCursor;
      if (matchedKeys.length > 0) {
        keysToDelete.push(...matchedKeys);
      }
    } while (cursor !== '0');

    if (keysToDelete.length > 0) {
      await redisClient.del(...keysToDelete);
    }
  } catch (err) {
    // Ignorar errores de invalidación
  }
}

// Rate limiter distribuido respaldado por Redis con script Lua 100% atómico
export async function consumeDistributedRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ allowed: boolean; retryAfterSeconds: number; remaining: number } | null> {
  if (!isRedisConnected || !redisClient) {
    return null; // Fallback a ventana local en memoria
  }

  try {
    const redisKey = `ratelimit:${key}`;
    const luaScript = `
      local current = redis.call('INCR', KEYS[1])
      if current == 1 then
        redis.call('PEXPIRE', KEYS[1], ARGV[1])
      end
      local pttl = redis.call('PTTL', KEYS[1])
      return {current, pttl}
    `;
    const result = (await redisClient.eval(luaScript, 1, redisKey, windowMs)) as [number, number];
    const count = Number(result[0]);
    const pttl = Number(result[1]);
    const retryAfterSeconds = pttl > 0 ? Math.ceil(pttl / 1000) : Math.ceil(windowMs / 1000);

    if (count > limit) {
      return { allowed: false, retryAfterSeconds, remaining: 0 };
    }

    return { allowed: true, retryAfterSeconds, remaining: limit - count };
  } catch (err) {
    return null; // Degradación elegante ante errores temporales de Redis
  }
}

// ------------------------------------------------------------------------------
// 5. Gestión Distribuida de Revocación de Sesiones (Redis)
// ------------------------------------------------------------------------------

/**
 * Registra un identificador de token (jti) como revocado en Redis con TTL automático.
 */
export async function setRevokedJti(jti: string, ttlSeconds: number): Promise<boolean> {
  if (!isRedisConnected || !redisClient || !jti) {
    return false;
  }
  try {
    const key = `revoked:${jti}`;
    const safeTtl = Math.max(1, Math.floor(ttlSeconds));
    await redisClient.set(key, '1', 'EX', safeTtl);
    return true;
  } catch {
    return false;
  }
}

/**
 * Consulta si un identificador de token (jti) ha sido revocado en Redis.
 * Retorna true si está revocado, false si es válido, o null si Redis no está disponible.
 */
export async function isJtiRevokedInRedis(jti: string): Promise<boolean | null> {
  if (!isRedisConnected || !redisClient || !jti) {
    return null;
  }
  try {
    const exists = await redisClient.exists(`revoked:${jti}`);
    return exists === 1;
  } catch {
    return null;
  }
}

export function getRedisClient(): Redis | null {
  return isRedisConnected ? redisClient : null;
}

export function getDrizzleDb(): AppDatabase | null {
  return isPgConnected ? drizzleDb : null;
}

export function getStorageHealth(): {
  database: 'postgresql' | 'memory';
  postgres_connected: boolean;
  redis_connected: boolean;
  postgres_total_records: number | null;
  memory_total_records: number;
  total_records: number;
} {
  const effectivePgCount = isPgConnected ? (lastKnownPgCount ?? memoryMap.size) : null;
  return {
    database: isPgConnected ? 'postgresql' : 'memory',
    postgres_connected: isPgConnected,
    redis_connected: isRedisConnected,
    postgres_total_records: effectivePgCount,
    memory_total_records: memoryMap.size,
    total_records: effectivePgCount ?? memoryMap.size,
  };
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
