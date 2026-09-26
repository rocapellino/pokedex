# 🔬 Stack Tecnológico, Arquitectura y Mejores Prácticas

Este documento técnico especifica el stack tecnológico de la plataforma **Pokédex**, las decisiones arquitectónicas vigentes, los estándares de ingeniería aplicados y el rationale técnico que fundamenta la selección de herramientas para garantizar escalabilidad, seguridad, mantenibilidad y rendimiento óptimo.

---

## 📑 Índice

1. [Stack Tecnológico Vigente](#1-stack-tecnológico-vigente)
2. [Decisiones Arquitectónicas Activas](#2-decisiones-arquitectónicas-activas)
3. [Catálogo de Mejores Prácticas de Ingeniería](#3-catálogo-de-mejores-prácticas-de-ingeniería)
   - [3.1. Arquitectura en Capas y Modularidad](#31-arquitectura-en-capas-y-modularidad)
   - [3.2. Tipado Estricto y Validación de Esquemas](#32-tipado-estricto-y-validación-de-esquemas)
   - [3.3. Resiliencia, Caché y Persistencia Híbrida](#33-resiliencia-caché-y-persistencia-híbrida)
   - [3.4. Seguridad Integral (Defense-in-Depth)](#34-seguridad-integral-defense-in-depth)
   - [3.5. Observabilidad, SRE y Telemetría](#35-observabilidad-sre-y-telemetría)
   - [3.6. Estrategia de Testing Automatizado](#36-estrategia-de-testing-automatizado)
4. [Rationale Técnico de Decisiones Clave](#4-rationale-técnico-de-decisiones-clave)

---

## 1. Stack Tecnológico Vigente

La plataforma está construida bajo un ecosistema unificado y tipado de extremo a extremo:

| Capa / Dominio | Tecnología Seleccionada | Versión / Especificación | Propósito Principal |
| :--- | :--- | :--- | :--- |
| **Runtime & Servidor** | Node.js (con soporte Bun) | 22 LTS | Servidor HTTP unificado, API REST y servicios auxiliares |
| **Lenguaje Core** | TypeScript | 5.x (NodeNext / ES2022) | Seguridad de tipos estática extremo a extremo |
| **Framework HTTP** | Express | 4.x | Ruteo declarativo, middlewares de seguridad y telemetría |
| **Frontend Web** | HTML5 Semántico + Vanilla JS / CSS | Modern Web APIs | Catálogo interactivo (Bento Grid) y Backoffice administrativo |
| **Bundler / Tooling** | esbuild / tsx / Vite | Modern ESM | Compilación ultrarrápida y recarga instantánea en desarrollo |
| **Persistencia Principal** | PostgreSQL | 16 | Almacenamiento relacional duradero con soporte JSONB |
| **Caché y Coordinación** | Redis | 7 (Alpine) | Caché de segundo nivel, rate limiting distribuido y revocación de JWT |
| **Integración IA** | Google GenAI SDK | `@google/genai` (Gemini 2.5 Flash) | Generación dinámica de diagramas y asistencia contextual |
| **Contenerización** | Docker Multi-Stage | `node:22-alpine` | Contenedores ultraligeros con usuario no root (`appuser`) |
| **Orquestación** | Kubernetes & Helm | Helm 3 | Despliegue declarativo y gestión de configuración por entornos |

---

## 2. Decisiones Arquitectónicas Activas

1. **Backend y API Unificada:** Un único proceso de servidor en Node.js/TypeScript atiende la API REST, sirve los activos estáticos del frontend, expone los endpoints de telemetría y ejecuta las integraciones externas.
2. **Modelos Compartidos y Type Safety:** Los contratos de datos (`Pokemon`, `PokemonStats`, `PokemonEvolution`) residen como interfaces canónicas en TypeScript (`src/pokemonData.ts`), compartidas entre controladores, servicios y validadores.
3. **Persistencia Híbrida Relacional + JSONB:**
   - PostgreSQL 16 actúa como la única fuente de verdad transaccional (ACID).
   - Columnas relacionales indexadas (`id`, `nombre`, `tipo`) para filtros de alta cardinalidad.
   - Columna binaria `data JSONB` indexada con GIN para flexibilidad total de atributos sin migraciones DDL disruptivas.
4. **Contenedor Único Multi-Stage:** Compilación limpia en etapa de build con `esbuild` y empaquetado final mínimo en `node:22-alpine`, ejecutado bajo un usuario de mínimos privilegios (`node`).

---

## 3. Catálogo de Mejores Prácticas de Ingeniería

### 3.1. Arquitectura en Capas y Modularidad

El código del servidor se organiza siguiendo principios de separación de responsabilidades:

```text
src/
├── domain/            # Modelos de dominio e interfaces puras
├── services/          # Lógica de negocio (DB, caché, IA, transformaciones)
├── middleware/        # Seguridad, autenticación, rate limiting y telemetría
└── routes/            # Definición declarativa de endpoints REST
```

### 3.2. Tipado Estricto y Validación de Esquemas

- **Tipado Estricto:** `tsconfig.json` configurado con `strict: true`, `noImplicitAny: true` y comprobación rigurosa de nulabilidad.
- **Validación en Runtime:** Validación rigurosa de payloads en endpoints mutadores (`POST`, `PUT`), sanitizando campos de texto para prevenir inyecciones y garantizando que no ingresen números fuera de rango en estadísticas de combate.

### 3.3. Resiliencia, Caché y Persistencia Híbrida

- **Patrón Cache-Aside con Redis:** Consultas de catálogo (`GET /pokemons`) se resuelven en memoria con TTL de 300 segundos. Toda mutación administrativa invalida proactivamente las claves asociadas en Redis.
- **Cabeceras HTTP de Caché:** Emisión de `ETag` y cabeceras `Cache-Control` (`public, max-age=300, stale-while-revalidate=60`) para maximizar el rendimiento en clientes y proxies intermedios.

### 3.4. Seguridad Integral (Defense-in-Depth)

- **Cabeceras HTTP:** Implementación de Content-Security-Policy (CSP), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` y protección contra Clickjacking.
- **Rate Limiting:** Control de abusos y mitigación de DoS mediante ventanas deslizantes con scripts Lua atómicos en Redis.
- **Principio de Mínimo Privilegio:** Contenedores de producción ejecutados como usuarios no privilegiados y sistemas de archivos raíz en modo de solo lectura cuando sea aplicable.

### 3.5. Observabilidad, SRE y Telemetría

- **Métricas Prometheus en `/metrics`:**
  - `pokedex_uptime_seconds`: Gauge de disponibilidad del servicio.
  - `pokedex_total_pokemons`: Cantidad de especímenes registrados.
  - `pokedex_http_requests_total`: Contador por método, ruta y código de estado.
  - `pokedex_http_request_duration_seconds`: Histogramas de latencia (p50, p95, p99).
- **Healthchecks Estandarizados:** `/healthz` responde `healthy` para `livenessProbe` y `readinessProbe` de Kubernetes, verificando la conectividad de dependencias críticas antes de recibir tráfico.
- **Logs Estructurados:** Emisión de eventos en formato JSON estructurado para facilitar la ingesta y trazabilidad en sistemas de agregación de logs.

### 3.6. Estrategia de Testing Automatizado

La plataforma implementa una estrategia de validación multi-nivel:

- **Unitarias:** Pruebas de cálculos estadísticos, transformadores y lógica de dominio.
- **Integración:** Verificación de endpoints HTTP con mocks de persistencia y base de datos en memoria.
- **Seguridad:** Verificación estricta de políticas de red, inyección de secretos, encabezados CSP y hardening de scripts.
- **Rendimiento:** Pruebas de carga con k6 para validar el comportamiento bajo estrés y el dimensionamiento de recursos.

---

## 4. Rationale Técnico de Decisiones Clave

| Decisión | Alternativa Descartada | Rationale Técnico |
| :--- | :--- | :--- |
| **Unificación en TypeScript** | Dualidad Python + Frontend independiente | Elimina la duplicación de esquemas (Pydantic vs JS), reduce el consumo de memoria en más del 60% por pod y permite reutilizar tipos entre capas. |
| **PostgreSQL + JSONB** | NoSQL puro (MongoDB) / SQL normalizado estricto | Combina la solidez de transacciones ACID y secuencias atómicas con la agilidad de evolucionar especificaciones de atributos sin alterar el esquema relacional. |
| **Contenedor Único de Producción** | Arquitectura multi-contenedor (Nginx + API) | Reduce la sobrecarga de orquestación, simplifica los manifiestos Helm y disminuye la superficie de ataque y los puntos de fallo en red. |
| **Assets vía CDN / URL Externa** | Almacenamiento local de binarios / Object Storage dedicado | Evita la degradación del rendimiento de la base de datos y aprovecha infraestructuras globales de distribución de contenidos con compresión WebP automática. |
