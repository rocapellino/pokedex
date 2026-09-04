# 📡 Especificación de Contratos y Endpoints de la API

Esta guía define formalmente todos los endpoints REST, parámetros, estructuras de payload, esquemas de autenticación y códigos de estado HTTP expuestos por el backend **Pokémon API**.

---

## 📑 Tabla de Contenidos
1. [Información General y Autenticación](#1-información-general-y-autenticación)
2. [Endpoints del Catálogo de Pokémon](#2-endpoints-del-catálogo-de-pokémon)
3. [Endpoints de Inteligencia Artificial (AI Services)](#3-endpoints-de-inteligencia-artificial-ai-services)
4. [Endpoints del Sistema, Salud y Monitoreo](#4-endpoints-del-sistema-salud-y-monitoreo)
5. [Estructura del Objeto Pokémon (JSON Schema / Pydantic)](#5-estructura-del-objeto-pokémon-json-schema--pydantic)
6. [Códigos de Estado HTTP y Manejo de Errores](#6-códigos-de-estado-http-y-manejo-de-errores)

---

## 1. Información General y Autenticación

* **Base URL Local (Docker / K8s):** `http://localhost:8080/api` o `http://localhost:5000`
* **Formato de Comunicación:** `application/json; charset=utf-8`
* **Estrategia de Caché:** Capa de lectura acelerada por **Redis 7** (Invalidación automática ante escrituras y soporte para cabeceras HTTP `ETag` y `Cache-Control`).
* **Persistencia:** **PostgreSQL 16** con pooling mediante **PgBouncer** y fallback controlado en modo degradado.

### 🔐 Mecanismo de Autenticación (`X-API-Key`)

Las operaciones de mutación y los servicios de Inteligencia Artificial requieren autenticación obligatoria mediante la cabecera HTTP `X-API-Key`:

| Rol / Ámbito | Cabecera | Variable de Entorno | Endpoints Protegidos | Rate Limit |
| :--- | :--- | :--- | :--- | :--- |
| **Administrador** | `X-API-Key: <ADMIN_API_KEY>` | `ADMIN_API_KEY` | `POST /pokemons`<br>`PUT /pokemons/{id}`<br>`DELETE /pokemons/{id}` | 30 peticiones/minuto |
| **Servicios IA** | `X-API-Key: <AI_API_KEY>` | `AI_API_KEY` | `POST /api/v1/ai/diagram`<br>`POST /api/v1/ai/mock`<br>`POST /api/v1/ai/image` | 5 peticiones/minuto |
| **Público (Lectura)** | *Ninguna requerida* | — | `GET /pokemons`<br>`GET /pokemons/{id}`<br>`GET /healthz`<br>`GET /readyz`<br>`GET /metrics` | 300 peticiones/minuto |

> [!IMPORTANT]
> Si la cabecera `X-API-Key` no se proporciona o su valor no coincide de forma constante con la clave configurada en el entorno del servidor, la API denegará la petición inmediatamente con código **`401 Unauthorized`**.

---

## 2. Endpoints del Catálogo de Pokémon

### 2.1. Listar y Filtrar Pokémon
* **Ruta:** `GET /pokemons` o `GET /api/pokemons`
* **Descripción:** Obtiene la lista de Pokémon con soporte para filtrado multicriterio, paginación y validación condicional con `ETag`.
* **Parámetros de Consulta (Query Params):**
  | Parámetro | Tipo | Requerido | Descripción | Ejemplo |
  | :--- | :--- | :--- | :--- | :--- |
  | `tipo` | `string` | No | Filtra por tipo elemental en español (busca en tipo principal y array de tipos) | `?tipo=Fuego` |
  | `nombre` | `string` | No | Búsqueda por coincidencia de subcadena en el nombre | `?nombre=Pikachu` |
  | `limit` | `integer` | No | Límite máximo de resultados retornados (1 - 1025) | `?limit=20` |
  | `offset` | `integer` | No | Desplazamiento inicial para paginación (defecto: 0) | `?offset=40` |

* **Cabeceras de Respuesta:**
  * `ETag`: Hash determinista de la colección para validación de caché cliente (`If-None-Match`).
  * `Cache-Control`: `public, max-age=60, stale-while-revalidate=300`.
* **Respuesta Exitosa (`200 OK`):**
  ```json
  [
    {
      "id": 25,
      "nombre": "Pikachu",
      "tipo": "Eléctrico",
      "tipos": ["Eléctrico"],
      "habilidades": ["Electricidad estática", "Pararrayos"],
      "habitat": "Bosque",
      "imagen": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png",
      "caracteristicas": {
        "altura": 0.4,
        "peso": 6.0,
        "fuerza": 55,
        "edad": 5
      },
      "stats": {
        "hp": 35,
        "attack": 55,
        "defense": 40,
        "sp_attack": 50,
        "sp_defense": 50,
        "speed": 90
      }
    }
  ]
  ```
* **Respuesta de Caché (`304 Not Modified`):** Retornada cuando la cabecera `If-None-Match` coincide con el ETag actual.

---

### 2.2. Obtener Detalle de un Pokémon por ID
* **Ruta:** `GET /pokemons/{id}` o `GET /api/pokemons/{id}`
* **Descripción:** Retorna la información completa de un Pokémon específico mediante su ID nacional.
* **Respuesta Exitosa (`200 OK`):** Objeto JSON completo del Pokémon.
* **Respuesta de Error (`404 Not Found`):**
  ```json
  {
    "detail": "Pokémon con id 9999 no encontrado"
  }
  ```

---

### 2.3. Crear un Nuevo Pokémon
* **Ruta:** `POST /pokemons` o `POST /api/pokemons`
* **Autenticación:** Requiere cabecera `X-API-Key: <ADMIN_API_KEY>`
* **Descripción:** Valida los datos con Pydantic, sanea contra inyecciones XSS, persiste el registro en PostgreSQL e invalida la caché de Redis.
* **Cuerpo de la Petición (Request Body):**
  ```json
  {
    "nombre": "Pecharunt",
    "tipo": "Veneno",
    "tipos": ["Veneno", "Fantasma"],
    "habilidades": ["Títere Tóxico"],
    "habitat": "Desconocido",
    "imagen": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/1025.png",
    "caracteristicas": {
      "altura": 0.3,
      "peso": 0.3,
      "fuerza": 88,
      "edad": 1,
      "categoria": "Pokémon Subyugador",
      "descripcion": "Almacena toxinas en su caparazón con forma de melocotón."
    },
    "stats": {
      "hp": 88,
      "attack": 88,
      "defense": 160,
      "sp_attack": 88,
      "sp_defense": 88,
      "speed": 88
    }
  }
  ```
* **Respuesta Exitosa (`201 Created`):** Objeto JSON del Pokémon creado con su `id` asignado automáticamente.
* **Respuesta de Error de Validación / XSS (`422 Unprocessable Entity`):**
  ```json
  {
    "detail": [
      {
        "loc": ["body", "nombre"],
        "msg": "Valor rechazado: contiene etiquetas HTML o scripts no permitidos",
        "type": "value_error"
      }
    ]
  }
  ```
* **Respuesta en Modo Degradado (`503 Service Unavailable`):**
  ```json
  {
    "detail": "La base de datos se encuentra temporalmente inaccesible. Operaciones de modificación restringidas en modo degradado."
  }
  ```

---

### 2.4. Actualizar un Pokémon Existente
* **Ruta:** `PUT /pokemons/{id}` o `PUT /api/pokemons/{id}`
* **Autenticación:** Requiere cabecera `X-API-Key: <ADMIN_API_KEY>`
* **Descripción:** Actualiza de forma parcial o total los campos de un Pokémon existente por ID nacional.
* **Cuerpo de la Petición:** Campos opcionales del esquema `PokemonUpdateSchema`.
* **Respuesta Exitosa (`200 OK`):** Objeto Pokémon con los cambios aplicados.

---

### 2.5. Eliminar un Pokémon
* **Ruta:** `DELETE /pokemons/{id}` o `DELETE /api/pokemons/{id}`
* **Autenticación:** Requiere cabecera `X-API-Key: <ADMIN_API_KEY>`
* **Descripción:** Elimina el Pokémon de la base de datos e invalida la caché de Redis.
* **Respuesta Exitosa (`200 OK`):**
  ```json
  {
    "mensaje": "Pokémon con id 25 eliminado con éxito"
  }
  ```

---

## 3. Endpoints de Inteligencia Artificial (AI Services)

Integración con Google Gemini (Studio / Vertex) e Imagen 3 para asistencia técnica en diseño, arquitectura y assets:

### 3.1. Generar Diagrama de Flujo / Arquitectura
* **Ruta:** `POST /api/v1/ai/diagram`
* **Autenticación:** Requiere cabecera `X-API-Key: <AI_API_KEY>`
* **Rate Limit:** 5 peticiones/minuto
* **Cuerpo de la Petición:**
  ```json
  {
    "topic": "Flujo de lectura con caché Redis y fallback en PostgreSQL"
  }
  ```
* **Respuesta Exitosa (`200 OK`):**
  ```json
  {
    "topic": "Flujo de lectura...",
    "diagram": "graph TD;\n    A[Cliente] --> B[FastAPI];\n    B --> C{Caché Redis?};\n    C -- Sí --> D[Retornar JSON];\n    C -- No --> E[Consultar PostgreSQL];"
  }
  ```

---

### 3.2. Generar Especificación de Mockup de UI
* **Ruta:** `POST /api/v1/ai/mock`
* **Autenticación:** Requiere cabecera `X-API-Key: <AI_API_KEY>`
* **Rate Limit:** 5 peticiones/minuto
* **Cuerpo de la Petición:**
  ```json
  {
    "component_name": "PokemonEvolutionChain"
  }
  ```
* **Respuesta Exitosa (`200 OK`):**
  ```json
  {
    "component_name": "PokemonEvolutionChain",
    "mockup_spec": "{\n  \"layout\": \"horizontal-flex\",\n  \"elements\": [...]\n}"
  }
  ```

---

### 3.3. Generar Asset de Imagen
* **Ruta:** `POST /api/v1/ai/image`
* **Autenticación:** Requiere cabecera `X-API-Key: <AI_API_KEY>`
* **Rate Limit:** 5 peticiones/minuto
* **Cuerpo de la Petición:**
  ```json
  {
    "prompt": "Ilustración oficial estilo Sugimori de un Pokémon legendario de tipo Dragón Eléctrico",
    "aspect_ratio": "1:1"
  }
  ```
* **Aspect Ratios Válidos:** `"1:1"`, `"16:9"`, `"9:16"`, `"4:3"`, `"3:4"`
* **Respuesta Exitosa (`200 OK`):**
  ```json
  {
    "prompt": "Ilustración oficial...",
    "status": "success",
    "image_data": "<base64_encoded_png_or_mock_reference>"
  }
  ```

---

## 4. Endpoints del Sistema, Salud y Monitoreo

| Endpoint | Método | Propósito | Autenticación | Respuesta Típica |
| :--- | :--- | :--- | :--- | :--- |
| **`/`** | `GET` | Bienvenida e info base del servicio | Pública | `{"mensaje": "¡Bienvenido a la PokéAPI!", "version": "2.0.0"}` |
| **`/docs`** | `GET` | Interfaz interactiva OpenAPI Swagger | Pública | HTML Swagger UI |
| **`/redoc`** | `GET` | Interfaz interactiva ReDoc OpenAPI | Pública | HTML ReDoc |
| **`/healthz`** | `GET` | **Liveness probe**: Verifica si el proceso ASGI está vivo | Pública | Plaintext: `healthy\n` (`200 OK`) |
| **`/readyz`** | `GET` | **Readiness probe**: Verifica conectividad activa con PostgreSQL y Redis | Pública | `{"status": "ready", "database": "connected", "redis": "connected"}` (`200 OK` o `503 Service Unavailable`) |
| **`/metrics`** | `GET` | Exportador oficial para scraping de **Prometheus** | Pública | Métricas en formato estándar de texto |

---

## 5. Estructura del Objeto Pokémon (JSON Schema / Pydantic)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Pokemon",
  "type": "object",
  "required": ["id", "nombre", "tipo", "imagen"],
  "properties": {
    "id": { "type": "integer", "description": "Número nacional de Pokédex" },
    "nombre": { "type": "string", "description": "Nombre en español (sanitizado contra XSS)" },
    "tipo": { "type": "string", "description": "Tipo elemental principal" },
    "tipos": { "type": "array", "items": { "type": "string" }, "description": "Tipos elementales duales" },
    "habilidades": { "type": "array", "items": { "type": "string" } },
    "habitat": { "type": "string" },
    "imagen": { "type": "string", "format": "uri" },
    "caracteristicas": {
      "type": "object",
      "properties": {
        "altura": { "type": "number" },
        "peso": { "type": "number" },
        "fuerza": { "type": "integer" },
        "edad": { "type": "integer" },
        "categoria": { "type": "string" },
        "descripcion": { "type": "string" }
      }
    },
    "stats": {
      "type": "object",
      "properties": {
        "hp": { "type": "integer" },
        "attack": { "type": "integer" },
        "defense": { "type": "integer" },
        "sp_attack": { "type": "integer" },
        "sp_defense": { "type": "integer" },
        "speed": { "type": "integer" }
      }
    },
    "evoluciones": {
      "type": "object",
      "description": "Árbol evolutivo jerárquico y lineal con soporte para ramificaciones"
    }
  }
}
```

---

## 6. Códigos de Estado HTTP y Manejo de Errores

| Código HTTP | Nombre | Escenario de Aplicación |
| :--- | :--- | :--- |
| **`200 OK`** | Éxito | Consultas `GET`, actualizaciones `PUT` y eliminaciones `DELETE`. |
| **`201 Created`** | Creado | Registro exitoso de nuevo Pokémon vía `POST`. |
| **`304 Not Modified`** | No Modificado | El ETag enviado en `If-None-Match` coincide con el estado actual del caché. |
| **`400 Bad Request`** | Petición Inválida | Payload JSON con sintaxis malformada. |
| **`401 Unauthorized`** | No Autorizado | Cabecera `X-API-Key` ausente o no coincidente con la clave administrativa o de IA. |
| **`404 Not Found`** | No Encontrado | El recurso o ID de Pokémon consultado no existe. |
| **`422 Unprocessable Entity`** | Entidad No Procesable | Error de validación Pydantic o detección de inyección XSS (etiquetas HTML `<...>` o esquemas `javascript:`). |
| **`429 Too Many Requests`** | Límite de Tasa Excedido | Superado el límite de peticiones por minuto para la IP origen vía `slowapi`. |
| **`503 Service Unavailable`** | Servicio No Disponible | La base de datos se encuentra temporalmente inaccesible. Las mutaciones de escritura se bloquean de forma preventiva. |
