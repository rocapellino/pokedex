# Baseline de Consolidación — Sprint de Topología CI/CD

> **Estado:** Vigente (baseline activo)
> **Fecha de captura:** 2026-09-27
> **Commit:** `0ca719a8c9ccf097c06f5b5a6557417d43c33ee2`
> **Rama:** `fix/ci-gates-dependency-review-y-release-bump`

---

## 1. Identificación de Versión

| Componente | Valor | Fuente de verdad |
| :--- | :--- | :--- |
| `package.json` | `1.84.5` | SSOT de versión de aplicación |
| `infra/helm/pokedex/Chart.yaml` (`version` / `appVersion`) | `1.84.5` | SSOT de empaquetado |
| GitOps `targetRevision` (Proxmox / Pre-Prod / AWS) | `v1.84.5` | SSOT de promoción |
| Último tag alcanzado | `v1.84.6` | `git tag --sort=-v:refname` |

> [!NOTE]
> La alineación entre `package.json`, `Chart.yaml` y los cuatro manifiestos GitOps es **1:1** y está verificada en este baseline.

---

## 2. Superficie del Repositorio

| Métrica | Valor |
| :--- | :--- |
| Workflows en `.github/workflows/` | 16 |
| Scripts en `scripts/` | 16 |
| Skills en `.agents/skills/` | 18 |
| Suites de pruebas (`tests/**/*.test.ts`) | 30 archivos |
| Documentos Markdown | 135 |

---

## 3. Topología de CI Consolidada

El sprint de topología CI/CD estableció un **orquestador central** con decisión única de impacto:

```text
PR / push
   │
   ▼
change-impact.yml  (🎯 Change Impact & Pipeline Orchestrator)
   │  └─ detect-change-impact.ts evalúa .github/ci-impact.yaml
   │
   ├─► ci-core  ──► ci.yml    (Quality Gates, Semgrep, Dependency Review, Trivy, Cosign, SBOM)
   └─► infra    ──► infra.yml (Helm, OpenTofu, Ansible, Kind)
```

Workflows de ejecución **independiente y legítima** (no compiten con el orquestador):
`dr-simulation`, `performance-k6`, `security-dast-zap`, `ghcr-retention`, `release-tag`, `security-linear-sync`, `sonar-linear-sync`, `renovate-linear-sync`.

---

## 4. Hallazgos Cerrados en este Ciclo

| ID | Área | Estado | Evidencia |
| :--- | :--- | :--- | :--- |
| CI-001 | CI/CD | ✅ **CLOSED** | `security-gitleaks.yml` ya no declara `paths-ignore`. Es un *Required Status Check*; si el workflow se omite, GitHub no reporta el check y el merge queda bloqueado en *Expected*. |
| CI-002 | Change Impact | ✅ **CLOSED** | `applyAlwaysTriggers()` implementado en `scripts/detect-change-impact.ts` y aplicado en los 4 caminos de retorno. Un `id` declarado en `always:` sin mapeo lanza error (fail-closed). |
| CI-003 | Change Impact | ✅ **CLOSED** | `linting` y `pr_governance` ahora se exportan a `$GITHUB_OUTPUT` y se coinciden en `change-impact.yml`. |
| CI-006 | Documentación | ✅ **CLOSED** | `lint-markdown.ts` falla ante rutas explícitas inexistentes. El `docs-gate` valida `docs/` completo en vez de rutas fijas. |
| CI-007 | Change Impact | ✅ **CLOSED** | La rama muerta de `linting` (`.github/workflows/**`, ya cubierto por `global` con retorno temprano) fue eliminada. |
| DOC-001 | Documentación | ✅ **CLOSED** | `docs/audits/README.md` ya no declara un baseline de `1.78.x` como vigente. |
| DOC-003 | Documentación | ✅ **CLOSED** | `APPLICATION_LIFECYCLE.md` refleja la topología con orquestador central. |
| SKILL-001 | Skills | ✅ **CLOSED** | `repo-lifecycle/SKILL.md` y `change-impact-matrix.md` alineados con el contrato real. |

---

## 5. Hallazgos Abiertos (deuda conocida)

| ID | Área | Severidad | Descripción |
| :--- | :--- | :--- | :--- |
| CI-004 | CI/CD | 🟠 Media | `change-impact.yml` aún no es *Single Point of Decision* real: `web.yml`, `mega-linter.yml`, `security-trivy.yml`, `security-code-scanning.yml` y `security-gitleaks.yml` conservan triggers `pull_request` propios. Planificado para un PR independiente. |
| CI-005 | CI/CD | 🟠 Media | Trivy se ejecuta en `ci.yml` (`trivy-scan`) y en `security-trivy.yml` (rebuild de backend + frontend), con solapamiento en PRs que tocan `Dockerfile` o `apps/frontend/**`. Planificado para un PR independiente. |
| CI-008 | CI/CD | 🟡 Baja | En `push` a `main` coexisten tres rutas de escaneo (`ci.yml` vía orquestador, `security-trivy.yml` y `security-code-scanning.yml`). |
| DOC-002 | Documentación | 🟠 Media | Este documento es el baseline vigente; los snapshots previos se conservan como evidencia histórica. |
| DOC-004 | Documentación | 🟡 Baja | Los directorios de auditorías previos siguen en el árbol. Su poda es segura: `git log --stat -- docs/audits/` preserva la trazabilidad. |

---

## 6. Regla de Oro

> [!IMPORTANT]
> Este documento es un **snapshot fechado**. NUNCA debe usarse para inferir el estado actual del repositorio.
> Las fuentes de verdad son `gitops/`, `infra/`, `docs/architecture/`, `apps/`, `scripts/`, `tests/` y `.github/`.
