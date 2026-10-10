# Auditoría Integral (`full-audit`) — Baseline 2026-10-09

> **Estado:** Histórico (snapshot inmutable; su frescura se evalúa con `audit-freshness.ts`)
>
> **Fecha de captura:** 2026-10-09
>
> **Commit:** `87d6b51fc8c27b84f210ee703f1759f086cedd16`
>
> **Rama auditada:** `main` (release `v1.107.2`)
>
> [!IMPORTANT]
> Este documento es evidencia histórica del commit auditado. No es SSOT: el estado vigente
> reside en `apps/`, `infra/`, `gitops/`, `scripts/`, `tests/` y `docs/architecture/`.
> El estado de cada hallazgo se sigue fuera del snapshot (issue con título `AUD-*`).

**Repositorio:** `rocapellino/pokedex`
**Contexto Operativo:** Monorepo (`apps/backend`, `apps/frontend`) | Entornos: Kind / Proxmox Pre-prod / Prod Cloud (blueprint)
**Vocabulario de estados:** gates según [state-model.md](../../../.agents/skills/_shared/state-model.md) §3 (`PASS`, `FAIL`, `NOT_EXECUTED`, `CI_REQUIRED`).
**Foco de la sesión:** consolidar el ciclo de auditoría y remediación de `tests/` del 2026-10-09 (plan de mejora, segunda auditoría y reestructura de directorios) y reemplazar al baseline 2026-10-08.

---

## 1. Identificación y Paridad de Versión

| Componente | Valor auditado | Fuente |
| :--- | :--- | :--- |
| `package.json` | `1.107.2` | Versión de aplicación y monorepo |
| `infra/helm/pokedex/Chart.yaml` (`version` / `appVersion`) | `1.107.2` | Empaquetado Helm |
| GitOps `targetRevision` (manifiestos de `gitops/apps/`) | `v1.107.2` | Promoción ArgoCD |
| Último tag | `v1.107.2` | `git describe --tags --abbrev=0` |

Los manifiestos de `gitops/apps/` también contienen dos `targetRevision: main` (aplicaciones que siguen la rama y no una versión), por lo que
`audit-freshness.ts` puede informar `GITOPS_REVISION` aunque los tres valores de versión coincidan. El estado es informativo y no bloqueante.

---

## 2. Resumen Ejecutivo

Los 21 hallazgos del baseline 2026-10-08 permanecen cerrados. Este ciclo añadió y cerró los hallazgos `AUD-TST-*` de `tests/` y un incidente de CI, y
reestructuró el directorio de pruebas. Los informes del ciclo (plan de mejora, remediación, segunda auditoría y su remediación) fueron absorbidos
por este baseline y podados conforme a la política de retención; permanecen consultables en el historial de Git.

- **Total de Hallazgos Abiertos:** 0
- **P0 (Crítico):** 0
- **P1 (Alto):** 0
- **P2 (Medio):** 0
- **P3 (Bajo):** 0

### Gates Automáticos

| Gate | Estado | Evidencia |
| :--- | :--- | :--- |
| `npm run typecheck` | `PASS` | TypeScript compila sin emitir errores |
| `npm run lint` | `PASS` | Biome verifica 272 archivos |
| `npm run docs:validate` | `PASS` | 100% de la gobernanza documental sin drift |
| `npm run lint:ignore` | `PASS` | 7 archivos `.ignore` validados |
| `npm run lint:yaml` | `PASS` | 0 archivos `.yml` (política `.yaml` canónica) |
| `npm run test:surface:check` | `PASS` | Catálogo `test-surface` sincronizado sin drift |
| `npm run nginx:conf:check` | `PASS` | `nginx.conf` sincronizado con la plantilla |
| `npm run gitops:verify-parity` | `PASS` | Paridad de digests entre Cloud GitOps, Proxmox Preprod y Helm Production |
| `npm audit --omit=dev` | `PASS` | 0 vulnerabilidades en dependencias de producción |
| `npm test` (worktree sin `node_modules` propio) | `PASS` / `CI_REQUIRED` | 1.067 tests, 1.065 pasan. Falla `AUD-DEP-ZOD-001`, que depende de las dependencias del repositorio principal y no se cumple en un worktree enlazado por junction; el CI la ejecuta en un checkout completo |

---

