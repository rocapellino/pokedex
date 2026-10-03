# `.agents` — Catálogo de Skills y Flujos de Orquestación

Este directorio contiene las **skills** del agente Antigravity para el repositorio
`rocapellino/pokedex`. Cada skill es una unidad autónoma de instrucciones que cubre
un dominio específico del ciclo de vida del repositorio.

> [!NOTE]
> El idioma operativo de toda comunicación humana es el **español**.
> Los identificadores técnicos, comandos y nombres de archivos permanecen en inglés.
> Referencia: [`_shared/language-policy.md`](skills/_shared/language-policy.md)

## Reglas Transversales de Gobernanza (`.agents/rules/`)

El repositorio establece políticas normativas obligatorias para todos los agentes y flujos en `.agents/rules/`:

- **[`ssot-governance.md`](rules/ssot-governance.md):** Demarcación estricta entre SSOT Actual (`gitops/`, `infra/`, `docs/architecture/`, código) y Evidencia Histórica (`docs/audits/`).
- **[`documentation-governance.md`](rules/documentation-governance.md):** Presupuestos, límites de líneas y contratos declarativos (`README.md` <= 260, `SECURITY.md` <= 180, Markdown Quality Gate).
- **[`repository-hygiene.md`](rules/repository-hygiene.md):** Gobernanza de archivos temporales e higiene del working tree: todos los artefactos efímeros deben residir bajo `<repository-root>/tmp/`, ignorados por Git y sin versionar `.gitkeep`.

---

## Mapa de Skills

| Categoría | Skill | Responsabilidad Principal |
| :--- | :--- | :--- |
| **Core & Lifecycle** | [`repo-context`](skills/repo-context/SKILL.md) | Construir el contexto técnico y operativo antes de cualquier análisis |
| | [`repo-lifecycle`](skills/repo-lifecycle/SKILL.md) | Orquestador maestro del ciclo de vida completo |
| | [`repo-impact`](skills/repo-impact/SKILL.md) | Analizar radio de cambio y dependencias cruzadas |
| | [`repo-audit`](skills/repo-audit/SKILL.md) | Coordinador de auditorías integrales (read-only) |
| **Engineering** | [`repo-quality`](skills/repo-quality/SKILL.md) | Calidad estática, linters y prevención de God Files |
| | [`repo-architecture`](skills/repo-architecture/SKILL.md) | Coherencia de sistema, plataforma y GitOps |
| | [`repo-testing`](skills/repo-testing/SKILL.md) | Pirámide de pruebas, cobertura y valor |
| | [`repo-dependencies`](skills/repo-dependencies/SKILL.md) | Árbol npm, lockfile, CVEs y librerías huérfanas |
| **Delivery & Security** | [`repo-security`](skills/repo-security/SKILL.md) | DevSecOps, secretos, Cilium L7 y supply chain |
| | [`repo-ci`](skills/repo-ci/SKILL.md) | Topología integral de CI/CD (PR ➔ Job ➔ Tool) |
| | [`repo-pr`](skills/repo-pr/SKILL.md) | Preparación, validación y revisión de Pull Requests |
| | [`repo-release`](skills/repo-release/SKILL.md) | Corte de versión y readiness de release |
| **Governance & Maintenance** | [`repo-docs`](skills/repo-docs/SKILL.md) | Integridad documental, contratos y claims verification |
| | [`repo-maintenance`](skills/repo-maintenance/SKILL.md) | Salud periódica, higiene y limpieza segura |
| | [`repo-fix`](skills/repo-fix/SKILL.md) | Ejecución de correcciones con test de regresión previo |
| | [`repo-refactor`](skills/repo-refactor/SKILL.md) | Diseño de cambios incrementales |
| | [`repo-modernize`](skills/repo-modernize/SKILL.md) | Evaluación de modernización tecnológica |
| | [`repo-metrics`](skills/repo-metrics/SKILL.md) | Telemetría auxiliar de evolución técnica |

---

## Flujo 1 — Orquestación Principal (`repo-lifecycle`)

`repo-lifecycle` es el **único orquestador** del ciclo de vida. Las demás skills
son invocadas condicionalmente según el tipo de cambio y el impacto detectado.

