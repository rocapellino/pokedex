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
     ├──► repo-architecture ──► architecture-structure-audit
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
architecture-structure-audit (Post-Refactor Quality Gate / Anti-Regression)
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

## Pipeline de Post-Change Audit (9 Pasos)

Tras cualquier modificación relevante en el repositorio (código, infraestructura, manifiestos o dependencias), el orquestador ejecuta conceptualmente la siguiente secuencia de validación sin omitir pasos:

1. **Tests:** Suite completa de pruebas unitarias, integración y persistencia (`npm test`).
2. **Lint:** Verificación estricta de tipos y linting estático (`npm run lint`).
3. **Security:** SAST (Semgrep), escaneo de secretos (Gitleaks) y verificación de egress L7 Anti-SSRF (`repo-security`).
4. **Architecture Audit:** Detección de acoplamiento, God Files o Monolith Relocated (`architecture-structure-audit`).
5. **Dependency Audit:** Auditoría de vulnerabilidades en dependencias y paridad de lockfiles (`repo-dependencies`).
6. **GitOps Consistency:** Paridad de digests entre entornos (`verify-image-digest-parity.ts`) y validación de templates Helm.
7. **Release Consistency:** Verificación de `targetRevision` en ArgoCD frente a tags existentes y capability matrix (`repo-release`).
8. **Documentation Consistency:** Detección de drift documental y alineación terminológica con el modelo de estados (`repo-docs`).
9. **Markdown Quality Gate:** Validación estricta con markdownlint (`npm run lint:md`) certificando 0 errores `MDxxx`.

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
- **Matriz de Decisión:** [references/decision-matrix.md](references/decision-matrix.md)
- **Planes de Cambio:** [change-plan.md](../_shared/change-plan.md)
- **Quality Gate de Markdown:** [markdown-quality.md](../_shared/markdown-quality.md)
