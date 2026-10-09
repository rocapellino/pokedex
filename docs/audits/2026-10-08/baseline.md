# Auditoría Integral (`full-audit`) — Baseline 2026-10-08

> **Estado:** Histórico (snapshot inmutable; su frescura se evalúa con `audit-freshness.ts`)
>
> **Fecha de captura:** 2026-10-08
>
> **Commit:** `a4a3c73ad8a59a20ae25be5b138b786be95c04aa`
>
> **Rama auditada:** `main` (release `v1.106.0`)
>
> [!IMPORTANT]
> Este documento es evidencia histórica del commit auditado. No es SSOT: el estado vigente
> reside en `apps/`, `infra/`, `gitops/`, `scripts/`, `tests/` y `docs/architecture/`.
> El estado de cada hallazgo se sigue fuera del snapshot (issue con título `AUD-*`).

**Repositorio:** `rocapellino/pokedex`
**Contexto Operativo:** Monorepo (`apps/backend`, `apps/frontend`) | Entornos: Kind / Proxmox Pre-prod / Prod Cloud (blueprint)
**Vocabulario de estados:** gates según [state-model.md](../../../.agents/skills/_shared/state-model.md) §3 (`PASS`, `FAIL`, `NOT_EXECUTED`, `CI_REQUIRED`).
**Foco de la sesión:** consolidación de ciclos anteriores, verificación de drift, depuración de snapshots y establecimiento de un nuevo baseline exhaustivo.

---

## 1. Identificación y Paridad de Versión

| Componente | Valor auditado | Fuente |
| :--- | :--- | :--- |
| `package.json` | `1.106.0` | Versión de aplicación y monorepo |
| `infra/helm/pokedex/Chart.yaml` (`version` / `appVersion`) | `1.106.0` | Empaquetado Helm |
| GitOps `targetRevision` (manifiestos de `gitops/apps/`) | `v1.106.0` | Promoción ArgoCD |
| Último tag | `v1.106.0` | `git describe --tags --abbrev=0` |

La paridad de versión es total (1:1) entre todos los componentes y manifiestos de GitOps.

---

## 2. Resumen Ejecutivo

