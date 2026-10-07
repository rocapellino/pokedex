# Auditoría Integral (`full-audit`) — Baseline 2026-10-07

> **Estado:** Histórico (snapshot inmutable; su frescura se evalúa con `audit-freshness.ts`)
>
> **Fecha de captura:** 2026-10-07
>
> **Commit:** `615ef9de1658fbdb046b7b5ef26ba53133359ef9`
>
> **Rama auditada:** `rocapellino/backend-stack-audit-e6d5f7` (sobre `main`, release `v1.101.0`)
>
> [!IMPORTANT]
> Este documento es evidencia histórica del commit auditado. No es SSOT: el estado vigente
> reside en `apps/`, `infra/`, `gitops/`, `scripts/`, `tests/` y `docs/architecture/`.
> El estado de cada hallazgo se sigue fuera del snapshot (issue con título `AUD-*`).

**Repositorio:** `rocapellino/pokedex`
**Contexto Operativo:** Monorepo (`apps/backend`, `apps/frontend`) | Entornos: Kind / Proxmox Pre-prod / Prod Cloud (blueprint)
**Vocabulario de estados:** gates según [state-model.md](../../../.agents/skills/_shared/state-model.md) §3 (`PASS`, `FAIL`, `NOT_EXECUTED`, `CI_REQUIRED`).
**Foco de la sesión:** idoneidad del stack del backend (`repo-modernize`), con barrido transversal de las demás dimensiones.

---

## 1. Identificación y Paridad de Versión

| Componente | Valor auditado | Fuente |
| :--- | :--- | :--- |
| `package.json` | `1.101.0` | Versión de aplicación y monorepo |
| `infra/helm/pokedex/Chart.yaml` (`version` / `appVersion`) | `1.101.0` | Empaquetado Helm |
| GitOps `targetRevision` (manifiestos de `gitops/apps/`) | `v1.101.0` | Promoción ArgoCD |
| Último tag | `v1.101.0` | `git describe --tags --abbrev=0` |

La paridad de versión es total entre los tres artefactos.

---

## 2. Resumen Ejecutivo

El stack del backend es **adecuado para el dominio** (catálogo de ~1.025 registros, 99 % lecturas)
y no se recomienda reemplazar ningún componente. No hay hallazgos P0 ni P1. Los defectos
encontrados son deriva entre documentación/ADR y código, y mantenimiento preventivo de runtime.

- **Total de Hallazgos:** 9
- **P0 (Crítico):** 0
- **P1 (Alto):** 0
- **P2 (Medio):** 4
- **P3 (Bajo):** 5

### Gates automáticos

| Gate | Estado | Evidencia |
| :--- | :--- | :--- |
| `npm test` | `PASS` | 924 casos: 923 pasan, 0 fallan, 1 omitido |
| `npm run typecheck` | `PASS` | Exit 0 (ver nota sobre una primera corrida fallida) |
| `npm run build` | `PASS` | Backend y frontend compilan |
| `npm run lint:code` (Biome) | `PASS` | 208 archivos |
| `npm run docs:validate` | `PASS` | Sin drift de gobernanza |
| `npm run lint:ignore` | `PASS` | Todos los `*.ignore` cumplen el gate |
| `npm run lint:yaml` | `PASS` | 0 archivos `.yml` |
| `npm run test:surface:check` | `PASS` | Inventario sincronizado (874 casos inventariados) |
| `npm run nginx:conf:check` | `PASS` | `nginx.conf` sincronizado con la plantilla |
| `npm run gitops:verify-parity` | `PASS` | Paridad de digests entre Cloud, Pre-prod y Helm |
| `npm audit` (con y sin dev) | `PASS` | 0 vulnerabilidades |
| `npm run lint:md` sobre este documento | Ver §7 | Se ejecuta al cerrar |
| Hadolint, Zizmor, Trivy, Gitleaks, `pre-commit` | `NOT_EXECUTED` | No se corrieron en esta sesión; `CI_REQUIRED` |
| `helm template` por entorno y trazado en runtime | `NOT_EXECUTED` | Sin acceso a clúster; el análisis de rutas fue estático |