> [!IMPORTANT]
> **Frontera de invocación con `repo-audit`.** `repo-audit` es una *superficie de
> invocación* read-only, no un segundo orquestador. `/repo-audit` delega íntegramente en
> el flujo `full-audit` de `repo-lifecycle`, y a su vez `repo-lifecycle` sitúa a
> `repo-audit` como paso ② de su flujo resumido. La entrada es por tanto **mutua** y
> deliberada: existe un único ciclo canónico de ejecución y la etapa ② de ese ciclo se
> implementa como diagnóstico read-only. **No hay recursión**: las 16 etapas del
> `full-audit` no reentran en `repo-audit`.
>
> Para auditar el repositorio, invocar cualquiera de las dos superficies; no ambas de
> forma encadenada.

```mermaid
flowchart TD
    START([Solicitud del usuario]) --> CTX

    CTX["①  repo-context\nConstruir contexto técnico y operativo"]
    CTX --> AUDIT

    AUDIT["②  repo-audit\nDiagnóstico integral o delta del repositorio"]
    AUDIT --> IMPACT

    IMPACT["③  repo-impact\nIdentificar archivos y clasificar radio de cambio"]
    IMPACT --> DISPATCH

    DISPATCH{{"④  Despacho condicional\n(Change Impact Matrix)"}}

    DISPATCH -->|"Backend / Frontend"| QUALITY
    DISPATCH -->|"IaC / GitOps"| ARCH
    DISPATCH -->|"Documentación pura"| DOCS
    DISPATCH -->|"CI/CD workflows"| CI
    DISPATCH -->|"Archivos .ignore"| HYGIENE

    QUALITY["repo-quality\nLint · typecheck · pre-commit"]
    ARCH["repo-architecture\nHelm · GitOps · OpenTofu"]
    DOCS["repo-docs\nIntegridad documental · lint:md"]
    CI["repo-ci\nWorkflows · permisos OIDC"]
    HYGIENE["repo-lifecycle\n(configuration-hygiene)\nAuditoría de archivos *.ignore"]

    QUALITY & ARCH & DOCS & CI & HYGIENE --> SEC

    SEC["repo-security\nSAST · secretos · supply chain · Cilium L7"]
    SEC --> TEST

    TEST["repo-testing\nPirámide de pruebas · cobertura · valor"]
    TEST --> REFACTOR

    REFACTOR["⑤  repo-refactor\nImplementación y refactor incremental\n(si aplica)"]
    REFACTOR --> QGATE

    QGATE["⑥  Quality Gates & Pre-Commit\nrepo-quality · suites técnicas"]
    QGATE --> DOCGOV

    DOCGOV["⑦  Cierre Documental & Gobernanza\nrepo-docs · lint:md"]
    DOCGOV --> PR

    PR["⑧  repo-pr\nPreparación y Gate de Pull Request"]
    PR --> RELEASE

    RELEASE["⑨  repo-release\nCorte y promoción de release\n(si amerita tag)"]
    RELEASE --> MAINT

    MAINT["⑩  repo-maintenance\nRegistro y mantenimiento de backlog"]
    MAINT --> END([Ciclo completado])
```

---

## Flujo 2 — Full-Audit (16 etapas secuenciales)

Cuando se invoca una auditoría integral, `repo-lifecycle` ejecuta de forma
secuencial las 16 etapas canónicas:

```text
PR/repository
 └── 1. inventory (Catálogo de archivos, módulos y artefactos)
      └── 2. code (Calidad estática, modularidad y antipatrones -> repo-quality)
           └── 3. dependencies (Árbol npm, lockfile y licencias -> repo-dependencies)
                └── 4. testing (Pirámide de pruebas, cobertura y valor -> repo-testing)
                     └── 5. security (SAST, secretos, supply chain y K8s -> repo-security)
                          └── 6. infrastructure (Helm, GitOps, Tofu y Ansible -> repo-architecture)
                               └── 7. CI/CD (Workflows, permisos y optimización -> repo-ci)
                                    └── 8. change impact (Matriz de impacto y propagación -> repo-impact)
                                         └── 9. documentation (Integridad, drift y Markdown Gate -> repo-docs)
                                              └── 10. scripts (Utilidades, consumidores y ADR-020 -> repo-maintenance)
                                                   └── 11. configuration hygiene (Auditoría integral de archivos *.ignore)
                                                        └── 12. issues/debt (Deuda técnica consolidada y backlog)
                                                             └── 13. skills (Auditoría de consistencia de skills del agente)
                                                                  └── 14. cleanup (Higiene de artefactos huérfanos o temporales)
                                                                       └── 15. architecture/simplification (Coherencia sistémica)
                                                                            └── 16. consolidated report (Reporte consolidado)
```

---

## Modos de Operación

