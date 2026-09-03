# 🧪 Guía Completa de Pruebas y Validación Local (Testing Guide)

Esta guía detalla la estrategia de aseguramiento de calidad (QA), las capas de pruebas implementadas en el monorepo **Pokédex** y los comandos estandarizados para ejecutarlas localmente en cualquier sistema operativo (Windows, Linux y macOS) tras la homogenización del repositorio mediante **Taskfile** y scripts agnósticos en Python.

---

## 📑 Tabla de Contenidos
1. [Estrategia y Pirámide de Pruebas](#1-estrategia-y-pirámide-de-pruebas)
2. [Matriz Rápida de Comandos Locales](#2-matriz-rápida-de-comandos-locales)
3. [Tipos de Pruebas y Cargas Masivas](#3-tipos-de-pruebas-y-cargas-masivas)
   * [3.1. Pruebas Unitarias y de Integración REST (Pytest)](#31-pruebas-unitarias-y-de-integración-rest-pytest)
   * [3.2. Carga Masiva de Datos / Seeding (1.025 Pokémon)](#32-carga-masiva-de-datos--seeding-1025-pokémon)
   * [3.3. Batería de Pruebas Funcionales de la API (CRUD)](#33-batería-de-pruebas-funcionales-de-la-api-crud)
   * [3.4. Pruebas de Rendimiento y Estrés (k6)](#34-pruebas-de-rendimiento-y-estrés-k6)
   * [3.5. Pruebas de Carga Concurrente y Autoescalado (HPA)](#35-pruebas-de-carga-concurrente-y-autoescalado-hpa)
   * [3.6. Auditoría Integral de Calidad, Complejidad y Duplicados](#36-auditoría-integral-de-calidad-complejidad-y-duplicados)
   * [3.7. Linter, Formato y Seguridad SAST](#37-linter-formato-y-seguridad-sast)
4. [Métodos de Ejecución Local](#4-métodos-de-ejecución-local)
   * [Método 1: Vía Taskfile (Recomendado y Multiplataforma)](#método-1-vía-taskfile-recomendado-y-multiplataforma)
   * [Método 2: Vía Python Directo](#método-2-vía-python-directo)
   * [Método 3: En Contenedores Docker Compose](#método-3-en-contenedores-docker-compose)
   * [Método 4: En Clúster Kubernetes](#método-4-en-clúster-kubernetes)
   * [Método 5: Vía Tareas de VS Code](#método-5-vía-tareas-de-vs-code)
5. [Quality Gates (Criterios de Aceptación)](#5-quality-gates-criterios-de-aceptación)

---

## 1. Estrategia y Pirámide de Pruebas

El monorepo implementa un enfoque de validación multicapa continuo para garantizar alta disponibilidad, velocidad de respuesta y mantenibilidad:

```text
                  ┌──────────────────────┐
                  │   Pruebas de Carga   │  (k6 / k8s_load_test.py / HPA)
                  │   y Resiliencia      │
                  ├──────────────────────┤
                  │ Pruebas Integración  │  (Endpoints REST / CRUD / Swagger)
                  ├──────────────────────┤
                  │  Pruebas Unitarias   │  (Pytest + Cobertura de Código)
                  ├──────────────────────┤
                  │   Análisis Estático, │  (Ruff / Radon / Bandit / JSCPD)
                  │ Calidad y Seguridad  │
                  └──────────────────────┘
```

---

## 2. Matriz Rápida de Comandos Locales

| Tipo de Prueba / Acción | Vía Taskfile (`task`) | Vía Python Nativo | Vía Docker Compose |
| :--- | :--- | :--- | :--- |
| **Pruebas Unitarias + Cobertura** | `task test` | `pytest -v --cov=apps/api/src` | `docker-compose exec api pytest` |
| **Carga Masiva de Datos (Seeding)**| `task seed` | `python scripts/bulk_load_pokemons.py` | `docker-compose exec api python apps/api/scripts/bulk_load_pokemons.py` |
| **Batería Funcional CRUD API** | `task test:api` | `python scripts/run_all_scripts.py` | `docker-compose exec api python apps/api/scripts/run_all_scripts.py` |
| **Prueba de Rendimiento (k6)** | `task perf` | `k6 run tests/performance/k6_stress_test.js` | N/A (requiere binario `k6`) |
| **Prueba de Carga HPA (Python)** | `task test:load` | `python scripts/k8s_load_test.py` | `docker-compose exec api python scripts/k8s_load_test.py` |
| **Auditoría Integral de Calidad** | `task audit` | `python scripts/audit_code_quality.py` | `docker-compose exec api python scripts/audit_code_quality.py` |
| **Linter de Código (Ruff)** | `task lint` | `ruff check apps/ src/ scripts/` | `docker-compose exec api ruff check apps/` |
| **Formateo Automático (Ruff)** | `task format` | `ruff format apps/ src/ scripts/` | `docker-compose exec api ruff format apps/` |
| **Análisis de Seguridad SAST** | `task security` | `bandit -r apps/api/src src/ -ll` | `docker-compose exec api bandit -r apps/api/src` |

---

## 3. Tipos de Pruebas y Cargas Masivas

### 3.1. Pruebas Unitarias y de Integración REST (Pytest)
* **Archivo:** [`tests/test_app.py`](file:///c:/Users/Rodrigo/Documents/Git/pokedex/tests/test_app.py) y [`apps/api/tests/test_app.py`](file:///c:/Users/Rodrigo/Documents/Git/pokedex/apps/api/tests/test_app.py).
* **Motor:** `pytest`, `pytest-cov` y `TestClient` de FastAPI/Flask.
* **Qué valida:**
  * `GET /`: Contrato de bienvenida y rutas expuestas.
  * `GET /pokemons`: Listado general con soporte de paginación y caché Redis.
  * `GET /pokemons/{id}`: Búsqueda exacta y manejo de códigos HTTP 404.
  * `POST /pokemons`: Validación de esquemas Pydantic, cálculo de estadísticas y código HTTP 201.
  * `POST /pokemons` (inválido): Rechazo automático (HTTP 400 / 422) ante campos obligatorios faltantes.
  * `PUT /pokemons/{id}`: Actualización selectiva de atributos.
  * `DELETE /pokemons/{id}`: Eliminación física e invalidación de claves en caché Redis.

### 3.2. Carga Masiva de Datos / Seeding (1.025 Pokémon)
* **Archivo:** [`scripts/bulk_load_pokemons.py`](file:///c:/Users/Rodrigo/Documents/Git/pokedex/scripts/bulk_load_pokemons.py).
* **Propósito:** Descarga concurrente mediante `ThreadPoolExecutor` de los Pokémon oficiales desde PokeAPI/WikiDex e inserción por lotes transaccionales en PostgreSQL, actualizando secuencias e invalidando Redis.
* **Variables de Entorno Disponibles:**
  * `POKEMON_LIMIT`: Cantidad de Pokémon a cargar (por defecto `1025`, ej: `POKEMON_LIMIT=50` para pruebas rápidas).
  * `DATABASE_URL`: Cadena de conexión a PostgreSQL.
  * `REDIS_URL`: Cadena de conexión al cluster/instancia Redis.

### 3.3. Batería de Pruebas Funcionales de la API (CRUD)
* **Archivo:** [`scripts/run_all_scripts.py`](file:///c:/Users/Rodrigo/Documents/Git/pokedex/scripts/run_all_scripts.py).
* **Propósito:** Ejecuta en secuencia real contra la API levantada el ciclo de vida completo de recursos:
  1. `test_get_all.py`: Verificación de catálogo inicial.
  2. `test_get_id.py`: Lectura unitaria (ID 1 - Pikachu).
  3. `test_post.py`: Creación de nuevo Pokémon (Squirtle).
  4. `test_put.py`: Modificación de atributos.
  5. `test_delete.py`: Eliminación de recurso (ID 2 - Charmander).
  6. Verificación final de consistencia.

### 3.4. Pruebas de Rendimiento y Estrés (k6)
* **Archivo:** [`tests/performance/k6_stress_test.js`](file:///c:/Users/Rodrigo/Documents/Git/pokedex/tests/performance/k6_stress_test.js).
* **Propósito:** Simula rampas de usuarios virtuales concurrentes con métricas detalladas de percentiles (p95, p99), tiempo de TTFB y tasa de error HTTP.

### 3.5. Pruebas de Carga Concurrente y Autoescalado (HPA)
* **Archivo:** [`scripts/k8s_load_test.py`](file:///c:/Users/Rodrigo/Documents/Git/pokedex/scripts/k8s_load_test.py).
* **Propósito:** Generador de carga masiva multi-hilo en Python puro (independiente del SO). Permite elevar deliberadamente el consumo de CPU/RAM para disparar el Horizontal Pod Autoscaler (HPA) en Kubernetes o medir rendimiento de Docker Compose.
* **Parámetros configurables:**
  * `--url`: Endpoint a estresar (defecto: `http://localhost:8080/api/pokemons`).
  * `--concurrency`: Hilos simultáneos (defecto: `50`).
  * `--total-requests`: Cantidad de peticiones (defecto: `3000`).
  * `--duration`: Tiempo límite en segundos (defecto: `60`).

### 3.6. Auditoría Integral de Calidad, Complejidad y Duplicados
* **Archivo:** [`scripts/audit_code_quality.py`](file:///c:/Users/Rodrigo/Documents/Git/pokedex/scripts/audit_code_quality.py).
* **Propósito:** Ejecuta de forma unificada:
  * **Ruff:** Verificación de sintaxis, imports muertos y anti-patrones.
  * **Radon:** Análisis de complejidad ciclomática por función (Grado A requerido).
  * **JSCPD / Detección de duplicados:** Búsqueda de bloques redundantes entre capas.

### 3.7. Linter, Formato y Seguridad SAST
* **Ruff (`ruff.toml`):** Linter ultrarrápido y formateador automático (`task lint`, `task format`).
* **Bandit:** Análisis estático de seguridad SAST sobre el código Python (`task security`).
* **Gitleaks (`.gitleaks.toml`):** Detección preventiva de credenciales o secretos expuestos.

---

## 4. Métodos de Ejecución Local

### Método 1: Vía Taskfile (Recomendado y Multiplataforma)

[Taskfile](https://taskfile.dev/) es el estándar adoptado en el repositorio para reemplazar el antiguo `Makefile` y los scripts dispersos de PowerShell. Funciona de manera idéntica en Windows (PowerShell/CMD), Linux y macOS.

```bash
# Ver lista de todas las tareas disponibles
task --list

# 1. Pruebas unitarias con cobertura
task test

# 2. Carga masiva de datos (Seeding completo)
task seed

# 2b. Carga masiva acotada para pruebas rápidas
task seed -- 50

# 3. Secuencia de pruebas funcionales de la API (CRUD)
task test:api

# 4. Pruebas de rendimiento con k6
task perf

# 5. Pruebas de carga concurrente (simulador HPA)
task test:load

# 5b. Pruebas de carga personalizadas
task test:load -- --concurrency 60 --total-requests 5000 --duration 90

# 6. Auditoría integral de calidad
task audit

# 7. Formateo y corrección automática
task format
task lint
```

---

### Método 2: Vía Python Directo

Si prefieres ejecutar comandos sin el binario `task`, utiliza el intérprete Python activo (virtual environment `.venv`):

```bash
# Pruebas unitarias con reporte de líneas faltantes
pytest -v --cov=apps/api/src --cov-report=term-missing

# Carga masiva de datos (todos los Pokémon)
python scripts/bulk_load_pokemons.py

# Batería de pruebas funcionales CRUD
python scripts/run_all_scripts.py

# Prueba de carga concurrente
python scripts/k8s_load_test.py --url http://localhost:8080/api/pokemons --concurrency 50 --total-requests 3000

# Auditoría integral
python scripts/audit_code_quality.py

# Linter y Formateo
ruff check apps/ src/ scripts/
ruff format apps/ src/ scripts/

# SAST con Bandit
bandit -r apps/api/src src/ -ll
```

---

### Método 3: En Contenedores Docker Compose

Permite correr cualquier test dentro del contenedor aislado de la API sin tener dependencias instaladas en tu máquina anfitriona:

```bash
# 1. Levantar el stack local
docker compose up -d --build

# 2. Ejecutar pruebas unitarias dentro del contenedor
docker compose exec api pytest

# 3. Ejecutar carga masiva de datos dentro de la red Docker
docker compose exec api python apps/api/scripts/bulk_load_pokemons.py

# 4. Ejecutar la secuencia de pruebas funcionales de la API
docker compose exec api python apps/api/scripts/run_all_scripts.py

# 5. Ejecutar la auditoría de calidad
docker compose exec api python scripts/audit_code_quality.py

# 6. Detener el stack
docker compose down
```

---

### Método 4: En Clúster Kubernetes

Para validar cargas de datos y autoescalado en un entorno orquestado:

1. **Carga masiva declarativa (Job de Kubernetes):**
   ```bash
   kubectl apply -f infra/k8s/08-db-seed-job.yaml
   
   # Inspeccionar logs del proceso de carga masiva
   kubectl logs -f job/pokemon-db-seed-job -n pokemon-app
   ```

2. **Validación de autoescalado elástico bajo estrés:**
   * Terminal 1 (Monitoreo HPA en vivo):
     ```bash
     kubectl get hpa -n pokemon-app -w
     ```
   * Terminal 2 (Monitoreo de Pods en vivo):
     ```bash
     kubectl get pods -n pokemon-app -w
     ```
   * Terminal 3 (Disparo de carga masiva):
     ```bash
     task test:load
     # O directamente:
     python scripts/k8s_load_test.py --url http://localhost:8080/api/pokemons --concurrency 60 --total-requests 5000
     ```

---

### Método 5: Vía Tareas de VS Code

1. Presiona `Ctrl + Shift + P` (o `F1`).
2. Escribe `Tasks: Run Task`.
3. Selecciona la tarea deseada:
   * **`🧪 Tests: Ejecutar Pytest`** (atajo: `Ctrl + Shift + B`).
   * **`🔍 Auditoría: Calidad, Duplicación y Rendimiento`**.
   * **`🚀 Docker: Dev Up`** / **`🛑 Docker: Dev Down`**.

---

## 5. Quality Gates (Criterios de Aceptación)

Para que cualquier Pull Request o cambio sea aprobado, debe cumplir con los siguientes umbrales:

| Criterio | Métrica Requerida | Estado Actual |
| :--- | :--- | :--- |
| **Pruebas Unitarias** | 100% de pruebas aprobadas | ✅ Aprobado |
| **Complejidad Ciclomática** | Promedio $\le 5.0$ (Calificación A) | ✅ 3.36 (A) |
| **Errores de Linter** | 0 errores críticos (`ruff check`) | ✅ 0 errores |
| **Duplicación de Código** | 0 duplicados en código de producción | ✅ Aprobado |
| **Seguridad SAST** | 0 vulnerabilidades de severidad alta/media | ✅ 0 alertas |
| **Healthchecks** | HTTP 200 en `/healthz` en menos de 10ms | ✅ Aprobado (< 5ms) |