> [!NOTE]
> Una primera corrida de `typecheck` falló con errores `TS7006` en
> `apps/backend/src/validation/schemas.ts` mientras `npm ci` terminaba en segundo plano.
> Tras completar la instalación, dos corridas posteriores dieron exit 0. Se atribuye a una
> condición de carrera con la instalación (hipótesis, confianza `MEDIUM`); ver `AUD-DEP-ZOD-001`.

---

## 3. Matriz de Hallazgos

| ID | Área | Evidencia | Riesgo / Impacto | Prioridad | Confianza | Esfuerzo | Recomendación |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `AUD-ARCH-ADR-001` | ADR Drift | `docs/decisions/ADR-011-persistence-drizzle-orm-and-pgbouncer.md:45`, `apps/backend/src/services/postgres.ts:98` | El ADR y dos documentos de arquitectura declaran `max: 20`; el código usa `max: 10`. El dimensionado de conexiones por pod no coincide con el contrato. | `P2` | `HIGH` | `XS` | Decidir el valor real y alinear código o enmendar el ADR. |
| `AUD-ARCH-DOC-001` | Documentación | `docs/architecture/MONOREPO_STRUCTURE.md:125`, `docs/architecture/ANALISIS_LENGUAJES_Y_MEJORES_PRACTICAS.md:28` | Se declara Express 4.x, soporte Bun, usuario `appuser` y una carpeta `domain/`. El código usa Express `^5.2.1`, `USER 1000:1000` y no tiene `domain/` ni soporte Bun. | `P2` | `HIGH` | `S` | Corregir con `repo-docs` y verificar contra `apps/backend/package.json`. |
| `AUD-ARCH-DB-001` | Documentación | `docs/architecture/DATABASE_ANALYSIS.md:130`, `docs/architecture/ANALISIS_LENGUAJES_Y_MEJORES_PRACTICAS.md:48`, `apps/backend/src/db/migrations/0000_greedy_luckman.sql` | Se documenta un índice `GIN (data)` que ninguna migración crea. Solo existen índices btree en `tipo` y `nombre`. | `P2` | `HIGH` | `XS` | Corregir el texto. No crear el índice: con ~1.025 filas no aporta. |
| `AUD-DEP-NODE-001` | Runtime | `.tool-versions`, `apps/backend/Dockerfile:11`, `apps/frontend/Dockerfile:4` | Runtime en Node 22 con `.tool-versions` en `22.13.0`, por detrás de la imagen. Según el conocimiento del auditor, Node 22 entra en mantenimiento y finaliza soporte en 2027-04; Node 24 es la LTS activa. La suite completa pasó sobre Node 24.19.0 local. | `P2` | `MEDIUM` | `M` | Plan de cambio a Node 24 con paridad y rollback (§4). Verificar fechas en la política upstream. |
| `AUD-ARCH-DOC-002` | Documentación | `docs/architecture/ANALISIS_LENGUAJES_Y_MEJORES_PRACTICAS.md` (§3.3), `apps/backend/src/services/pokemon.repository.ts` | Se documenta TTL de 300 s para el listado; el código usa 60 s en listados y 300 s en detalle. | `P3` | `HIGH` | `XS` | Corregir el texto. |
| `AUD-MOD-AI-001` | Modernización | `apps/backend/src/services/ai.ts:34`, `apps/backend/package.json` | Modelo por defecto `gemini-2.5-flash` y SDK `@google/genai` 2.21.0 (último: 2.27.0). El ciclo de vida del modelo no se verificó en línea. | `P3` | `LOW` | `S` | Revisar la política de retiro del modelo. El cambio es de configuración (`GEMINI_MODEL`). |
| `AUD-DEP-MISC-001` | Dependencias | salida de `npm outdated` y `npm ci` | Parches menores pendientes: `express-rate-limit` 8.7.1, `vite` 8.3.3, `jsdom` 30.1.2. Se vieron avisos de paquetes transitivos deprecados (`inflight`, `rimraf@3`, `glob@7`) sin trazar su origen. `@types/node` en 22 coincide con el runtime y no debe subirse a 26. | `P3` | `HIGH` | `XS` | Dejar que Renovate agrupe los parches; trazar el origen de los deprecados con `npm ls`. |
| `AUD-DEP-ZOD-001` | Dependencias | `package-lock.json` (`node_modules/zod` 3.25.76 hoisted; `apps/backend/node_modules/zod` 4.6.5) | La raíz hoistea zod 3 (arrastrado por `lighthouse`) y el backend usa zod 4 anidado. Si una herramienta resuelve el zod de la raíz, los tipos de `superRefine` cambian. Es la hipótesis más plausible de la falla transitoria de `typecheck`. | `P3` | `LOW` | `S` | Reproducir en un `npm ci` limpio; si se confirma, fijar la resolución con `overrides` o documentar el riesgo. |
| `AUD-SEC-OBS-001` | Seguridad | `apps/backend/src/routes/health.ts:77`, `apps/frontend/nginx.conf.template:152` | `/metrics` en la API no autentica; la restricción vive en nginx (allowlist CIDR). Las `NetworkPolicy` que acotan el acceso directo a la API no se verificaron en esta sesión. | `P3` | `MEDIUM` | `S` | Confirmar con el test de `NetworkPolicy` que solo Prometheus alcanza el puerto de la API; documentar la defensa en profundidad. |

