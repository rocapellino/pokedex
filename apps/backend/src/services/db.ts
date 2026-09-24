// ==============================================================================
// Fachada Unificada de Almacenamiento & Persistencia (PostgreSQL, Redis & Memoria)
// Arquitectura Modular Desacoplada (IMP-ARC-001)
// ==============================================================================
import {
  connectPg,
  closePg,
  getDrizzleDb,
  getPostgresVersion,
  isPgConnectedStatus,
  getLastKnownPgCount
} from './postgres.js';
import {
  connectRedis,
  closeRedis,
  isCacheConnected,
  getRedisClient,
  invalidateCache,
  consumeDistributedRateLimit,
  setRevokedJti,
  isJtiRevokedInRedis
} from './cache.js';
import {
  getAllPokemons,
  getPokemonById,
  savePokemon,
  deletePokemon,
  getNextPokemonId,
  isWritableStorageAvailable,
  getMemoryMapSize
} from './pokemon.repository.js';

let heartbeatTimer: NodeJS.Timeout | null = null;

// ------------------------------------------------------------------------------
// 1. Heartbeat y Ciclo de Vida del Almacenamiento
// ------------------------------------------------------------------------------

export function startStorageHeartbeat(intervalMs = 5000): void {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(async () => {
    if (process.env.DATABASE_URL && !isPgConnectedStatus()) {
      await connectPg();
    }
    if (Boolean(process.env.REDIS_URL || process.env.REDIS_HOST) && !isCacheConnected()) {
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

/**
 * Cierra limpiamente las conexiones de persistencia y caché (PostgreSQL y Redis)
 * y detiene cualquier timer de reconexión o heartbeat activo.
 * Esencial para Graceful Shutdown en Kubernetes ante señales SIGTERM/SIGINT.
 */
export async function closeStorage(): Promise<void> {
  stopStorageHeartbeat();
  await Promise.allSettled([closePg(), closeRedis()]);
}

// ------------------------------------------------------------------------------
// 2. Diagnóstico & Salud del Almacenamiento
// ------------------------------------------------------------------------------

export function getStorageHealth(): {
  database: 'postgresql' | 'memory';
  postgres_connected: boolean;
  redis_connected: boolean;
  postgres_total_records: number | null;
  memory_total_records: number;
  total_records: number;
} {
  const pgConnected = isPgConnectedStatus();
  const redisConnected = isCacheConnected();
  const memorySize = getMemoryMapSize();
  const effectivePgCount = pgConnected ? (getLastKnownPgCount() ?? memorySize) : null;

  return {
    database: pgConnected ? 'postgresql' : 'memory',
    postgres_connected: pgConnected,
    redis_connected: redisConnected,
    postgres_total_records: effectivePgCount,
    memory_total_records: memorySize,
    total_records: effectivePgCount ?? memorySize,
  };
}

// ------------------------------------------------------------------------------
// 3. Re-exportaciones de Contratos Públicos (Compatibilidad Retrocompatible 100%)
// ------------------------------------------------------------------------------

export { getDrizzleDb, getPostgresVersion } from './postgres.js';

export {
  getAllPokemons,
  getPokemonById,
  savePokemon,
  deletePokemon,
  getNextPokemonId,
  isWritableStorageAvailable
} from './pokemon.repository.js';

export {
  invalidateCache,
  consumeDistributedRateLimit,
  setRevokedJti,
  isJtiRevokedInRedis,
  getRedisClient
} from './cache.js';
