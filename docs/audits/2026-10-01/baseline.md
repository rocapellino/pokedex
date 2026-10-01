# Baseline de Consolidación — Gobernanza, Infraestructura y Superficie de Pruebas

> **Estado:** Histórico (`AUDIT_STALE`; snapshot consolidado no bloqueante)  
> **Fecha de captura:** 2026-10-01  
> **Commit:** `394346984f226e93d285639a22da3eef60a91b64`  
> **Versión Base:** `v1.88.1`  
>
> [!IMPORTANT]
> Este documento conserva la evidencia del commit auditado y consolida los ciclos cerrados de auditoría.
> No representa el estado dinámico actual ni debe utilizarse como SSOT; esa función corresponde
> exclusivamente al código ejecutable, la configuración vigente, GitOps y `docs/architecture/`.

---

## 1. Identificación y Paridad de Versión

| Componente | Valor Vigente | Fuente de Verdad Canónica (SSOT) |
| :--- | :--- | :--- |
| `package.json` | `1.88.1` | SSOT de versión de aplicación y monorepo |
| `infra/helm/pokedex/Chart.yaml` (`version` / `appVersion`) | `1.88.1` | SSOT de empaquetado Helm y distribución |
| GitOps Root Application (`gitops/apps/root-application.yaml`) | `v1.88.1` | SSOT de orquestación App-of-Apps |
| GitOps Proxmox Prod (`gitops/apps/app-proxmox.yaml`) | `v1.88.1` | SSOT de promoción en producción |
| GitOps Proxmox Pre-Prod (`gitops/apps/app-proxmox-preprod.yaml`) | `v1.88.1` | SSOT de promoción en pre-producción |
| GitOps Cloud Reference (`gitops/apps/app-cloud.yaml`) | `v1.88.1` | Manifiesto de referencia desacoplado |
| Último tag alcanzado | `v1.88.1` | `git tag --sort=-v:refname` |

> [!NOTE]
> La paridad entre `package.json`, `Chart.yaml` y la totalidad de los manifiestos de ArgoCD en `gitops/apps/` es estricta **1:1** (`v1.88.1`).

---

## 2. Superficie Técnica del Repositorio

| Métrica | Valor Auditado | Notas de Alcance |
| :--- | :---: | :--- |
| Workflows en `.github/workflows/` | 18 | Orquestador central, gates especializados y jobs programados |
| Scripts en `scripts/` | 24 | Automatización, reconciliación CLI, linter y gates de plataforma |
| Skills canónicas en `.agents/skills/` | 17 | Catálogo consolidado tras fusionar gobernanza documental en regla transversal |
| Archivos totales en `tests/` | 46 | 44 suites activas, 1 fixture/entorno, 1 script k6 de carga |
| Casos individuales de prueba | 438 | Unitarios, contratos, seguridad, IaC, GitOps, E2E y a11y |
| Líneas de código de pruebas | 12.288 | Inventariadas determinísticamente en `test-surface.json` |
| Tamaño de suite de pruebas | 565.2 KB | Cobertura integral en runtime y CI/CD |

---

## 3. Topología de CI/CD y Gates de Gobernanza

La arquitectura de integración continua opera bajo un modelo de orquestación desacoplado y predecible:

1. **Orquestador Central de Impacto:**
   `.github/workflows/change-impact.yml` evalúa la matriz `.github/ci-impact.yaml` mediante `scripts/detect-change-impact.ts`, despachando selectivamente los flujos `ci-core`, `infra` y `frontend`.
2. **Gobernanza de Higiene y Temporales (`tmp/`):**
   Regla transversal formalizada en `.agents/rules/repository-hygiene.md` que prohíbe la dispersión de artefactos transitorios fuera de `tmp/`, respaldada por `.gitignore`, `repo-lifecycle` y validaciones automatizadas.
3. **Gobernanza de Superficie de Pruebas:**
   Catálogo machine-readable en `docs/testing/test-surface.json` y reporte de auditoría en `docs/testing/test-surface.md`, respaldado por el motor `scripts/test-surface.ts` y auditado contra drift mediante `tests/contracts.test.ts` en cada build.
4. **Markdown Quality Gate:**
   Verificación fail-closed mediante `scripts/lint-markdown.ts` exigiendo 0 errores `MDxxx` en la totalidad del árbol documental.

---

## 4. Auditorías Finalizadas y Hallazgos Remediados Consolidados

Todos los hallazgos correspondientes a los ciclos previos de auditoría han sido remediados, validados en CI/CD y consolidados en el árbol canónico:

### A. Ciclo de Infraestructura y GitOps (Fases 1, 2 y 3 — PRs #413 al #428)

