# Plan de Implementación: Mejoras de Tercera Generación

> **Estado:** Histórico (documento auxiliar de planificación técnica de tercera generación)
>
> **Fecha de captura:** 2026-10-15
>
> **Rama de trabajo:** `chore/consolidate-audit-baseline`
>
> [!IMPORTANT]
> Este documento es evidencia histórica y de planificación técnica para la ejecución de mejoras estructurales de tercera generación. No es SSOT: el estado vigente reside en `apps/`, `infra/`, `gitops/`, `scripts/`, `tests/` y `docs/architecture/`.

---

## 1. Resumen Ejecutivo y Objetivos Estratégicos

Tomando como punto de partida el estado del repositorio `rocapellino/pokedex` en el release `v1.116.2` (commit `4d5168db`), donde se consolidaron el paquete `@pokedex/contracts`, PostgreSQL 17 y Valkey 8 (`ADR-031`), PgBouncer 1.25.2, el catálogo canónico MCP y los linters canónicos directos, este plan formaliza la hoja de ruta de **Mejoras de Tercera Generación** estructurada en 4 fases de ejecución secuencial e incremental.

```mermaid
flowchart TD
    subgraph Fase 1: Persistencia Avanzada
        F1A["Segregación de URLs (DATABASE_URL vs DIRECT_DATABASE_URL)"] --> F1B["Eliminación de Double Pooling & Prepared Statements en PgBouncer"]
        F1B --> F1C["Protocolo Expand-Contract e Índices Concurrentes"]
        F1C --> F1D["Derivación de Esquemas con drizzle-zod en @pokedex/contracts"]
    end

    subgraph Fase 2: Consolidación de Tooling
        F2A["Optimización de biome.json para Workspaces"] --> F2B["Desacoplamiento de playwright & lighthouse de la Raíz"]
        F2B --> F2C["Caché Determinista (sources/generates) en taskfiles/"]
    end

    subgraph Fase 3: Gobernanza Documental & Evals
        F3A["Depuración de AGENTS.md (Standing Instructions Only)"] --> F3B["Estandarización Contrastiva de Reglas en .agents/"]
        F3B --> F3C["Suite de Evaluaciones Conductuales (.agents/evals/)"]
    end

    subgraph Fase 4: Blindaje Zero-Trust MCP
        F4A["Escaneo Estático mcp-scan en Pre-commit & CI"] --> F4B["Digest Pinning Inmutable en Servidores MCP"]
        F4B --> F4C["Aislamiento stdio, Mínimo Privilegio & Trazabilidad W3C"]
    end

    Fase 1 --> Fase 2
    Fase 2 --> Fase 3
    Fase 3 --> Fase 4
```

---

## 2. Fase 1: Persistencia Avanzada (PostgreSQL 17 + Drizzle ORM + PgBouncer 1.25.2)

### Objetivos y Criterio de Éxito

- Cero *double pooling* en la arquitectura runtime.
- Segregación estricta de conexiones runtime vs. migraciones/seeders.
- Migraciones sin bloqueo de tablas en despliegues continuos con ArgoCD.

### Tareas Detalladas

#### 1.1 Segregación de Cadenas de Conexión

- **Definición de Variables:**
  - `DATABASE_URL`: Apunta a PgBouncer en puerto `6432` con `pool_mode=transaction` para el runtime de la API Express.
  - `DIRECT_DATABASE_URL`: Apunta directamente a PostgreSQL 17 en puerto `5432` con `pool_mode=session` para migraciones (`drizzle-kit migrate`) y jobs de inicialización (`seed-job.yaml`).
- **Archivos Impactados:**
  - `.env.example`: Incorporación documentada de ambas variables.
  - `apps/backend/src/config/`: Validación estricta con Zod en el arranque del backend.
  - `infra/helm/pokedex/values.yaml` y templates de Secret/ConfigMap (`externalsecret.yaml`, `secret.yaml`).
  - `infra/k8s/seed-job.yaml` y `infra/helm/pokedex/templates/seed-job.yaml`: Consumir exclusivamente `DIRECT_DATABASE_URL`.

#### 1.2 Prevención de Double Pooling y Prepared Statements

- **Configuración de Cliente `node-postgres` en Drizzle:**
  - Ajustar el tamaño del pool local en el backend (`max: 2-5` por réplica de pod) para delegar la agregación masiva a PgBouncer.
  - Configurar `{ prepare: false }` en las consultas de Drizzle o desactivar sentencias preparadas de cliente para compatibilidad nativa con el modo transacción de PgBouncer.
- **Archivos Impactados:**
  - `apps/backend/src/db/`: Factoría de conexión de Drizzle.

#### 1.3 Protocolo de Migraciones Expand-Contract e Índices Concurrentes

