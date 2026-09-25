---
name: repo-lifecycle
description: Orquestador del ciclo de vida completo del repositorio Pokedex.
---

# repo-lifecycle

## Objetivo

Orquestar de extremo a extremo el ciclo de vida de desarrollo, análisis, refactorización, calidad, pruebas, documentación, preparación de Pull Requests y publicación de releases en `rocapellino/pokedex`. Esta skill coordina la invocación condicional de las skills especializadas, evitando redundancias y garantizando cambios verificables y gobernados.

---

## Flujo Conceptual de Orquestación

El ciclo de vida del repositorio sigue una secuencia estricta y desacoplada donde cada skill opera bajo su ámbito de responsabilidad:

```text
               1. repo-context (Construir contexto técnico y operativo)
                               │
                               ▼
               2. repo-audit (Diagnóstico integral o delta)
                               │
                               ▼
               3. repo-impact (Identificar archivos y clasificar radio de cambio)
                               │
                               ▼
               4. Skills Especializadas (Activadas según impacto)
                               │
                               ▼
               5. Implementación / Refactor (repo-refactor si aplica)
                               │
                               ▼
               6. Quality Gates & Pre-Commit (repo-quality & suites técnicas)
                               │
                               ▼
               7. Cierre Documental & Markdown Quality (repo-docs & lint:md)
                               │
                               ▼
               8. Preparación y Gate de Pull Request (repo-pr)
                               │
                               ▼
               9. Corte y Promoción de Release (repo-release, si amerita tag)
                               │
                               ▼
              10. Registro y Mantenimiento de Backlog (repo-maintenance)
```

---

## Despacho Condicional por Tipología de Cambio

No todas las skills son obligatorias para todos los cambios. Las validaciones a ejecutar dependen estrictamente del impacto clasificado en [change-impact-matrix.md](../_shared/change-impact-matrix.md):

### 1. Cambio Backend (`apps/backend/`)

```text
impact ──► testing ──► quality (lint/pre-commit) ──► security (App SAST) ──► architecture ──► docs ──► pr
```

### 2. Cambio Documentación Pura (`docs/`, `*.md`) — Fast Track

```text
impact ──► docs ──► markdown quality gate (0 errores MDxxx) ──► pr
```

*Exento de compilar código, correr tests unitarios de apps o levantar contenedores Docker.*

### 3. Cambio en Workflows de CI/CD (`.github/workflows/`)

```text
impact ──► quality (sintaxis YAML/pre-commit) ──► security (permisos OIDC) ──► ci ──► docs ──► pr
```

### 4. Cambio en Helm / GitOps (`infra/helm/`, `gitops/`)

```text
impact ──► quality ──► security ──► architecture (AST/paridad) ──► release (pinning) ──► docs ──► pr
```

---

## Demarcación Estricta de Responsabilidades

Para evitar duplicaciones y mantener límites arquitectónicos claros:

1. **`repo-lifecycle` (Orquestación):**
   - Decide el flujo y el orden de invocación de las skills.
   - No implementa directamente comprobaciones de código ni linters.
2. **`repo-quality` (Quality Gates Técnicos):**
   - Ejecuta y audita linters (`npm run lint`, `typecheck`), formateo y la inspección/ejecución de [`.pre-commit-config.yaml`](../../.pre-commit-config.yaml).
   - Genera evidencias estructuradas diferenciando `EXECUTED_SUCCESS`, `EXECUTED_FAILED`, `NOT_AVAILABLE`, `NOT_APPLICABLE` o `NOT_EXECUTED`.
3. **`repo-pr` (Preparación y Gate de Pull Request):**
   - Descubre dinámicamente el PR Template real del repositorio ([`.github/pull_request_template.md`](../../.github/pull_request_template.md)).
   - Consume las evidencias generadas por `repo-quality`, `repo-testing`, `repo-security` y `repo-docs`.
   - Redacta el título, descripción y checklists en español ([language-policy.md](../_shared/language-policy.md)).
   - Ejecuta el PR Readiness Gate formal. **No realiza auditorías completas redundantes.**
4. **`repo-docs` (Integridad Documental):**
   - Responsable de verificar la consistencia documental, claims verification y el Markdown Quality Gate (`npm run lint:md`).
5. **`repo-release` (Gobernanza de Release y Promoción):**
   - Gobierna la transición de los cuatro niveles: `MAIN` → `RELEASE` → `GITOPS` → `RUNTIME`.
   - `repo-pr` no asume que la apertura o merge de un PR equivale a la publicación o despliegue de un release.

---

## Reglas de Orquestación y Gobernanza

- **Evitar Redundancia:** No repetir análisis si el árbol de código o configuración relevante no ha cambiado.
- **Precedencia:** Ejecutar siempre `repo-context` antes de invocar análisis especializados.
- **Validación Fáctica:** No considerar una recomendación como resuelta sin evidencia demostrable.
- **Cierre Documental Obligatorio:** Todo cambio debe cerrar su drift documental antes de la preparación del PR.

---

## Modos de Operación

- **Full:** Ciclo completo desde contexto y auditoría integral hasta release y mantenimiento.
- **Fast:** Validación rápida de cambios acotados (`repo-context` + `repo-impact` + gates de dominio).
- **Change:** Modo estándar para desarrollo de features o correcciones de bugs (`repo-impact` + skills de dominio + `repo-pr`).
- **Release:** Preparación formal de corte de versión y actualización GitOps (`repo-release`).
- **Maintenance:** Evaluación periódica de salud, higiene y backlog (`repo-maintenance`).

---

## Referencias Compartidas

- **Metodología Base:** [methodology.md](../_shared/methodology.md)
- **Política de Idioma:** [language-policy.md](../_shared/language-policy.md)
- **Modelo de Estados:** [state-model.md](../_shared/state-model.md)
- **Matriz de Impacto:** [change-impact-matrix.md](../_shared/change-impact-matrix.md)
- **Planes de Cambio:** [change-plan.md](../_shared/change-plan.md)
- **Quality Gate de Markdown:** [markdown-quality.md](../_shared/markdown-quality.md)
