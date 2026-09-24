---
name: repo-lifecycle
description: Orquestador del ciclo de vida completo del repositorio Pokedex.
---

# repo-lifecycle

## Objetivo

Orquestar de extremo a extremo el ciclo de vida de auditoría, análisis, refactorización, pruebas, despliegue y documentación en `rocapellino/pokedex`, coordinando las skills especializadas para evitar análisis redundantes y asegurar cambios verificables.

## Flujo de Orquestación

```text
               1. repo-context (Construir contexto de partida)
                               │
                               ▼
               2. repo-audit (Diagnóstico integral o delta)
                               │
                               ▼
               3. repo-impact (Identificar archivos modificados)
                               │
         ┌─────────────────────┴─────────────────────┐
         ▼                                           ▼
¿Afecta solo Docs / Markdown?              ¿Afecta Código / Infra?
         │                                           │
         ▼                                           ▼
  [Fast Track Docs]                     [Selective Domain Execution]
  - repo-docs (Drift)                   - Engineering (repo-quality / repo-architecture)
  - Markdown Quality Gate               - Delivery (repo-security / repo-ci / repo-release)
         │                              - repo-testing (Suites dirigidas)
         │                                           │
         └─────────────────────┬─────────────────────┘
                               ▼
               4. repo-refactor (Si requiere cambio)
                               │
                               ▼
               5. Conditional Quality Gates (Gating por dominio)
                               │
                               ▼
               6. repo-release (Solo si amerita corte de versión)
                               │
                               ▼
               7. repo-docs (Cierre documental obligatorio)
                               │
                               ▼
               8. repo-maintenance (Registro en backlog / baseline)
```

## Reglas de Orquestación y Gobernanza

- **Evitar Redundancia:** No repetir un análisis si existe un resultado vigente y el árbol de código o configuración relevante no ha cambiado.
- **Precedencia:** Ejecutar siempre `repo-context` antes de invocar análisis especializados.
- **Priorización de Riesgo:** Priorizar mitigaciones de seguridad (`repo-security`), dependencias críticas (`repo-dependencies`) y regresiones operativas antes de tareas de modernización o refactor.
- **Validación Fáctica:** No considerar una recomendación como resuelta hasta que exista evidencia ejecutable en código, pruebas o pipelines de CI.
- **Cierre Documental Obligatorio:** Ningún cambio se considera cerrado si deja drift documental: cada intervención debe señalar los documentos afectados y delegar en `repo-docs` antes de la revisión final.
- **Matriz de Impacto y Gating:** Consultar [change-impact-matrix.md](../_shared/change-impact-matrix.md) para determinar qué skills y quality gates invocar según la tipología del cambio.

## Pipeline de Post-Change Audit (Gating Condicional por Dominio)

Tras cualquier modificación en el repositorio, el orquestador **NO** ejecuta una batería universal a ciegas. En su lugar, aplica el principio de **despacho condicional** consultando la tabla de gating de [`_shared/change-impact-matrix.md`](../_shared/change-impact-matrix.md):

1. **Identificación de Dominio (`repo-impact`):** Clasifica los archivos alterados en uno o más dominios: Backend Core, Frontend SPA, Infraestructura Helm, GitOps Declarativo, Plataforma (Ansible/OpenTofu), CI/CD, Dependencias o Documentación Pura.
2. **Despacho Selectivo de Skills y Gates:**
   - **Documentación Pura (`docs/`, `*.md`):** *Fast Track*. Ejecuta exclusivamente `repo-docs` y el Markdown Quality Gate (`npm run lint:md -- <archivos>`). Se exime de builds, pruebas unitarias y scans de seguridad.
   - **Backend Core (`apps/backend/`):** Ejecuta `repo-quality`, `repo-testing` (`npm run lint`, `npm run build:backend`, `npm test`, `npm run test:fuzz`) y `repo-security` (SAST de aplicación).
   - **Frontend SPA (`apps/frontend/`):** Ejecuta `repo-quality` y `repo-testing` (`npm run build:frontend`, `npm run typecheck`, component tests, E2E Playwright).
   - **Infraestructura Helm (`infra/helm/`):** Ejecuta `repo-architecture` y `repo-security` (`helm lint`, `gitops:verify-parity:strict`, validación AST).
   - **GitOps (`gitops/`):** Ejecuta `repo-architecture` y `repo-release` (`gitops:pin:check`, `gitops:verify-parity:strict`).
   - **Plataforma / Ansible / OpenTofu (`infra/ansible/`, `infra/opentofu/`):** Ejecuta `repo-architecture` y `repo-security` (`secrets:audit-rotation`, linters de IaC).
   - **CI/CD (`.github/workflows/`):** Ejecuta `repo-ci` y `repo-security` (sintaxis YAML, permisos OIDC).
   - **Dependencias (`package.json`, lockfiles):** Ejecuta `repo-dependencies`, `repo-security` y `repo-testing` (`npm audit`, lockfile parity, suite de pruebas).
   - **Corte de Release:** Ejecuta validación integral (`npm run validate`), firma Cosign, SBOM, paridad 1:1 de ArgoCD (`repo-release`).
3. **Cierre Documental y Markdown Quality Gate:** Si cualquier archivo `.md` fue creado o modificado durante el cambio o su documentación, se ejecuta obligatoriamente `npm run lint:md` certificando **0 errores `MDxxx`**.

## Modos de Operación

- **Full:** Ejecución exhaustiva del ciclo completo de vida del repositorio.
- **Fast:** Validación rápida: `repo-context` + `repo-audit` + `repo-security` + `repo-dependencies` + `repo-testing`.
- **Change:** Modo enfocado en cambios: `repo-impact` + skills específicas del dominio afectado + `repo-testing`.
- **Release:** Preparación de release: `repo-security` + `repo-dependencies` + `repo-testing` + `repo-ci` + `repo-release` + `repo-docs`.
- **Maintenance:** Evaluación de salud periódica y delta respecto al último baseline consolidado.

## Referencias Compartidas

- **Metodología Base:** [methodology.md](../_shared/methodology.md)
- **Modelo de Estados:** [state-model.md](../_shared/state-model.md)
- **Matriz de Impacto:** [change-impact-matrix.md](../_shared/change-impact-matrix.md)
- **Planes de Cambio:** [change-plan.md](../_shared/change-plan.md)
- **Quality Gate de Markdown:** [markdown-quality.md](../_shared/markdown-quality.md)
