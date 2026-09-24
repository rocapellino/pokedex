# Auditoría Estructural y de Arquitectura del Repositorio

- **Fecha:** 2026-09-24
- **Skill:** `architecture-structure-audit`
- **Ámbito:** `apps/backend/`, `apps/frontend/`, `infra/`, `gitops/`, `scripts/`, `tests/`
- **Tipo de evaluación:** Diagnóstico estructural, detección de monolitos y control de regresión

---

## Executive Summary

Se ha ejecutado la primera auditoría estructural integral del repositorio `rocapellino/pokedex` aplicando la metodología multicriterio de `architecture-structure-audit`.

La evaluación certifica que el repositorio no presenta dependencias circulares (0 ciclos en todo el grafo de TypeScript), mantiene un flujo de llamadas unidireccional y consolidó un éxito arquitectónico mayor: la reducción de [`apps/backend/server.ts`](../../apps/backend/server.ts) de ~1.178 LOC a 288 LOC (223 SLOC), transformándolo en un *composition root* limpio y desacoplado mediante la segregación en `routes/`, `middleware/`, `services/` y `utils/`.

No obstante, la auditoría identificó dos focos de concentración que demandan límites claros para evitar que evolucionen hacia God Files o God Modules:

1. **[`apps/backend/src/services/db.ts`](../../apps/backend/src/services/db.ts) (607 LOC, $C_a = 12$):** Concentra conexión de PostgreSQL, configuración SSL, cliente Redis, fallback sincronizado en memoria, migraciones Drizzle y health check de almacenamiento en un único módulo.
2. **[`apps/frontend/src/pokedex.ts`](../../apps/frontend/src/pokedex.ts) (763 LOC) y [`apps/frontend/src/backoffice.ts`](../../apps/frontend/src/backoffice.ts) (637 LOC):** Ambos módulos concentran renderizado de UI, gestión de estado local, lógica de filtrado/búsqueda, interacción modal y serialización CSV en un único archivo por vista.

---

## Repository Structure

El repositorio sigue un esquema de monorepo gestionado con npm workspaces y Turborepo:

```text
rocapellino/pokedex/
├── .agents/                    # Framework de skills, reglas y gobernanza de agentes
│   └── skills/
│       ├── _shared/            # Metodologías, plantillas de hallazgos y markdown quality gate
│       └── architecture-structure-audit/  # Skill de prevención de degradación estructural
├── apps/
│   ├── backend/                # Servidor Express API TypeScript, Drizzle ORM, Redis, Gemini AI
│   │   ├── server.ts           # Composition root (288 LOC)
│   │   └── src/                # config/, data/, db/, middleware/, routes/, services/, utils/, validation/
│   └── frontend/               # Aplicación SPA Vanilla TypeScript + Vite + Tailwind/CSS
│       └── src/                # pokedex.ts (763 LOC), backoffice.ts (637 LOC), shared/, sanitizer.ts
├── gitops/                     # Manifiestos ArgoCD (root-application, apps, environments)
├── infra/                      # Helm chart canónico, playbooks de Ansible, OpenTofu, K8s manifests
├── scripts/                    # Scripts de automatización operativa, validación y sincronización
├── tests/                      # Suites de pruebas unitarias, pentest, fuzzing y seguridad
└── docs/                       # Documentación formal (architecture/, decisions/, operations/, audits/)
```

---

## Largest Files

Top de archivos con mayor volumen de líneas físicas (LOC) y líneas de código lógicas (SLOC):

