# ==============================================================================
# Pruebas Unitarias para los Servicios de Google AI Studio (Gemini & Imagen 3)
# ==============================================================================
import os
import sys
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Definir las variables requeridas antes de importar el módulo (falla en startup si no están)
os.environ.setdefault("ADMIN_API_KEY", "test-admin-key-do-not-use-in-production")
os.environ.setdefault("AI_API_KEY", "test-ai-key-do-not-use-in-production")

import src.app as app_module
from src.ai_service import (
    generate_flowchart,
    generate_image_asset,
    generate_ui_mockup,
    get_ai_client,
    sanitize_ai_html,
)
from src.app import app


@pytest.fixture
def client():
    os.environ["TESTING"] = "true"
    app.dependency_overrides[app_module.verify_ai_key] = lambda: True
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_ai_client_missing_key(monkeypatch):
    """Verifica que sin API Key retorne None con seguridad."""
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    assert get_ai_client() is None


def test_ai_diagram_service_without_key(monkeypatch):
    """Verifica que el generador de diagramas maneje la falta de API Key adecuadamente."""
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    result = generate_flowchart("Flujo de login")
    assert result["success"] is False
    assert "GEMINI_API_KEY" in result["error"]


def test_ai_mockup_service_without_key(monkeypatch):
    """Verifica que el generador de mockups maneje la falta de API Key adecuadamente."""
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    result = generate_ui_mockup("Card de Pikachu")
    assert result["success"] is False
    assert "GEMINI_API_KEY" in result["error"]


def test_ai_image_service_without_key(monkeypatch):
    """Verifica que el generador de imágenes maneje la falta de API Key adecuadamente."""
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    result = generate_image_asset("Pikachu con armadura")
    assert result["success"] is False
    assert "GEMINI_API_KEY" in result["error"]


@patch("src.app.generate_flowchart")
def test_ai_diagram_endpoint(mock_flowchart, client):
    """Prueba POST /api/v1/ai/diagram con respuesta mockeada."""
    mock_flowchart.return_value = {
        "success": True,
        "diagram_type": "flowchart",
        "mermaid_code": "graph TD;\nA-->B;",
        "model": "gemini-2.0-flash",
    }

    response = client.post("/api/v1/ai/diagram", json={"prompt": "Flujo de prueba", "diagram_type": "flowchart"})
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["mermaid_code"] == "graph TD;\nA-->B;"


@patch("src.app.generate_ui_mockup")
def test_ai_mock_endpoint(mock_ui, client):
    """Prueba POST /api/v1/ai/mock con respuesta mockeada."""
    mock_ui.return_value = {
        "success": True,
        "framework": "html/css",
        "html_code": "<div class='card'>Pokemon</div>",
        "model": "gemini-2.0-flash",
    }

    response = client.post("/api/v1/ai/mock", json={"prompt": "Pokemon Card", "framework": "html/css"})
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "<div class='card'>" in data["html_code"]


@patch("src.app.generate_image_asset")
def test_ai_image_endpoint(mock_image, client):
    """Prueba POST /api/v1/ai/image con respuesta mockeada."""
    mock_image.return_value = {
        "success": True,
        "prompt": "Charizard digital art",
        "aspect_ratio": "1:1",
        "image_base64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "model": "imagen-3.0-generate-002",
    }

    response = client.post("/api/v1/ai/image", json={"prompt": "Charizard digital art", "aspect_ratio": "1:1"})
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "image_base64" in data


def test_ai_image_endpoint_invalid_aspect_ratio(client):
    """Verifica que un aspect_ratio inválido retorne error 422 de validación Pydantic."""
    response = client.post("/api/v1/ai/image", json={"prompt": "Charizard", "aspect_ratio": "invalid_ratio"})
    assert response.status_code == 422


@patch("src.ai_service.get_ai_client")
def test_generate_flowchart_end_to_end_mock(mock_get_client):
    """Prueba de integración simulada con SDK de Google GenAI retornando bloque Mermaid."""
    from unittest.mock import MagicMock

    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.text = "```mermaid\ngraph TD;\n    A[Inicio] --> B[Fin];\n```"
    mock_client.models.generate_content.return_value = mock_response
    mock_get_client.return_value = mock_client

    result = generate_flowchart("Flujo de autenticación", diagram_type="flowchart")
    assert result["success"] is True
    assert result["mermaid_code"] == "graph TD;\n    A[Inicio] --> B[Fin];"
    assert result["model"] == "gemini-3.6-flash"


def test_sanitize_ai_html_removes_dangerous_tags_and_events():
    """Verifica que el sanitizador elimine scripts, eventos on*, iframes y pseudo-URLs javascript:."""
    malicious_input = (
        "<div class='pokemon-card' onclick=\"alert('hack')\">"
        "<h3>Pikachu</h3>"
        "<script>stealTokens();</script>"
        "<img src='poke.png' onerror='maliciousCode()' />"
        "<iframe src='http://evil.com'></iframe>"
        "<a href='javascript:exploit()'>Detalles</a>"
        "</div>"
    )
    cleaned = sanitize_ai_html(malicious_input)
    assert "<script" not in cleaned
    assert "stealTokens" not in cleaned
    assert "onclick" not in cleaned
    assert "onerror" not in cleaned
    assert "<iframe" not in cleaned
    assert "javascript:" not in cleaned
    assert "<div class='pokemon-card'" in cleaned
    assert "<h3>Pikachu</h3>" in cleaned


def test_ai_diagram_endpoint_prompt_length_validation(client):
    """Verifica rechazo con 422 si el prompt es menor a 3 caracteres o excede 1000."""
    res_short = client.post("/api/v1/ai/diagram", json={"prompt": "hi"})
    assert res_short.status_code == 422

    long_prompt = "A" * 1001
    res_long = client.post("/api/v1/ai/diagram", json={"prompt": long_prompt})
    assert res_long.status_code == 422


def test_ai_mock_endpoint_prompt_length_validation(client):
    """Verifica rechazo con 422 si el prompt de mockup es menor a 3 caracteres o mayor a 1000."""
    res_short = client.post("/api/v1/ai/mock", json={"prompt": "ab"})
    assert res_short.status_code == 422

    res_long = client.post("/api/v1/ai/mock", json={"prompt": "A" * 1001})
    assert res_long.status_code == 422


