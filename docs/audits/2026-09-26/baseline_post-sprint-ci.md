# Baseline Post-Sprint CI/CD — Pokédex DevOps Platform

> [!IMPORTANT]
> Este documento es el **snapshot canónico vigente** para el sprint de mejoras CI/CD (hallazgos 1-15).
> Supersede a `full-repository-audit.md` como referencia del estado actual.
> El `full-repository-audit.md` (commit `578a191`) permanece como evidencia histórica inmutable.

---

## Metadatos del Snapshot

| Campo | Valor |
| :--- | :--- |
| **Fecha** | 2026-09-26 (hora local: 22:30 ART) |
| **Commit HEAD** | `fb7ce36` (rama `main`) |
| **Versión del Paquete** | `1.78.3` |
| **ArgoCD targetRevision** | `v1.84.5` (todos los entornos: prod, preprod, cloud) |
| **Baseline anterior** | `full-repository-audit.md` (commit `578a191`, 227 tests) |

---

## Quality Gates — Estado Actual

| Gate | Comando | Resultado |
| :--- | :--- | :--- |
| **Tipado TypeScript** | `npm run typecheck` | ✅ 0 errores |
| **Pruebas automatizadas** | `npm test` | ✅ 264/264 PASS |
| **Fuzzing DAST** | `npm run test:fuzz` | ✅ 7/7 PASS |
| **Vulnerabilidades de dependencias** | `npm audit --omit=dev` | ✅ 0 vulnerabilidades |
| **Configuration Hygiene** | `npm run lint:ignore` | ✅ PASS (6 archivos `.ignore` conformes) |
| **Governance de Scripts** | `npm run governance:audit-scripts` | ✅ 0 scripts ilegítimos |

---

## Inventario del Repositorio

| Métrica | Valor en `578a191` (audit anterior) | Valor en `fb7ce36` (actual) | Delta |
| :--- | ---: | ---: | ---: |
| Archivos totales (excl. `.git`, `node_modules`) | 411 | 491 | +80 |
| Archivos Markdown (`.md`) | — | 137 | — |
| Archivos de tests (`*.test.ts`) | 24 | 29 | +5 |
| Scripts en `scripts/` | 13 | 16 | +3 |
| GitHub Actions workflows | — | 16 | — |
| Skills en `.agents/skills/` | 18 | 19 | +1 |
| Archivos `*.ignore` gobernados | — | 6 | — |
| Archivos en `docs/audits/2026-09-26/` | 4 | 5 | +1 |
| ADRs en `docs/decisions/` | — | 29 (ADR-001 a ADR-029) | — |

---

## Tests — Taxonomía y Distribución

| Suite | Comando | Tests | Estado |
| :--- | :--- | ---: | :--- |
| **Estándar (sin fuzzing)** | `npm test` | 264 | ✅ PASS |
| **Fuzzing DAST** | `npm run test:fuzz` | 7 | ✅ PASS |
| **Total acumulado** | `npm run test:all` | 271 | ✅ PASS |
| **Security & Pentest** | `npm run test:security` | 189 | ✅ PASS |

### Desglose por dominio (contenidos en 264)

| Dominio | Descripción |
| :--- | :--- |
| Unit & Integration (backend) | Auth, Cache, PokemonRepository, API limits, contratos, concurrencia |
| Security contracts | 4 suites temáticas modulares (IaC, supply chain, secrets, pentest) |
| CI Impact | 17 casos de prueba del Change Impact Analysis |
| Configuration Hygiene | Gobernanza documental contractual |
| GitOps | Paridad de digests, contratos de manifiestos |
| Performance | k6 stress test |

---

## CI/CD — Topología Post-Sprint

### Cambios Incorporados (vs. `full-repository-audit.md` en `578a191`)

