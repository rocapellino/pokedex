// ==============================================================================
// Repositorio de Dominio Pokémon (Drizzle ORM con Fallback Resiliente en Memoria)
// ==============================================================================
import { eq, ilike, and, asc, count, sql } from 'drizzle-orm';
import { Pokemon } from '../types.js';
import { initialPokemons } from '../data/initialPokemons.js';
import { logger } from '../utils/logger.js';
import { pokedexEntries } from '../db/index.js';
import {
  getDrizzleDb,
  isPgConnectedStatus,
  isPgConfigured,
  incrementPgCount,
  decrementPgCount
} from './postgres.js';
import {
  invalidateCache,
  getRedisClient,
  isCacheConnected
} from './cache.js';

// Almacén en memoria sincronizado como fallback resiliente
const memoryMap = new Map<number, Pokemon>();
for (const p of initialPokemons) {
  memoryMap.set(p.id, JSON.parse(JSON.stringify(p)));
}
let inMemorySequence = initialPokemons.reduce((max, p) => Math.max(max, p.id), 1008);

export function getMemoryMapSize(): number {
  return memoryMap.size;
}

export function isWritableStorageAvailable(): boolean {
  if (isPgConfigured()) {
    return isPgConnectedStatus() && getDrizzleDb() !== null;
  }
  return true;
}

export async function getAllPokemons(options: {
  limit?: number;
  offset?: number;
  type?: string;
  search?: string;
} = {}): Promise<{ total: number; pokemons: Pokemon[] }> {
  const { limit = 20, offset = 0, type, search } = options;
  const redis = getRedisClient();
  const hasRedis = isCacheConnected() && redis !== null;

  // 1. Intentar consultar caché de Redis para listados con versionado O(1)
  let listCacheKey = '';
  if (hasRedis) {
    try {
      const version = (await redis.get('pokedex:list_version')) || '1';
      listCacheKey = `pokedex:list:v${version}:${(type || 'all').toLowerCase()}:${(search || 'all').toLowerCase()}:${limit}:${offset}`;
      const cached = await redis.get(listCacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {
      // Degradar silenciosamente ante fallo de lectura de Redis
    }
  }

  let resultData: { total: number; pokemons: Pokemon[] } | null = null;
  const drizzleDb = getDrizzleDb();

  // 2. Intentar consultar PostgreSQL vía Drizzle ORM
  if (isPgConnectedStatus() && drizzleDb) {
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
  if (hasRedis && resultData && listCacheKey) {
    redis.setex(listCacheKey, 60, JSON.stringify(resultData)).catch(() => {});
  }

  return resultData;
}

export async function getPokemonById(id: number): Promise<Pokemon | null> {
  const redis = getRedisClient();
  const hasRedis = isCacheConnected() && redis !== null;

  // Intentar caché de Redis primero
  const cacheKey = `pokedex:item:${id}`;
  if (hasRedis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {
      // Ignorar error de lectura de cache
    }
  }

  const drizzleDb = getDrizzleDb();

  // Consultar PostgreSQL vía Drizzle ORM
  if (isPgConnectedStatus() && drizzleDb) {
    try {
      const [entry] = await drizzleDb
        .select({ data: pokedexEntries.data })
        .from(pokedexEntries)
        .where(eq(pokedexEntries.id, id))
        .limit(1);

      if (entry) {
        const item = entry.data;
        // Guardar en caché Redis por 5 minutos
        if (hasRedis) {
          redis.setex(cacheKey, 300, JSON.stringify(item)).catch(() => {});
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
  if (found && hasRedis) {
    redis.setex(cacheKey, 300, JSON.stringify(found)).catch(() => {});
  }
  return found;
}

export async function savePokemon(pokemon: Pokemon): Promise<void> {
  // Fail-Closed: si PostgreSQL está configurado pero desconectado, rechazar la escritura para evitar pérdida de datos
  const drizzleDb = getDrizzleDb();
  if (isPgConfigured() && (!isPgConnectedStatus() || !drizzleDb)) {
    throw new Error('Almacenamiento persistente (PostgreSQL) no disponible para escritura. Operación cancelada.');
  }

  // 1. Guardar primero en PostgreSQL vía Drizzle ORM (Source of Truth)
  if (isPgConnectedStatus() && drizzleDb) {
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

    if (!memoryMap.has(pokemon.id)) {
      incrementPgCount();
    }
  }

  // 2. Actualizar réplica en memoria y caché tras éxito en BD (o si BD está ausente en modo local)
  memoryMap.set(pokemon.id, pokemon);
  await invalidateCache(pokemon.id);
}

export async function deletePokemon(id: number): Promise<boolean> {
  // Fail-Closed: si PostgreSQL está configurado pero desconectado, rechazar eliminación
  const drizzleDb = getDrizzleDb();
  if (isPgConfigured() && (!isPgConnectedStatus() || !drizzleDb)) {
    throw new Error('Almacenamiento persistente (PostgreSQL) no disponible para eliminación. Operación cancelada.');
  }

  let deleted = false;

  // 1. Eliminar primero en PostgreSQL vía Drizzle ORM (Source of Truth)
  if (isPgConnectedStatus() && drizzleDb) {
    const deletedRows = await drizzleDb
      .delete(pokedexEntries)
      .where(eq(pokedexEntries.id, id))
      .returning({ id: pokedexEntries.id });

    deleted = deletedRows.length > 0;
    if (deleted) {
      decrementPgCount();
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
  const drizzleDb = getDrizzleDb();
  if (isPgConnectedStatus() && drizzleDb) {
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