| Archivo | LOC | SLOC | Clasificación Estructural | Cohesión / Justificación |
| :--- | :---: | :---: | :---: | :--- |
| `tests/security/deploy_scripts_security.test.ts` | 2.112 | 1.663 | Test Suite | Cohesiva (acumulación de casos de prueba de seguridad). |
| `apps/backend/src/data/initialPokemons.ts` | 801 | 782 | Seed Data | **Alta** (Array estático de 151 Pokémon; sin lógica). |
| `apps/frontend/src/pokedex.ts` | 763 | 677 | UI Controller | **Media-Baja** (Mezcla estado, DOM, modales y lógica de catálogo). |
| `scripts/github-security-linear-sync.ts` | 756 | 639 | Automation Tool | Cohesiva (Sincronización de alertas de seguridad con Linear). |
| `Taskfile.yml` | 667 | 518 | Taskfile | Cohesiva (Catálogo declarativo de tareas del monorepo). |
| `apps/backend/src/validation/schemas.ts` | 638 | 506 | Validation | **Alta** (Definición declarativa de esquemas Zod de Pokémon). |
| `apps/frontend/src/backoffice.ts` | 637 | 547 | Admin UI | **Media-Baja** (Mezcla CRUD, estado de sesión, tablas, modales y CSV). |
| `tests/pentest.test.ts` | 627 | 461 | Test Suite | Cohesiva (Batería de pentesting y fuzzing de seguridad). |
| `apps/backend/src/services/db.ts` | 607 | 473 | Persistence Service | **Media-Baja** (Múltiples motores: PG + Redis + Memoria + Migraciones). |
| `infra/ansible/playbooks/setup_vault.yml` | 529 | 431 | Ansible Playbook | Cohesiva (Aprovisionamiento y configuración de HashiCorp Vault). |
| `apps/backend/src/services/ai.ts` | 454 | 349 | AI Service | Cohesiva (Integración con Gemini AI, sanitización y caché). |
| `apps/backend/server.ts` | 288 | 223 | Composition Root | **Alta** (Punto de ensamblaje, sin persistencia ni lógica de dominio). |

---

## Largest Modules

Agrupación del volumen de código por directorios en `apps/backend/src/` y `apps/frontend/src/`:

```text
apps/backend/src/
├── services/       1.308 LOC  (db.ts: 607, ai.ts: 454, auth.ts: 247)
├── validation/       818 LOC  (schemas.ts: 638, pokemon.ts: 180)
├── data/             801 LOC  (initialPokemons.ts: 801)
├── middleware/       692 LOC  (auth.ts: 221, metrics.ts: 185, rate-limiter.ts: 169, tracer: 117)
├── routes/           477 LOC  (pokemons.ts: 284, auth.ts: 83, health.ts: 70, ai.ts: 40)
├── utils/            231 LOC  (logger, lifecycle, async-handler, pagination, result)
├── db/               197 LOC  (schema.ts: 104, index.ts: 58, migrate.ts: 35)
└── config/           112 LOC  (startup-env-check.ts)

apps/frontend/src/
├── pokedex.ts        763 LOC  (Catálogo, búsqueda, modales, evoluciones, comparador)
├── backoffice.ts     637 LOC  (Tabla CRUD, formulario, login, sesión, import/export CSV)
├── shared/           421 LOC  (api.ts: 185, ui.ts: 105, formatters.ts: 66, constants: 45)
├── theme.ts          121 LOC  (Gestión de modo oscuro/claro y accesibilidad de contraste)
├── sanitizer.ts       74 LOC  (Envoltura de DOMPurify y escape seguro)
└── types.ts           53 LOC  (Interfaces de dominio de frontend)
```

---

## Responsibility Analysis

### 1. `apps/backend/server.ts` (Saludable)

El archivo principal tiene una única responsabilidad bien acotada: ensamblar el pipeline HTTP de Express y coordinar el ciclo de vida del proceso (*composition root*).

- **Responsabilidades delegadas:**
  - Rutas de dominio delegadas a `src/routes/`.
  - Rate limiting, trazabilidad y autenticación delegados a `src/middleware/`.
  - Persistencia y conexiones delegadas a `src/services/db.ts`.
  - Cierre ordenado delegado a `src/utils/lifecycle.ts`.

### 2. `apps/backend/src/services/db.ts` (Atención Requerida)

Concentra 6 responsabilidades de infraestructura y persistencia:

