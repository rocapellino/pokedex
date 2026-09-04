# ==============================================================================
# Database & Cache Layer (Asyncpg Pool + Redis.asyncio)
# ==============================================================================
import contextlib
import json
import logging
import os
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Pools y clientes asíncronos en memoria
_db_pool = None
_async_redis_client = None
_sync_redis_client = None


def get_database_url() -> str:
    """Construye la URL de conexión a PostgreSQL a partir de variables de entorno seguras."""
    if os.getenv("DATABASE_URL"):
        return os.environ["DATABASE_URL"]
    user = os.getenv("POSTGRES_USER", "postgres")
    password = os.getenv("POSTGRES_PASSWORD", "postgres")
    host = os.getenv("POSTGRES_HOST") or os.getenv("DATABASE_HOST", "postgres")
    port = os.getenv("POSTGRES_PORT") or os.getenv("DATABASE_PORT", "5432")
    db = os.getenv("POSTGRES_DB") or os.getenv("DATABASE_NAME", "pokedex_db")
    return f"postgresql://{user}:{password}@{host}:{port}/{db}"


def get_redis_url() -> str:
    """Construye la URL de conexión a Redis a partir de variables de entorno."""
    if os.getenv("REDIS_URL"):
        return os.environ["REDIS_URL"]
    host = os.getenv("REDIS_HOST", "redis")
    port = os.getenv("REDIS_PORT", "6379")
    return f"redis://{host}:{port}/0"


# ==============================================================================
# Gestión Asíncrona del Pool de Conexiones (PostgreSQL - asyncpg)
# ==============================================================================

async def init_db_pool():
    """Inicializa el pool de conexiones asíncrono para PostgreSQL."""
    global _db_pool
    if _db_pool is not None:
        return _db_pool

    db_url = get_database_url()
    try:
        import asyncpg
        _db_pool = await asyncpg.create_pool(
            dsn=db_url,
            min_size=2,
            max_size=15,
            command_timeout=10,
            timeout=5
        )
        logger.info("[DB Pool] Pool de conexiones asyncpg inicializado exitosamente (min=2, max=15).")
        return _db_pool
    except Exception as e:
        logger.warning("[DB Pool] No se pudo inicializar el pool de asyncpg (%s). Operando en modo degradado.", e)
        _db_pool = None
        return None


async def close_db_pool():
    """Cierra limpiamente el pool de conexiones de PostgreSQL."""
    global _db_pool
    if _db_pool is not None:
        try:
            await _db_pool.close()
            logger.info("[DB Pool] Pool de conexiones asyncpg cerrado correctamente.")
        except Exception as e:
            logger.warning("[DB Pool] Error cerrando pool de conexiones: %s", e)
        finally:
            _db_pool = None


async def get_db_pool():
    """Retorna el pool de conexiones activo o intenta inicializarlo."""
    global _db_pool
    if _db_pool is None:
        await init_db_pool()
    return _db_pool


# ==============================================================================
# Gestión Asíncrona de Redis (redis.asyncio)
# ==============================================================================

async def get_async_redis_client():
    """Obtiene o inicializa el cliente asíncrono de Redis."""
    global _async_redis_client
    if _async_redis_client is not None:
        return _async_redis_client

    try:
        import redis.asyncio as aioredis
        client = aioredis.from_url(get_redis_url(), decode_responses=True, socket_connect_timeout=2)
        await client.ping()
        _async_redis_client = client
        return _async_redis_client
    except Exception as e:
        logger.warning("[Redis Async] Redis no disponible (%s), omitiendo capa de caché.", e)
        return None


async def close_async_redis_client():
    """Cierra la conexión asíncrona de Redis."""
    global _async_redis_client
    if _async_redis_client is not None:
        try:
            await _async_redis_client.close()
        except Exception:
            pass
        finally:
            _async_redis_client = None


# ==============================================================================
# Operaciones Asíncronas de Base de Datos y Caché (Sin Bloqueo del Event Loop)
# ==============================================================================

async def check_db_health_async() -> bool:
    """Verifica de forma no bloqueante la disponibilidad de PostgreSQL."""
    pool = await get_db_pool()
    if pool:
        try:
            async with pool.acquire() as conn:
                res = await conn.fetchval("SELECT 1;")
                return res == 1
        except Exception as e:
            logger.warning("[Healthcheck] Error comprobando salud de BD vía pool: %s", e)
            return False

    # Intento de conexión puntual si el pool no estuviese levantado
    try:
        import asyncpg
        conn = await asyncpg.connect(get_database_url(), timeout=2)
        await conn.execute("SELECT 1;")
        await conn.close()
        return True
    except Exception:
        return False


