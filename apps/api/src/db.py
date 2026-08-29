import os
import json
import logging
from typing import List, Optional, Dict, Any

logger = logging.getLogger(__name__)

# Configuración de URLs por variables de entorno
DATABASE_URL = os.getenv('DATABASE_URL') or (
    f"postgresql://{os.getenv('POSTGRES_USER', 'postgres')}:{os.getenv('POSTGRES_PASSWORD', 'postgres')}@"
    f"{os.getenv('POSTGRES_HOST', 'postgres')}:{os.getenv('POSTGRES_PORT', '5432')}/{os.getenv('POSTGRES_DB', 'pokedex_db')}"
)
REDIS_URL = os.getenv('REDIS_URL', 'redis://redis:6379/0')

_db_conn = None
_redis_client = None


def get_redis_client():
    global _redis_client
    if _redis_client is not None:
        return _redis_client
    try:
        import redis
        client = redis.from_url(REDIS_URL, decode_responses=True, socket_connect_timeout=1)
        client.ping()
        _redis_client = client
        logger.info("Conexión con Redis establecida con éxito.")
        return _redis_client
    except Exception as e:
        logger.debug(f"Redis no disponible ({e}), operando sin caché.")
        return None


def get_db_connection():
    try:
        import psycopg2
        import psycopg2.extras
        conn = psycopg2.connect(DATABASE_URL, connect_timeout=2)
        return conn
    except Exception as e:
        logger.debug(f"PostgreSQL no disponible ({e}), operando en memoria.")
        return None


def fetch_pokemons_from_db() -> Optional[List[Dict[str, Any]]]:
    """Obtiene la lista de Pokémon desde PostgreSQL con sus relaciones."""
    # 1. Intentar leer de caché Redis
    redis_cli = get_redis_client()
    if redis_cli:
        try:
            cached = redis_cli.get('pokemons_all')
            if cached:
                return json.loads(cached)
        except Exception:
            pass

    # 2. Consultar PostgreSQL
    conn = get_db_connection()
    if not conn:
        return None

    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            query = """
                SELECT 
                    p.id,
                    p.name_es AS nombre,
                    p.image_url AS imagen,
                    COALESCE(
                        (SELECT t.name FROM types t JOIN pokemon_types pt ON t.id = pt.type_id WHERE pt.pokemon_id = p.id ORDER BY pt.slot LIMIT 1),
                        'Normal'
                    ) AS tipo,
                    p.habitat,
                    json_build_object(
                        'peso', p.weight_kg::float,
                        'altura', p.height_m::float,
                        'fuerza', COALESCE(s.attack, 50),
                        'edad', COALESCE((p.metadata->>'edad')::int, 5)
                    ) AS caracteristicas,
                    COALESCE(
                        (SELECT array_agg(a.name) FROM abilities a JOIN pokemon_abilities pa ON a.id = pa.ability_id WHERE pa.pokemon_id = p.id),
                        ARRAY['Combate']::varchar[]
                    ) AS habilidades
                FROM pokemons p
                LEFT JOIN pokemon_stats s ON p.id = s.pokemon_id
                ORDER BY p.id ASC;
            """
            cur.execute(query)
            rows = cur.fetchall()
            result = [dict(r) for r in rows]

            # 3. Guardar en caché Redis con TTL de 60 segundos
            if redis_cli:
                try:
                    redis_cli.setex('pokemons_all', 60, json.dumps(result))
                except Exception:
                    pass

            return result
    except Exception as err:
        logger.error(f"Error consultando PostgreSQL: {err}")
        return None
    finally:
        conn.close()


def invalidate_cache():
    redis_cli = get_redis_client()
    if redis_cli:
        try:
            redis_cli.delete('pokemons_all')
        except Exception:
            pass
