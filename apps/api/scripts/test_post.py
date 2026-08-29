import sys
import os
import json
import urllib.request
import urllib.error

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

try:
    from src.app import app
except ImportError:
    app = None

BASE_URL = "http://127.0.0.1:5000"


def run_test_post():
    print("==================================================")
    print("SCRIPT: Probando POST /pokemons (Crear nuevo Pokemon)")
    print("==================================================")

    nuevo_pokemon = {
        "nombre": "Squirtle",
        "imagen": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/7.png",
        "caracteristicas": {
            "peso": 9.0,
            "altura": 0.5,
            "fuerza": 48,
            "edad": 3
        },
        "habilidades": ["Torrente", "Cura Lluvia"],
        "tipo": "Agua",
        "habitat": "Dulce-acuatico"
    }

    try:
        json_data = json.dumps(nuevo_pokemon).encode('utf-8')
        req = urllib.request.Request(
            f"{BASE_URL}/pokemons",
            data=json_data,
            headers={'Content-Type': 'application/json'},
            method='POST'
        )
        with urllib.request.urlopen(req) as response:
            status = response.status
            data = json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        status = e.code
        data = json.loads(e.read().decode('utf-8'))
    except Exception as err:
        if app is not None:
            with app.test_client() as client:
                res = client.post('/pokemons', json=nuevo_pokemon)
                status = res.status_code
                data = res.get_json()
        else:
            print(f"Error de conexion a {BASE_URL}: {err}")
            print("Asegurate de que la API este corriendo ('python app.py') o de usar el venv ('.venv').")
            print("==================================================\n")
            return

    print(f"Estado HTTP: {status}")
    print("Respuesta JSON (Pokemon Creado):")
    print(json.dumps(data, indent=2, ensure_ascii=False))
    print("==================================================\n")


if __name__ == '__main__':
    run_test_post()
