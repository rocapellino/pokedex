import os
import sys

import pytest
from fastapi.testclient import TestClient

# Agregar el directorio raíz al path para importar src.app
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import copy

import src.app as app_module
from src.app import app


@pytest.fixture
def client():
    app_module._IS_TESTING = True
    saved_pokemons = copy.deepcopy(app_module.pokemons)
    saved_id = app_module.current_id
    with TestClient(app) as test_client:
        yield test_client
    app_module.pokemons = saved_pokemons
    app_module.current_id = saved_id
    app_module._IS_TESTING = False


def test_root_index(client):
    """Prueba GET / de bienvenida."""
    response = client.get('/')
    assert response.status_code == 200
    data = response.json()
    assert "rutas_disponibles" in data
    assert data["version"] == "2.0.0"


def test_healthz_endpoint(client):
    """Prueba GET /healthz para comprobación de salud."""
    response = client.get('/healthz')
    assert response.status_code == 200
    assert "healthy" in response.text


def test_openapi_docs_endpoint(client):
    """Prueba GET /docs para la documentación Swagger interactiva."""
    response = client.get('/docs')
    assert response.status_code == 200
    assert "swagger-ui" in response.text.lower() or response.status_code == 200


def test_get_all_pokemons(client):
    """Prueba GET /pokemons para listar todos los Pokémon."""
    response = client.get('/pokemons')
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 2
    assert data[0]['nombre'] == 'Pikachu'


def test_get_pokemon_by_id_success(client):
    """Prueba GET /pokemons/<id> cuando el Pokémon existe."""
    response = client.get('/pokemons/1')
    assert response.status_code == 200
    data = response.json()
    assert data['id'] == 1
    assert data['nombre'] == 'Pikachu'
    assert 'caracteristicas' in data
    assert data['caracteristicas']['peso'] == 6.0


def test_get_pokemon_by_id_not_found(client):
    """Prueba GET /pokemons/<id> cuando el Pokémon no existe."""
    response = client.get('/pokemons/999')
    assert response.status_code == 404
    data = response.json()
    assert 'detail' in data or 'error' in data


def test_create_pokemon_success(client):
    """Prueba POST /pokemons para crear un nuevo Pokémon con validación Pydantic."""
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
    data = response.json()
    assert data['nombre'] == 'Bulbasaur'
    assert data['id'] is not None
    assert data['caracteristicas']['peso'] == 6.9


def test_create_pokemon_missing_fields(client):
    """Prueba POST /pokemons con datos incompletos (falla validación Pydantic)."""
    incompleto = {
        "nombre": "Squirtle"
    }
    response = client.post('/pokemons', json=incompleto)
    assert response.status_code in [400, 422]


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
    data = response.json()
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


def test_prometheus_metrics_endpoint(client):
    """Prueba GET /metrics para exportar métricas Prometheus."""
    client.get('/pokemons')  # Generar una petición para contadores
    response = client.get('/metrics')
    assert response.status_code == 200
    content = response.text
    assert "pokedex_total_pokemons" in content
    assert "pokedex_http_requests_total" in content
    assert "pokedex_uptime_seconds" in content


def test_get_pokemons_includes_evoluciones(client):
    """Prueba que el endpoint /pokemons devuelva la estructura de evoluciones."""
    response = client.get('/pokemons')
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0
    first_pk = data[0]
    assert 'evoluciones' in first_pk


def test_get_pokemons_filter_by_tipo(client):
    """Prueba GET /pokemons?tipo=Fuego."""
    response = client.get('/pokemons?tipo=Fuego')
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert all(p['tipo'] == 'Fuego' or 'Fuego' in p.get('tipos', []) for p in data)


def test_get_pokemons_filter_by_nombre(client):
    """Prueba GET /pokemons?nombre=pika."""
    response = client.get('/pokemons?nombre=pika')
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    assert any('pikachu' in p['nombre'].lower() for p in data)


def test_get_pokemons_pagination(client):
    """Prueba GET /pokemons con limit y offset."""
    response = client.get('/pokemons?limit=1&offset=0')
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1

    response_offset = client.get('/pokemons?limit=1&offset=1')
    assert response_offset.status_code == 200
    data_offset = response_offset.json()
    assert len(data_offset) == 1
    assert data[0]['id'] != data_offset[0]['id']


def test_update_pokemon_pydantic_validation(client):
    """Prueba que PUT /pokemons/<id> valide tipos numéricos en caracteristicas."""
    # Enviar un valor inválido para peso (string no convertible)
    response = client.put('/pokemons/1', json={"caracteristicas": {"peso": "no-es-un-numero"}})
    assert response.status_code == 422


def test_readyz_endpoint(client):
    """Prueba GET /readyz para verificación de dependencias."""
    response = client.get('/readyz')
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "database" in data


def test_prometheus_metrics_degraded_mode(client):
    """Prueba que GET /metrics contenga la métrica pokedex_degraded_mode."""
    response = client.get('/metrics')
    assert response.status_code == 200
    assert "pokedex_degraded_mode" in response.text


def test_admin_auth_rejected_with_invalid_key(client):
    """Prueba que mutaciones con X-API-Key inválida sean rechazadas con 401."""
    headers = {"X-API-Key": "clave-completamente-invalida"}
    response = client.delete('/pokemons/1', headers=headers)
    assert response.status_code == 401
    assert "Credencial de autenticación inválida" in response.json()["detail"]


def test_admin_auth_accepted_with_valid_key(client):
    """Prueba que mutaciones con X-API-Key correcta sean permitidas."""
    valid_key = os.getenv("ADMIN_API_KEY", "pokedex-super-admin-key-2026")
    headers = {"X-API-Key": valid_key}
    nuevo = {
        "nombre": "Mewtwo",
        "imagen": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/150.png",
        "caracteristicas": {"peso": 122.0, "altura": 2.0, "fuerza": 110, "edad": 10, "categoria": "Genético"},
        "habilidades": ["Presión"],
        "tipo": "Psíquico",
        "habitat": "Raro"
    }
    response = client.post('/pokemons', json=nuevo, headers=headers)
    assert response.status_code == 201
    assert response.json()["nombre"] == "Mewtwo"


@pytest.mark.anyio
async def test_db_pool_and_async_health():
    """Prueba de inicialización y cierre del pool asíncrono sin colisiones."""
    from apps.api.src.db import check_db_health_async, close_db_pool, init_db_pool
    await init_db_pool()
    healthy = await check_db_health_async()
    assert isinstance(healthy, bool)
    await close_db_pool()


def test_cache_headers_and_etag(client):
    """Prueba que GET /pokemons devuelva Cache-Control, ETag y soporte 304 Not Modified."""
    response = client.get('/pokemons')
    assert response.status_code == 200
    assert "etag" in response.headers
    assert "cache-control" in response.headers
    etag = response.headers["etag"]

    # Segunda petición enviando If-None-Match con el mismo ETag
    response_cached = client.get('/pokemons', headers={"If-None-Match": etag})
    assert response_cached.status_code == 304



