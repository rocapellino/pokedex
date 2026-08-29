import sys
import os
import json
import urllib.request
import urllib.error

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

try:
    from src.app import app
except ImportError:
    app = None

BASE_URL = "http://127.0.0.1:5000"


def run_test_put(pokemon_id=1):
    print("==================================================")
    print(f"SCRIPT: Probando PUT /pokemons/{pokemon_id} (Actualizar Pokemon)")
    print("==================================================")

    datos_actualizados = {
        "habitat": "Ciudad Paleta - Centro de Entrenamiento",
        "caracteristicas": {
            "fuerza": 99,
            "edad": 6
        }
    }

    try:
        json_data = json.dumps(datos_actualizados).encode('utf-8')
        req = urllib.request.Request(
            f"{BASE_URL}/pokemons/{pokemon_id}",
            data=json_data,
            headers={'Content-Type': 'application/json'},
            method='PUT'
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
                res = client.put(f'/pokemons/{pokemon_id}', json=datos_actualizados)
                status = res.status_code
                data = res.get_json()
        else:
            print(f"Error de conexion a {BASE_URL}: {err}")
            print("Asegurate de que la API este corriendo ('python app.py') o de usar el venv ('.venv').")
            print("==================================================\n")
            return

    print(f"Estado HTTP: {status}")
    print("Respuesta JSON (Pokemon Actualizado):")
    print(json.dumps(data, indent=2, ensure_ascii=False))
    print("==================================================\n")


if __name__ == '__main__':
    run_test_put(1)
