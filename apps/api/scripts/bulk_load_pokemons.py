import os
import sys
import json
import logging
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

# Configuración de base de datos
DATABASE_URL = os.getenv('DATABASE_URL') or "postgresql://postgres:postgres@localhost:5432/pokedex_db"
REDIS_URL = os.getenv('REDIS_URL') or "redis://localhost:6379/0"

# Mapeo de tipos en español (WikiDex)
TYPE_TRANSLATIONS = {
    "normal": "Normal",
    "fighting": "Lucha",
    "flying": "Volador",
    "poison": "Veneno",
    "ground": "Tierra",
    "rock": "Roca",
    "bug": "Bicho",
    "ghost": "Fantasma",
    "steel": "Acero",
    "fire": "Fuego",
    "water": "Agua",
    "grass": "Planta",
    "electric": "Eléctrico",
    "psychic": "Psíquico",
    "ice": "Hielo",
    "dragon": "Dragón",
    "dark": "Siniestro",
    "fairy": "Hada"
}

TYPE_COLORS = {
    "Eléctrico": "#FACC15",
    "Fuego": "#EF4444",
    "Agua": "#3B82F6",
    "Planta": "#10B981",
    "Psíquico": "#EC4899",
    "Roca": "#B45309",
    "Tierra": "#D97706",
    "Hielo": "#06B6D4",
    "Fantasma": "#8B5CF6",
    "Dragón": "#6366F1",
    "Normal": "#6B7280",
    "Lucha": "#DC2626",
    "Veneno": "#A855F7",
    "Bicho": "#84CC16",
    "Volador": "#38BDF8",
    "Acero": "#94A3B8",
    "Siniestro": "#334155",
    "Hada": "#F472B6"
}

def get_generation_id(dex_number: int) -> int:
    if dex_number <= 151:
        return 1
    elif dex_number <= 251:
        return 2
    elif dex_number <= 386:
        return 3
    elif dex_number <= 493:
        return 4
    elif dex_number <= 649:
        return 5
    elif dex_number <= 721:
        return 6
    elif dex_number <= 809:
        return 7
    elif dex_number <= 905:
        return 8
    else:
        return 9

def get_generation_region(gen_id: int) -> str:
    regions = {
        1: "Kanto",
        2: "Johto",
        3: "Hoenn",
        4: "Sinnoh",
        5: "Teselia",
        6: "Kalos",
        7: "Alola",
        8: "Galar",
        9: "Paldea"
    }
    return regions.get(gen_id, "Desconocida")

def fetch_pokemon_details(pokemon_id: int) -> dict:
    url = f"https://pokeapi.co/api/v2/pokemon/{pokemon_id}"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode('utf-8'))
            
            raw_name = data['name'].capitalize()
            height_m = round(data['height'] / 10.0, 2)
            weight_kg = round(data['weight'] / 10.0, 2)
            
            types = []
            for t in sorted(data['types'], key=lambda x: x['slot']):
                type_name = TYPE_TRANSLATIONS.get(t['type']['name'], t['type']['name'].capitalize())
                types.append(type_name)
                
            abilities = []
            for a in data['abilities']:
                abilities.append({
                    "name": a['ability']['name'].replace('-', ' ').title(),
                    "is_hidden": a['is_hidden'],
                    "slot": a['slot']
                })
                
            stats = {}
            for s in data['stats']:
                stats[s['stat']['name']] = s['base_stat']
                
            artwork_url = (
                data.get('sprites', {})
                    .get('other', {})
                    .get('official-artwork', {})
                    .get('front_default') or 
                f"https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/{pokemon_id}.png"
            )
            
            gen_id = get_generation_id(pokemon_id)
            region = get_generation_region(gen_id)

            return {
                "id": pokemon_id,
                "national_number": pokemon_id,
                "name_es": raw_name,
                "name_en": raw_name,
                "height_m": height_m,
                "weight_kg": weight_kg,
                "habitat": region,
                "generation_id": gen_id,
                "image_url": artwork_url,
                "types": types,
                "abilities": abilities,
                "stats": {
                    "hp": stats.get('hp', 50),
                    "attack": stats.get('attack', 50),
                    "defense": stats.get('defense', 50),
                    "sp_attack": stats.get('special-attack', 50),
                    "sp_defense": stats.get('special-defense', 50),
                    "speed": stats.get('speed', 50)
                }
            }
    except Exception as e:
        logger.warning(f"Error descargando Pokémon #{pokemon_id}: {e}")
        return None