| Commit | Cambio | Impacto |
| :--- | :--- | :--- |
| `d372533` | Change Impact extendido a workflows de seguridad | Gitleaks, Trivy y MegaLinter condicionados |
| `d295f50` | `validate-iac` particionado en jobs granulares | Helm / K8s / OpenTofu / Ansible / Checkov independientes |
| `e38f90c` | `kind-integration` restringido a `helm\|kubernetes` | Elimina falsos positivos por cambios de backend |
| `da1acf5` | Modelo `security` descompuesto en 6 dimensiones | `secrets`, `sast`, `dependencies`, `container`, `iac`, `supply_chain` |
| `36cdb67` | `repo-ci` evolucionado a topología CI multinivel | Análisis PR→Impact→Workflow→Job→Step→Tool |
| `d2a5636` | `change-impact.yml` como orquestador único | Elimina doble ejecución de `detect-change-impact.ts` |
| `18168db` | Scripts clasificados individualmente en `ci-impact.yaml` | `lint-markdown.ts` vs `k8s-rollout-restart.ts` diferenciados |
| `6ed43d3` | Reglas granulares para `tests/**` y subdominios | `tests/unit` activa backend; `tests/gitops` activa kubernetes |
| `148f406` | Fuzzing desacoplado de `npm test` | Eliminada doble ejecución en CI |
| `fb7ce36` | Baseline de tests actualizado en SSOT arquitectural | `APPLICATION_LIFECYCLE.md` refleja 264+7 tests |

---

## GitOps — Estado Actual

| Entorno | Archivo | targetRevision |
| :--- | :--- | :--- |
| **Producción (Proxmox)** | `gitops/apps/app-proxmox.yaml` | `v1.84.5` |
| **Pre-producción (Proxmox)** | `gitops/apps/app-proxmox-preprod.yaml` | `v1.84.5` |
| **Cloud (AWS EKS)** | `gitops/apps/app-cloud.yaml` | `v1.84.5` |
| **App-of-Apps (root)** | `gitops/apps/root-application.yaml` | `v1.84.5` |

---

## Scripts — Gobernanza (ADR-020)

| Tipo | Cantidad | Conformidad |
| :--- | ---: | :--- |
| TypeScript (`.ts`) | 15 | ✅ Todos en allowlist |
| Shell (`.sh`) | 1 (`dr_verify_restore.sh`) | ✅ Único shell autorizado |
| Imperativos ilegítimos | 0 | ✅ PASS |

---

## Hallazgos del Sprint — Estado de Cierre

| Hallazgo | Severidad | Estado |
| :--- | :--- | :--- |
| Change Impact no controlaba workflows de seguridad | MEDIUM | ✅ Cerrado |
| `infra.yml` ejecutaba Helm+K8s+OpenTofu+Ansible juntos | MEDIUM | ✅ Cerrado |
| `kind-integration` se activaba por cambios de backend | MEDIUM | ✅ Cerrado |
| Modelo de security demasiado grueso (`security: true`) | MEDIUM | ✅ Cerrado |
| `repo-ci` limitado a análisis de workflows | LOW | ✅ Cerrado |
| Doble ejecución de Change Impact en PR | LOW | ✅ Cerrado |
| `scripts/**` clasificado como global en `ci-impact.yaml` | MEDIUM | ✅ Cerrado |
| `tests/**` sin regla explícita en `ci-impact.yaml` | MEDIUM | ✅ Cerrado |
| Fuzzing ejecutado dos veces en CI (`npm test` + `test:fuzz`) | LOW | ✅ Cerrado |
| Baseline de tests desactualizado en SSOT (54 → 264) | LOW | ✅ Cerrado |
| Scripts: gobernanza (KEEP, sin acción requerida) | INFO | ✅ Verificado |
| `docs/README.md` con enlaces rotos a `2026-09-23` | LOW | ✅ Ya corregido |
| `full-repository-audit.md` desactualizado | MEDIUM | ✅ Cerrado — este documento |

---

> [!NOTE]
> Este baseline fue generado según el protocolo `repo-audit` (read-only, evidence-first).
> El estado canónico de arquitectura vigente se especifica en [`docs/architecture/`](../architecture/).
> Consultar el historial de commits para trazabilidad completa de cada hallazgo.
