// ==============================================================================
// Módulo de Caché y Coordinación Distribuida (Redis)
// ==============================================================================
import { Redis } from 'ioredis';
import { logger } from '../utils/logger.js';

const REDIS_URL = process.env.REDIS_URL || (
  process.env.REDIS_HOST
    ? `redis://${process.env.REDIS_PASSWORD ? `:${encodeURIComponent(process.env.REDIS_PASSWORD)}@` : ''}${process.env.REDIS_HOST}:${process.env.REDIS_PORT || 6379}`
    : undefined
);

let redisClient: Redis | null = null;
let isRedisConnected = false;

export async function connectRedis(): Promise<boolean> {
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

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
      logger.info('[Cache: Redis] Conexión cerrada limpiamente');
    } catch {
      try {
        redisClient.disconnect();
      } catch {
        // Ignorar si ya estaba desconectado
      }
    } finally {
      redisClient = null;
      isRedisConnected = false;
    }
  }
}

export function isCacheConnected(): boolean {
  return isRedisConnected;
}

export function getRedisClient(): Redis | null {
  return isRedisConnected ? redisClient : null;
}

/**
 * Invalida caché de ítems individuales y avanza la versión de listados de forma atómica O(1).
 */
export async function invalidateCache(id?: number): Promise<void> {
  if (!isRedisConnected || !redisClient) return;

  try {
    if (id !== undefined) {
      await redisClient.del(`pokedex:item:${id}`);
    }

    // Invalidación atómica O(1) sin escaneo bloqueante:
    // El incremento de versión deja obsoletas todas las claves pokedex:list:v* anteriores
    // permitiendo que expiren pasivamente mediante su TTL de 60 segundos
    await redisClient.incr('pokedex:list_version');
  } catch {
    // Ignorar errores de invalidación de caché
  }
}

/**
 * Rate limiter distribuido respaldado por Redis con script Lua 100% atómico.
 */
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
  } catch {
    return null; // Degradación elegante ante errores temporales de Redis
  }
}

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
