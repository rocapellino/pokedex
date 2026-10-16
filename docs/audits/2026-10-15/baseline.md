# Auditoría Integral (`full-audit`) — Baseline 2026-10-15

> **Estado:** Histórico (snapshot inmutable; su frescura se evalúa con `audit-freshness.ts`)
>
> **Fecha de captura:** 2026-10-15
>
> **Commit:** `4d5168dbdc1e4f4760cbf8e28f77bf38c6983f9d`
>
> **Rama auditada:** `main` (release `v1.116.2`)
>
> [!IMPORTANT]
> Este documento es evidencia histórica del commit auditado. No es SSOT: el estado vigente
> reside en `apps/`, `infra/`, `gitops/`, `scripts/`, `tests/` y `docs/architecture/`.
> El estado de cada hallazgo se sigue fuera del snapshot (issue con título `AUD-*`).

**Repositorio:** `rocapellino/pokedex`
**Contexto Operativo:** Monorepo (`apps/backend`, `apps/frontend`, `packages/contracts`) | Entornos: Kind / Proxmox Pre-prod / Prod Cloud (blueprint)
**Vocabulario de estados:** gates según [state-model.md](../../../.agents/skills/_shared/state-model.md) §3 (`PASS`, `FAIL`, `NOT_EXECUTED`, `CI_REQUIRED`).
**Foco de la sesión:** consolidar la auditoría integral (`full-audit`) absorbiendo las migraciones estructurales de plataforma (`js-yaml v5` [#880], `PostgreSQL 17 / Valkey 8` [#882, #884], `PgBouncer 1.25.2` [#887], `KaTeX 0.19.0` [#888], herramientas CLI IaC/Seguridad [#889] y consolidación de deudas estructurales de segunda generación con paquete de contratos compartidos `@pokedex/contracts` y gobierno de agentes/MCP [#891]) en el release `v1.116.2`, manteniendo un único snapshot activo conforme a `max_active_snapshots: 1`.

---

## 1. Identificación y Paridad de Versión

| Componente | Valor auditado | Fuente |
| :--- | :--- | :--- |
| `package.json` | `1.116.2` | Versión de aplicación y monorepo |
| `infra/helm/pokedex/Chart.yaml` (`version` / `appVersion`) | `1.116.2` | Empaquetado Helm |
| GitOps `targetRevision` (manifiestos de `gitops/apps/`) | `v1.116.2` | Promoción ArgoCD |
| Último tag | `v1.116.2` | `git describe --tags --abbrev=0` |

Los manifiestos de `gitops/apps/` también contienen `targetRevision: main` en la aplicación raíz (`root-application.yaml`), por lo que `audit-freshness.ts` puede informar `GITOPS_REVISION` aun cuando las versiones de las aplicaciones de entorno están perfectamente alineadas. El estado es informativo y no bloqueante.

---

## 2. Resumen Ejecutivo

El repositorio exhibe un estándar sobresaliente de salud técnica, arquitectura inmutable, paridad de cadena de suministro y gobernanza de plataforma tras la consolidación de deudas estructurales de segunda generación. Se certifica el 100% de paridad criptográfica en la cadena de suministro OCI, paridad estricta entre descriptores de workspaces (`package.json`) y `package-lock.json`, gobernanza documental estricta con cero drift (`docs:validate`), suite de pruebas exhaustiva (1225 casos de prueba inventariados en `test-surface`, 1241 pruebas ejecutadas y superadas en CI/local) y 0 vulnerabilidades de dependencias en `npm audit`.

- **Total de Hallazgos Abiertos:** 0
- **P0 (Crítico):** 0
- **P1 (Alto):** 0
- **P2 (Medio):** 0 (6 remediados / consolidados en este ciclo)
- **P3 (Bajo):** 0 (2 remediados / consolidados en este ciclo)

### Gates Automáticos

| Gate | Estado | Evidencia |
| :--- | :--- | :--- |
| `npm run typecheck` | `PASS` | TypeScript (`~7.0.2`) compila sin errores en raíz, workspaces (`apps/backend`, `apps/frontend`) y paquete `@pokedex/contracts` |
| `npm run lint` | `PASS` | Biome (`2.7.2`) verifica 315 archivos con 0 errores y 0 advertencias en todo el repositorio |
| `npm run docs:validate` | `PASS` | 100% de los documentos cumplen compuertas de gobernanza sin drift |
| `npm run lint:md` | `PASS` | 153 archivos Markdown validados con 0 errores `MDxxx` |
| `npm run lint:ignore` / `strict` | `PASS` | 7 archivos `.ignore` validados en modo estricto |
| `npm run lint:yaml` / `strict` | `PASS` | 0 archivos `.yml` (política canónica `.yaml` cumplida al 100%) |
| `npm run test:surface:check` | `PASS` | Catálogo `test-surface` sincronizado sin drift (186 archivos, 165 activos, 1225 tests) |
| `npm run nginx:conf:check` | `PASS` | `apps/frontend/nginx.conf` sincronizado con la plantilla (`APPS-001`) |
| `npm run gitops:verify-parity:strict` | `PASS` | Paridad de digests SHA256 entre Cloud GitOps, Proxmox Preprod y Helm Production |
| `npm run gitops:pin:check` | `PASS` | Coherencia de `targetRevision: v1.116.2` en manifiestos de ArgoCD |
| `npm run secrets:audit-rotation` | `PASS` | 12/12 controles de la arquitectura dual (Reloader Cloud / Rollout Proxmox) en cumplimiento |
| `npm run governance:audit-scripts` | `PASS` | 28/28 tests de gobernanza y seguridad de scripts e IaC superados |
| `npm run mcp:validate` / `mcp:test` | `PASS` | 9 servidores MCP (8 activos), 8 perfiles de seguridad y 5 clientes validados; 39/39 tests superados |
| `npm run worktree:doctor` | `PASS` | Diagnóstico de worktrees gobernados completo |
| `npm run aas:governance` | `PASS` | AAS Core 18.6.0 con gobierno local válido (8 referencias, sin materialización) |
| `npm audit` | `PASS` | 0 vulnerabilidades en dependencias npm |
| `npm run test:unit` | `PASS` | 235 tests unitarios superados (0 fallos; incluye regresiones de worktrees y contratos Zod) |
| `npm run test:contracts` | `PASS` | 325 tests de contratos superados (324 pass, 1 omitido justificado en entorno live de GitHub) |
| `npm run test:security` | `PASS` | 210 tests de seguridad y DevSecOps superados (0 fallos) |
| `npm run test:gitops` | `PASS` | 43 tests de GitOps superados (0 fallos) |
| `npm run test:frontend` | `PASS` | 374 tests de accesibilidad y frontend superados (0 fallos) |
| `npm run test:integration` | `PASS` | 48 tests de integración superados (0 fallos) |
| `npm run test:fuzz` | `PASS` | 7 tests de fuzzing superados (0 fallos) |
| `npm run probe:security:egress` | `PASS` | Validación determinista de Anti-SSRF y Egress Cilium L7 |
| `npm run test` (suite K8s helm-render) | `CI_REQUIRED` | Tests de render Helm pasan en CI con Docker/Helm; en Windows local sin daemon Docker activo requieren CI |

---

## 3. Matriz de Hallazgos y Remediaciones Consolidadas

| ID | Área | Evidencia (`ruta:línea`) | Riesgo / Impacto | Prioridad | Confianza | Esfuerzo | Estado | Acción / Remediación |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `AUD-MOD-YAML-001` | Modernización / Dependencias | `scripts/check-yaml-extension.ts`, `tests/` | Obsolescencia técnica de `js-yaml v4` y métodos heredados `safeLoad`. | `P2` | `HIGH` | `S` | `CLOSED` | Migración completa a `js-yaml v5` con imports ESM nativos y tipado estricto en PR `#880`. |
| `AUD-INF-PG17-001` | Infraestructura / Datastores | `docker-compose.dev.yaml`, `infra/ansible/` | Versiones desactualizadas PostgreSQL 16 y Redis 7.2 en entornos local y Proxmox pre-prod. | `P2` | `HIGH` | `M` | `CLOSED` | Actualización de core datastores a `PostgreSQL 17.9` y `Valkey 8.1`, formalizada en `ADR-031` en PRs `#882` y `#884`. |
| `AUD-INF-PGB-001` | Infraestructura / PgBouncer | `infra/helm/pokedex/values.yaml:127` | PgBouncer en versión `1.22.0` con digest anterior. | `P2` | `HIGH` | `XS` | `CLOSED` | Actualizado PgBouncer a `1.25.2` fijado por digest SHA256 inmutable multi-arch en PR `#887`. |
| `AUD-DEP-KATEX-001` | Tooling / Renderizado | `package.json:overrides` | KaTeX en versión `^0.18.11` rezagada en árbol de dependencias. | `P3` | `HIGH` | `XS` | `CLOSED` | Actualizado override en raíz monorepo a `^0.19.0` en PR `#888`. |
| `AUD-SEC-TOOL-001` | Supply Chain / Herramientas CLI | `.github/workflows/infra.yaml`, `security-gitleaks.yaml` | Herramientas de análisis IaC y seguridad (`kubeconform`, `kube-linter`, `kyverno`, `gitleaks`) rezagadas respecto a releases upstream. | `P2` | `HIGH` | `S` | `CLOSED` | Actualizados binarios a `kubeconform v0.8.0`, `kube-linter v0.8.3`, `kyverno v1.19.1` y `gitleaks 8.30.1` verificados con checksum SHA256 estricto (`SEC-001`) en PR `#889`. |
| `AUD-ARCH-CONTR-001` | Arquitectura / Tipado Compartido | `apps/backend/src/types.ts`, `apps/frontend/src/types.ts` | Duplicación de tipos entre backend y frontend y acoplamiento con runtime Zod. | `P2` | `HIGH` | `M` | `CLOSED` | Creación del workspace `@pokedex/contracts` (`packages/contracts`) con tipos puros de TypeScript, desacoplando Zod 4 (`AUD-DEP-ZOD-001`) y sincronizando Dockerfiles en PR `#891`. |
| `AUD-GOV-SKL-001` | Gobernanza / Skills & Reglas | `.agents/skills/`, `AGENTS.md` | Falta de formalización de skills de arquitectura y preflight (`adr-manager`, `db-drizzle-ops`, `k8s-gitops-validator`, `devsecops-preflight`). | `P2` | `HIGH` | `S` | `CLOSED` | Creadas 4 nuevas skills con frontmatter YAML validado y sincronizadas las 4 reglas inquebrantables en `AGENTS.md` en PR `#891`. |
| `AUD-MCP-SEC-001` | Gobernanza / MCP | `.mcp/registry.yaml`, `.gitignore` | Servidor `postgres-readonly` no estandarizado y archivos locales sin ignorar. | `P3` | `HIGH` | `XS` | `CLOSED` | Estandarizado servidor en registry, protección de artefactos efímeros en `.gitignore` y blindaje Zero-Trust en `AGENTS.md` en PR `#891`. |

---

## 4. Detalle de Hallazgos Significativos (P0 / P1)

No se registraron hallazgos P0 ni P1 en este ciclo de auditoría.

---

## 5. Configuration Hygiene

### 1. `.ignore inventory`

Catálogo dinámico de archivos de exclusión inspeccionados mediante `scripts/check-ignore-hygiene.ts`:

1. `.dockerignore` (raíz): 69 reglas activas, 113 líneas.
2. `.gitignore` (raíz): 94 reglas activas, 156 líneas.
3. `.markdownlintignore` (raíz): 13 reglas activas, 14 líneas.
4. `.semgrepignore` (raíz): 12 reglas activas, 39 líneas.
5. `apps/backend/.dockerignore`: 32 reglas activas, 50 líneas.
6. `apps/frontend/.dockerignore`: 30 reglas activas, 48 líneas.
7. `infra/helm/pokedex/.helmignore`: 25 reglas activas, 43 líneas.

### 2. Obsolete rules

Ninguna regla obsoleta detectada. Todas las referencias corresponden a rutas, extensiones y tecnologías vigentes del monorepo.

### 3. Missing rules

No se identificaron reglas faltantes críticas. Los patrones esenciales de exclusión de artefactos transitorios (`tmp/`, `.coverage/`, `dist/`, `node_modules/`, `.worktrees/`, `.mcp/*.local.json`) están presentes de forma homogénea.

### 4. Overbroad rules

No se identificaron exclusiones desmedidas ni comodines ambiguos.

### 5. Security-sensitive exclusions

Se certifica el cumplimiento estricto de las exclusiones de seguridad obligatorias:

- `.env` y variantes `.env.*` excluidas en `.gitignore`, `.dockerignore` y en los `.dockerignore` de cada workspace.
- Certificados y llaves privadas (`*.pem`, `*.key`) excluidas en `.gitignore`.
- `/tmp/` aislado estrictamente según la regla transversal `repository-hygiene.md`.
- Rutas de configuración de clientes MCP locales protegidas en `.gitignore`.

### 6. Cross-configuration consistency

- Coherencia total entre los contextos de Dockerfile (`apps/backend/Dockerfile`, `apps/frontend/Dockerfile`) y sus respectivos `.dockerignore`.
- Los artefactos excluidos en `.gitignore` concuerdan con las tareas de `Taskfile.yaml` y los pipelines de CI.

### 7. Recommended changes

| Archivo | Regla / Patrón | Clasificación | Justificación |
| :--- | :--- | :--- | :--- |
| `.gitignore` | Reglas actuales | `KEEP` | Cubre exhaustivamente artefactos, secretos, worktrees y entornos locales. |
| `.dockerignore` | Reglas raíz y apps | `KEEP` | Minimiza el contexto de build en GHCR y previene filtración de secretos. |
| `.markdownlintignore` | Reglas de documentación | `KEEP` | Alineado con el presupuesto documental y templates. |
| `.semgrepignore` | Reglas de SAST | `KEEP` | Excluye fixtures de tests y código generado. |
| `infra/helm/pokedex/.helmignore` | Reglas de chart | `KEEP` | Previene empaquetar values locales o documentación en el chart OCI. |

---

## 6. Cambios Propuestos y Roadmap

1. **Inmediato (P0/P1):** Ninguno requerido.
2. **Medio Plazo (P2):** Todos los hallazgos P2 identificados en los ciclos anteriores han sido completados y cerrados satisfactoriamente.
3. **Mantenimiento Continuo (P3):** Mantener la vigilancia de versiones menores y parches mediante Renovate y Dependency Review en CI.

---

## 7. Checklist de Verificación y Criterios de Aceptación

- [x] **Compilación & Tipado:** `npm run build` y `npm run typecheck` en verde.
- [x] **Linters de Código:** `npm run lint` (Biome) limpio con 0 errores y 0 advertencias en 315 archivos.
- [x] **Gobernanza Documental & Markdown Gate:** `npm run docs:validate` y `npm run lint:md` sin fallos (153 archivos Markdown certificados).
- [x] **Higiene de Configuración:** `npm run lint:ignore:strict` y `npm run lint:yaml:strict` en verde.
- [x] **Superficie de Testing:** `npm run test:surface:check` sincronizado (1225 tests en catálogo, 1241 ejecutados).
- [x] **Gobernanza de Secretos:** `npm run secrets:audit-rotation` (12/12 controles certificados).
- [x] **Supply Chain & GitOps:** `npm run gitops:verify-parity:strict` y `npm run gitops:pin:check` certificados en `v1.116.2`.
- [x] **Anti-SSRF & Egress:** `npm run probe:security:egress` verificado en modo determinista.
- [x] **Gobernanza de Worktrees & MCP:** `npm run worktree:doctor`, `npm run mcp:validate` y `npm run mcp:test` validados.
- [x] **Retención de Auditorías:** Un único baseline activo mantenido conforme a `max_active_snapshots: 1`.