- **Linter de Migraciones SQL:**
  - Desarrollar regla de validación en `scripts/` y tarea `task db:lint-migrations` que exija:
    - Creación de índices con `CREATE INDEX CONCURRENTLY IF NOT EXISTS`.
    - Eliminación de índices con `DROP INDEX CONCURRENTLY IF EXISTS`.
    - Ausencia de bloqueos `ACCESS EXCLUSIVE` innecesarios en horas pico.
- **Archivos Impactados:**
  - `taskfiles/db.yaml` o `Taskfile.yaml`.
  - `scripts/check-migration-hygiene.ts`.

#### 1.4 Derivación de Esquemas con `drizzle-zod` en `@pokedex/contracts`

- **Tipado Unificado:**
  - Integrar `drizzle-zod` para generar schemas Zod automáticamente a partir del esquema Drizzle sin duplicidad de definiciones manuales.
  - Preservar la compatibilidad de runtime y tipos entre backend y contratos compartidos.
- **Archivos Impactados:**
  - `packages/contracts/package.json`
  - `packages/contracts/src/pokemon.ts`
  - `apps/backend/src/db/schema.ts`

---

## 3. Fase 2: Consolidación de Tooling e Higiene del Monorepo

### Objetivos y Criterio de Éxito

- Raíz del monorepo libre de configuraciones específicas de frontend/testing.
- `biome.json` optimizado para workspaces y ejecuciones incrementales.
- Tareas de `Taskfile` deterministas con omitido inteligente por fingerprint de archivos.

### Tareas Detalladas

#### 2.1 Optimización de `biome.json` para Workspaces

- Anclar la propiedad `$schema` a la versión exacta de Biome instalada en el monorepo (`2.7.2`).
- Configurar overrides granulares por workspace (`apps/backend`, `apps/frontend`, `packages/contracts`).
- Incorporar flag `--changed` en tareas de pre-commit para ejecuciones de sub-segundo en cambios locales.
- **Archivos Impactados:**
  - `biome.json`
  - `.pre-commit-config.yaml`
  - `taskfiles/quality.yaml`

#### 2.2 Desacoplamiento de Configuraciones Web de la Raíz

- **Reubicación de Archivos:**
  - Mover `playwright.config.ts` a `apps/frontend/playwright.config.ts` (o `tests/e2e/playwright.config.ts`).
  - Mover `lighthouserc.json` a `apps/frontend/lighthouserc.json`.
- **Actualización de Scripts y Workflows:**
  - Actualizar `package.json` (`test:e2e`, `test:a11y`, `perf:lighthouse`) pasando `--config`.
  - Actualizar `.github/workflows/web.yaml` y `ci.yaml`.
  - Actualizar referencias en `Taskfile.yaml`.
- **Archivos Impactados:**
  - `package.json`, `Taskfile.yaml`
  - `.github/workflows/web.yaml`, `.github/workflows/ci.yaml`

#### 2.3 Caché de Tareas en `taskfiles/`

- Declarar directivas `sources:` y `generates:` en tareas de construcción (`build`, `build:backend`, `build:frontend`, `build:contracts`) para que `task` omita tareas no modificadas.
- **Archivos Impactados:**
  - `Taskfile.yaml`
  - `taskfiles/build.yaml` (o archivos modulares equivalentes).

---

## 4. Fase 3: Gobernanza Documental (`AGENTS.md`) y Arquitectura de Skills (`evals`)

### Objetivos y Criterio de Éxito

- Reducción de la ventana de contexto en invocaciones de agentes mediante `AGENTS.md` exclusivamente operativo.
- Reglas modulares con patrón contrastivo (*Why It Matters → Incorrect → Correct → References*).
- Suite de `evals` automatizada en `.agents/evals/`.

### Tareas Detalladas

#### 3.1 Depuración de `AGENTS.md` (*Standing Instructions Only*)

- Eliminar narrativas históricas o justificaciones de diseño superadas de `AGENTS.md`.
- Asegurar que contenga únicamente instrucciones operativas permanentes: mapa del monorepo, comandos canónicos de Taskfile/npm, reglas inquebrantables y modelo de despacho de skills.
- Trasladar cualquier decisión o contexto a sus respectivos `docs/decisions/ADR-*.md`.
- **Archivos Impactados:**
  - `AGENTS.md`
  - `docs/decisions/`

#### 3.2 Estandarización Contrastiva en `.agents/`

- Crear índice maestro en `.agents/references/_sections.md`.
- Reestructurar referencias técnicas (`schema-`, `query-`, `k8s-`, `security-`) bajo el formato de 4 bloques:
  1. **Por qué importa (*Why It Matters*):** Explicación de impacto en seguridad/arquitectura.
  2. **Incorrecto (*Incorrect*):** Ejemplo de código anti-patrón o riesgoso.
  3. **Correcto (*Correct*):** Implementación recomendada y segura.
  4. **Referencias:** Enlaces a ADRs y documentación canónica.