1. Pool de conexiones PostgreSQL nativo (`pg.Pool`) con autodetección de SSL y timeout.
2. Cliente de conexiones Redis (`ioredis`) con reconexión automática.
3. Fallback en memoria en tiempo de ejecución (`Map<number, Pokemon>`) para entornos sin base de datos.
4. Ejecución programática de migraciones Drizzle (`runMigrations`).
5. Sonda de salud y latido periódico (`getStorageHealth`, `heartbeatTimer`).
6. Operaciones CRUD de repositorio para Pokémon (`getAllPokemons`, `getPokemonById`, `savePokemon`).

### 3. `apps/frontend/src/pokedex.ts` (Atención Requerida)

Concentra 5 responsabilidades de interfaz de usuario en un solo archivo:

1. Gestión de estado global de la vista (filtros, paginación, búsqueda, ordenamiento).
2. Renderizado del grid de tarjetas y control del scroll.
3. Renderizado y gestión de foco accesible del modal de detalle de Pokémon.
4. Generación y renderizado del árbol gráfico de evoluciones.
5. Lógica del modal interactivo de comparación entre dos Pokémon.

---

## Coupling Analysis

### Métricas de Acoplamiento en TypeScript (`apps/`)

- **Módulos con mayor Acoplamiento Aferente ($C_a$ - Más dependidos):**
  1. `apps/backend/src/services/db.ts`: $C_a = 12$, $C_e = 4$, Inestabilidad $I = 0.25$ (Alta centralidad; casi todo el backend depende de este archivo).
  2. `apps/backend/src/types.ts`: $C_a = 7$, $C_e = 0$, Inestabilidad $I = 0.00$ (Núcleo estable de contratos).
  3. `apps/backend/src/utils/logger.ts`: $C_a = 6$, $C_e = 0$, Inestabilidad $I = 0.00$ (Utilitario puro).
  4. `apps/backend/src/services/auth.ts`: $C_a = 5$, $C_e = 1$, Inestabilidad $I = 0.17$.
- **Módulos con mayor Acoplamiento Eferente ($C_e$ - Más dependencias salientes):**
  1. `apps/backend/server.ts`: $C_e = 12$, $C_a = 3$, Inestabilidad $I = 0.80$ (Natural para un Composition Root).
  2. `apps/backend/src/routes/pokemons.ts`: $C_e = 8$, $C_a = 1$, Inestabilidad $I = 0.89$.
  3. `apps/frontend/src/shared/index.ts`: $C_e = 4$, $C_a = 2$, Inestabilidad $I = 0.67$.

---

## Cohesion Analysis

- **`apps/backend/src/utils/`:** Presenta **alta cohesión funcional**. Cada archivo (`logger.ts`, `lifecycle.ts`, `async-handler.ts`, `pagination.ts`, `result.ts`) contiene funciones puras o interfaces especializadas de menos de 80 líneas, sin dependencias de I/O externas. No actúa como cajón de sastre.
- **`apps/backend/src/validation/`:** Presenta **alta cohesión comunicacional**. `schemas.ts` y `pokemon.ts` se dedican exclusivamente a validar datos con Zod antes de ingresar a la capa de dominio.
- **`apps/frontend/src/shared/`:** Presenta **buena cohesión modular**. Las funciones comunes se dividieron en `api.ts`, `constants.ts`, `formatters.ts` y `ui.ts`.

---

## Complexity Analysis

- **Profundidad de Anidamiento:** Se mantiene en un rango saludable ($\le 3$ niveles de indentación) en la mayoría de los módulos de backend.
- **Puntos con mayor Complejidad Ciclomática:**
  - `apps/backend/src/services/db.ts`: Lógica de fallback entre PostgreSQL, Redis y almacenamiento en memoria ante caídas de red o credenciales faltantes ($v(G) \approx 22$).
  - `apps/frontend/src/pokedex.ts`: Renderizado recursivo del árbol de evoluciones y cálculo de filtros combinados ($v(G) \approx 18$).

---