---

## 4. Detalle de Hallazgos Significativos

No hay hallazgos P0/P1. Se detallan los P2 por su impacto en trazabilidad.

### `AUD-ARCH-ADR-001` Pool de conexiones: ADR dice 20, código usa 10

- **Área:** ADR Drift (`ADR-011`)
- **Prioridad:** `P2`
- **Confianza:** `HIGH`
- **Esfuerzo:** `XS`
- **Evidencia:** `postgres.ts:98` fija `max: 10`; `ADR-011:45` afirma `max: 20` por pod; `DATABASE_ANALYSIS.md:37` y `:52` repiten 20.
- **Estado actual:** El ADR está *Aceptado*. Con 1 réplica por entorno y PgBouncer desactivado en Pre-prod, el pool real es la mitad del documentado.
- **Riesgo/impacto:** Los cálculos de capacidad del ADR (por ejemplo, "40 totales") no corresponden al comportamiento real.
- **Recomendación:** Alinear el código con el ADR o enmendar el ADR a 10. Con la carga actual (99 % lecturas con caché) ambos valores bastan; la decisión es de contrato, no de rendimiento.
- **Verificación:** Un test que lea el `max` del pool y lo compare con el valor declarado en el ADR.
- **Impacto en documentación:** `docs/decisions/ADR-011-persistence-drizzle-orm-and-pgbouncer.md` y `docs/architecture/DATABASE_ANALYSIS.md` (pendiente)

### `AUD-DEP-NODE-001` Evaluación de Node 24 (`repo-modernize`)

| Alternativa | Evaluación |
| :--- | :--- |
| Mantener Node 22 | Válido hasta el fin de soporte; sin beneficio nuevo. |
| Actualizar in-place a Node 24 | **Recomendada.** Sin APIs nativas ni dependencias con binarios en el backend; la suite pasó sobre 24.19.0. |
| Reemplazar por Bun u otro runtime | Descartada: sin ventaja medible y contradice la documentación de seguridad y CI. |
| Eliminar | No aplica. |

Plan de transición: actualizar `.tool-versions` e imágenes base de ambos Dockerfile con digest nuevo,
validar con CI completo y promover primero a Pre-prod. Rollback: revertir el pin de digest en GitOps.

---

## 5. Revisión por Dimensión (`full-audit`)

