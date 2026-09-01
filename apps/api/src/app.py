import sys
import time
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, PlainTextResponse
from pydantic import BaseModel, Field

try:
    from apps.api.src.db import fetch_pokemons_from_db, invalidate_cache
except ImportError:
    try:
        from src.db import fetch_pokemons_from_db, invalidate_cache
    except ImportError:
        def fetch_pokemons_from_db():
            return None
        def invalidate_cache():
            pass

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

BASE_DIR = Path(__file__).resolve().parent.parent

app = FastAPI(
    title="Pokédex REST API",
    description="API REST de Alto Rendimiento para Pokédex con soporte asíncrono, OpenAPI, observabilidad y Google AI Studio.",
    version="1.2.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Configuración de CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Métricas Prometheus en memoria
_APP_START_TIME = time.time()
_HTTP_REQUESTS_TOTAL = defaultdict(int)
_HTTP_REQUEST_DURATION_SECONDS = defaultdict(float)
_HTTP_REQUEST_COUNT = defaultdict(int)
_IS_TESTING = False


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


class PokemonUpdateSchema(BaseModel):
    nombre: Optional[str] = None
    imagen: Optional[str] = None
    caracteristicas: Optional[Dict[str, Any]] = None
    habilidades: Optional[List[str]] = None
    tipo: Optional[str] = None
    habitat: Optional[str] = None
    tipos: Optional[List[str]] = None
    stats: Optional[Dict[str, int]] = None


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
async def root(request: Request):
    accept = request.headers.get("accept", "")
    if "text/html" in accept:
        index_html_path = BASE_DIR / "templates" / "index.html"
        if index_html_path.exists():
            return HTMLResponse(content=index_html_path.read_text(encoding="utf-8"))
    return {
        "mensaje": "¡Bienvenido a la API REST de Pokémon (FastAPI Engine)!",
        "version": "2.0.0",
        "docs": "/docs",
        "rutas_disponibles": {
            "GET /pokemons": "Lista todos los Pokémon",
            "GET /pokemons/{id}": "Obtiene un Pokémon por ID",
            "POST /pokemons": "Crea un nuevo Pokémon",
            "PUT /pokemons/{id}": "Actualiza un Pokémon por ID",
            "DELETE /pokemons/{id}": "Elimina un Pokémon por ID",
            "GET /metrics": "Exportador de métricas Prometheus"
        }
    }


@app.get("/healthz", summary="Healthcheck del Servicio")
async def healthz():
    return PlainTextResponse("healthy\n", status_code=status.HTTP_200_OK)


@app.get("/pokemons", summary="Listar todos los Pokémon")
async def get_pokemons():
    global _IS_TESTING
    if not _IS_TESTING:
        db_pokemons = fetch_pokemons_from_db()
        if db_pokemons and len(db_pokemons) > 0:
            return db_pokemons
    return pokemons


@app.get("/pokemons/{id}", summary="Obtener Pokémon por ID")
async def get_pokemon_by_id(id: int):
    pokemon = buscar_pokemon_por_id(id)
    if pokemon is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Pokémon con id {id} no encontrado"
        )
    return pokemon


@app.post("/pokemons", status_code=status.HTTP_201_CREATED, summary="Crear un nuevo Pokémon")
async def create_pokemon(payload: PokemonCreateSchema):
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
    invalidate_cache()

    return nuevo_pokemon


@app.put("/pokemons/{id}", summary="Actualizar Pokémon existente")
async def update_pokemon(id: int, payload: Dict[str, Any]):
    pokemon = buscar_pokemon_por_id(id)
    if pokemon is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Pokémon con id {id} no encontrado"
        )

    if "nombre" in payload and payload["nombre"] is not None:
        pokemon["nombre"] = str(payload["nombre"])
    if "imagen" in payload and payload["imagen"] is not None:
        pokemon["imagen"] = str(payload["imagen"])
    if "caracteristicas" in payload and isinstance(payload["caracteristicas"], dict):
        car = payload["caracteristicas"]
        if "peso" in car:
            pokemon["caracteristicas"]["peso"] = float(car["peso"])
        if "altura" in car:
            pokemon["caracteristicas"]["altura"] = float(car["altura"])
        if "fuerza" in car:
            pokemon["caracteristicas"]["fuerza"] = int(car["fuerza"])
        if "edad" in car:
            pokemon["caracteristicas"]["edad"] = int(car["edad"])
    if "habilidades" in payload and payload["habilidades"] is not None:
        pokemon["habilidades"] = list(payload["habilidades"])
    if "tipo" in payload and payload["tipo"] is not None:
        pokemon["tipo"] = str(payload["tipo"])
    if "habitat" in payload and payload["habitat"] is not None:
        pokemon["habitat"] = str(payload["habitat"])

    invalidate_cache()
    return pokemon


@app.delete("/pokemons/{id}", summary="Eliminar Pokémon por ID")
async def delete_pokemon(id: int):
    pokemon = buscar_pokemon_por_id(id)
    if pokemon is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Pokémon con id {id} no encontrado"
        )

    pokemons.remove(pokemon)
    invalidate_cache()
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

