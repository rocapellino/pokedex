# Baseline de Consolidación — Gobernanza, Infraestructura y Superficie de Pruebas

> **Estado:** Histórico (`AUDIT_STALE`; snapshot consolidado no bloqueante)  
> **Fecha de captura:** 2026-10-02  
> **Commit:** `b4fafd567823b3cc740b17d9d9986c2dea63270b`  
> **Versión Base:** `v1.89.7`  
>
> [!IMPORTANT]
> Este documento conserva la evidencia del commit auditado y consolida los ciclos cerrados de auditoría.
> No representa el estado dinámico actual ni debe utilizarse como SSOT; esa función corresponde
> exclusivamente al código ejecutable, la configuración vigente, GitOps y `docs/architecture/`.

---

## 1. Identificación y Paridad de Versión

| Componente | Valor Vigente | Fuente de Verdad Canónica (SSOT) |
| :--- | :--- | :--- |
| `package.json` | `1.89.7` | SSOT de versión de aplicación y monorepo |
| `infra/helm/pokedex/Chart.yaml` (`version` / `appVersion`) | `1.89.7` | SSOT de empaquetado Helm y distribución |
| GitOps Root Application (`gitops/apps/root-application.yaml`) | `v1.89.7` | SSOT de orquestación App-of-Apps |
| GitOps Proxmox Prod (`gitops/apps/app-proxmox.yaml`) | `v1.89.7` | SSOT de promoción en producción |
| GitOps Proxmox Pre-Prod (`gitops/apps/app-proxmox-preprod.yaml`) | `v1.89.7` | SSOT de promoción en pre-producción |
| GitOps Cloud Reference (`gitops/apps/app-cloud.yaml`) | `v1.89.7` | Manifiesto de referencia desacoplado |
| Último tag alcanzado | `v1.89.7` | `git tag --sort=-v:refname` |

> [!NOTE]
> La paridad entre `package.json`, `Chart.yaml` y la totalidad de los manifiestos de ArgoCD en `gitops/apps/` es estricta **1:1** (`v1.89.7`).

---

## 2. Superficie Técnica del Repositorio

| Métrica | Valor Auditado | Notas de Alcance |
| :--- | :---: | :--- |
| Workflows en `.github/workflows/` | 18 | Orquestador central, gates especializados y jobs programados |
| Scripts en `scripts/` | 25 | Automatización, reconciliación CLI, linters y gates de plataforma |
| Skills canónicas en `.agents/skills/` | 17 | Catálogo consolidado bajo despacho condicional |
| Archivos totales en `tests/` | 49 | 47 suites activas, 1 fixture/entorno, 1 script k6 de carga |
| Casos individuales de prueba | 464 | Unitarios, contratos, seguridad, IaC, GitOps, E2E y a11y |
| Líneas de código de pruebas | 13.182 | Inventariadas determinísticamente en `test-surface.json` |
| Tamaño de suite de pruebas | 598.8 KB | Cobertura integral en runtime y CI/CD |

---

## 3. Topología de CI/CD y Gates de Gobernanza

La arquitectura de integración continua opera bajo un modelo de orquestación desacoplado y predecible:

1. **Orquestador Central de Impacto:**
   `.github/workflows/change-impact.yaml` evalúa la matriz `.github/ci-impact.yaml` mediante `scripts/detect-change-impact.ts`, despachando selectivamente los flujos `ci-core`, `infra` y `frontend`.
2. **Gobernanza de Higiene y Temporales (`tmp/`):**
   Regla transversal formalizada en `.agents/rules/repository-hygiene.md` que prohíbe la dispersión de artefactos transitorios fuera de `tmp/`, respaldada por `.gitignore`, `repo-lifecycle` y validaciones automatizadas.
3. **Gobernanza de Superficie de Pruebas:**
   Catálogo machine-readable en `docs/testing/test-surface.json` y reporte de auditoría en `docs/testing/test-surface.md`, respaldado por el motor `scripts/test-surface.ts` y auditado contra drift mediante `tests/contracts.test.ts` en cada build.
4. **Markdown Quality Gate:**
   Verificación fail-closed mediante `scripts/lint-markdown.ts` exigiendo 0 errores `MDxxx` en la totalidad del árbol documental.

---

## 4. Auditorías Finalizadas y Hallazgos Remediados Consolidados

Todos los hallazgos correspondientes a los ciclos previos de auditoría han sido remediados, validados en CI/CD y consolidados en el árbol canónico:

### A. Ciclo de Consolidación de Dependencias, Seguridad y Releases (PRs #455 al #461)