| Etapa | Resultado |
| :--- | :--- |
| Inventario y código | Backend de ~7.000 líneas con módulos acotados; el mayor archivo propio es `validation/schemas.ts` (677 líneas), sin God Files. Arquitectura en capas (`routes`, `services`, `middleware`, `db`). |
| Dependencias | 0 vulnerabilidades. Express 5, Drizzle, `pg`, ioredis, Zod 4, pino y esbuild vigentes. Ver `AUD-DEP-*`. |
| Testing | 924 casos en verde; inventario sincronizado. Cobertura de contratos de seguridad, GitOps y CI. |
| Seguridad de la aplicación | CSRF por Origin/Referer en mutaciones con cookie, `HttpOnly` + `SameSite=Lax`, `timingSafeEqual` en comparaciones, CORS fail-closed en producción, CSP estricta, rate limiting híbrido con Redis. Sin hallazgos más allá de `AUD-SEC-OBS-001`. |
| Supply chain | Las 83 referencias a acciones externas están fijadas por SHA de 40 caracteres; las 5 restantes son workflows locales. Imágenes base fijadas por digest. |
| Infraestructura | Chart, manifiestos GitOps y versión alineados. `securityContext` con `runAsNonRoot`, `readOnlyRootFilesystem` y sin escalada de privilegios en los templates revisados. PgBouncer desactivado en Pre-prod, coherente con el ADR-011. |
| CI/CD | Todos los workflows declaran `permissions`; los tests de gobernanza de CI (timeout, `persist-credentials: false`, pines únicos) pasan. |
| Documentación | `docs:validate` en verde, pero con deriva factual no detectada por el gate: `AUD-ARCH-*`. Ver §3. |
| Higiene de configuración | `lint:ignore` en verde para los 7 archivos `*.ignore` detectados. Sin revisión manual de reglas obsoletas o demasiado amplias en esta sesión. |
| Skills | No se auditó la consistencia interna de skills (`NOT_EXECUTED`). |

### Evaluación del stack del backend

| Componente | Decisión | Motivo |
| :--- | :--- | :--- |
| Express 5 | Mantener | Vigente; no hay ventaja cuantificable en Fastify/Hono para esta carga. |
| PostgreSQL con `data JSONB` + Drizzle | Mantener | Encaja con la forma de los datos; migraciones declarativas. |
| Redis (caché, rate limit, revocación) | Mantener | Cumple el contrato fail-open/fail-closed del ADR-027. |
| Fallback a memoria | Mantener | Contenido en producción por `MigrationFailedError` (fail-closed). |
| Node 22 | Actualizar a 24 | `AUD-DEP-NODE-001`. |
| TypeScript 7 + esbuild (CJS) | Mantener | ADR-023; sin beneficio claro en pasar a ESM. |
| Gemini 2.5 Flash | Revisar | `AUD-MOD-AI-001`. |

---

## 6. Roadmap de Corrección

1. **Inmediato (P0/P1):** ninguno.
2. **Medio plazo (P2):**
   - Un único cambio documental (Fast Track) que cierre `AUD-ARCH-DOC-001`, `AUD-ARCH-DB-001` y `AUD-ARCH-DOC-002`.
   - Resolver `AUD-ARCH-ADR-001` con un test que fije el valor del pool.
   - Plan de cambio de Node 24 (`AUD-DEP-NODE-001`) con `repo-impact` y luego `repo-fix`/`repo-refactor`.
3. **Mejoras opcionales (P3):** `AUD-MOD-AI-001`, `AUD-DEP-MISC-001`, `AUD-DEP-ZOD-001`, `AUD-SEC-OBS-001`.

---

## 7. Límites de esta auditoría

- No se ejecutaron Hadolint, Zizmor, Trivy, Gitleaks ni `pre-commit`; quedan como `CI_REQUIRED`.
- No hubo acceso a clúster: el trazado cliente → ingress → proxy → handler fue estático, solo por lectura de `gitops/`, `infra/` y nginx.
- No se auditó el frontend en profundidad ni la consistencia interna de las skills.
- Las afirmaciones sobre el calendario de soporte de Node 22 y del modelo Gemini provienen del conocimiento del auditor, no de una verificación en línea.
- El estado de los hallazgos se registra fuera de este snapshot, en issues con título `AUD-*`.
