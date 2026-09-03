import logging
import os
import sys
import time
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

import hashlib
import json
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response, Security, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse
from fastapi.security import APIKeyHeader
from pydantic import BaseModel, Field
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

logger = logging.getLogger(__name__)

try:
    from apps.api.src.db import (
        check_db_health_async,
        close_db_pool,
        fetch_pokemons_from_db_async,
        init_db_pool,
        invalidate_cache_async,
    )
except ImportError:
    try:
        from src.db import (
            check_db_health_async,
            close_db_pool,
            fetch_pokemons_from_db_async,
            init_db_pool,
            invalidate_cache_async,
        )
    except ImportError:
        async def init_db_pool():
            return None
        async def close_db_pool():
            pass
        async def fetch_pokemons_from_db_async():
            return None
        async def invalidate_cache_async():
            pass
        async def check_db_health_async():
            return False

try:
    from apps.api.src.ai_service import generate_flowchart, generate_image_asset, generate_ui_mockup
except ImportError:
    try:
        from src.ai_service import generate_flowchart, generate_image_asset, generate_ui_mockup
    except ImportError:
        def generate_flowchart(prompt: str, diagram_type: str = "flowchart"):
            return {"success": False, "error": "AI service unavailable", "mermaid_code": None}
        def generate_ui_mockup(prompt: str, framework: str = "html/css"):
            return {"success": False, "error": "AI service unavailable", "html_code": None}
        def generate_image_asset(prompt: str, aspect_ratio: str = "1:1"):
            return {"success": False, "error": "AI service unavailable", "image_base64": None}

try:
    from apps.api.src.telemetry import setup_telemetry
except ImportError:
    try:
        from src.telemetry import setup_telemetry
    except ImportError:
        def setup_telemetry(app, service_name: str = "pokedex-api"):
            return False

BASE_DIR = Path(__file__).resolve().parent.parent

# ==============================================================================
# Ciclo de Vida Asíncrono (Pool de Base de Datos) & Rate Limiting
# ==============================================================================
@asynccontextmanager
async def lifespan(app_instance: FastAPI):
    # Startup: Inicializar pool de conexiones asyncpg
    if not _IS_TESTING:
        await init_db_pool()
    yield
    # Shutdown: Cerrar pool de conexiones limpiamente
    if not _IS_TESTING:
        await close_db_pool()

limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])

app = FastAPI(
    title="Pokédex REST API",
    description="API REST de Alto Rendimiento para Pokédex con soporte asíncrono, OpenAPI, observabilidad y Google AI Studio.",
    version="1.2.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Inicialización de Trazabilidad Distribuida (APM) con OpenTelemetry y Grafana Tempo
setup_telemetry(app)

# ==============================================================================
# Seguridad: Autenticación por Cabecera X-API-Key para Endpoints de Mutación
# ==============================================================================
API_KEY_NAME = "X-API-Key"
api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=False)
ADMIN_API_KEY = os.getenv("ADMIN_API_KEY", "pokedex-super-admin-key-2026")


async def verify_admin_key(
    api_key: Optional[str] = Security(api_key_header),
):
    """
    Verifica que la petición incluya una cabecera X-API-Key válida.
    En testing (_IS_TESTING=True) permite el paso si la cabecera no se envió,
    pero rechaza con 401 si se envía una clave explícitamente incorrecta.
    """
    if _IS_TESTING and api_key is None:
        return True
    if not api_key or api_key != ADMIN_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credencial de autenticación inválida o faltante en la cabecera X-API-Key",
            headers={"WWW-Authenticate": "ApiKey"}
        )
    return True


# Configuración de CORS segura con lista explícita de orígenes permitidos
cors_origins_env = os.getenv("CORS_ORIGINS")
if cors_origins_env:
    allowed_origins = [o.strip() for o in cors_origins_env.split(",") if o.strip()]
