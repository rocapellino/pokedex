# 📡 Especificación de Contratos y Endpoints de la API

Esta guía define formalmente todos los endpoints REST, parámetros, estructuras de payload y códigos de estado HTTP expuestos por el backend **Pokémon API**.

---

## 📑 Tabla de Contenidos
1. [Información General](#1-información-general)
2. [Endpoints del Catálogo de Pokémon](#2-endpoints-del-catálogo-de-pokémon)
3. [Endpoints del Sistema y Monitoreo](#3-endpoints-del-sistema-y-monitoreo)
4. [Estructura del Objeto Pokémon (JSON Schema)](#4-estructura-del-objeto-pokémon-json-schema)
5. [Códigos de Estado HTTP y Manejo de Errores](#5-códigos-de-estado-http-y-manejo-de-errores)

---

## 1. Información General

* **Base URL Local (Docker / K8s):** `http://localhost:8080/api` o `http://localhost:5000`
* **Formato de Comunicación:** `application/json; charset=utf-8`
* **Estrategia de Caché:** Capa de lectura acelerada por **Redis 7** (Invalidación automática ante escrituras).
* **Persistencia:** **PostgreSQL 16** con pooling mediante **PgBouncer**.

---

## 2. Endpoints del Catálogo de Pokémon

### 2.1. Listar y Filtrar Pokémon
* **Ruta:** `GET /pokemons` o `GET /api/pokemons`
* **Descripción:** Obtiene la lista completa de Pokémon o filtra por nombre/tipo.
* **Parámetros de Consulta (Query Params):**
  | Parámetro | Tipo | Requerido | Descripción | Ejemplo |
  | :--- | :--- | :--- | :--- | :--- |
  | `tipo` | `string` | No | Filtra por tipo elemental en español | `?tipo=Fuego` |
  | `nombre` | `string` | No | Búsqueda por coincidencia de nombre | `?nombre=Pikachu` |

* **Respuesta Exitosa (`200 OK`):**
  ```json
  [
    {
      "id": 25,
      "nombre": "Pikachu",
      "tipo": "Eléctrico",
      "habilidades": ["Static", "Lightning Rod"],
      "habitat": "Kanto",
      "imagen": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png",
      "caracteristicas": {
        "altura": 0.4,
        "peso": 6.0,
        "fuerza": 55,
        "edad": 5
      }
    }
  ]
  ```

---

### 2.2. Obtener Detalle de un Pokémon por ID
* **Ruta:** `GET /pokemons/<id>` o `GET /api/pokemons/<id>`
* **Descripción:** Retorna la información completa de un Pokémon específico mediante su ID nacional.
* **Respuesta Exitosa (`200 OK`):**
  ```json
  {
    "id": 1,
    "nombre": "Bulbasaur",
    "tipo": "Planta / Veneno",
    "habilidades": ["Overgrow", "Chlorophyll"],
    "habitat": "Kanto",
    "imagen": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/1.png",
    "caracteristicas": {
      "altura": 0.7,
      "peso": 6.9,
      "fuerza": 49,
      "edad": 3
    }
  }
  ```
* **Respuesta de Error (`404 Not Found`):**
  ```json
  {
    "error": "Pokémon no encontrado"
  }
  ```

---

### 2.3. Crear un Nuevo Pokémon
* **Ruta:** `POST /pokemons` o `POST /api/pokemons`
* **Descripción:** Registra un nuevo Pokémon en la base de datos PostgreSQL e invalida el caché de Redis.
* **Cuerpo de la Petición (Request Body):**
  > [!NOTE]
  > El campo `id` es asignado automáticamente de forma secuencial por el servidor; cualquier valor de `id` enviado en el cuerpo de la petición es omitido e ignorado.

  ```json
  {
    "nombre": "Pecharunt",
    "tipo": "Veneno / Fantasma",
    "habilidades": ["Poison Puppeteer"],
    "habitat": "Norclaudio",
    "imagen": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/1026.png",
    "caracteristicas": {
      "altura": 0.3,
      "peso": 0.3,
      "fuerza": 88,
      "edad": 1
    }
  }
  ```
* **Respuesta Exitosa (`201 Created`):**
  ```json
  {
    "mensaje": "Pokémon creado con éxito",
    "pokemon": { ... }
  }
  ```

---

## 3. Endpoints del Sistema, Documentación y Monitoreo

| Endpoint | Método | Descripción | Respuesta |
| :--- | :--- | :--- | :--- |
| `/` | `GET` | Información base del microservicio y rutas disponibles | `{"mensaje": "¡Bienvenido...", "version": "2.0.0"}` |
| `/docs` | `GET` | Documentación interactiva Swagger UI | Interfaz web interactiva OpenAPI |
| `/redoc` | `GET` | Especificación y documentación en formato ReDoc | Interfaz web ReDoc OpenAPI |
| `/healthz` | `GET` | Liveness & Readiness probe para Nginx y Kubernetes | `200 "healthy\n"` |
| `/metrics` | `GET` | Exportador de métricas en formato estándar de Prometheus | Plaintext con contadores y latencias |

---

## 4. Estructura del Objeto Pokémon (Pydantic / JSON Schema)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Pokemon",
  "type": "object",
  "required": ["id", "nombre", "tipo", "imagen"],
  "properties": {
    "id": { "type": "integer", "description": "Número nacional de Pokédex" },
    "nombre": { "type": "string", "description": "Nombre en español" },
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

## 5. Códigos de Estado HTTP y Manejo de Errores

| Código | Significado | Escenario de Aplicación |
| :--- | :--- | :--- |
| **`200 OK`** | Éxito | Consulta de lista o detalle de Pokémon exitosa. |
| **`201 Created`** | Creado | Registro de nuevo Pokémon persistido en base de datos. |
| **`400 Bad Request`** | Petición Inválida | Payload JSON malformado. |
| **`404 Not Found`** | No Encontrado | El ID de Pokémon consultado no existe en la base de datos. |
| **`422 Unprocessable Entity`** | Error de Validación | Parámetros o campos incompatibles con los esquemas Pydantic. |
| **`500 Internal Server Error`** | Error de Servidor | Falla en conexión a PostgreSQL / Redis no controlada. |