| Modo | Comando / Contexto | Cuándo Usarlo |
| :--- | :--- | :--- |
| **`full-audit`** | `/repo-lifecycle` o `/repo-audit` | Diagnóstico integral de las 16 etapas. Solo lectura. |
| **`full`** | `/repo-lifecycle full` | Ciclo completo: auditoría ➔ propuesta ➔ implementación ➔ gates ➔ PR. |
| **`fast`** | `/repo-lifecycle fast` | Validación rápida para cambios de bajo impacto (Fast Track). |
| **`change`** | `/repo-lifecycle change` | Modo estándar: análisis de impacto ➔ implementación guiada. |
| **`release`** | `/repo-release` | Corte de versión, validación de paridad de imagen y GitOps. |
| **`maintenance`** | `/repo-maintenance` | Health check periódico, backlog y gobernanza de scripts. |

---

## Matriz de Invocación Rápida

| Si el cambio toca... | Skills principales a invocar |
| :--- | :--- |
| **Backend** (`apps/backend/`) | `repo-context` ➔ `repo-impact` ➔ `repo-quality` ➔ `repo-testing` ➔ `repo-security` |
| **Frontend** (`apps/frontend/`) | `repo-context` ➔ `repo-impact` ➔ `repo-quality` ➔ `repo-testing` |
| **Helm / K8s** (`infra/helm/`, `gitops/`) | `repo-context` ➔ `repo-impact` ➔ `repo-architecture` ➔ `repo-security` |
| **OpenTofu / Ansible** (`infra/`) | `repo-context` ➔ `repo-impact` ➔ `repo-architecture` |
| **CI/CD** (`.github/workflows/`) | `repo-context` ➔ `repo-impact` ➔ `repo-ci` ➔ `repo-security` |
| **Documentación pura** (`docs/`, `*.md`) | `repo-docs` *(Fast Track — no requiere suites técnicas)* |
| **Archivos .ignore** (`.*ignore`) | `repo-lifecycle` *(configuration-hygiene)* ➔ `repo-quality` ➔ `repo-security` |
| **Dependencias** (`package.json`) | `repo-context` ➔ `repo-impact` ➔ `repo-dependencies` ➔ `repo-security` |
| **Nuevo Release** | `repo-release` ➔ `repo-ci` |

---

## Recursos Compartidos (`_shared/`)

Todos los skills consumen los contratos definidos en `_shared/`:

| Archivo | Propósito |
| :--- | :--- |
| [`methodology.md`](skills/_shared/methodology.md) | Ciclo de 8 pasos, Evidence-first, clasificación P0-P3 |
| [`change-impact-matrix.md`](skills/_shared/change-impact-matrix.md) | Cascada de dependencias por tipo de componente |
| [`documentation-impact-matrix.md`](skills/_shared/documentation-impact-matrix.md) | Evaluación de drift entre código y documentación |
| [`state-model.md`](skills/_shared/state-model.md) | Taxonomías de estados por dominio (KEEP, REMOVE, REVIEW…) |
| [`language-policy.md`](skills/_shared/language-policy.md) | Política de idioma: español operativo, inglés técnico |
| [`change-plan.md`](skills/_shared/change-plan.md) | Plantilla de planes de cambio con rollback explícito |
| [`finding.md`](skills/_shared/finding.md) | Formato atómico de hallazgo (P0-P3, evidencia, acción) |
| [`report-template.md`](skills/_shared/report-template.md) | Estructura del reporte consolidado de auditoría |
| [`markdown-quality.md`](skills/_shared/markdown-quality.md) | Markdown Quality Gate — 0 errores `MDxxx` obligatorio |
| [`source-of-truth.md`](skills/_shared/source-of-truth.md) | Jerarquía de fuentes de verdad (SSOT vs. evidencia histórica) |

---

## Guardarraíles Generales

> [!IMPORTANT]
> **Antes de ejecutar cualquier análisis o cambio**, consultar la
> [Change Impact Matrix](skills/_shared/change-impact-matrix.md) para determinar
> qué skills son necesarias. Los cambios puramente documentales aplican
> **Fast Track** (`repo-docs` + `npm run lint:md`).

Las auditorías históricas en `docs/audits/` **nunca** son evidencia del
estado actual. Las SSOT vigentes son `gitops/`, `infra/`, `docs/architecture/`,
`apps/`, `scripts/` y `tests/`. El **Markdown Quality Gate** (`npm run lint:md`)
es obligatorio tras crear o modificar cualquier `.md`; ninguna tarea se considera
terminada con errores `MDxxx` pendientes.
