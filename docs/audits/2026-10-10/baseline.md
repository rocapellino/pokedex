# Auditoría Integral (`full-audit`) — Baseline 2026-10-10

> **Estado:** Histórico (snapshot inmutable; su frescura se evalúa con `audit-freshness.ts`)
>
> **Fecha de captura:** 2026-10-10
>
> **Commit:** `591566dca510edfea624a3d20c04fd97901c1c8c`
>
> **Rama auditada:** `main` (release `v1.110.1`)
>
> [!IMPORTANT]
> Este documento es evidencia histórica del commit auditado. No es SSOT: el estado vigente
> reside en `apps/`, `infra/`, `gitops/`, `scripts/`, `tests/` y `docs/architecture/`.
> El estado de cada hallazgo se sigue fuera del snapshot (issue con título `AUD-*`).

**Repositorio:** `rocapellino/pokedex`
**Contexto Operativo:** Monorepo (`apps/backend`, `apps/frontend`) | Entornos: Kind / Proxmox Pre-prod / Prod Cloud (blueprint)
**Vocabulario de estados:** gates según [state-model.md](../../../.agents/skills/_shared/state-model.md) §3 (`PASS`, `FAIL`, `NOT_EXECUTED`, `CI_REQUIRED`).
**Foco de la sesión:** consolidar la nueva auditoría completa (`full-audit`) cubriendo la evolución del repositorio desde el ciclo anterior hasta el release `v1.110.1` (incorporación de validación de PgBouncer en clúster Kind de CI, paridad de pruebas HTML frontend y monitoreo de herramientas por Renovate), absorbiendo y reemplazando al baseline 2026-10-09 conforme a la política de retención (`max_active_snapshots: 1`).

---

## 1. Identificación y Paridad de Versión

| Componente | Valor auditado | Fuente |
| :--- | :--- | :--- |
| `package.json` | `1.110.1` | Versión de aplicación y monorepo |
| `infra/helm/pokedex/Chart.yaml` (`version` / `appVersion`) | `1.110.1` | Empaquetado Helm |
| GitOps `targetRevision` (manifiestos de `gitops/apps/`) | `v1.110.1` | Promoción ArgoCD |
| Último tag | `v1.110.1` | `git describe --tags --abbrev=0` |

Los manifiestos de `gitops/apps/` también contienen `targetRevision: main` en la aplicación raíz (`root-application.yaml`), por lo que `audit-freshness.ts` puede informar `GITOPS_REVISION` aun cuando las versiones de las aplicaciones de entorno están perfectamente alineadas. El estado es informativo y no bloqueante.

---

## 2. Resumen Ejecutivo

El repositorio se encuentra en un estado de alta salud técnica, con 100% de paridad criptográfica en la cadena de suministro OCI, gobernanza documental estricta sin drift, suite de pruebas robusta (1090 casos de prueba inventariados) y cero vulnerabilidades de dependencias. Se identifica una advertencia menor de modernización en la configuración de Vite (`apps/frontend/vite.config.ts`).

- **Total de Hallazgos Abiertos:** 0
- **P0 (Crítico):** 0
- **P1 (Alto):** 0
- **P2 (Medio):** 0
- **P3 (Bajo):** 0 (1 remediado en este ciclo: `AUD-BLD-VITE-001`)

### Gates Automáticos

| Gate | Estado | Evidencia |
| :--- | :--- | :--- |
| `npm run typecheck` | `PASS` | TypeScript compila sin errores |
| `npm run lint` | `PASS` | Biome verifica 283 archivos y typecheck pasa en todos los workspaces |
| `npm run docs:validate` | `PASS` | 100% de la gobernanza documental sin drift |
| `npm run lint:md` | `PASS` | 141 archivos Markdown validados con 0 errores `MDxxx` |
| `npm run lint:ignore` / `strict` | `PASS` | 7 archivos `.ignore` validados en modo estricto |
| `npm run lint:yaml` / `strict` | `PASS` | 0 archivos `.yml` (política `.yaml` canónica cumplida) |
| `npm run test:surface:check` | `PASS` | Catálogo `test-surface` sincronizado sin drift (154 archivos, 1090 tests) |
| `npm run nginx:conf:check` | `PASS` | `apps/frontend/nginx.conf` sincronizado con la plantilla |
| `npm run gitops:verify-parity` | `PASS` | Paridad de digests SHA256 entre Cloud GitOps, Proxmox Preprod y Helm Production |
| `npm run gitops:pin:check` | `PASS` | Coherencia de `targetRevision: v1.110.1` en ArgoCD |
| `npm run secrets:audit-rotation` | `PASS` | 12/12 controles de la arquitectura dual (Reloader Cloud / Rollout Proxmox) en cumplimiento |
| `npm run governance:audit-scripts` | `PASS` | 28/28 tests de gobernanza y seguridad de scripts e IaC |
| `npm run aas:governance` | `PASS` | AAS Core 18.6.0 con gobierno local válido |
| `npm audit` | `PASS` | 0 vulnerabilidades en dependencias npm |
| `npm run test:unit` | `PASS` | 191 tests unitarios superados (0 fallos) |
| `npm run test:integration` | `PASS` | 48 tests de integración superados (0 fallos) |
| `npm run test:frontend` | `PASS` | 372 tests de accesibilidad y frontend superados (0 fallos) |
| `npm run test:fuzz` | `PASS` | 7 tests de fuzzing superados (0 fallos) |
| `npm run probe:security:egress` | `PASS` | Validación determinista de Anti-SSRF y Egress Cilium L7 |
| `npm run test` (suite K8s helm-render) | `CI_REQUIRED` | Tests de render Helm pasan en CI con Docker/Helm; en Windows local sin daemon Docker activo requieren CI |

