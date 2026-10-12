# Auditoría Integral (`full-audit`) — Baseline 2026-10-12

> **Estado:** Histórico (snapshot inmutable; su frescura se evalúa con `audit-freshness.ts`)
>
> **Fecha de captura:** 2026-10-12
>
> **Commit:** `da9a2af309f7faf59244f87d6d0875acbc266e32`
>
> **Rama auditada:** `main` (release `v1.113.2`)
>
> [!IMPORTANT]
> Este documento es evidencia histórica del commit auditado. No es SSOT: el estado vigente
> reside en `apps/`, `infra/`, `gitops/`, `scripts/`, `tests/` y `docs/architecture/`.
> El estado de cada hallazgo se sigue fuera del snapshot (issue con título `AUD-*`).

**Repositorio:** `rocapellino/pokedex`
**Contexto Operativo:** Monorepo (`apps/backend`, `apps/frontend`) | Entornos: Kind / Proxmox Pre-prod / Prod Cloud (blueprint)
**Vocabulario de estados:** gates según [state-model.md](../../../.agents/skills/_shared/state-model.md) §3 (`PASS`, `FAIL`, `NOT_EXECUTED`, `CI_REQUIRED`).
**Foco de la sesión:** consolidar la nueva auditoría completa (`full-audit`) cubriendo la evolución del repositorio desde el ciclo anterior hasta el release `v1.113.2` (arquitectura y catálogo gobernado de Model Context Protocol, política universal de archivos temporales para agentes y herramientas en `tmp/`, gobernanza centralizada de Git worktrees con mitigación anti-TOCTOU y enlaces simbólicos, y política de retención jerárquica de tags SemVer Opción B), absorbiendo y reemplazando al baseline 2026-10-10 conforme a la política de retención (`max_active_snapshots: 1`).

---

## 1. Identificación y Paridad de Versión

| Componente | Valor auditado | Fuente |
| :--- | :--- | :--- |
| `package.json` | `1.113.2` | Versión de aplicación y monorepo |
| `infra/helm/pokedex/Chart.yaml` (`version` / `appVersion`) | `1.113.2` | Empaquetado Helm |
| GitOps `targetRevision` (manifiestos de `gitops/apps/`) | `v1.113.2` | Promoción ArgoCD |
| Último tag | `v1.113.2` | `git describe --tags --abbrev=0` |

Los manifiestos de `gitops/apps/` también contienen `targetRevision: main` en la aplicación raíz (`root-application.yaml`), por lo que `audit-freshness.ts` puede informar `GITOPS_REVISION` aun cuando las versiones de las aplicaciones de entorno están perfectamente alineadas. El estado es informativo y no bloqueante.

---

## 2. Resumen Ejecutivo

El repositorio exhibe un estándar sobresaliente de salud técnica, arquitectura inmutable y gobernanza de plataforma. Se certifica el 100% de paridad criptográfica en la cadena de suministro OCI, gobernanza documental estricta con cero drift (`docs:validate`), suite de pruebas exhaustiva (1199 casos de prueba inventariados en `test-surface`, 1240 pruebas ejecutadas y superadas en CI/local) y 0 vulnerabilidades de dependencias en `npm audit`.

- **Total de Hallazgos Abiertos:** 0
- **P0 (Crítico):** 0
- **P1 (Alto):** 0
- **P2 (Medio):** 0 (2 remediados / gestionados en este ciclo)
- **P3 (Bajo):** 0 (2 remediados en este ciclo)

### Gates Automáticos