else:
    allowed_origins = [
        "http://localhost:3000",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://localhost:5000",
        "http://127.0.0.1:5000",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Métricas Prometheus en memoria y estado operativo
_APP_START_TIME = time.time()
_HTTP_REQUESTS_TOTAL = defaultdict(int)
_HTTP_REQUEST_DURATION_SECONDS = defaultdict(float)
_HTTP_REQUEST_COUNT = defaultdict(int)
_IS_TESTING = False
_IS_DEGRADED_MODE = False


@app.middleware("http")
async def metrics_middleware(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    duration = time.time() - start_time

    endpoint = request.url.path
    method = request.method
    status_code = response.status_code

    key = (method, endpoint, status_code)
    _HTTP_REQUESTS_TOTAL[key] += 1
    dur_key = (method, endpoint)
    _HTTP_REQUEST_DURATION_SECONDS[dur_key] += duration
    _HTTP_REQUEST_COUNT[dur_key] += 1

    return response


# ==============================================================================
# Modelos Pydantic (Validación y Serialización)
# ==============================================================================
class CaracteristicasSchema(BaseModel):
    peso: float = Field(..., description="Peso en kilogramos")
    altura: float = Field(..., description="Altura en metros")
    fuerza: int = Field(50, description="Puntos de fuerza de combate")
    edad: int = Field(5, description="Edad estimada")
    categoria: Optional[str] = None
    descripcion: Optional[str] = None


class PokemonCreateSchema(BaseModel):
    nombre: str = Field(..., min_length=1, description="Nombre en español del Pokémon")
    imagen: str = Field(..., description="URL oficial del artwork o sprite")
    caracteristicas: CaracteristicasSchema
    habilidades: List[str] = Field(default_factory=list, description="Lista de habilidades")
    tipo: str = Field(..., description="Tipo elemental principal")
    habitat: str = Field(..., description="Hábitat o región")
    tipos: Optional[List[str]] = None
    stats: Optional[Dict[str, int]] = None
    evoluciones: Optional[Any] = None


class CaracteristicasUpdateSchema(BaseModel):
    peso: Optional[float] = Field(None, description="Peso en kilogramos")
    altura: Optional[float] = Field(None, description="Altura en metros")
    fuerza: Optional[int] = Field(None, description="Puntos de fuerza de combate")
    edad: Optional[int] = Field(None, description="Edad estimada")
    categoria: Optional[str] = None
    descripcion: Optional[str] = None


class PokemonUpdateSchema(BaseModel):
    nombre: Optional[str] = Field(None, min_length=1, description="Nombre en español del Pokémon")
    imagen: Optional[str] = Field(None, description="URL oficial del artwork o sprite")
    caracteristicas: Optional[CaracteristicasUpdateSchema] = None
    habilidades: Optional[List[str]] = None
    tipo: Optional[str] = None
    habitat: Optional[str] = None
    tipos: Optional[List[str]] = None
    stats: Optional[Dict[str, int]] = None
    evoluciones: Optional[Any] = None


# ==============================================================================
# Modelos Pydantic para Google AI Studio (Gemini & Imagen 3)
# ==============================================================================
class AIDiagramRequest(BaseModel):
    prompt: str = Field(..., description="Descripción del flujo o arquitectura a diagramar")
    diagram_type: Optional[str] = Field("flowchart", description="Tipo de diagrama Mermaid (flowchart, sequence, classDiagram)")


class AIMockupRequest(BaseModel):
    prompt: str = Field(..., description="Descripción del componente o interfaz a generar")
    framework: Optional[str] = Field("html/css", description="Framework de estilos (html/css, tailwind, react)")


class AIImageRequest(BaseModel):
    prompt: str = Field(..., description="Descripción del Pokémon o asset visual a generar con Imagen 3")
    aspect_ratio: str = Field(
        "1:1",
        pattern=r"^(1:1|16:9|9:16|4:3|3:4)$",
        description="Relación de aspecto de la imagen (1:1, 16:9, 9:16, 4:3, 3:4)",
    )


# Base de datos en memoria (Fallback / Testing)
pokemons: List[Dict[str, Any]] = [
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
        "habitat": "Bosques",
        "evoluciones": [
            {"id": 172, "nombre": "Pichu", "etapa": "Base", "metodo": None, "imagen": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/172.png"},
            {"id": 25, "nombre": "Pikachu", "etapa": "Fase 1", "metodo": "Amistad alta + Nivel", "imagen": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png"},
            {"id": 26, "nombre": "Raichu", "etapa": "Fase 2", "metodo": "Usar Piedra Trueno", "imagen": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/26.png"}
        ]
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
        "habitat": "Montañas",
        "evoluciones": [
            {"id": 4, "nombre": "Charmander", "etapa": "Base", "metodo": None, "imagen": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/4.png"},
            {"id": 5, "nombre": "Charmeleon", "etapa": "Fase 1", "metodo": "Nivel 16", "imagen": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/5.png"},
            {"id": 6, "nombre": "Charizard", "etapa": "Fase 2", "metodo": "Nivel 36", "imagen": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/6.png"}
        ]
    }
]

current_id = 3


def buscar_pokemon_por_id(pokemon_id: int) -> Optional[Dict[str, Any]]:
    for pokemon in pokemons:
        if pokemon["id"] == pokemon_id:
            return pokemon
    return None


# ==============================================================================
# Endpoints de la API
# ==============================================================================
@app.get("/", summary="Bienvenida / Rutas disponibles")
async def root():
    return {
        "mensaje": "¡Bienvenido a la API REST de Pokémon (FastAPI Engine)!",
        "version": "2.0.0",
        "docs": "/docs",
        "rutas_disponibles": {
            "GET /pokemons": "Lista y filtra todos los Pokémon",
            "GET /pokemons/{id}": "Obtiene un Pokémon por ID",
            "POST /pokemons": "Crea un nuevo Pokémon",
            "PUT /pokemons/{id}": "Actualiza un Pokémon por ID",
            "DELETE /pokemons/{id}": "Elimina un Pokémon por ID",
            "GET /healthz": "Comprobación de vida (liveness)",
            "GET /readyz": "Comprobación de dependencias (readiness)",
            "GET /metrics": "Exportador de métricas Prometheus"
        }
    }


@app.get("/healthz", summary="Healthcheck Liveness del Servicio")
async def healthz():
    return PlainTextResponse("healthy\n", status_code=status.HTTP_200_OK)


@app.get("/readyz", summary="Healthcheck Readiness con verificación de Base de Datos")
async def readyz():
    global _IS_DEGRADED_MODE
    db_ok = await check_db_health_async()
    if db_ok:
        _IS_DEGRADED_MODE = False
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={"status": "ready", "database": "connected", "degraded_mode": False}
        )
    _IS_DEGRADED_MODE = True
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={"status": "degraded", "database": "disconnected", "degraded_mode": True}
    )


def calculate_etag(data: Any) -> str:
    """Calcula una cabecera ETag determinista basada en SHA-256."""
    serialized = json.dumps(data, sort_keys=True, default=str).encode("utf-8")
    return f'"{hashlib.sha256(serialized).hexdigest()[:16]}"'



@app.get("/pokemons", summary="Listar y filtrar Pokémon")
@limiter.limit("300/minute")
async def get_pokemons(
    request: Request,
    response: Response,
    tipo: Optional[str] = Query(None, description="Filtra por tipo elemental en español"),
    nombre: Optional[str] = Query(None, description="Búsqueda por coincidencia de nombre"),
    limit: Optional[int] = Query(None, ge=1, le=1025, description="Límite máximo de resultados"),
    offset: int = Query(0, ge=0, description="Desplazamiento para paginación"),
):
    global _IS_TESTING, _IS_DEGRADED_MODE
    pokemons_list: List[Dict[str, Any]] = []

    if not _IS_TESTING:
        db_pokemons = await fetch_pokemons_from_db_async()
        if db_pokemons and len(db_pokemons) > 0:
            _IS_DEGRADED_MODE = False
            pokemons_list = db_pokemons
        else:
            _IS_DEGRADED_MODE = True
            logger.error("ADVERTENCIA CRÍTICA: Fallo al consultar PostgreSQL/Redis. Operando en modo degradado en memoria.")
            pokemons_list = pokemons
    else:
        pokemons_list = pokemons

    # Filtro por tipo elemental
    if tipo:
        tipo_lower = tipo.strip().lower()
        pokemons_list = [
            p for p in pokemons_list
            if p.get("tipo", "").lower() == tipo_lower
            or any(t.lower() == tipo_lower for t in p.get("tipos", []))
        ]

    # Filtro por coincidencia en nombre
    if nombre:
        nombre_lower = nombre.strip().lower()
        pokemons_list = [
            p for p in pokemons_list
            if nombre_lower in p.get("nombre", "").lower()
        ]

    # Paginación (offset y limit)
    if offset > 0:
        pokemons_list = pokemons_list[offset:]
    if limit is not None:
        pokemons_list = pokemons_list[:limit]

    # Gestión de Caché HTTP (ETag & Cache-Control)
    etag = calculate_etag(pokemons_list)
    if_none_match = request.headers.get("if-none-match")
    if if_none_match and if_none_match.strip() == etag:
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers={"ETag": etag})

    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = "public, max-age=60, stale-while-revalidate=300"
    return pokemons_list


@app.get("/pokemons/{id}", summary="Obtener Pokémon por ID")
async def get_pokemon_by_id(request: Request, response: Response, id: int):
    pokemon = buscar_pokemon_por_id(id)
    if pokemon is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Pokémon con id {id} no encontrado"
        )

    # Gestión de Caché HTTP (ETag & Cache-Control)
    etag = calculate_etag(pokemon)
    if_none_match = request.headers.get("if-none-match")
    if if_none_match and if_none_match.strip() == etag:
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers={"ETag": etag})

    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = "public, max-age=60, stale-while-revalidate=300"
    return pokemon



@app.post(
    "/pokemons",
    status_code=status.HTTP_201_CREATED,
    summary="Crear un nuevo Pokémon",
    dependencies=[Depends(verify_admin_key)]
)
@limiter.limit("30/minute")
async def create_pokemon(request: Request, payload: PokemonCreateSchema):
    global current_id

    nuevo_pokemon = {
        "id": current_id,
        "nombre": payload.nombre,
        "imagen": payload.imagen,
        "caracteristicas": {
            "peso": payload.caracteristicas.peso,
            "altura": payload.caracteristicas.altura,
            "fuerza": payload.caracteristicas.fuerza,
            "edad": payload.caracteristicas.edad,
            "categoria": payload.caracteristicas.categoria,
            "descripcion": payload.caracteristicas.descripcion
        },
        "habilidades": payload.habilidades,
        "tipo": payload.tipo,
        "habitat": payload.habitat,
        "tipos": payload.tipos or [payload.tipo],
        "stats": payload.stats or {"hp": 50, "attack": payload.caracteristicas.fuerza, "defense": 50, "sp_attack": 50, "sp_defense": 50, "speed": 50},
        "evoluciones": payload.evoluciones or []
    }

    pokemons.append(nuevo_pokemon)
    current_id += 1
    await invalidate_cache_async()

    return nuevo_pokemon


@app.put(
    "/pokemons/{id}",
    summary="Actualizar Pokémon existente",
    dependencies=[Depends(verify_admin_key)]
)
@limiter.limit("30/minute")
async def update_pokemon(request: Request, id: int, payload: PokemonUpdateSchema):
    pokemon = buscar_pokemon_por_id(id)
    if pokemon is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Pokémon con id {id} no encontrado"
        )

    data = payload.model_dump(exclude_unset=True)

    if "nombre" in data and data["nombre"] is not None:
        pokemon["nombre"] = str(data["nombre"])
    if "imagen" in data and data["imagen"] is not None:
        pokemon["imagen"] = str(data["imagen"])
    if "caracteristicas" in data and isinstance(data["caracteristicas"], dict):
        car = data["caracteristicas"]
        if "peso" in car and car["peso"] is not None:
            pokemon["caracteristicas"]["peso"] = float(car["peso"])
        if "altura" in car and car["altura"] is not None:
            pokemon["caracteristicas"]["altura"] = float(car["altura"])
        if "fuerza" in car and car["fuerza"] is not None:
            pokemon["caracteristicas"]["fuerza"] = int(car["fuerza"])
        if "edad" in car and car["edad"] is not None:
            pokemon["caracteristicas"]["edad"] = int(car["edad"])
        if "categoria" in car:
            pokemon["caracteristicas"]["categoria"] = car["categoria"]
        if "descripcion" in car:
            pokemon["caracteristicas"]["descripcion"] = car["descripcion"]
    if "habilidades" in data and data["habilidades"] is not None:
        pokemon["habilidades"] = list(data["habilidades"])
    if "tipo" in data and data["tipo"] is not None:
        pokemon["tipo"] = str(data["tipo"])
    if "habitat" in data and data["habitat"] is not None:
        pokemon["habitat"] = str(data["habitat"])
    if "tipos" in data and data["tipos"] is not None:
        pokemon["tipos"] = list(data["tipos"])
    if "stats" in data and data["stats"] is not None:
        pokemon["stats"] = dict(data["stats"])
    if "evoluciones" in data and data["evoluciones"] is not None:
        pokemon["evoluciones"] = data["evoluciones"]

    await invalidate_cache_async()
    return pokemon


@app.delete(
    "/pokemons/{id}",
    summary="Eliminar Pokémon por ID",
    dependencies=[Depends(verify_admin_key)]
)
@limiter.limit("30/minute")
async def delete_pokemon(request: Request, id: int):
    pokemon = buscar_pokemon_por_id(id)
    if pokemon is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Pokémon con id {id} no encontrado"
        )

    pokemons.remove(pokemon)
    await invalidate_cache_async()
    return {
        "mensaje": f"Pokémon con id {id} eliminado correctamente",
        "pokemon_eliminado": pokemon
    }