---

## 3. Matriz de Hallazgos

| ID | Área | Evidencia (`ruta:línea`) | Riesgo / Impacto | Prioridad | Confianza | Esfuerzo | Estado | Acción / Remediación |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `AUD-BLD-VITE-001` | Tooling / Build Frontend | `apps/frontend/vite.config.ts:4` | Advertencia en build: import sin extensión (`./css-version`) no soportado por `configLoader: 'native'` en futuras versiones de Vite. | `P3` | `HIGH` | `XS` | `CLOSED` | Resuelto con importación explícita `./css-version.js` conforme al estándar ESM y TypeScript bundler resolution. Build verificado con 0 advertencias. |

---

## 4. Detalle de Hallazgos Significativos (P0 / P1)

No se registraron hallazgos P0 ni P1 en este ciclo.

---

## 5. Configuration Hygiene

### 1. `.ignore inventory`

Catálogo dinámico de archivos de exclusión inspeccionados mediante `scripts/check-ignore-hygiene.ts`:

1. `.dockerignore` (raíz): 69 reglas activas, 113 líneas.
2. `.gitignore` (raíz): 86 reglas activas, 143 líneas.
3. `.markdownlintignore` (raíz): 13 reglas activas, 14 líneas.
4. `.semgrepignore` (raíz): 12 reglas activas, 39 líneas.
5. `apps/backend/.dockerignore`: 32 reglas activas, 50 líneas.
6. `apps/frontend/.dockerignore`: 30 reglas activas, 48 líneas.
7. `infra/helm/pokedex/.helmignore`: 25 reglas activas, 43 líneas.

### 2. Obsolete rules

Ninguna regla obsoleta detectada. Todas las referencias a directorios y patrones corresponden a tecnologías y rutas vigentes en el monorepo.

### 3. Missing rules

No se identificaron reglas faltantes críticas. Los patrones esenciales de exclusión de artefactos transitorios (`tmp/`, `.coverage/`, `dist/`, `node_modules/`) están presentes de manera homogénea.

### 4. Overbroad rules

No se identificaron exclusiones desmedidas o comodines excesivamente amplios que oculten código fuente necesario.

### 5. Security-sensitive exclusions

Se verificó el cumplimiento estricto de las exclusiones de seguridad obligatorias:

- `.env` y variantes `.env.*` excluidas en `.gitignore`, `.dockerignore` y en los `.dockerignore` de cada aplicación.
- Certificados y llaves privadas (`*.pem`, `*.key`) excluidas en `.gitignore`.
- `/tmp/` aislado estrictamente según la regla transversal `repository-hygiene.md`.

### 6. Cross-configuration consistency

- Coherencia total entre los contextos de Dockerfile (`apps/backend/Dockerfile`, `apps/frontend/Dockerfile`) y sus respectivos `.dockerignore`.
- Los artefactos excluidos en `.gitignore` concuerdan con los generados por las tareas de `Taskfile.yaml` y los scripts de CI.

### 7. Recommended changes

| Archivo | Regla / Patrón | Clasificación | Justificación |
| :--- | :--- | :--- | :--- |
| `.gitignore` | Reglas actuales | `KEEP` | Cubre exhaustivamente artefactos, secretos y entornos locales. |
| `.dockerignore` | Reglas raíz y apps | `KEEP` | Minimiza el contexto de build en GHCR y previene filtración de secretos. |
| `.markdownlintignore` | Reglas de documentación | `KEEP` | Alineado con el presupuesto documental y templates. |
| `.semgrepignore` | Reglas de SAST | `KEEP` | Excluye fixtures de tests y código generado. |
| `infra/helm/pokedex/.helmignore` | Reglas de chart | `KEEP` | Previene empaquetar values locales o documentación en el chart OCI. |

---

## 6. Cambios Propuestos y Roadmap de Corrección

1. **Inmediato (P0/P1):** Ninguno requerido.
2. **Medio Plazo (P2):** Ninguno requerido.
3. **Mejoras Opcionales (P3):**
   - `AUD-BLD-VITE-001`: Remediado en este ciclo especificando `./css-version.js` en `apps/frontend/vite.config.ts:4`. Build verificado sin advertencias.

---

## 7. Checklist de Verificación y Criterios de Aceptación

- [x] **Compilación & Tipado:** `npm run build` y `npm run typecheck` en verde.
- [x] **Linters de Código:** `npm run lint` (Biome) limpio sin errores.
- [x] **Gobernanza Documental & Markdown Gate:** `npm run docs:validate` y `npm run lint:md` sin fallos.
- [x] **Higiene de Configuración:** `npm run lint:ignore:strict` y `npm run lint:yaml:strict` en verde.
- [x] **Superficie de Testing:** `npm run test:surface:check` sincronizado (1090 tests).
- [x] **Gobernanza de Secretos:** `npm run secrets:audit-rotation` (12/12 controles).
- [x] **Supply Chain & GitOps:** `npm run gitops:verify-parity` y `npm run gitops:pin:check` certificados.
- [x] **Anti-SSRF & Egress:** `npm run probe:security:egress` verificado en modo determinista.
- [x] **Retención de Auditorías:** Un único baseline activo mantenido conforme a `max_active_snapshots: 1`.
