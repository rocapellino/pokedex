import json
import logging
import os
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv('DATABASE_URL') or "postgresql://postgres:postgres_secure_password_k8s@postgres:5432/pokedex_db"
REDIS_URL = os.getenv('REDIS_URL') or "redis://redis:6379/0"

# Diccionario de traducción de ítems evolutivos (WikiDex / PKParaíso)
ITEM_TRANSLATIONS = {
    "thunder-stone": "Piedra Trueno",
    "fire-stone": "Piedra Fuego",
    "water-stone": "Piedra Agua",
    "leaf-stone": "Piedra Hoja",
    "moon-stone": "Piedra Lunar",
    "sun-stone": "Piedra Solar",
    "shiny-stone": "Piedra Día",
    "dusk-stone": "Piedra Noche",
    "dawn-stone": "Piedra Alba",
    "ice-stone": "Piedra Hielo",
    "oval-stone": "Piedra Oval",
    "sweet-apple": "Manzana Dulce",
    "tart-apple": "Manzana Ácida",
    "syrupy-apple": "Manzana Melosa",
    "kings-rock": "Roca del Rey",
    "metal-coat": "Revestimiento Metálico",
    "dragon-scale": "Escama Dragón",
    "up-grade": "Mejora",
    "dubious-disc": "Disco Extraño",
    "protector": "Protector",
    "electirizer": "Electrizador",
    "magmarizer": "Magmatizador",
    "reaper-cloth": "Telaterrible",
    "prism-scale": "Escama Bella",
    "whipped-dream": "Dulce de Nata",
    "sachet": "Saquito Fragante",
    "black-augurite": "Mineral Negro",
    "peat-block": "Bloque de Turba",
    "auspicious-armor": "Armadura Auspiciosa",
    "malicious-armor": "Armadura Maldita",
    "leaders-crest": "Distintivo de Líder",
    "scroll-of-darkness": "Manuscrito de las Sombras",
    "scroll-of-waters": "Manuscrito de las Aguas",
    "razor-claw": "Garra Afilada",
    "razor-fang": "Colmillo Agudo",
    "deep-sea-tooth": "Diente Marino",
    "deep-sea-scale": "Escama Marina",
    "cracked-pot": "Tetera Rota",
    "chipped-pot": "Tetera Agrietada",
    "unremarkable-teacup": "Cuenco Modesto",
    "masterpiece-teacup": "Cuenco Exquisito",
    "galarica-cuff": "Brazal Galanuez",
    "galarica-wreath": "Corona Galanuez"
}

def translate_trigger(det: dict) -> str:
    """Traduce los desencadenantes de evolución a español según WikiDex / PKParaíso."""
    if not det:
        return "Evolución especial"

    trig = det.get('trigger', {}).get('name', '')
    min_level = det.get('min_level')
    item = det.get('item', {})
    held_item = det.get('held_item', {})
    min_happiness = det.get('min_happiness')
    known_move = det.get('known_move', {})
    known_move_type = det.get('known_move_type', {})
    time_of_day = det.get('time_of_day', '')
    location = det.get('location', {})
    needs_rain = det.get('needs_overworld_rain')

    # 1. Por Nivel
    if min_level:
        cond = f"Nivel {min_level}"
        if time_of_day == 'day':
            cond += " (Día)"
        elif time_of_day == 'night':
            cond += " (Noche)"
        if held_item:
            item_name = ITEM_TRANSLATIONS.get(held_item.get('name', ''), held_item.get('name', '').title())
            cond += f" equipado con {item_name}"
        return cond

    # 2. Por Ítem evolutivo
    if item and item.get('name'):
        item_raw = item['name']
        item_es = ITEM_TRANSLATIONS.get(item_raw, item_raw.replace('-', ' ').title())
        return f"Usar {item_es}"

    # 3. Por Intercambio
    if trig == 'trade':
        if held_item and held_item.get('name'):
            item_raw = held_item['name']
            item_es = ITEM_TRANSLATIONS.get(item_raw, item_raw.replace('-', ' ').title())
            return f"Intercambio con {item_es}"
        if det.get('trade_species'):
            trade_sp = det['trade_species'].get('name', '').capitalize()
            return f"Intercambio por {trade_sp}"
        return "Intercambio"

    # 4. Por Amistad / Felicidad
    if min_happiness:
        if time_of_day == 'day':
            return "Amistad (De día)"
        elif time_of_day == 'night':
            return "Amistad (De noche)"
        return "Amistad alta + Nivel"

    # 5. Por Movimiento conocido
    if known_move and known_move.get('name'):
        move_name = known_move['name'].replace('-', ' ').title()
        return f"Conociendo {move_name}"

    if known_move_type and known_move_type.get('name'):
        tname = known_move_type['name'].capitalize()
        return f"Movimiento tipo {tname} + Amistad"

    # 6. Por Localización
    if location and location.get('name'):
        loc_name = location['name'].replace('-', ' ').title()
        return f"Subir nivel en {loc_name}"

    # 7. Condiciones especiales
    if needs_rain:
        return "Nivel 50+ con lluvia"
    if trig == 'shed':
        return "Espacio libre en equipo + Poké Ball"
    if trig == 'spin':
        return "Girar sobre sí mismo con Dulce"
    if trig == 'three-critical-hits':
        return "3 golpes críticos en 1 combate"
    if trig == 'take-damage':
        return "Recibir 49+ daño y cruzar arco de piedra"
    if trig == 'tower-of-darkness':
        return "Torre de las Sombras"
    if trig == 'tower-of-waters':
        return "Torre de las Aguas"
    if trig == 'level-up':
        return "Subir de nivel"

    return "Evolución especial"