def bulk_load_to_postgres(pokemons_data: list):
    import psycopg2
    from psycopg2.extras import execute_batch

    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    try:
        # Asegurar tipos
        for type_name, color in TYPE_COLORS.items():
            cur.execute("""
                INSERT INTO types (name, color_hex)
                VALUES (%s, %s)
                ON CONFLICT (name) DO UPDATE SET color_hex = EXCLUDED.color_hex;
            """, (type_name, color))

        # Obtener mapa de tipos
        cur.execute("SELECT id, name FROM types;")
        types_map = {name: id for id, name in cur.fetchall()}

        # Insertar / Actualizar Pokemons
        pokemon_records = []
        for p in pokemons_data:
            if not p:
                continue
            pokemon_records.append((
                p['id'],
                p['national_number'],
                p['name_es'],
                p['name_en'],
                p['height_m'],
                p['weight_kg'],
                p['habitat'],
                p['generation_id'],
                p['image_url'],
                json.dumps({"fuerza": p['stats']['attack'], "edad": max(1, p['id'] % 10)})
            ))

        execute_batch(cur, """
            INSERT INTO pokemons (id, national_number, name_es, name_en, height_m, weight_kg, habitat, generation_id, image_url, metadata)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
            ON CONFLICT (id) DO UPDATE SET
                name_es = EXCLUDED.name_es,
                height_m = EXCLUDED.height_m,
                weight_kg = EXCLUDED.weight_kg,
                habitat = EXCLUDED.habitat,
                image_url = EXCLUDED.image_url,
                metadata = EXCLUDED.metadata;
        """, pokemon_records)

        # Insertar Stats
        stats_records = []
        for p in pokemons_data:
            if not p:
                continue
            st = p['stats']
            stats_records.append((
                p['id'],
                st['hp'],
                st['attack'],
                st['defense'],
                st['sp_attack'],
                st['sp_defense'],
                st['speed']
            ))

        execute_batch(cur, """
            INSERT INTO pokemon_stats (pokemon_id, hp, attack, defense, sp_attack, sp_defense, speed)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (pokemon_id) DO UPDATE SET
                hp = EXCLUDED.hp,
                attack = EXCLUDED.attack,
                defense = EXCLUDED.defense,
                sp_attack = EXCLUDED.sp_attack,
                sp_defense = EXCLUDED.sp_defense,
                speed = EXCLUDED.speed;
        """, stats_records)

        # Insertar Tipos de Pokémon
        type_records = []
        for p in pokemons_data:
            if not p:
                continue
            for slot, type_name in enumerate(p['types'], 1):
                type_id = types_map.get(type_name)
                if type_id:
                    type_records.append((p['id'], type_id, slot))

        execute_batch(cur, """
            INSERT INTO pokemon_types (pokemon_id, type_id, slot)
            VALUES (%s, %s, %s)
            ON CONFLICT (pokemon_id, type_id) DO NOTHING;
        """, type_records)

        # Insertar Habilidades
        for p in pokemons_data:
            if not p:
                continue
            for ab in p['abilities']:
                cur.execute("""
                    INSERT INTO abilities (name, description)
                    VALUES (%s, %s)
                    ON CONFLICT (name) DO NOTHING;
                """, (ab['name'], f"Habilidad especial de combate: {ab['name']}"))
                
                cur.execute("SELECT id FROM abilities WHERE name = %s;", (ab['name'],))
                ability_id = cur.fetchone()[0]

                cur.execute("""
                    INSERT INTO pokemon_abilities (pokemon_id, ability_id, is_hidden, slot)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (pokemon_id, ability_id) DO NOTHING;
                """, (p['id'], ability_id, ab['is_hidden'], ab['slot']))

        conn.commit()
        logger.info(f"✅ Se insertaron/actualizaron {len(pokemon_records)} Pokémon en PostgreSQL con éxito.")
    except Exception as e:
        conn.rollback()
        logger.error(f"Error durante bulk load en PostgreSQL: {e}")
        raise
    finally:
        cur.close()
        conn.close()


def invalidate_redis_cache():
    try:
        import redis
        r = redis.from_url(REDIS_URL)
        r.delete('pokemons_all')
        logger.info("⚡ Caché de Redis invalidada correctamente.")
    except Exception as e:
        logger.warning(f"No se pudo invalidar Redis: {e}")


def main():
    total_limit = int(os.getenv('POKEMON_LIMIT', '1025'))
    logger.info(f"🚀 Iniciando carga masiva de los {total_limit} Pokémon de WikiDex / Pokédex (Generaciones I a IX)...")

    results = []
    with ThreadPoolExecutor(max_workers=30) as executor:
        futures = {executor.submit(fetch_pokemon_details, i): i for i in range(1, total_limit + 1)}
        for future in as_completed(futures):
            res = future.result()
            if res:
                results.append(res)
                if len(results) % 25 == 0 or len(results) == total_limit:
                    logger.info(f"Progreso de descarga: {len(results)}/{total_limit} Pokémon...")

    results.sort(key=lambda x: x['id'])
    logger.info(f"💾 Guardando {len(results)} Pokémon en PostgreSQL...")
    bulk_load_to_postgres(results)
    invalidate_redis_cache()
    logger.info("🎉 ¡Carga masiva completada con éxito!")


if __name__ == '__main__':
    main()