Todos los hallazgos de las auditorías previas (`2026-10-03` y `2026-10-07`) fueron completamente resueltos, verificados e integrados en `main` a través de los PRs correspondientes (#487, #489, #491, #493, #640, #642, #648, #659, #662, #667, #669, #676).
En cumplimiento estricto de la política de retención `current-baseline-only` de `documentation-contract.yaml` (máximo 1 snapshot activo en el árbol de trabajo), los snapshots fechados anteriores han sido depurados, manteniéndose preservados de forma inmutable en el historial de Git.

- **Total de Hallazgos Abiertos:** 0
- **P0 (Crítico):** 0
- **P1 (Alto):** 0
- **P2 (Medio):** 0
- **P3 (Bajo):** 0

### Gates Automáticos

| Gate | Estado | Evidencia |
| :--- | :--- | :--- |
| `npm run typecheck` | `PASS` | TypeScript compila sin emitir errores |
| `npm run lint` | `PASS` | Biome verifica 227 archivos; typecheck de workspaces pasa |
| `npm run docs:validate` | `PASS` | 100% de la gobernanza documental sin drift |
| `npm run lint:ignore` | `PASS` | 7 archivos `.ignore` validados |
| `npm run lint:yaml` | `PASS` | 0 archivos `.yml` detectados (política `.yaml` canónica) |
| `npm run test:surface:check` | `PASS` | 974 casos de prueba sincronizados en inventario |
| `npm run nginx:conf:check` | `PASS` | `nginx.conf` sincronizado con la plantilla |
| `npm run gitops:verify-parity` | `PASS` | Paridad criptográfica multi-entorno certificada por digest SHA256 |
| `npm audit --omit=dev` | `PASS` | 0 vulnerabilidades en dependencias de producción |
| `npm test` (entorno local sin Helm) | `PASS` / `CI_REQUIRED` | La suite de tests pasa en su totalidad excepto contratos de renderizado Helm que requieren binario local en host (`CI_REQUIRED` en runners de CI o vía `repo-tool-exec`) |

---

## 3. Matriz de Hallazgos de Auditorías Anteriores (Estado de Cierre)

| ID | Origen | Descripción | Estado | Resolución / PR |
| :--- | :--- | :--- | :--- | :--- |
| `AUD-SEC-CORS-001` | 2026-10-03 | Orígenes CORS por entorno | `CLOSED` | PR #487 |
| `AUD-SEC-TLS-001` | 2026-10-03 | Ingress TLS y cookies seguras | `CLOSED` | PR #487 |
| `AUD-GOV-SKL-011` | 2026-10-03 | Frontmatter YAML de skills | `CLOSED` | PR #487 |
| `AUD-WF-GOV-001` | 2026-10-03 | Control `pr-governance` en CI | `CLOSED` | PR #487 |
| `AUD-SEC-CSRF-001` | 2026-10-03 | Endurecimiento CSRF | `CLOSED` | PR #487 |
| `AUD-GOV-ADR-001` | 2026-10-03 | Enmienda ADR-018 OTLP diferido | `CLOSED` | PR #487 |
| `AUD-GOV-SKL-012` | 2026-10-03 | CLI de frescura de auditoría | `CLOSED` | PR #487 |
| `AUD-SEC-CORS-002` | 2026-10-03 | Error CORS mapping a 403 | `CLOSED` | PR #487 |
| `AUD-TST-HYG-001` | 2026-10-03 | Limpieza `tmp/dr_drill_*` en try/finally | `CLOSED` | PR #487 |
| `AUD-GOV-DOC-002` | 2026-10-03 | Reclasificación registro vivo | `CLOSED` | PR #493 |
| `AUD-DEP-MAJ-001` | 2026-10-03 | Migración Express 5 | `CLOSED` | PR #491 |
| `AUD-TST-GOD-001` | 2026-10-03 | Modularización contratos IaC | `CLOSED` | PR #489 |
| `AUD-ARCH-ADR-001` | 2026-10-07 | Alineación pool pg (max 10) en ADR-011 | `CLOSED` | PR #642 |
| `AUD-ARCH-DOC-001` | 2026-10-07 | Corrección Express 5 y usuario en docs | `CLOSED` | PR #640 |
| `AUD-ARCH-DB-001` | 2026-10-07 | Retiro de índice GIN inexistente en docs | `CLOSED` | PR #640 |
| `AUD-DEP-NODE-001` | 2026-10-07 | Migración integral a Node.js 24 LTS | `CLOSED` | PR #648 |
| `AUD-ARCH-DOC-002` | 2026-10-07 | Corrección TTL caché en docs | `CLOSED` | PR #640 |
| `AUD-MOD-AI-001` | 2026-10-07 | Revisión Gemini 2.5 Flash y SDK | `CLOSED` | PR #669 |
| `AUD-DEP-MISC-001` | 2026-10-07 | Actualización de parches npm | `CLOSED` | PR #669 |
| `AUD-DEP-ZOD-001` | 2026-10-07 | Fijación de resolución Zod 4 en backend | `CLOSED` | PR #669 |
| `AUD-SEC-OBS-001` | 2026-10-07 | Activación Bearer Token en `/metrics` | `CLOSED` | PR #659, #662, #667 |

---

## 4. Revisión por Dimensión (`full-audit`)

| Etapa | Resultado |
| :--- | :--- |
| **1. Inventario y Arquitectura** | Monorepo limpio, backend desacoplado, frontend SPA sin dependencias legacy ni variables expuestas. |
| **2. Código y Calidad** | Cobertura estricta con Biome, TypeScript sin errores de tipado, modularidad preservada sin God Files. |
| **3. Dependencias** | 0 vulnerabilidades en producción. Zod 4 anclado en backend, Express 5, Node 24 LTS. |
| **4. Testing** | 974 casos inventariados en `test-surface.json` y `test-surface.md`. Total alineación con la pirámide de pruebas. |
| **5. Seguridad y DevSecOps** | Autenticación con cookies `HttpOnly`, `SameSite=Lax`, CSRF reforzado, `/metrics` protegido por Bearer Token e inspección L7 eBPF. |
| **6. Infraestructura y GitOps** | Despliegue con Helm parametrizado por entorno (`proxmox-preprod`, `cloud`). Digests SHA256 inmutables con paridad 1:1 verificada. |
| **7. CI/CD** | Workflows gobernados con permisos mínimos, dependencias fijadas por SHA de commit y jobs coordinados. |
| **8. Documentación** | 100% de coherencia fáctica con el código. Markdown Quality Gate validado sin infracciones. |
| **9. Higiene y Gobernanza** | Directorio `tmp/` saneado; sin artefactos temporales residuales en tracking. Poda de snapshots históricos de auditoría a 1 único baseline vigente conforme a `documentation-contract.yaml`. |

---

## 5. Configuration Hygiene

### 1. `.ignore inventory`

- `.dockerignore` (raíz): 69 reglas activas, 113 líneas.
- `.gitignore` (raíz): 86 reglas activas, 143 líneas.
- `.markdownlintignore` (raíz): 11 reglas activas, 12 líneas.
- `.semgrepignore` (raíz): 12 reglas activas, 39 líneas.
- `apps/backend/.dockerignore`: 32 reglas activas, 50 líneas.
- `apps/frontend/.dockerignore`: 30 reglas activas, 48 líneas.
- `infra/helm/pokedex/.helmignore`: 25 reglas activas, 43 líneas.

Total de archivos evaluados: 7.

### 2. Obsolete rules

Ninguna. Todas las reglas corresponden a patrones y directorios reales del monorepo.

### 3. Missing rules

Ninguna. Patrones esenciales (`.env`, `node_modules`, `.git`, `/tmp/`, `.pem`, `.key`) debidamente cubiertos.

### 4. Overbroad rules

No se identificaron patrones excesivamente amplios que expongan riesgo de omisión no intencionada de código fuente.

### 5. Security-sensitive exclusions

`.gitignore` y `.dockerignore` protegen exhaustivamente credenciales, certificados y variables de entorno.

### 6. Cross-configuration consistency

Paridad total entre los `.dockerignore` de servicios individuales y el raíz. Sincronización completa con pre-commit y CI.

### 7. Recommended changes

| Archivo | Estado | Acción |
| :--- | :--- | :--- |
| `.dockerignore` | `KEEP` | Mantener |
| `.gitignore` | `KEEP` | Mantener |
| `.markdownlintignore` | `KEEP` | Mantener |
| `.semgrepignore` | `KEEP` | Mantener |
| `apps/backend/.dockerignore` | `KEEP` | Mantener |
| `apps/frontend/.dockerignore` | `KEEP` | Mantener |
| `infra/helm/pokedex/.helmignore` | `KEEP` | Mantener |

---

## 6. Checklist de Verificación y Criterios de Aceptación

- [x] **Identificación y Paridad:** `audit-freshness.ts` reporta `CURRENT`.
- [x] **Compilación y Tipado:** `npm run typecheck` en verde.
- [x] **Linters de Código:** `npm run lint` en verde.
- [x] **Gobernanza Documental:** `npm run docs:validate` y `npm run lint:md` en verde.
- [x] **Higiene de Configuración:** `npm run lint:ignore` y `npm run lint:yaml` en verde.
- [x] **Paridad GitOps:** `npm run gitops:verify-parity` en verde.
- [x] **Superficie de Pruebas:** `npm run test:surface:check` sincronizado sin drift.
- [x] **Auditoría de Dependencias:** `npm audit --omit=dev` sin vulnerabilidades.