- **Archivos Impactados:**
  - `.agents/rules/`
  - `.agents/skills/_shared/`

#### 3.3 Implementación de Evaluaciones Conductuales (`evals`)

- Crear suite de pruebas de comportamiento para agentes en `.agents/evals/`:
  - Test de no filtración de secretos en `.mcp/`.
  - Test de obligatoriedad de uso de `@pokedex/contracts` para contratos de API.
  - Test de respeto a `securityContext` restrictivo en manifiestos de Helm.
- **Archivos Impactados:**
  - `.agents/evals/`
  - `package.json` (tarea `aas:evals` o `evals:run`).

---

## 5. Fase 4: Blindaje de Seguridad Zero-Trust para MCP (`.mcp/`)

### Objetivos y Criterio de Éxito

- Detección proactiva de *Tool Poisoning*, *Rug Pulls* y RCE (`CVE-2025-6514` / `CV-2025-54135`).
- Fijación estricta por digest SHA256 inmutable de todas las herramientas y contenedores MCP.
- Trazabilidad y correlación distribuida W3C (`ADR-018`) en invocaciones MCP.

### Tareas Detalladas

#### 4.1 Integración de Escaneo Estático de Esquemas MCP

- Incorporar `mcp-scan` (o script equivalente de validación de esquemas y permisos MCP) en el pipeline de validación y pre-commit.
- Detectar variaciones no autorizadas en descripciones de herramientas (*metadata drift*) o servidores no aprobados.
- **Archivos Impactados:**
  - `.mcp/policies.yaml`, `.mcp/registry.yaml`
  - `.pre-commit-config.yaml`
  - `.github/workflows/security-mcp.yaml` o `ci.yaml`

#### 4.2 Pinning Inmutable y Verificación de Integridad

- Prohibir etiquetas flotantes (`latest`, `^`, `~`) en `.mcp/registry.yaml`.
- Todos los servidores basados en imágenes Docker deben usar `@sha256:...`.
- Todos los paquetes invocados vía `npx` o scripts deben estar fijados a versiones exactas e inmutables.
- **Archivos Impactados:**
  - `.mcp/registry.yaml`
  - `tests/contracts/mcp/`

#### 4.3 Aislamiento de Transporte `stdio` y Principio de Mínimo Privilegio

- Limitar el ámbito de permisos del filesystem a la raíz estricta del workspace.
- Configurar flags que exijan confirmación humana explícita (HITL) para comandos mutables de infraestructura o base de datos.
- Desactivar directivas de auto-arranque silencioso en clientes.
- **Archivos Impactados:**
  - `scripts/mcp/adapters/`
  - `docs/architecture/MCP_FRAMEWORK_DESIGN.md`

#### 4.4 Trazabilidad y Correlación Distribuida (`ADR-018`)

- Conectar las herramientas de observabilidad para inyectar cabeceras de trazabilidad W3C (`traceparent`) en operaciones ejecutadas por o hacia servidores MCP.
- Registrar accesos en logs estructurados locales para auditoría de cumplimiento.
- **Archivos Impactados:**
  - `scripts/mcp/`
  - `apps/backend/src/middleware/tracing.ts`

---

## 6. Matriz de Riesgos y Mitigaciones

| Riesgo Técnico | Impacto | Probabilidad | Mitigación Planificada |
| :--- | :---: | :---: | :--- |
| Incompatibilidad de sentencias preparadas en PgBouncer | Alto | Media | Desactivar `prepare` en Drizzle (`{ prepare: false }`) para el pool del runtime y habilitarlo solo en conexiones directas. |
| Bloqueo accidental de tabla en migraciones Drizzle | Crítico | Baja | Validar en CI que las migraciones solo contengan `CREATE INDEX CONCURRENTLY` y verificar en staging con `dry-run`. |
| Rotura de paths en CI por reubicación de configs web | Medio | Baja | Mantener compatibilidad temporal mediante flags `--config` explícitos en scripts npm y workflows. |
| Inyecciones de prompts en descripciones de herramientas MCP | Alto | Baja | Validación de firmas e integridad de metadata en `mcp:validate` y pre-commit. |

---

## 7. Criterios de Aceptación y Pipeline de Verificación

Al concluir cada fase, el siguiente pipeline debe superar el 100% de los controles:

```bash
# 1. Tipado, linting y contratos
npm run lint
npm run typecheck

# 2. Gobernanza documental y Markdown
npm run docs:validate
npm run lint:md

# 3. Gobernanza de MCP y worktrees
npm run mcp:validate
npm run mcp:test
npm run worktree:doctor

# 4. Suite integral de pruebas
npm run test:unit
npm run test:contracts
npm run test:security
npm run test:gitops
npm run test:frontend
npm test
```