| ID | Área | Descripción y Solución Aplicada | PR / Commit |
| :--- | :--- | :--- | :--- |
| `GITOPS-001` | GitOps | Parcheo de `argocd-cm` para evaluar correctamente la salud de CRDs en ArgoCD. | #413 (`572f48b`) |
| `INFRA-003` | Infra / SSH | Unificación de contratos de usuario SSH en Proxmox/Ansible y purga de hosts fantasma. | #414 (`a24e094`) |
| `INFRA-007` | OpenTofu | Anclaje de imagen VM de producción a release inmutable con checksum validado. | #415 (`4f2bb23`) |
| `GITOPS-002` | Red / Ingress | Restricción del Ingress catch-all a host explícito, evitando bypass de Cilium L7. | #416 (`1d5bf02`) |
| `INFRA-001` | Ansible | Fijación de versiones de collections (`community.general`, `ansible.posix`) para reproducibilidad. | #418 (`a0186af`) |
| `INFRA-002` | Ansible / SSH | Formalización de política SSH única `accept-new` documentada en playbooks. | #419 (`a434393`) |
| `INFRA-005` | Helm | Soporte condicional de digest inmutable en Postgres, PgBouncer, Redis y Seed Job. | #420 (`8f38ae8`) |
| `INFRA-009` | Ansible / Red | Definición explícita de red del cluster y migración de nodos de laboratorio. | #421 (`2b2c96b`) |
| `GITOPS-005` | CI / Infra | Incorporación del renderizado de `proxmox-preprod` en el pipeline de validación. | #423 (`cd86b5d`) |
| `CI-001` | CI / Impact | Clasificación de `Taskfile.yaml` en el motor de impacto para evitar fail-closed indiscriminado. | #424 (`89584f3`) |
| `INFRA-006` | Monitoreo | Retiro seguro de values de Alloy huérfano sin consumidores. | #425 (`1c9f72a`) |
| `INFRA-008` | OpenTofu | Eliminación de variable huérfana `image_file_id` en módulos OpenTofu. | #426 (`d440b28`) |
| `INFRA-011` | Helm | Documentación y delimitación del rol real de `values.prod.yaml` como perfil de referencia. | #427 (`a500707`) |
| `GITOPS-003` | GitOps | Creación del `README.md` canónico en `gitops/` formalizando la jerarquía de promoción. | #428 (`123f700`) |

### B. Ciclo de Gobernanza de Agentes y Skills (.agents/)

| ID | Área | Descripción y Solución Aplicada | Referencia |
| :--- | :--- | :--- | :--- |
| `AUD-GOV-SKL-001` a `010` | Skills / SSOT | Reconciliación de autoridad SSOT, corrección de motor de impacto en `_shared/change-impact-matrix.md` y eliminación de referencias a `src/`. | Audit 2026-09-30 |
| `REFACTOR-DOC-GOV` | Gobernanza | Consolidación de `repo-doc-governance` eliminando skill redundante y formalizando la regla `.agents/rules/documentation-governance.md`. | #431 (`f09d7ab`) |
| `DEV-CONTAINER-001` | Tooling | Auditoría de `.devcontainer/`: verificación de 0 artefactos huérfanos y suficiencia para desarrollo. | Audit 2026-09-30 |

### C. Ciclo de Higiene Transversal y Superficie de Testing

| Hito | Dominio | Descripción y Solución Aplicada | Referencia |
| :--- | :--- | :--- | :--- |
| Gobernanza de `tmp/` | Higiene | Implementación de política transversal para que todo archivo temporal resida exclusivamente en `tmp/`. | #432 (`a81af2e`) |
| Inventario de Testing | Testing | Creación de motor determinista de inventario y gobierno de testing con 438 casos auditados. | #435 (`3943469`) |

---

## 5. Deuda Técnica Conocida y Próximos Pasos

1. **Unificación de Triggers en Workflows Autónomos:**
   Workflows como `security-trivy.yml` y `web.yml` conservan triggers `pull_request` independientes para escaneos profundos de contenedores y artefactos web que complementan al orquestador central.
2. **Promoción Continua de Releases:**
   Garantizar la preservación de la correspondencia 1:1 en versiones cada vez que se ejecute una promoción mediante `release-tag.yaml`.

---

## 6. Regla de Oro Operativa (AGENTS.md)

> [!IMPORTANT]
> Este documento representa un **snapshot histórico consolidado** al commit `3943469`.
> **NUNCA debe utilizarse para inferir el estado actual, rutas de secretos o configuraciones vigentes.**
> La verdad operativa reside estrictamente en las Fuentes Únicas de Verdad (SSOT): `gitops/`, `infra/`, `docs/architecture/`, `apps/`, `scripts/` y `tests/`.