def parse_evolution_tree(node: dict, parent_id: int = None, stage_idx: int = 0) -> dict:
    """Extrae recursivamente la estructura de árbol evolutivo jerárquico."""
    stage_names = ["Base", "Fase 1", "Fase 2", "Fase 3"]
    species_data = node.get('species', {})
    url = species_data.get('url', '')

    try:
        pokemon_id = int(url.rstrip('/').split('/')[-1])
    except (ValueError, IndexError):
        return None

    name = species_data.get('name', '').capitalize()

    method = None
    details = node.get('evolution_details', [])
    if details and len(details) > 0:
        method = translate_trigger(details[0])

    current_stage = stage_names[min(stage_idx, len(stage_names) - 1)]

    current_node = {
        "id": pokemon_id,
        "nombre": name,
        "etapa": current_stage,
        "metodo": method,
        "parent_id": parent_id,
        "imagen": f"https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/{pokemon_id}.png",
        "evolves_to": []
    }

    for child in node.get('evolves_to', []):
        child_tree = parse_evolution_tree(child, pokemon_id, stage_idx + 1)
        if child_tree:
            current_node["evolves_to"].append(child_tree)

    return current_node


def collect_member_ids(tree_node: dict) -> list:
    """Recolecta todos los IDs de Pokémon en un árbol evolutivo."""
    if not tree_node:
        return []
    ids = [tree_node['id']]
    for child in tree_node.get('evolves_to', []):
        ids.extend(collect_member_ids(child))
    return ids


def is_branched_tree(tree_node: dict) -> bool:
    """Determina si el árbol evolutivo tiene ramificaciones alternativas."""
    if not tree_node:
        return False
    if len(tree_node.get('evolves_to', [])) > 1:
        return True
    for child in tree_node.get('evolves_to', []):
        if is_branched_tree(child):
            return True
    return False


def fetch_chain(chain_id: int):
    """Descarga y parsea una cadena/árbol evolutivo de PokeAPI."""
    url = f"https://pokeapi.co/api/v2/evolution-chain/{chain_id}/"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req, timeout=8) as response:
            data = json.loads(response.read().decode('utf-8'))
            tree = parse_evolution_tree(data.get('chain', {}), None, 0)
            return tree
    except Exception:
        return None


def main():
    logger.info("🧬 Iniciando sincronización de Árboles Evolutivos (Soporte para ramas como Eevee)...")

    # 1. Descargar las cadenas evolutivas en paralelo
    family_trees = []

    with ThreadPoolExecutor(max_workers=30) as executor:
        futures = {executor.submit(fetch_chain, cid): cid for cid in range(1, 550)}
        completed = 0
        for future in as_completed(futures):
            completed += 1
            if completed % 100 == 0:
                logger.info(f"Progreso de descarga de árboles: {completed}/550...")
            tree = future.result()
            if tree:
                family_trees.append(tree)

    logger.info(f"✅ Se obtuvieron {len(family_trees)} árboles evolutivos.")

    # 2. Actualizar PostgreSQL
    import psycopg2
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    try:
        cur.execute("SELECT id, name_es FROM pokemons;")
        db_names = {row[0]: row[1] for row in cur.fetchall()}

        def localize_tree(node: dict) -> dict:
            if not node:
                return None
            nid = node['id']
            localized_name = db_names.get(nid, node['nombre'])
            return {
                "id": nid,
                "nombre": localized_name,
                "etapa": node['etapa'],
                "metodo": node['metodo'],
                "parent_id": node['parent_id'],
                "imagen": node['imagen'],
                "evolves_to": [localize_tree(child) for child in node.get('evolves_to', [])]
            }

        update_count = 0
        for tree in family_trees:
            localized_root = localize_tree(tree)
            is_branch = is_branched_tree(localized_root)
            member_ids = collect_member_ids(localized_root)

            payload = {
                "arbol": localized_root,
                "es_ramificada": is_branch
            }

            for pid in member_ids:
                if pid in db_names and pid <= 1025:
                    cur.execute("""
                        UPDATE pokemons 
                        SET metadata = jsonb_set(
                            COALESCE(metadata, '{}'::jsonb), 
                            '{evoluciones}', 
                            %s::jsonb
                        )
                        WHERE id = %s;
                    """, (json.dumps(payload), pid))
                    update_count += 1

        conn.commit()
        logger.info(f"🎉 Se actualizaron con éxito los árboles evolutivos de {update_count} Pokémon en PostgreSQL.")

    except Exception as e:
        conn.rollback()
        logger.error(f"Error actualizando árboles evolutivos en PostgreSQL: {e}")
        raise
    finally:
        cur.close()
        conn.close()

    # 3. Invalidar caché en Redis
    try:
        import redis
        r = redis.from_url(REDIS_URL)
        r.delete('pokemons_all')
        logger.info("⚡ Caché de Redis invalidada con éxito.")
    except Exception as e:
        logger.warning(f"No se pudo invalidar Redis: {e}")

    logger.info("✨ Sincronización jerárquica de evoluciones completada satisfactoriamente.")


if __name__ == '__main__':
    main()