| Hito / ID | Área | Descripción y Solución Aplicada | PR / Commit |
| :--- | :--- | :--- | :--- |
| **DEP-001** | Dependencias | Actualización de dependencias wanted (`@commitlint/*`, `turbo`, `drizzle-orm`, `drizzle-kit`, `express`, `pg`, `pino`, `zod`, `vite`) y mitigación SCA completa (`basic-ftp ^6.2.1`, GHSA-c475-qrg2-pj4r) logrando 0 vulnerabilidades en `npm audit`. | #461 (`c93b77d`) |
| **APPS-009** | Docker / Runtime | Configuración de `NODE_PATH` en `apps/backend/Dockerfile` asegurando resolución determinista de módulos anidados en workspaces de monorepo. Interoperabilidad ESM/CJS de `js-yaml` en testing. | #461 (`c93b77d`) |
| **REL-005** | Release / GitOps | Promoción atómica e inmutable de la versión `v1.89.7` en todo el monorepo y sincronización 1:1 en ArgoCD. | #460 (`b4fafd5`) |
| **APPS-008** | Apps / Calidad | Modularización de seguridad de red en `network-security.ts`, extracción de validaciones SSRF e IP privada, desacoplamiento de Express/Postgres y creación de tests unitarios de guardrails anti-monolito. | #455 (`3890f77`) |
| **APPS-002** | Apps / Seed | Desacoplamiento del auto-seed en `postgres.ts` (condicionado estrictamente a `AUTO_SEED=true` o `NODE_ENV=test`), delegando la población en producción al K8s Seed Job (`seed-job.yaml`). | #455 (`3890f77`) |
| **CI-007** | CI / Least Privilege | Consolidación de permisos Zero-Trust en los 18 workflows de GitHub Actions; aplicación de permisos explícitos por job y tipado de variables no falsificables (`user.login` no-fork). | #456 (`68282e1`) |
| **DOC-012** | Docs / Gobernanza | Emisión de reporte formal de ciclo de vida (`documentation-lifecycle.md`), ratificación de enmienda ADR-006 por ADR-028, y agregado de reporter `spec` a `stdout` en `npm run test:coverage`. | #457 (`c683a95`) |
| **REL-004** | Release / GitOps | Promoción atómica e inmutable de la versión `v1.89.6` en todo el monorepo y sincronización 1:1 en ArgoCD. | #458 (`31ad8d7`) |

### B. Ciclos Previos Consolidados (Infraestructura y Base Histórica — PRs #413 al #451)

| Dominio | Hallazgos Principales Resueltos | Referencia |
| :--- | :--- | :--- |
| **Infraestructura (Fases 1-3)** | CRI agnóstico (`validate_hosts.yaml`), consolidación ESO (`cluster-secret-store.yaml`), READMEs normativos en `infra/k8s`, `infra/helm` y `infra/opentofu`. | PRs #448, #450, #451 |
| **GitOps & Red** | Parcheo de `argocd-cm` (`GITOPS-001`), restricción Ingress host (`GITOPS-002`), renderizado pre-prod (`GITOPS-005`), SSOT `gitops/README.md` (`GITOPS-003`). | PRs #413, #416, #423, #428 |
| **IaC & Seguridad** | Unificación de contratos SSH (`INFRA-003`), checksums inmutables en OpenTofu (`INFRA-007`), colecciones fijas en Ansible (`INFRA-001`), red de clúster explícita (`INFRA-009`), purga de variable huérfana (`INFRA-008`). | PRs #414, #415, #418, #421, #426 |
| **Helm & Monitoreo** | Digest condicional (`INFRA-005`), retiro de values de Alloy huérfano (`INFRA-006`), delimitación de `values.prod.yaml` (`INFRA-011`). | PRs #420, #425, #427 |
| **Skills & Gobernanza** | Demarcación SSOT y motor de impacto (`AUD-GOV-SKL-001..010`), regla transversal `documentation-governance.md` (`REFACTOR-DOC-GOV`), higiene estricta de `tmp/` e inventario de testing (`test-surface`). | PRs #431, #432, #435 |

---

## 5. Regla de Oro Operativa (AGENTS.md)

> [!IMPORTANT]
> Este documento representa un **snapshot histórico consolidado** al commit `b4fafd5`.
> **NUNCA debe utilizarse para inferir el estado actual, rutas de secretos o configuraciones vigentes.**
> La verdad operativa reside estrictamente en las Fuentes Únicas de Verdad (SSOT): `gitops/`, `infra/`, `docs/architecture/`, `apps/`, `scripts/` y `tests/`.
