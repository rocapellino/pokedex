// ==============================================================================
// Capa de Acceso a Datos & Caching (PostgreSQL & Redis) con Fallback Resiliente
// ==============================================================================
import pg from 'pg';
import { Redis } from 'ioredis';
import { Pokemon } from '../types.js';
import { initialPokemons } from '../data/initialPokemons.js';

const { Pool } = pg;

// ------------------------------------------------------------------------------
// 1. Configuración de Conexiones
// ------------------------------------------------------------------------------
const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;

let pgPool: pg.Pool | null = null;
let redisClient: Redis | null = null;

let isPgConnected = false;
let isRedisConnected = false;

// Almacén en memoria sincronizado como fallback resiliente
const memoryMap = new Map<number, Pokemon>();
for (const p of initialPokemons) {
  memoryMap.set(p.id, JSON.parse(JSON.stringify(p)));
}

// ------------------------------------------------------------------------------
// 2. Inicialización de Clientes
// ------------------------------------------------------------------------------
export async function initStorage(): Promise<void> {
  // Inicialización de PostgreSQL
  if (DATABASE_URL) {
    try {
      pgPool = new Pool({
        connectionString: DATABASE_URL,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });

      // Manejar errores imprevistos en clientes inactivos del pool
      pgPool.on('error', (err) => {
        console.error('[Storage: PostgreSQL Error] Idle client error:', err.message);
        isPgConnected = false;
      });

      // Validar conexión y crear tabla si no existe
      const client = await pgPool.connect();
      try {
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
        `);

        // Sembrar datos iniciales si la tabla está vacía
        const countRes = await client.query('SELECT COUNT(*) FROM pokedex_entries');
        const count = parseInt(countRes.rows[0].count, 10);
        if (count === 0) {
          console.log('[Storage: PostgreSQL] Sembrando catálogo inicial de Pokémon...');
          for (const p of initialPokemons) {
            await client.query(
              'INSERT INTO pokedex_entries (id, nombre, tipo, data) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING',
              [p.id, p.nombre, p.tipo, JSON.stringify(p)]
            );
          }
        }
        isPgConnected = true;
        console.log('[Storage: PostgreSQL] ✅ Conectado y tabla pokedex_entries sincronizada.');
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.warn(`[Storage: PostgreSQL] ⚠️ No disponible (${err.message}). Operando con almacén en memoria.`);
      isPgConnected = false;
    }
  } else {
    console.log('[Storage] DATABASE_URL no definida. Operando en memoria.');
  }

  // Inicialización de Redis
  if (REDIS_URL) {
    try {
      redisClient = new Redis(REDIS_URL, {
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        connectTimeout: 2000,
        retryStrategy: () => null, // No bloquear si no está disponible
      });

      redisClient.on('connect', () => {
        isRedisConnected = true;
        console.log('[Cache: Redis] ✅ Conexión activa a Redis.');
      });

      redisClient.on('error', (err) => {
        isRedisConnected = false;
      });

      // Ping de prueba
      await redisClient.ping();
      isRedisConnected = true;
    } catch (err: any) {
      console.warn(`[Cache: Redis] ⚠️ No disponible (${err.message}). Caching en memoria desactivado.`);
      isRedisConnected = false;
    }
  }
}

// ------------------------------------------------------------------------------
// 3. Operaciones CRUD (PostgreSQL con Fallback a Memoria)
// ------------------------------------------------------------------------------

export async function getAllPokemons(options: {
  limit?: number;
  offset?: number;
  type?: string;
  search?: string;
} = {}): Promise<{ total: number; pokemons: Pokemon[] }> {
  const { limit = 20, offset = 0, type, search } = options;

  // 1. Intentar consultar PostgreSQL
  if (isPgConnected && pgPool) {
    try {
      let query = 'SELECT data FROM pokedex_entries WHERE 1=1';
      const params: any[] = [];
      let paramIndex = 1;

      if (type) {
        query += ` AND LOWER(tipo) = LOWER($${paramIndex++})`;
        params.push(type);
      }
      if (search) {
        query += ` AND LOWER(nombre) LIKE LOWER($${paramIndex++})`;
        params.push(`%${search}%`);
      }

      query += ' ORDER BY id ASC';

      const countResult = await pgPool.query(
        query.replace('SELECT data FROM', 'SELECT COUNT(*) FROM'),
        params
      );
      const total = parseInt(countResult.rows[0].count, 10);

      query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
      params.push(limit, offset);

      const result = await pgPool.query(query, params);
      const pokemons = result.rows.map(r => r.data as Pokemon);

      return { total, pokemons };
    } catch (err) {
      console.error('[Storage: PostgreSQL Error] Fallback a memoria:', err);
    }
  }

  // 2. Fallback a Memoria
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

  return { total, pokemons };
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

  // Consultar PostgreSQL
  if (isPgConnected && pgPool) {
    try {
      const res = await pgPool.query('SELECT data FROM pokedex_entries WHERE id = $1', [id]);
      if (res.rows.length > 0) {
        const item = res.rows[0].data as Pokemon;
        // Guardar en caché Redis por 5 minutos
        if (isRedisConnected && redisClient) {
          redisClient.setex(cacheKey, 300, JSON.stringify(item)).catch(() => {});
        }
        return item;
      }
      return null;
    } catch (err) {
      console.error('[Storage: PostgreSQL Error] Fallback a memoria para getById:', err);
    }
  }

  // Fallback a Memoria
  const found = memoryMap.get(id) || null;
  if (found && isRedisConnected && redisClient) {
    redisClient.setex(cacheKey, 300, JSON.stringify(found)).catch(() => {});
  }
  return found;
}

export async function savePokemon(pokemon: Pokemon): Promise<void> {
  // 1. Guardar en memoria siempre
  memoryMap.set(pokemon.id, pokemon);

  // 2. Guardar en PostgreSQL
  if (isPgConnected && pgPool) {
    try {
      await pgPool.query(
        `INSERT INTO pokedex_entries (id, nombre, tipo, data, updated_at)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
         ON CONFLICT (id) DO UPDATE
         SET nombre = EXCLUDED.nombre,
             tipo = EXCLUDED.tipo,
             data = EXCLUDED.data,
             updated_at = CURRENT_TIMESTAMP`,
        [pokemon.id, pokemon.nombre, pokemon.tipo, JSON.stringify(pokemon)]
      );
    } catch (err) {
      console.error('[Storage: PostgreSQL Error] Fallo guardando Pokémon en BD:', err);
    }
  }

  // 3. Invalidar caché en Redis
  await invalidateCache(pokemon.id);
}

export async function deletePokemon(id: number): Promise<boolean> {
  let deleted = false;

  // 1. Borrar de memoria
  if (memoryMap.has(id)) {
    memoryMap.delete(id);
    deleted = true;
  }

  // 2. Borrar de PostgreSQL
  if (isPgConnected && pgPool) {
    try {
      const res = await pgPool.query('DELETE FROM pokedex_entries WHERE id = $1', [id]);
      if (res.rowCount && res.rowCount > 0) {
        deleted = true;
      }
    } catch (err) {
      console.error('[Storage: PostgreSQL Error] Fallo eliminando de BD:', err);
    }
  }

  // 3. Invalidar caché
  await invalidateCache(id);

  return deleted;
}

export async function getNextPokemonId(): Promise<number> {
  if (isPgConnected && pgPool) {
    try {
      const res = await pgPool.query('SELECT COALESCE(MAX(id), 1008) AS max_id FROM pokedex_entries');
      return parseInt(res.rows[0].max_id, 10) + 1;
    } catch {
      // fallback
    }
  }

  return Array.from(memoryMap.keys()).reduce((max, id) => Math.max(max, id), 1008) + 1;
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

export function getStorageHealth(): {
  database: 'postgresql' | 'memory';
  postgres_connected: boolean;
  redis_connected: boolean;
  total_records: number;
} {
  return {
    database: isPgConnected ? 'postgresql' : 'memory',
    postgres_connected: isPgConnected,
    redis_connected: isRedisConnected,
    total_records: memoryMap.size,
  };
}
