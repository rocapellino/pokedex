---
name: repo-lifecycle
description: Orquestador del ciclo de vida completo del repositorio Pokedex.
---

# repo-lifecycle

## Objetivo

Orquestar de extremo a extremo el ciclo de vida de auditoría, análisis, refactorización, pruebas, despliegue y documentación en `rocapellino/pokedex`, coordinando las skills especializadas para evitar análisis redundantes y asegurar cambios verificables.

## Flujo de Orquestación

```text
repo-context
     │
     ▼
repo-audit
     │
     ├──► repo-security
     ├──► repo-dependencies
     ├──► repo-architecture
     ├──► repo-quality
     ├──► repo-testing
     ├──► repo-ci
     ├──► repo-cleanup
     └──► repo-modernize
     │
     ▼
repo-metrics / backlog
     │
     ▼
repo-impact
     │
     ▼
repo-refactor
     │
     ▼
repo-testing
     │
     ▼
repo-pr
     │
     ▼
repo-release
     │
     ▼
repo-docs
     │
     ▼
repo-maintenance
```

## Reglas de Orquestación y Gobernanza

- **Evitar Redundancia:** No repetir un análisis si existe un resultado vigente y el árbol de código o configuración relevante no ha cambiado.
- **Precedencia:** Ejecutar siempre `repo-context` antes de invocar análisis especializados.
- **Priorización de Riesgo:** Priorizar mitigaciones de seguridad (`repo-security`), dependencias críticas (`repo-dependencies`) y regresiones operativas antes de tareas de modernización o refactor.
- **Validación Fáctica:** No considerar una recomendación como resuelta hasta que exista evidencia ejecutable en código, pruebas o pipelines de CI.
- **Cierre Documental Obligatorio:** Ningún cambio se considera cerrado si deja drift documental: cada intervención debe señalar los documentos afectados y delegar en `repo-docs` antes de la revisión final.
- **Matriz de Decisión:** Consultar [references/decision-matrix.md](references/decision-matrix.md) para determinar qué skills invocar según la tipología del cambio.

## Modos de Operación

- **Full:** Ejecución exhaustiva del ciclo completo de vida del repositorio.
- **Fast:** Validación rápida: `repo-context` + `repo-audit` + `repo-security` + `repo-dependencies` + `repo-testing`.
- **Change:** Modo enfocado en cambios: `repo-impact` + skills específicas del dominio afectado + `repo-testing`.
- **Release:** Preparación de release: `repo-security` + `repo-dependencies` + `repo-testing` + `repo-ci` + `repo-release` + `repo-docs`.
- **Maintenance:** Evaluación de salud periódica y delta respecto al último baseline consolidado.

## Referencias Compartidas

- **Metodología Base:** [methodology.md](../_shared/methodology.md)
- **Matriz de Decisión:** [references/decision-matrix.md](references/decision-matrix.md)
- **Planes de Cambio:** [change-plan.md](../_shared/change-plan.md)
- **Quality Gate de Markdown:** [markdown-quality.md](../_shared/markdown-quality.md)
