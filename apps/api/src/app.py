import sys
from pathlib import Path

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from flask import Flask, jsonify, request, render_template

try:
    from apps.api.src.db import fetch_pokemons_from_db, invalidate_cache
except ImportError:
    try:
        from src.db import fetch_pokemons_from_db, invalidate_cache
    except ImportError:
        fetch_pokemons_from_db = lambda: None
        invalidate_cache = lambda: None

BASE_DIR = Path(__file__).resolve().parent.parent
app = Flask(
    __name__,
    template_folder=str(BASE_DIR / 'templates'),
    static_folder=str(BASE_DIR / 'static')
)
app.config['JSON_AS_ASCII'] = False
app.json.ensure_ascii = False

# Base de datos en memoria (Fallback / Testing)
pokemons = [
    {
        "id": 1,
        "nombre": "Pikachu",
        "imagen": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png",
        "caracteristicas": {
            "peso": 6.0,
            "altura": 0.4,
            "fuerza": 55,
            "edad": 5
        },
        "habilidades": ["Impactrueno", "Cola férrea"],
        "tipo": "Eléctrico",
        "habitat": "Bosques"
    },
    {
        "id": 2,
        "nombre": "Charmander",
        "imagen": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/4.png",
        "caracteristicas": {
            "peso": 8.5,
            "altura": 0.6,
            "fuerza": 52,
            "edad": 4
        },
        "habilidades": ["Mar llamas", "Lanzallamas"],
        "tipo": "Fuego",
        "habitat": "Montañas"
    }
]

# Contador para autoincrementar el ID
current_id = 3


def buscar_pokemon_por_id(pokemon_id):
    for pokemon in pokemons:
        if pokemon["id"] == pokemon_id:
            return pokemon
    return None


@app.route('/', methods=['GET'])
def index():
    """Ruta raíz de bienvenida (Servir HTML para navegadores, JSON para API)."""
    accept = request.headers.get('Accept', '')
    if 'text/html' in accept:
        return render_template('index.html')
    return jsonify({
        "mensaje": "¡Bienvenido a la API REST de Pokémon!",
        "rutas_disponibles": {
            "GET /pokemons": "Lista todos los Pokémon",
            "GET /pokemons/<id>": "Obtiene un Pokémon por ID",
            "POST /pokemons": "Crea un nuevo Pokémon",
            "PUT /pokemons/<id>": "Actualiza un Pokémon por ID",
            "DELETE /pokemons/<id>": "Elimina un Pokémon por ID"
        }
    }), 200


@app.route('/gui', methods=['GET'])
def gui():
    """Interfaz gráfica visual Web Dashboard."""
    return render_template('index.html')


@app.route('/pokemons', methods=['GET'])
def get_pokemons():
    """Obtiene la lista de todos los Pokémon desde BD (con fallback en memoria)."""
    db_pokemons = fetch_pokemons_from_db()
    if db_pokemons and len(db_pokemons) > 0 and not app.config.get('TESTING'):
        return jsonify(db_pokemons), 200
    return jsonify(pokemons), 200


@app.route('/pokemons/<int:id>', methods=['GET'])
def get_pokemon_by_id(id):
    """Obtiene un Pokémon específico por su ID."""
    pokemon = buscar_pokemon_por_id(id)
    if pokemon is None:
        return jsonify({"error": f"Pokémon con id {id} no encontrado"}), 404
    return jsonify(pokemon), 200


@app.route('/pokemons', methods=['POST'])
def create_pokemon():
    """Crea un nuevo Pokémon."""
    global current_id
    data = request.get_json()

    if not data:
        return jsonify({"error": "Cuerpo de solicitud JSON requerido"}), 400

    # Validar campos obligatorios
    campos_requeridos = ["nombre", "imagen", "caracteristicas", "habilidades", "tipo", "habitat"]
    for campo in campos_requeridos:
        if campo not in data:
            return jsonify({"error": f"Falta el campo obligatorio '{campo}'"}), 400

    caracteristicas = data.get("caracteristicas", {})
    subcampos_caracteristicas = ["peso", "altura", "fuerza", "edad"]
    for subcampo in subcampos_caracteristicas:
        if subcampo not in caracteristicas:
            return jsonify({"error": f"Falta el subcampo '{subcampo}' en caracteristicas"}), 400

    nuevo_pokemon = {
        "id": current_id,
        "nombre": str(data["nombre"]),
        "imagen": str(data["imagen"]),
        "caracteristicas": {
            "peso": float(caracteristicas["peso"]),
            "altura": float(caracteristicas["altura"]),
            "fuerza": int(caracteristicas["fuerza"]),
            "edad": int(caracteristicas["edad"])
        },
        "habilidades": list(data["habilidades"]),
        "tipo": str(data["tipo"]),
        "habitat": str(data["habitat"])
    }

    pokemons.append(nuevo_pokemon)
    current_id += 1
    invalidate_cache()

    return jsonify(nuevo_pokemon), 201


@app.route('/pokemons/<int:id>', methods=['PUT'])
def update_pokemon(id):
    """Actualiza la información de un Pokémon por su ID."""
    pokemon = buscar_pokemon_por_id(id)
    if pokemon is None:
        return jsonify({"error": f"Pokémon con id {id} no encontrado"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"error": "Cuerpo de solicitud JSON requerido"}), 400

    if "nombre" in data:
        pokemon["nombre"] = str(data["nombre"])
    if "imagen" in data:
        pokemon["imagen"] = str(data["imagen"])
    if "caracteristicas" in data and isinstance(data["caracteristicas"], dict):
        car = data["caracteristicas"]
        if "peso" in car:
            pokemon["caracteristicas"]["peso"] = float(car["peso"])
        if "altura" in car:
            pokemon["caracteristicas"]["altura"] = float(car["altura"])
        if "fuerza" in car:
            pokemon["caracteristicas"]["fuerza"] = int(car["fuerza"])
        if "edad" in car:
            pokemon["caracteristicas"]["edad"] = int(car["edad"])
    if "habilidades" in data:
        pokemon["habilidades"] = list(data["habilidades"])
    if "tipo" in data:
        pokemon["tipo"] = str(data["tipo"])
    if "habitat" in data:
        pokemon["habitat"] = str(data["habitat"])

    invalidate_cache()
    return jsonify(pokemon), 200


@app.route('/pokemons/<int:id>', methods=['DELETE'])
def delete_pokemon(id):
    """Elimina un Pokémon por su ID."""
    pokemon = buscar_pokemon_por_id(id)
    if pokemon is None:
        return jsonify({"error": f"Pokémon con id {id} no encontrado"}), 404

    pokemons.remove(pokemon)
    invalidate_cache()
    return jsonify({"mensaje": f"Pokémon con id {id} eliminado correctamente", "pokemon_eliminado": pokemon}), 200


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