## 3. Hallazgos del Ciclo de `tests/` (Estado de Cierre)

| ID | Descripción | Estado | PR |
| :--- | :--- | :--- | :--- |
| `AUD-TST-INT-001` | Integración HTTP de rutas (cobertura de `routes/` 33–66 % a 92–100 %) | `CLOSED` | #694 |
| `AUD-TST-FE-001`, `AUD-TST-FE-002`, `AUD-TST-TIM-001` | Tests de frontend sobre la página real y tiempo determinista | `CLOSED` | #695 |
| `AUD-TST-SNAP-001` | Snapshots nativos de `node:test` en lugar de archivos golden | `CLOSED` | #696 |
| `AUD-TST-CTR-001`, `AUD-TST-RED-001` | Contratos de infraestructura sobre estructura, fase 1 (7 archivos) | `CLOSED` | #697 a #703 |
| `AUD-TST-SRF-001` | Catálogo `test-surface` sin datos volátiles | `CLOSED` | #704 |
| `AUD-TST-CI-001` | Suite ejecutada dos veces (`code-quality` y Sonar) | `ACCEPTED` | Medido; sin cambio |
| `AUD-TST-PERF-001` | Coste de los tests de controladores del frontend | `ACCEPTED` | Medido; sin cambio |
| `AUD-SEC-AI-001` | El fallback local de `generateMockup` no escapaba el prompt | `CLOSED` | #708 |
| `AUD-TST-DUP-002`, `AUD-TST-TIM-002` | Consolidación de tests de sesión e IA, con tiempo simulado | `CLOSED` | #709 |
| `AUD-TST-DB-001` | PostgreSQL y Redis reales en integración (opt-in, activo en CI) | `CLOSED` | #712 |
| `AUD-TST-CTR-002` | Contratos por estructura, fase 2 (8 archivos) | `CLOSED` | #713 a #718, #720, #721 |
| `AUD-TST-DOC-001` | Pauta de contratos sobre documentos Markdown | `CLOSED` | #723 |
| `AUD-TST-DIR-001` | Reestructura de `tests/` en subdirectorios por área y regla escrita en la skill | `CLOSED` | #725, #727, #728, #730 |

Incidente asociado: el job `publish` de `main` falló durante 22 ejecuciones por imports con extensión `.js` en scripts ejecutados con
`--experimental-strip-types`; se corrigió en #705 con el contrato `node_strip_types_entrypoints`.

---

## 4. Revisión por Dimensión (`full-audit`)

| Etapa | Resultado |
| :--- | :--- |
| **1. Inventario y Arquitectura** | Monorepo con backend desacoplado y frontend SPA. Sin hallazgos nuevos. |
| **2. Código y Calidad** | Biome y TypeScript sin errores. Helpers de contrato reutilizables en `tests/helpers/` (`yaml`, `hcl`, `helm-render`, `ansible`, `taskfile`, `argocd`, `services`). |
| **3. Dependencias** | 0 vulnerabilidades en producción. |
| **4. Testing** | 1.067 tests en 146 archivos `.test.ts` y 2 `.spec.ts`. Contratos verificados sobre estructura parseada y comprobados por mutación (ver §5). Integración con servicios reales en CI. |
| **5. Seguridad y DevSecOps** | Sin hallazgos abiertos. Postura de seguridad en `tests/security/`; contratos del repositorio separados en `tests/contracts/`. |
| **6. Infraestructura y GitOps** | Paridad de digests verificada. `tests/gitops/` conserva sus contratos de arquitectura y promoción. |
| **7. CI/CD** | `ci.yaml` levanta PostgreSQL 16 y Redis 7 (por digest, iguales a `docker-compose.yaml`) en `code-quality` y `sonarcloud`. Reglas de impacto en `ci-impact.yaml` para `tests/contracts/**`. |
| **8. Documentación** | `docs:validate` sin drift. `docs/audits/` reducido a un único baseline. |
| **9. Higiene y Gobernanza** | Retención de `docs/audits/` verificable por `doc_governance`. La raíz de `tests/` queda sin archivos de test y la skill `repo-testing` fija la regla. |

---

## 5. Estructura y Calidad de `tests/`

### 5.1 Árbol vigente

