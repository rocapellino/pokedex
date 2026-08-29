import sys
import os
import pytest

# Agregar el directorio raíz al path para importar src.app
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.app import app, pokemons


@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client


def test_root_index(client):
    """Prueba GET / de bienvenida."""
    response = client.get('/')
    assert response.status_code == 200
    data = response.get_json()
    assert "rutas_disponibles" in data


def test_get_all_pokemons(client):
    """Prueba GET /pokemons para listar todos los Pokémon."""
    response = client.get('/pokemons')
    assert response.status_code == 200
    data = response.get_json()
    assert isinstance(data, list)
    assert len(data) >= 2
    assert data[0]['nombre'] == 'Pikachu'


def test_get_pokemon_by_id_success(client):
    """Prueba GET /pokemons/<id> cuando el Pokémon existe."""
    response = client.get('/pokemons/1')
    assert response.status_code == 200
    data = response.get_json()
    assert data['id'] == 1
    assert data['nombre'] == 'Pikachu'
    assert 'caracteristicas' in data
    assert data['caracteristicas']['peso'] == 6.0


def test_get_pokemon_by_id_not_found(client):
    """Prueba GET /pokemons/<id> cuando el Pokémon no existe."""
    response = client.get('/pokemons/999')
    assert response.status_code == 404
    data = response.get_json()
    assert 'error' in data


def test_create_pokemon_success(client):
    """Prueba POST /pokemons para crear un nuevo Pokémon."""
    nuevo_pokemon = {
        "nombre": "Bulbasaur",
        "imagen": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/1.png",
        "caracteristicas": {
            "peso": 6.9,
            "altura": 0.7,
            "fuerza": 49,
            "edad": 3
        },
        "habilidades": ["Espesura", "Clorofila"],
        "tipo": "Planta",
        "habitat": "Praderas"
    }
    response = client.post('/pokemons', json=nuevo_pokemon)
    assert response.status_code == 201
    data = response.get_json()
    assert data['nombre'] == 'Bulbasaur'
    assert data['id'] is not None
    assert data['caracteristicas']['peso'] == 6.9


def test_create_pokemon_missing_fields(client):
    """Prueba POST /pokemons con datos incompletos."""
    incompleto = {
        "nombre": "Squirtle"
    }
    response = client.post('/pokemons', json=incompleto)
    assert response.status_code == 400
    data = response.get_json()
    assert 'error' in data


def test_update_pokemon_success(client):
    """Prueba PUT /pokemons/<id> para actualizar un Pokémon."""
    actualizacion = {
        "habitat": "Ciudad",
        "caracteristicas": {
            "fuerza": 60
        }
    }
    response = client.put('/pokemons/1', json=actualizacion)
    assert response.status_code == 200
    data = response.get_json()
    assert data['id'] == 1
    assert data['habitat'] == 'Ciudad'
    assert data['caracteristicas']['fuerza'] == 60


def test_update_pokemon_not_found(client):
    """Prueba PUT /pokemons/<id> en un ID inexistente."""
    response = client.put('/pokemons/999', json={"nombre": "Inexistente"})
    assert response.status_code == 404


def test_delete_pokemon_success(client):
    """Prueba DELETE /pokemons/<id> para eliminar un Pokémon."""
    response_del = client.delete('/pokemons/2')
    assert response_del.status_code == 200

    response_get = client.get('/pokemons/2')
    assert response_get.status_code == 404


def test_delete_pokemon_not_found(client):
    """Prueba DELETE /pokemons/<id> con ID inexistente."""
    response = client.delete('/pokemons/999')
    assert response.status_code == 404
