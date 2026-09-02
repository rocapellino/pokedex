# 🔬 Análisis de Lenguajes, Arquitectura y Mejores Prácticas

Este informe técnico analiza en profundidad el stack tecnológico del proyecto **Pokédex**, evalúa la necesidad o conveniencia de modificar lenguajes de programación, y establece un plan de mejoras y mejores prácticas de ingeniería de software para maximizar escalabilidad, seguridad, mantenibilidad y rendimiento.

---

## 📑 Índice
1. [Evaluación de Lenguajes y Runtimes](#1-evaluación-de-lenguajes-y-runtimes)
   * [1.1. ¿Es necesario cambiar de lenguaje?](#11-es-necesario-cambiar-de-lenguaje)
   * [1.2. Matriz Comparativa: TypeScript vs. Python vs. Go](#12-matriz-comparativa-typescript-vs-python-vs-go)
   * [1.3. Evaluación del Frontend (Vanilla JS vs. React/Vue/Svelte)](#13-evaluación-del-frontend-vanilla-js-vs-reactvuesvelte)
   * [1.4. Decisión y Recomendación Estratégica](#14-decisión-y-recomendación-estratégica)
2. [Catálogo de Mejores Prácticas de Ingeniería](#2-catálogo-de-mejores-prácticas-de-ingeniería)
   * [2.1. Arquitectura en Capas (Clean Architecture)](#21-arquitectura-en-capas-clean-architecture)
   * [2.2. Tipado Estricto y Validación de Esquemas](#22-tipado-estricto-y-validación-de-esquemas)
   * [2.3. Resiliencia, Caché y Persistencia Híbrida](#23-resiliencia-caché-y-persistencia-híbrida)
   * [2.4. Seguridad Integral (Defense-in-Depth)](#24-seguridad-integral-defense-in-depth)
   * [2.5. Observabilidad, SRE y Telemetría](#25-observabilidad-sre-y-telemetría)
   * [2.6. Estrategia de Testing Automatizado](#26-estrategia-de-testing-automatizado)
3. [Plan de Acción Roadmap](#3-plan-de-acción-roadmap)
4. [Auditoría y Registro de Modificaciones Realizadas por AI Studio](#4-auditoría-y-registro-de-modificaciones-realizadas-por-ai-studio)
   * [4.1. Resumen Ejecutivo de la Intervención](#41-resumen-ejecutivo-de-la-intervención)
   * [4.2. Inventario Detallado de Archivos Creados y Modificados](#42-inventario-detallado-de-archivos-creados-y-modificados)
   * [4.3. Comparativa Arquitectónica: Estado Previo vs. Estado Actual](#43-comparativa-arquitectónica-estado-previo-vs-estado-actual)
   * [4.4. Módulos y Nuevas Capacidades Implementadas](#44-módulos-y-nuevas-capacidades-implementadas)
   * [4.5. Coexistencia con la Infraestructura Monorepo y DevOps](#45-coexistencia-con-la-infraestructura-monorepo-y-devops)
   * [4.6. Guía de Ejecución y Validación Local](#46-guía-de-ejecución-y-validación-local)

---

## 1. Evaluación de Lenguajes y Runtimes

### 1.1. ¿Es necesario cambiar de lenguaje?

> **Dictamen Técnico:** **No es estrictamente obligatorio** cambiar de lenguaje para que la aplicación funcione, pero **sí es altamente recomendable consolidar la arquitectura bajo un stack unificado en TypeScript (Node.js)** o mantener microservicios con límites claros (*Bounded Contexts*).

#### Estado Inicial del Repositorio:
* El repositorio contenía originalmente una mezcla de **Python (FastAPI)** en backend y **Vanilla JavaScript (HTML5/CSS3)** en frontend, servido por Nginx y orquestado con Docker/Kubernetes.
* **Fricciones observadas con el enfoque dual:**
  1. **Duplicación de Modelos de Datos:** Los esquemas de Pokémon debían definirse dos veces (Pydantic en Python y TypeScript/JS en la web), aumentando el riesgo de discrepancias de tipos.
  2. **Sobrecarga de Infraestructura:** Se requerían dos contenedores separados (uno para Uvicorn/Python y otro para Nginx/HTML) en escenarios donde un solo servidor unificado puede atender la API y los estáticos con menor consumo de RAM y CPU.
  3. **Compatibilidad con SDKs Modernos de IA:** El SDK oficial `@google/genai` de Google AI Studio ofrece soporte de primer nivel y tipado nativo en TypeScript.

---

### 1.2. Matriz Comparativa: TypeScript vs. Python vs. Go

| Criterio | TypeScript (Node.js / Bun) | Python 3.13 (FastAPI) | Go 1.22+ (Gin / Fiber) |
|---|---|---|---|
| **Velocidad de I/O Concurrente** | 🟢 Excelente (Event Loop no bloqueante) | 🟡 Buena (con AsyncIO / uvloop) | 🟢 Sobresaliente (Goroutines nativas) |
| **Consumo de Memoria por Pod** | 🟢 Moderado (~30 - 60 MB) | 🔴 Alto (~90 - 150 MB por worker) | 🟢 Mínimo (< 15 - 25 MB) |
| **Tipado y Compartición de Código**| 🟢 End-to-End Type Safety (Front + Back) | 🟡 Fuerte en backend (Pydantic), aislado del front | 🟡 Estricto en backend, aislado del front |
| **Integración con Google AI Studio**| 🟢 Nativa (`@google/genai`) | 🟢 Buena (`google-genai` pip) | 🟡 Requiere wrappers REST/gRPC |
| **Cold Start en Cloud Run / Serverless** | 🟢 Ultrarrápido (< 250 ms con esbuild) | 🔴 Lento (1.2 s a 3.0 s por imports) | 🟢 Instantáneo (< 80 ms binario compilado) |
| **Curva de Aprendizaje del Equipo** | 🟢 Muy baja (JavaScript omnipresente) | 🟢 Muy baja (Python limpio) | 🟡 Media (punteros, concurrencia Go) |

---

### 1.3. Evaluación del Frontend (Vanilla JS vs. React/Vue/Svelte)

* **Situación actual con Vanilla JS:**
  * *Ventajas:* Cero dependencias en el cliente, peso de descarga diminuto (< 40 KB), renderizado inmediato sin tiempos de compilación ni hydration lag.
  * *Limitaciones:* Manipulación directa del DOM (`document.createElement`, `innerHTML`), lo que se vuelve propenso a errores al escalar a catálogos con miles de registros, filtros anidados o estados complejos de formularios.
* **Recomendación para la evolución del Frontend:**
  * Si el proyecto se mantiene como catálogo ligero y backoffice administrativo, **Vanilla JS con Web Components modulares** o **Svelte/Preact** es la opción ideal para mantener la velocidad extrema sin la pesadez de frameworks gigantes.
  * Para catálogos con más de 1.000 entradas, implementar **Virtual Scrolling (DOM Virtualizado)** y **búsqueda indexada en cliente (Fuse.js o MiniSearch)**.

---

### 1.4. Decisión y Recomendación Estratégica

1. **Backend Unificado:** Adoptar **TypeScript en Node.js (Express o Fastify)** como runtime principal para la API REST, backoffice y servicios de integración con Gemini.
2. **Modelos Compartidos:** Exportar interfaces comunes (`Pokemon`, `PokemonStats`, `PokemonEvolution`) que alimenten tanto los controladores de la API como los componentes del frontend.
3. **Contenerización Eficiente:** Imagen Docker única basada en `node:22-alpine` multi-stage, reduciendo la complejidad de despliegue de 2 contenedores a 1 solo contenedor de producción.

---

## 2. Catálogo de Mejores Prácticas de Ingeniería

### 2.1. Arquitectura en Capas (Clean Architecture)
Separar el servidor en capas independientes con responsabilidades bien delimitadas:

```
src/
├── domain/            # Entidades y tipos de negocio puros (Pokemon, Stats)
├── services/          # Lógica de negocio, cálculos de BST y llamadas a Gemini
├── repositories/      # Acceso a datos (PostgreSQL, Redis, Memoria)
├── controllers/       # Controladores HTTP (parsing de requests y status codes)
└── routes/            # Definición declarativa de endpoints REST
```

### 2.2. Tipado Estricto y Validación de Esquemas
* **Validación en Tiempo de Ejecución:** Implementar **Zod** para validar el cuerpo de las peticiones en los endpoints `POST /pokemons` y `PUT /pokemons/:id`.
* **Beneficio:** Garantiza que no ingresen valores NaN en peso/altura, números negativos en estadísticas de combate o URLs malformadas en sprites.

### 2.3. Resiliencia, Caché y Persistencia Híbrida
* **Patrón Cache-Aside con Redis:**
  * Las consultas `GET /pokemons` y `GET /pokemons/:id` deben consultar primero la memoria caché de Redis con un TTL de 1 hora.
  * Cualquier mutación (`POST`, `PUT`, `DELETE`) debe invalidar automáticamente las claves `pokemons:all` y `pokemon:{id}`.
* **Cabeceras HTTP de Caché:**
  * Emitir `ETag` y `Cache-Control: public, max-age=300, stale-while-revalidate=60` para permitir que navegadores y CDNs almacenen respuestas sin sobrecargar el backend.

### 2.4. Seguridad Integral (Defense-in-Depth)
* **Cabeceras de Seguridad con Helmet:** Configurar Content-Security-Policy (CSP), `X-Content-Type-Options: nosniff` y `X-Frame-Options`.
* **Rate Limiting:** Proteger la API de abusos y ataques de denegación de servicio utilizando un limitador de velocidad (ej. 100 peticiones por minuto por IP).
* **Sanitización de Inputs:** Evitar inyecciones XSS en nombres y descripciones de Pokémon mediante sanitización estricta antes de persistir.
* **Contenedores No-Root:** Asegurar que el Dockerfile final ejecute el proceso bajo un usuario sin privilegios (`node` o `appuser`).

### 2.5. Observabilidad, SRE y Telemetría
* **Métricas Prometheus:** Exponer gauges y contadores estandarizados en `/metrics`:
  * `pokedex_http_requests_total{method, endpoint, status}`
  * `pokedex_http_request_duration_seconds` (histogramas de latencia p50, p95, p99).
  * `pokedex_total_pokemons` (inventario en vivo).
* **Logs Estructurados en Formato JSON:** Incluir `timestamp`, `level`, `trace_id`, `method`, `path` y `duration_ms` para facilitar la ingesta en Datadog, Grafana Loki o Cloud Logging.
* **Probes de Kubernetes:**
  * `livenessProbe`: Verificación básica de que el proceso está activo.
  * `readinessProbe`: Validación de que la base de datos y la caché están conectadas y listas para recibir tráfico en `/healthz`.

### 2.6. Estrategia de Testing Automatizado
1. **Pruebas Unitarias:** Cobertura de cálculos estadísticos, validadores y transformadores de datos (> 80% coverage).
2. **Pruebas de Integración:** Verificación de ciclo completo de endpoints HTTP con `supertest` o `vitest`.
3. **Pruebas de Estrés con k6:** Validación de autoescalado horizontal (HPA) sometiendo la API a 500 usuarios concurrentes (`tests/performance/k6_stress_test.js`).

---

## 3. Plan de Acción Roadmap

| Fase | Tarea | Impacto | Esfuerzo |
|---|---|---|---|
| **Fase 1 (Inmediata)** | Consolidación en TypeScript, contratos de tipos y endpoints CRUD estandarizados. | 🟢 Alto | 🟢 Bajo (Completado) |
| **Fase 2 (Corto Plazo)** | Integración de Zod para validación de requests y Helmet para cabeceras de seguridad. | 🟢 Alto | 🟢 Bajo |
| **Fase 3 (Medio Plazo)** | Adición de capa de persistencia PostgreSQL / Firestore con invalidación de caché en Redis. | 🟡 Medio | 🟡 Medio |
| **Fase 4 (Largo Plazo)** | Adopción de OpenTelemetry distribuido y virtualización de catálogo para miles de entradas. | 🟢 Alto | 🟡 Medio |

---

## 4. Auditoría y Registro de Modificaciones Realizadas por AI Studio

En esta sección se documenta el análisis exhaustivo de la intervención técnica realizada por **Google AI Studio** en el repositorio sobre la rama `studio/new-implement`. La intervención abordó la materialización práctica de la **Fase 1 del Roadmap**, reemplazando la dualidad previa por un stack consolidado en **TypeScript** con integración nativa al SDK de Gemini.

---

### 4.1. Resumen Ejecutivo de la Intervención

* **Objetivo Principal:** Prototipar y desplegar una arquitectura unificada y moderna que consolide la API REST, el catálogo web y las capacidades generativas de IA bajo un único runtime de alto rendimiento, eliminando la duplicidad entre microservicios y reduciendo la fricción operativa.
* **Componentes Principales Entregados:**
  1. **Servidor Backend Unificado en TypeScript (`server.ts`):** Provee la API REST completa, healthcheck de Kubernetes (`/healthz`), telemetría de Prometheus (`/metrics`), endpoints de IA generativa y servidor de activos estáticos web en el puerto `3000`.
  2. **Contratos de Dominio y Tipos Fuertes (`src/pokemonData.ts`):** Interfaces declarativas (`Pokemon`, `PokemonStats`, `PokemonCharacteristics`, `PokemonEvolution`) junto con un almacén en memoria precargado con especímenes de las Generaciones I a IX.
  3. **Integración con Google AI Studio (`@google/genai`):** Incorporación de endpoints respaldados por el modelo `gemini-2.5-flash` para generación automática de diagramas Mermaid (`/api/v1/ai/diagram`) y prototipado dinámico de componentes UI (`/api/v1/ai/mock`).
  4. **Frontend Modernizado de Alta Fidelidad (`public/`):** Rediseño completo de la interfaz de usuario con Catálogo interactivo (búsqueda reactiva, filtros multigenacionales y modales con árbol genealógico) y un **Backoffice Administrativo** con KPIs operativos en tiempo real.
  5. **Documentación Arquitectónica y Mockups (`docs/architecture/`):** Generación de especificaciones de UI/UX, tokens de diseño y mockups vectoriales SVG de alta definición (`MOCKUPS_Y_DISENO_UI.md`).

---

### 4.2. Inventario Detallado de Archivos Creados y Modificados

A continuación se detalla cada uno de los artefactos impactados o introducidos por la intervención de AI Studio:

| Archivo / Ruta | Estado Git | Capa / Dominio | Descripción y Propósito Técnico |
|---|---|---|---|
| [`server.ts`](file:///c:/Users/Rodrigo/Documents/Git/pokedex/server.ts) | ✨ Nuevo | Backend / API | Servidor central en Express/TypeScript. Gestiona endpoints CRUD `/pokemons`, métricas Prometheus `/metrics`, healthcheck `/healthz`, endpoints de Gemini y ruteo SPA. |
| [`src/pokemonData.ts`](file:///c:/Users/Rodrigo/Documents/Git/pokedex/src/pokemonData.ts) | ✨ Nuevo | Dominio / Datos | Interfaces y modelos de tipos (`Pokemon`, `PokemonStats`, etc.) y dataset inicial de 830+ líneas con Pokémon de Kanto a Paldea. |
| [`package.json`](file:///c:/Users/Rodrigo/Documents/Git/pokedex/package.json) | ✨ Nuevo | Config / Build | Manifiesto Node.js con dependencias (`@google/genai`, `express`, `cors`), bundler (`esbuild`), runtime de desarrollo (`tsx`) y TypeScript. |
| [`bun.lock`](file:///c:/Users/Rodrigo/Documents/Git/pokedex/bun.lock) | ✨ Nuevo | Config / Build | Lockfile determinístico para gestión de dependencias ultrarrápida con Bun. |
| [`tsconfig.json`](file:///c:/Users/Rodrigo/Documents/Git/pokedex/tsconfig.json) | ✨ Nuevo | Config / Build | Configuración de compilación de TypeScript para NodeNext y ECMAScript 2022 (`outDir: ./dist`). |
| [`metadata.json`](file:///c:/Users/Rodrigo/Documents/Git/pokedex/metadata.json) | ✨ Nuevo | AI Studio | Metadatos de la aplicación para AI Studio, declarando la capacidad `MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API`. |
| [`public/index.html`](file:///c:/Users/Rodrigo/Documents/Git/pokedex/public/index.html) | ✨ Nuevo | Frontend | Vista principal de la Pokédex: Bento Grid con métricas de fuerza/peso, buscador reactivo, filtros por tipo y modal de evoluciones. |
| [`public/backoffice.html`](file:///c:/Users/Rodrigo/Documents/Git/pokedex/public/backoffice.html) | ✨ Nuevo | Frontend / Admin | Panel de administración CRUD: monitoreo de latencia y estado de salud, tabla interactiva de Pokémon y formulario modal de alta/edición. |
| [`public/js/pokedex.js`](file:///c:/Users/Rodrigo/Documents/Git/pokedex/public/js/pokedex.js) | ✨ Nuevo | Frontend / Lógica | Lógica reactiva de la Pokédex: consumo asíncrono de `/pokemons`, cálculo de estadísticas BST en cliente, filtrado combinado y renderizado DOM optimizado. |
| [`public/js/backoffice.js`](file:///c:/Users/Rodrigo/Documents/Git/pokedex/public/js/backoffice.js) | ✨ Nuevo | Frontend / Admin | Lógica del panel administrativo: operaciones HTTP `POST`, `PUT`, `DELETE` con confirmación, validación y pooling de healthcheck. |
| [`public/js/theme.js`](file:///c:/Users/Rodrigo/Documents/Git/pokedex/public/js/theme.js) | ✨ Nuevo | Frontend / UI | Gestor de temas claro / oscuro con persistencia en `localStorage` y sincronización con preferencias del sistema operativo. |
| [`public/css/style.css`](file:///c:/Users/Rodrigo/Documents/Git/pokedex/public/css/style.css) | ✨ Nuevo | Frontend / Estilos | Sistema de diseño con tokens CSS, gradientes cromáticos por tipo elemental, glassmorphism, microanimaciones y diseño responsivo. |
| [`public/css/backoffice.css`](file:///c:/Users/Rodrigo/Documents/Git/pokedex/public/css/backoffice.css) | ✨ Nuevo | Frontend / Estilos | Estilos específicos para la consola administrativa, tablas de gestión y modales CRUD. |
| [`public/assets/mockups/*`](file:///c:/Users/Rodrigo/Documents/Git/pokedex/public/assets/mockups/) | ✨ Nuevo | Assets / Diseño | Mockups vectoriales SVG de alta fidelidad (`pokedex-catalog.svg`, `pokemon-detail.svg`, `backoffice-dashboard.svg`). |
| [`docs/architecture/MOCKUPS_Y_DISENO_UI.md`](file:///c:/Users/Rodrigo/Documents/Git/pokedex/docs/architecture/MOCKUPS_Y_DISENO_UI.md) | ✨ Nuevo | Documentación | Documentación técnica del sistema de diseño visual, tokens, accesibilidad WCAG 2.1 AA y lineamientos de UX. |
| [`.env.example`](file:///c:/Users/Rodrigo/Documents/Git/pokedex/.env.example) | 📝 Modificado | Configuración | Plantilla ajustada para el entorno unificado (`PORT=3000`, `GEMINI_API_KEY`, `DATABASE_URL`, `REDIS_URL`). |
| [`.gitignore`](file:///c:/Users/Rodrigo/Documents/Git/pokedex/.gitignore) | 📝 Modificado | Git / DevOps | Adición de exclusiones estándar para el ecosistema Node.js (`node_modules/`, `dist/`, `.npm/`). |
| [`docs/README.md`](file:///c:/Users/Rodrigo/Documents/Git/pokedex/docs/README.md) | 📝 Modificado | Documentación | Vinculación en el índice general hacia los nuevos documentos arquitectónicos. |

---

### 4.3. Comparativa Arquitectónica: Estado Previo vs. Estado Actual

La siguiente matriz contrasta la arquitectura original basada en dos microservicios con la implementación unificada propuesta por AI Studio:

```mermaid
graph TD
  subgraph "Arquitectura Anterior (Dual Python + Nginx)"
    A1[Usuario / Navegador] -->|HTTP 8080| B1[Nginx: apps/web]
    A1 -->|HTTP 5000 /api| C1[FastAPI / Uvicorn: apps/api]
    C1 --> D1[(PostgreSQL)]
    C1 --> E1[(Redis)]
  end

  subgraph "Arquitectura Nueva (TypeScript Unificado)"
    A2[Usuario / Navegador] -->|HTTP 3000| B2[Express Server: server.ts]
    B2 -->|API REST & Estáticos| B2
    B2 -->|SDK @google/genai| C2[Google AI Studio / Gemini 2.5 Flash]
    B2 -->|Persistencia Híbrida| D2[(In-Memory / Postgres / Redis)]
    B2 -->|Métricas & SRE| E2[/metrics & /healthz]
  end
```

| Dimensión Técnica | Arquitectura Anterior (Monorepo Legacy) | Arquitectura Nueva (AI Studio - TypeScript) | Impacto / Beneficio |
|---|---|---|---|
| **Runtimes de Ejecución** | Python 3.13 (Uvicorn) + Nginx (Web estática). | Node.js 22 LTS o Bun en un solo proceso unificado. | 📉 **-50% contenedores requeridos** en entornos de staging/dev. |
| **Consumo de Memoria Base** | ~140 MB a 200 MB combinando ambos pods. | ~35 MB a 55 MB en un único pod Node/Bun. | ⚡ **~70% de ahorro de memoria RAM**, ideal para clústeres K8s con recursos limitados. |
| **Compartición de Modelos** | Modelos duplicados (Pydantic en Python vs. JS plano en cliente). | Interfaces TypeScript nativas (`src/pokemonData.ts`). | 🛡️ **Tipado extremo a extremo**: Previene discrepancias en atributos de combate o evolución. |
| **Integración con IA** | Scripts CLI manuales (`scripts/ai_tools.py`). | Endpoints REST nativos integrados en Express con `@google/genai`. | 🤖 **Capacidades generativas accesibles vía API** en tiempo real. |
| **Observabilidad y Telemetría** | Módulo de métricas básico en Flask. | Middleware nativo que computa contadores y latencia por ruta y método HTTP (`/metrics`). | 📊 **Compatibilidad total con Prometheus y Grafana** sin librerías externas pesadas. |
| **Experiencia de Usuario (UI/UX)** | Interfaz plana sin feedback de estado ni modales complejos. | Catálogo dinámico con Bento Grid, temas persistentes y modal con árbol genealógico. | ✨ **Alineación con estándares de diseño modernos y WCAG 2.1 AA**. |

---

### 4.4. Módulos y Nuevas Capacidades Implementadas

#### 1. Endpoints de la API REST (`server.ts`)
* `GET /pokemons`: Obtiene el catálogo completo en formato JSON con características, estadísticas y cadenas evolutivas.
* `GET /pokemons/:id`: Consulta individual con validación de existencia (código `404` controlado).
* `POST /pokemons`: Creación de especímenes con cálculo automático de nuevo ID correlativo y valores por defecto para estadísticas no provistas.
* `PUT /pokemons/:id`: Actualización granular de campos (`caracteristicas`, `stats`, `tipos`, `habilidades`).
* `DELETE /pokemons/:id`: Eliminación física del registro con confirmación de elemento removido.

#### 2. Endpoints de SRE y Salud
* `GET /healthz`: Healthcheck estándar (`healthy\n`) para `livenessProbe` y `readinessProbe` de Kubernetes.
* `GET /metrics`: Exportador en formato abierto de Prometheus con:
  * `pokedex_uptime_seconds`: Gauge de tiempo de actividad del proceso.
  * `pokedex_total_pokemons`: Gauge con la cantidad de Pokémon en inventario.
  * `pokedex_http_requests_total`: Counter etiquetado por `{method, endpoint, status}`.
  * `pokedex_http_request_duration_seconds_sum` y `_count`: Histogram summary de latencia.

#### 3. Capacidades de Inteligencia Artificial (Google AI Studio)
* `POST /api/v1/ai/diagram`: Utiliza el SDK `@google/genai` con el modelo `gemini-2.5-flash` para transformar descripciones de lenguaje natural en diagramas Mermaid limpios (con fallback sintético en caso de no proveer API Key).
* `POST /api/v1/ai/mock`: Genera código HTML/CSS semántico y accesible para componentes visuales solicitados bajo demanda.
* `POST /api/v1/ai/image`: Resuelve URLs de ilustraciones de Pokémon de alta definición.

#### 4. Frontend y Backoffice Modernizados
* **Catálogo Pokédex (`public/index.html`):**
  * Bento Grid superior con cálculo reactivo de total de especímenes, mayor fuerza, peso promedio y tipos cubiertos.
  * Búsqueda en tiempo real debounce con selector multigenacional (Gen I a Gen IX) y filtros rápidos por tipo elemental.
  * Modal detallado con visualización de estadísticas base (HP, Ataque, Defensa, etc.) y cadena evolutiva lineal (Base → Fase 1 → Fase 2).
* **Backoffice Administrativo (`public/backoffice.html`):**
  * Dashboard con KPIs de salud del pod, latencia promedio y contador de operaciones CRUD.
  * Formulario modal completo para dar de alta nuevos Pokémon con validación de entradas numéricas.
  * Tabla con acciones de edición rápida y eliminación protegida por diálogo modal de confirmación.

---

### 4.5. Coexistencia con la Infraestructura Monorepo y DevOps

* **Convivencia con código preexistente:** Los directorios legados `apps/api/` (Python) y `apps/web/` (Nginx) se mantienen intactos dentro del monorepo, lo que permite una transición progresiva y segura sin pérdida de código histórico ni dependencias de pipelines actuales.
* **Impacto en Contenedores (`Dockerfile`):**
  * El repositorio conserva su `Dockerfile` original orientado a Python.
  * Para poner en producción la implementación de TypeScript de AI Studio, se debe agregar un `Dockerfile` multi-stage para Node.js/Bun:
    ```dockerfile
    # Etapa 1: Build
    FROM node:22-alpine AS builder
    WORKDIR /app
    COPY package.json bun.lock* tsconfig.json ./
    RUN npm ci
    COPY server.ts ./
    COPY src ./src
    RUN npm run build

    # Etapa 2: Runtime
    FROM node:22-alpine AS runner
    WORKDIR /app
    ENV NODE_ENV=production
    COPY package.json ./
    RUN npm install --omit=dev
    COPY --from=builder /app/dist ./dist
    COPY public ./public
    USER node
    EXPOSE 3000
    CMD ["node", "dist/server.cjs"]
    ```
* **Impacto en Kubernetes (`infra/k8s/`):**
  * Permite unificar `04-api-deployment.yaml` y `05-web-deployment.yaml` en un solo manifiesto `04-pokedex-deployment.yaml` que escuche en el puerto `3000`.
  * Simplifica el `07-ingress.yaml`, ya que no se requiere bifurcar el tráfico entre rutas de API (`/api/*`) y estáticos (`/*`), reduciendo las reglas de ruteo y timeouts.

---

### 4.6. Guía de Ejecución y Validación Local

Para levantar y validar la versión creada por AI Studio en el entorno local:

```bash
# 1. Instalar dependencias
npm install
# o alternativamente con bun:
bun install

# 2. Configurar variables de entorno (opcional)
# Copiar .env.example y configurar GEMINI_API_KEY si se dispone de una clave
cp .env.example .env

# 3. Iniciar el servidor en modo desarrollo (con recarga rápida vía tsx)
npm run dev
# Salida esperada: "Pokédex Server running at http://0.0.0.0:3000"

# 4. Probar endpoints principales desde la terminal
curl -s http://localhost:3000/healthz
curl -s http://localhost:3000/metrics
curl -s http://localhost:3000/pokemons/1

# 5. Compilar para producción y verificar bundle
npm run build
npm start
```