POKEMONS_SQL_QUERY = """
    SELECT
        p.id,
        p.name_es AS nombre,
        p.image_url AS imagen,
        COALESCE(
            (SELECT t.name FROM types t JOIN pokemon_types pt ON t.id = pt.type_id WHERE pt.pokemon_id = p.id ORDER BY pt.slot LIMIT 1),
            'Normal'
        ) AS tipo,
        COALESCE(
            (SELECT array_agg(t.name ORDER BY pt.slot) FROM types t JOIN pokemon_types pt ON t.id = pt.type_id WHERE pt.pokemon_id = p.id),
            ARRAY['Normal']::varchar[]
        ) AS tipos,
        p.habitat,
        json_build_object(
            'peso', p.weight_kg::float,
            'altura', p.height_m::float,
            'fuerza', COALESCE(s.attack, 50),
            'edad', COALESCE((p.metadata->>'edad')::int, 5),
            'categoria', COALESCE(p.metadata->>'categoria', p.habitat),
            'descripcion', p.metadata->>'descripcion'
        ) AS caracteristicas,
        json_build_object(
            'hp', COALESCE(s.hp, 45),
            'attack', COALESCE(s.attack, 49),
            'defense', COALESCE(s.defense, 49),
            'sp_attack', COALESCE(s.sp_attack, 65),
            'sp_defense', COALESCE(s.sp_defense, 65),
            'speed', COALESCE(s.speed, 45)
        ) AS stats,
        COALESCE(
            (SELECT array_agg(a.name) FROM abilities a JOIN pokemon_abilities pa ON a.id = pa.ability_id WHERE pa.pokemon_id = p.id),
            ARRAY['Espesura']::varchar[]
        ) AS habilidades,
        COALESCE(p.metadata->'evoluciones', '[]'::jsonb) AS evoluciones
    FROM pokemons p
    LEFT JOIN pokemon_stats s ON p.id = s.pokemon_id
    ORDER BY p.id ASC;
"""


def _deserialize_json_fields(item: Dict[str, Any]) -> Dict[str, Any]:
    """Deserializa campos JSON si el motor de base de datos los devuelve como string plano."""
    for key in ('caracteristicas', 'stats', 'evoluciones'):
        val = item.get(key)
        if isinstance(val, str):
            with contextlib.suppress(Exception):
                item[key] = json.loads(val)
    return item


async def fetch_pokemons_from_db_async() -> Optional[List[Dict[str, Any]]]:
    """Obtiene la lista de Pokémon de forma asíncrona desde Redis o PostgreSQL con pool."""
    # 1. Intentar lectura en Redis asíncrono
    redis_cli = await get_async_redis_client()
    if redis_cli:
        try:
            cached = await redis_cli.get('pokemons_all')
            if cached:
                return json.loads(cached)
        except Exception as e:
            logger.debug("[Cache] Fallo al leer caché Redis: %s", e)

    # 2. Consultar PostgreSQL usando el pool de conexiones
    pool = await get_db_pool()
    if not pool:
        return None

    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch(POKEMONS_SQL_QUERY)
            result = [_deserialize_json_fields(dict(r)) for r in rows]

            # 3. Guardar en Redis asíncrono con TTL de 300 segundos
            if redis_cli and result:
                with contextlib.suppress(Exception):
                    await redis_cli.setex('pokemons_all', 300, json.dumps(result))

            return result

    except Exception as err:
        logger.error("[DB Async] Error consultando PostgreSQL: %s", err)
        return None


async def invalidate_cache_async():
    """Invalida la clave de caché de forma asíncrona."""
    redis_cli = await get_async_redis_client()
    if redis_cli:
        with contextlib.suppress(Exception):
            await redis_cli.delete('pokemons_all')


# ==============================================================================
# Wrappers Síncronos Compatibles (Legacy / Scripts auxiliares)
# ==============================================================================

def get_redis_client():
    global _sync_redis_client
    if _sync_redis_client is not None:
        return _sync_redis_client
    try:
        import redis
        client = redis.from_url(get_redis_url(), decode_responses=True, socket_connect_timeout=2)
        client.ping()
        _sync_redis_client = client
        return _sync_redis_client
    except Exception as e:
        logger.warning("Redis no disponible (%s), omitiendo capa de caché.", e)
        return None


def get_db_connection():
    try:
        import psycopg2
        return psycopg2.connect(get_database_url(), connect_timeout=3)
    except Exception as e:
        logger.error("CRITICAL: PostgreSQL no disponible (%s), operando en modo degradado en memoria.", e)
        return None


def check_db_health() -> bool:
    conn = get_db_connection()
    if conn:
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT 1;")
            return True
        except Exception:
            return False
        finally:
            conn.close()
    return False


def fetch_pokemons_from_db() -> Optional[List[Dict[str, Any]]]:
    conn = get_db_connection()
    if not conn:
        return None
    try:
        import psycopg2.extras
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(POKEMONS_SQL_QUERY)
            rows = cur.fetchall()
            return [dict(r) for r in rows]
    except Exception as err:
        logger.error("Error consultando PostgreSQL: %s", err)
        return None
    finally:
        conn.close()


def invalidate_cache():
    redis_cli = get_redis_client()
    if redis_cli:
        with contextlib.suppress(Exception):
            redis_cli.delete('pokemons_all')