## Circular Dependencies

- **Total de dependencias circulares detectadas:** **0**.
- El grafo de dependencias en `apps/backend` y `apps/frontend` es un Grafo Acíclico Dirigido (DAG) perfecto.
- No se detectaron ciclos mutuos ($A \leftrightarrow B$) ni ciclos transitivos ($A \rightarrow B \rightarrow C \rightarrow A$).

---

## Duplication

- **Lógica de Autenticación:** Se consolidó en `apps/backend/src/services/auth.ts` y `src/middleware/auth.ts`, eliminando duplicaciones previas entre rutas.
- **Utilidades Frontend:** `showToast`, `getTypeColor`, `getGeneration` y `formatPokemonId` se unificaron en `apps/frontend/src/shared/formatters.ts` y `ui.ts`, consumidas limpiamente tanto por `pokedex.ts` como por `backoffice.ts`.

---

## Historical Growth

Análisis de evolución histórica extraído mediante `git log --follow`:

| Hito / Commit | `apps/backend/server.ts` (LOC) | Evento Arquitectónico Asociado |
| :--- | :---: | :--- |
| **Commit `596d093`** | ~850 LOC | Integración de ADR-010 (gestión de sesión fail-closed). |
| **Commit `23f2f70`** | ~940 LOC | Integración de ADR-015 (graceful shutdown y health probes). |
| **Commit `97fd5d5`** | ~1.178 LOC | Crecimiento no gobernado; concentración de caché Redis y auth. |
| **Commit `dd7f61b` (PR #247)** | **288 LOC (-938 LOC)** | **Refactorización modular mayor (Eje 2):** Extracción de routes, middleware y utils. |
| **Commit `c36e929`** | 288 LOC | Ajuste puntual de tipado; tamaño estable sin regresiones. |

> [!NOTE]
> La tendencia de crecimiento de `server.ts` se redujo drásticamente en PR #247 y se ha mantenido completamente plana (288 LOC) a lo largo de los últimos commits y PRs, certificando que el control de regresión está funcionando.

---

## Monolith Candidates

1. **`apps/backend/src/services/db.ts` (607 LOC):** Candidato a *God Module* de persistencia. No es crítico hoy en día gracias a que el volumen de datos es moderado, pero agrupa infraestructura de conexión con consultas de dominio.
2. **`apps/frontend/src/pokedex.ts` (763 LOC):** Candidato a *God File* de presentación en el frontend.
3. **`apps/frontend/src/backoffice.ts` (637 LOC):** Candidato a *God File* administrativo en el frontend.

---

## Structural Regressions

- **Evaluación:** **0 regresiones detectadas en el backend.**
- No hubo fenómeno de *Monolith Relocated* tras la refactorización de `server.ts`: las 938 líneas extraídas no se movieron a un único archivo sustituto, sino que se repartieron de forma balanceada en 8 módulos independientes (`routes/` y `middleware/`), ninguno de los cuales supera las 285 LOC.

---

## Positive Structural Changes

1. **Modularización limpia de `server.ts`:** Paso de 1.178 LOC a 288 LOC.
2. **Biblioteca compartida en frontend (`apps/frontend/src/shared/`):** Desacoplamiento de llamadas fetch (`api.ts`), constantes (`constants.ts`), formateadores puros (`formatters.ts`) y componentes UI (`ui.ts`).
3. **Módulo de ciclo de vida dedicado:** `src/utils/lifecycle.ts` aísla las señales de proceso (`SIGTERM`, `SIGINT`) del servidor HTTP.
4. **Validación Zod desacoplada:** `src/validation/schemas.ts` concentra los contratos sin contaminar los controladores.

---

## Findings

### [ASA-001] Concentración de Responsabilidades de Conexión y Repositorio en `db.ts`

- **Área:** Backend / Persistencia
- **Prioridad:** P2
- **Confianza:** HIGH
- **Esfuerzo:** M
- **Evidencia:** [`apps/backend/src/services/db.ts:1-607`](../../apps/backend/src/services/db.ts) (607 LOC, $C_a = 12$).
- **Estado actual:** El archivo `db.ts` gestiona concurrentemente el pool de PostgreSQL, conexiones Redis, fallback en memoria, migraciones Drizzle, sondeo de salud y las consultas CRUD de Pokémon.
- **Riesgo/impacto:** Si se agregan nuevas entidades o tablas, `db.ts` crecerá exponencialmente, convirtiéndose en el nuevo cuello de botella monolítico del backend.
- **Recomendación:** Aplicar la técnica *Extract Repository*: separar la inicialización de clientes (`connection-pool.ts` y `redis-client.ts`) de las consultas de catálogo (`pokemon.repository.ts`).
- **Verificación:** `npm test` debe pasar sin fallos de importación y `db.ts` debe reducirse a menos de 250 LOC.
- **Impacto en documentación:** Actualizar diagramas en `docs/architecture/ARCHITECTURE_SPECIFICATION.md`.

---

### [ASA-002] Concentración de Vistas y Componentes en Módulos de Frontend

- **Área:** Frontend / UI
- **Prioridad:** P3
- **Confianza:** HIGH
- **Esfuerzo:** M
- **Evidencia:** [`apps/frontend/src/pokedex.ts:1-763`](../../apps/frontend/src/pokedex.ts) (763 LOC) y [`apps/frontend/src/backoffice.ts:1-637`](../../apps/frontend/src/backoffice.ts) (637 LOC).
- **Estado actual:** Ambos archivos contienen toda la lógica de su respectiva página SPA: renderizado del DOM, modales secundarios (comparador, detalle, login, importador CSV) y manipulación de eventos.
- **Riesgo/impacto:** Dificultad para añadir nuevas características a la interfaz o implementar pruebas unitarias aisladas de componentes sin montar el DOM completo en Playwright.
- **Recomendación:** Extraer los controladores de modales a submódulos en `apps/frontend/src/components/` (`modal-detail.ts`, `modal-compare.ts`, `modal-csv.ts`).
- **Verificación:** Compilación limpia con `npm run build:frontend` y suite E2E en verde con `npm run test:e2e`.
- **Impacto en documentación:** Ninguno.

---

## Recommended Actions

1. **Monitoreo preventivo de `server.ts`:** Mantener el límite contractual de 300 LOC para `apps/backend/server.ts` como regla de revisión en PRs.
2. **Planificación de modularización de persistencia (P2):** Cuando se aborde una tarea relacionada con base de datos, aprovechar para desacoplar `pokemon.repository.ts` de `db.ts` sin sobrediseñar patrones innecesarios.
3. **Modularización progresiva de frontend (P3):** Extraer los modales de `pokedex.ts` a funciones de renderizado independientes.

---

## Priority

- **P0 / P1 (Crítico/Alto):** Ninguno. La arquitectura actual es saludable y no presenta bloqueos operativos ni dependencias circulares.
- **P2 (Medio):** [ASA-001] Modularización de la capa de persistencia `db.ts`.
- **P3 (Bajo):** [ASA-002] Modularización de modales en `pokedex.ts` y `backoffice.ts`.

---

## Risk

- **Riesgo global del repositorio:** **Bajo**.
- La plataforma se encuentra en un estado arquitectónico modular, con separación efectiva de capas y cobertura completa de pruebas (216/216 tests pasando).

---

## Suggested Refactoring Boundaries

```text
Capa de Persistencia Recomendada:
apps/backend/src/
├── db/
│   ├── index.ts                 # Instancia cliente Drizzle
│   ├── schema.ts                # Esquemas de tablas
│   └── pool.ts                  # Gestión de pg.Pool y SSL
├── services/
│   ├── cache.ts                 # Cliente Redis y operaciones de clave/valor
│   ├── storage-health.ts        # Monitor de salud y latido
│   └── pokemon.repository.ts    # Operaciones CRUD sobre pokedexEntries
```