@app.get("/metrics", summary="Métricas estándar de Prometheus")
async def prometheus_metrics():
    lines = [
        "# HELP pokedex_uptime_seconds Tiempo que la aplicación ha estado activa en segundos.",
        "# TYPE pokedex_uptime_seconds gauge",
        f"pokedex_uptime_seconds {time.time() - _APP_START_TIME:.2f}",
        "",
        "# HELP pokedex_total_pokemons Cantidad actual de Pokémon registrados.",
        "# TYPE pokedex_total_pokemons gauge",
        f"pokedex_total_pokemons {len(pokemons)}",
        "",
        "# HELP pokedex_degraded_mode Indica si el backend opera en modo degradado (en memoria).",
        "# TYPE pokedex_degraded_mode gauge",
        f"pokedex_degraded_mode {1 if _IS_DEGRADED_MODE else 0}",
        "",
        "# HELP pokedex_http_requests_total Contador total de solicitudes HTTP recibidas.",
        "# TYPE pokedex_http_requests_total counter"
    ]

    for (method, endpoint, status_code), count in _HTTP_REQUESTS_TOTAL.items():
        lines.append(f'pokedex_http_requests_total{{method="{method}",endpoint="{endpoint}",status="{status_code}"}} {count}')

    lines.extend([
        "",
        "# HELP pokedex_http_request_duration_seconds Latencia total de solicitudes HTTP procesadas.",
        "# TYPE pokedex_http_request_duration_seconds summary"
    ])

    for (method, endpoint), total_sec in _HTTP_REQUEST_DURATION_SECONDS.items():
        count = _HTTP_REQUEST_COUNT[(method, endpoint)]
        lines.append(f'pokedex_http_request_duration_seconds_sum{{method="{method}",endpoint="{endpoint}"}} {total_sec:.4f}')
        lines.append(f'pokedex_http_request_duration_seconds_count{{method="{method}",endpoint="{endpoint}"}} {count}')

    return PlainTextResponse("\n".join(lines) + "\n")


# ==============================================================================
# Endpoints de Google AI Studio (Gemini 2.0 Flash & Imagen 3)
# ==============================================================================
@app.post("/api/v1/ai/diagram", summary="Generar Diagrama de Flujo (Mermaid) con Gemini")
async def ai_generate_diagram(payload: AIDiagramRequest):
    result = generate_flowchart(prompt=payload.prompt, diagram_type=payload.diagram_type or "flowchart")
    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.get("error", "Error generando diagrama con Gemini")
        )
    return result


@app.post("/api/v1/ai/mock", summary="Generar Mockup Frontend / UI con Gemini")
async def ai_generate_mock(payload: AIMockupRequest):
    result = generate_ui_mockup(prompt=payload.prompt, framework=payload.framework or "html/css")
    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.get("error", "Error generando mockup con Gemini")
        )
    return result


@app.post("/api/v1/ai/image", summary="Generar Imagen Pokémon con Imagen 3")
async def ai_generate_image(payload: AIImageRequest):
    result = generate_image_asset(prompt=payload.prompt, aspect_ratio=payload.aspect_ratio or "1:1")
    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.get("error", "Error generando imagen con Imagen 3")
        )
    return result