| Directorio | Contenido |
| :--- | :--- |
| `unit/`, `integration/`, `frontend/`, `e2e/`, `fuzz/`, `performance/` | Comportamiento de la aplicación, por nivel de la pirámide |
| `security/` | Postura de seguridad del código y la infraestructura (15 archivos de contrato más `app/`) |
| `gitops/`, `ci/` | Paridad GitOps y topología de CI |
| `contracts/adr/`, `app/`, `delivery/`, `governance/`, `observability/` | Contratos del repositorio, agrupados por área (35 archivos desde #725, #727 y #728) |
| `helpers/` | Utilidades compartidas |

### 5.2 Medidas de la remediación

| Medida | Resultado |
| :--- | :--- |
| Cobertura de líneas del backend | 81,3 % a 87,4 % (rutas HTTP) |
| Cobertura con servicios reales | `pokemon.repository.ts` 56,5 % a 97,6 %; `cache.ts` 44,3 % a 87,4 %; `migrate.ts` 66 % a 88,3 % |
| Contratos migrados a estructura | 15 archivos (7 de la fase 1, 8 de la fase 2) |
| Mutaciones aplicadas a esos contratos | 139 (63 y 76); 76 pasaban el test antiguo y ninguna pasa el nuevo |
| Catálogo `test-surface.json` | 328 KB a 120 KB sin datos volátiles; un PR que solo edita un test ya no lo modifica |

### 5.3 Lecciones vigentes

- Una expresión regular sobre texto se satisface con lo que no debe (valores en comentarios, `p(95)<2000`): se verifica la estructura y se prueba la prueba con mutaciones.
- Un job que solo corre al fusionar no está cubierto por el CI de los PR: los contratos que reproducen su ejecución en local son la defensa disponible.
- Un cambio de ruta de un test se rompe en lugares que la búsqueda de texto no ve (expresiones regulares con rutas escapadas): se ejecuta la suite completa antes de dar por buena una reubicación.

---

## 6. Decisiones y Pendientes No Bloqueantes

- **Entrada de `.gitleaks.toml`:** el plan anterior pedía retirar una entrada de allowlist sin efecto; no se verificó cuál en este ciclo.
- **Meta de cobertura de `routes/`:** confirmar el 80 % como gate de CI o fijar otro umbral.
- **Cobertura de scripts operativos** (`k8s-rollout-restart.ts`, `github-security-linear-sync.ts`, `check-ruleset-parity.ts`): fuera del alcance de Sonar (`scripts/**`).
- **Guardia automática de la raíz de `tests/`:** hoy la regla vive solo en la skill; un test de gobernanza podría hacerla cumplir.

---

## 7. Configuration Hygiene

### 1. `.ignore inventory`

- `.dockerignore` (raíz), `.gitignore` (raíz), `.markdownlintignore` (raíz) y `.semgrepignore` (raíz).
- `apps/backend/.dockerignore`, `apps/frontend/.dockerignore` e `infra/helm/pokedex/.helmignore`.

Total de archivos evaluados: 7. `npm run lint:ignore` los valida sin infracciones.

### 2. Obsolete rules

Ninguna reportada por el gate.

### 3. Missing rules

Ninguna reportada por el gate.

### 4. Overbroad rules

No se identificaron patrones que oculten código fuente.

### 5. Security-sensitive exclusions

`.gitignore` y `.dockerignore` mantienen la exclusión de credenciales, certificados y variables de entorno según el gate.

### 6. Cross-configuration consistency

El gate de higiene no reporta divergencias entre los `.dockerignore` de servicios y el raíz.

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

## 8. Checklist de Verificación y Criterios de Aceptación

- [x] **Compilación y Tipado:** `npm run typecheck` en verde.
- [x] **Linters de Código:** `npm run lint` en verde.
- [x] **Gobernanza Documental:** `npm run docs:validate` en verde.
- [x] **Higiene de Configuración:** `npm run lint:ignore` y `npm run lint:yaml` en verde.
- [x] **Paridad GitOps:** `npm run gitops:verify-parity` en verde.
- [x] **Superficie de Pruebas:** `npm run test:surface:check` sincronizado sin drift.
- [x] **Auditoría de Dependencias:** `npm audit --omit=dev` sin vulnerabilidades.
- [ ] **Suite completa en un checkout con dependencias propias:** pendiente al CI (`AUD-DEP-ZOD-001` falla solo en worktree).