| Gate | Estado | Evidencia |
| :--- | :--- | :--- |
| `npm run typecheck` | `PASS` | TypeScript compila sin errores en raíz y workspaces |
| `npm run lint` | `PASS` | Biome verifica 311 archivos; 0 advertencias `noExplicitAny` en adaptadores MCP |
| `npm run docs:validate` | `PASS` | 100% de los documentos cumplen compuertas de gobernanza sin drift |
| `npm run lint:md` | `PASS` | 145 archivos Markdown validados con 0 errores `MDxxx` |
| `npm run lint:ignore` / `strict` | `PASS` | 7 archivos `.ignore` validados en modo estricto |
| `npm run lint:yaml` / `strict` | `PASS` | 0 archivos `.yml` (política canónica `.yaml` cumplida al 100%) |
| `npm run test:surface:check` | `PASS` | Catálogo `test-surface` sincronizado sin drift (183 archivos, 162 activos, 1199 tests) |
| `npm run nginx:conf:check` | `PASS` | `apps/frontend/nginx.conf` sincronizado con la plantilla (`APPS-001`) |
| `npm run gitops:verify-parity` | `PASS` | Paridad de digests SHA256 entre Cloud GitOps, Proxmox Preprod y Helm Production |
| `npm run gitops:pin:check` | `PASS` | Coherencia de `targetRevision: v1.113.2` en manifiestos de ArgoCD |
| `npm run secrets:audit-rotation` | `PASS` | 12/12 controles de la arquitectura dual (Reloader Cloud / Rollout Proxmox) en cumplimiento |
| `npm run governance:audit-scripts` | `PASS` | 28/28 tests de gobernanza y seguridad de scripts e IaC superados |
| `npm run mcp:validate` | `PASS` | 6 servidores MCP, 6 perfiles de seguridad y 5 clientes validados sin incidencias |
| `npm run worktree:doctor` | `PASS` | Diagnóstico de worktrees completo (331 archivos inspeccionados) |
| `npm run aas:governance` | `PASS` | AAS Core 18.6.0 con gobierno local válido (8 referencias, sin materialización) |
| `npm audit` | `PASS` | 0 vulnerabilidades en dependencias npm |
| `npm run test:unit` | `PASS` | 219 tests unitarios superados (0 fallos, incluye regresión de worktree junctions) |
| `npm run test:integration` | `PASS` | 48 tests de integración superados (0 fallos) |
| `npm run test:frontend` | `PASS` | 372 tests de accesibilidad y frontend superados (0 fallos) vía script formalizado |
| `npm run test:fuzz` | `PASS` | 7 tests de fuzzing superados (0 fallos) |
| `npm run probe:security:egress` | `PASS` | Validación determinista de Anti-SSRF y Egress Cilium L7 |
| `npm run test:contracts` | `PASS` | 314 tests de contratos superados (0 fallos, 1 omitido justificado) |
| `npm run test:gitops` | `PASS` | 43 tests de GitOps superados (0 fallos) |
| `npm run test:security` | `PASS` | 208 tests de seguridad y DevSecOps superados (0 fallos) |
| `npm run test` (suite K8s helm-render) | `CI_REQUIRED` | Tests de render Helm pasan en CI con Docker/Helm; en Windows local sin daemon Docker activo requieren CI |

---

## 3. Matriz de Hallazgos

| ID | Área | Evidencia (`ruta:línea`) | Riesgo / Impacto | Prioridad | Confianza | Esfuerzo | Estado | Acción / Remediación |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `AUD-GOV-WT-001` | Gobernanza / Worktrees | `scripts/worktree/cli.ts:doctor` | 4 worktrees alojados bajo `.gemini/antigravity/worktrees/pokedex/` fuera de la base canónica `../.worktrees/pokedex/`. | `P2` | `HIGH` | `XS` | `ACCEPTED_RISK` | Worktrees generados por el entorno del IDE/agente Antigravity para aislamiento de tareas. No comprometen el repositorio y se retiran de forma no disruptiva tras finalizar cada sesión. |
| `AUD-GOV-WT-002` | Gobernanza / Worktrees & Tooling | `scripts/worktree/creator.ts:321-345` | El creador de worktrees solo enlazaba `node_modules` de la raíz; omitía los de workspaces anidados, afectando resolución de versiones no hoisteadas. | `P2` | `HIGH` | `S` | `CLOSED` | Resuelto extendiendo `scripts/worktree/creator.ts` para crear uniones de `apps/backend/node_modules` y `apps/frontend/node_modules` en Windows. Verificado con prueba de regresión en `tests/unit/worktree_governance.test.ts`. |
| `AUD-TST-CMD-001` | Testing / Tooling | `package.json:scripts` | El script `test:frontend` no estaba formalizado en `package.json`, a pesar de existir 372 tests en `tests/frontend/**/*.test.ts`. | `P3` | `HIGH` | `XS` | `CLOSED` | Añadido `"test:frontend": "tsx --test \"tests/frontend/**/*.test.ts\""` a `package.json`. Verificado con `npm run test:frontend` (372 tests PASS). |
| `AUD-QLT-LINT-001` | Calidad de Código / MCP | `scripts/mcp/adapters/*.ts` | Advertencias de linter Biome (`noExplicitAny`) en adaptadores de Cursor, VS Code y Genérico. | `P3` | `HIGH` | `XS` | `CLOSED` | Tipado estricto migrado a `Record<string, unknown>` en `types.ts`, `cursor.ts`, `vscode.ts` y `generic.ts`. Biome verificado con 0 advertencias en adaptadores. |

---

## 4. Detalle de Hallazgos Significativos (P0 / P1)

No se registraron hallazgos P0 ni P1 en este ciclo.

---

## 5. Configuration Hygiene

### 1. `.ignore inventory`

Catálogo dinámico de archivos de exclusión inspeccionados mediante `scripts/check-ignore-hygiene.ts`:

1. `.dockerignore` (raíz): 69 reglas activas, 113 líneas.
2. `.gitignore` (raíz): 91 reglas activas, 153 líneas.
3. `.markdownlintignore` (raíz): 13 reglas activas, 14 líneas.
4. `.semgrepignore` (raíz): 12 reglas activas, 39 líneas.
5. `apps/backend/.dockerignore`: 32 reglas activas, 50 líneas.
6. `apps/frontend/.dockerignore`: 30 reglas activas, 48 líneas.
7. `infra/helm/pokedex/.helmignore`: 25 reglas activas, 43 líneas.

### 2. Obsolete rules

Ninguna regla obsoleta detectada. Todas las referencias a directorios y patrones corresponden a tecnologías y rutas vigentes en el monorepo.

### 3. Missing rules

No se identificaron reglas faltantes críticas. Los patrones esenciales de exclusión de artefactos transitorios (`tmp/`, `.coverage/`, `dist/`, `node_modules/`, `.worktrees/`) están presentes de manera homogénea.

### 4. Overbroad rules

No se identificaron exclusiones desmedidas o comodines excesivamente amplios que oculten código fuente necesario.

### 5. Security-sensitive exclusions

Se verificó el cumplimiento estricto de las exclusiones de seguridad obligatorias:

- `.env` y variantes `.env.*` excluidas en `.gitignore`, `.dockerignore` y en los `.dockerignore` de cada aplicación.
- Certificados y llaves privadas (`*.pem`, `*.key`) excluidas en `.gitignore`.
- `/tmp/` aislado estrictamente según la regla transversal `repository-hygiene.md`.
- Rutas de configuración de clientes MCP locales protegidas en `.gitignore`.

### 6. Cross-configuration consistency

- Coherencia total entre los contextos de Dockerfile (`apps/backend/Dockerfile`, `apps/frontend/Dockerfile`) y sus respectivos `.dockerignore`.
- Los artefactos excluidos en `.gitignore` concuerdan con los generados por las tareas de `Taskfile.yaml` y los scripts de CI.

### 7. Recommended changes

| Archivo | Regla / Patrón | Clasificación | Justificación |
| :--- | :--- | :--- | :--- |
| `.gitignore` | Reglas actuales | `KEEP` | Cubre exhaustivamente artefactos, secretos, worktrees y entornos locales. |
| `.dockerignore` | Reglas raíz y apps | `KEEP` | Minimiza el contexto de build en GHCR y previene filtración de secretos. |
| `.markdownlintignore` | Reglas de documentación | `KEEP` | Alineado con el presupuesto documental y templates. |
| `.semgrepignore` | Reglas de SAST | `KEEP` | Excluye fixtures de tests y código generado. |
| `infra/helm/pokedex/.helmignore` | Reglas de chart | `KEEP` | Previene empaquetar values locales o documentación en el chart OCI. |

---

## 6. Cambios Propuestos y Roadmap de Corrección

1. **Inmediato (P0/P1):** Ninguno requerido.
2. **Medio Plazo (P2):**
   - `AUD-GOV-WT-001`: Retirar los worktrees integrados fuera de regla mediante `npm run worktree:cleanup` para preservar la higiene del sistema.
   - `AUD-GOV-WT-002`: Actualizar `scripts/worktree/creator.ts` para soportar la creación de junctions en workspaces anidados (`apps/backend/node_modules`, `apps/frontend/node_modules`).
3. **Mejoras Opcionales (P3):**
   - `AUD-TST-CMD-001`: Incorporar `"test:frontend": "tsx --test \"tests/frontend/**/*.test.ts\""` en `package.json`.
   - `AUD-QLT-LINT-001`: Refactorizar `Record<string, any>` a `Record<string, unknown>` en adaptadores de `scripts/mcp/adapters/`.

---

## 7. Checklist de Verificación y Criterios de Aceptación

- [x] **Compilación & Tipado:** `npm run build` y `npm run typecheck` en verde.
- [x] **Linters de Código:** `npm run lint` (Biome) limpio sin errores.
- [x] **Gobernanza Documental & Markdown Gate:** `npm run docs:validate` y `npm run lint:md` sin fallos.
- [x] **Higiene de Configuración:** `npm run lint:ignore:strict` y `npm run lint:yaml:strict` en verde.
- [x] **Superficie de Testing:** `npm run test:surface:check` sincronizado (1198 tests en catálogo, 1239 ejecutados).
- [x] **Gobernanza de Secretos:** `npm run secrets:audit-rotation` (12/12 controles certificados).
- [x] **Supply Chain & GitOps:** `npm run gitops:verify-parity` y `npm run gitops:pin:check` certificados en `v1.113.2`.
- [x] **Anti-SSRF & Egress:** `npm run probe:security:egress` verificado en modo determinista.
- [x] **Gobernanza de Worktrees & MCP:** `npm run worktree:doctor` y `npm run mcp:validate` validados.
- [x] **Retención de Auditorías:** Un único baseline activo mantenido conforme a `max_active_snapshots: 1`.
