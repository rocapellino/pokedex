---
name: repo-pr
description: Preparación, validación y revisión estructurada de Pull Requests.
---

# repo-pr

## Objetivo

Gobernar el ciclo completo de preparación, validación y revisión de Pull Requests (PRs) en `rocapellino/pokedex`. Esta skill actúa como el componente canónico para estructurar la representación final de los cambios, verificar el PR Readiness Gate previo a la apertura o merge, y realizar revisiones de código rigurosas sin duplicar las auditorías técnicas de otras skills.

---

## Alcance y Verificaciones de Dominio

### 1. Consumo Dinámico del PR Template (SSOT)

- Localización en tiempo de ejecución del template oficial del repositorio (prioridad: `.github/pull_request_template.md`).
- Extracción de secciones obligatorias, checklists y campos de texto sin memorizar ni hardcodear la estructura dentro de la skill.
- Mapeo fáctico de cada sección contra la evidencia provista por las skills de dominio.
- Ninguna sección se elimina silenciosamente: las secciones no aplicables se declaran explícitamente como `N/A: <justificación>`.
- Consulta la especificación detallada en [pr-template-policy.md](references/pr-template-policy.md).

### 2. Consumo de Evidencias Técnicas (No Duplicación)

`repo-pr` es un consumidor de evidencias, no una segunda suite de auditoría:

- **Quality Gates y Pre-Commit:** Consume de `repo-quality` los resultados de `npm run lint`, `typecheck` y el estado de los hooks en `.pre-commit-config.yaml` (`EXECUTED_SUCCESS`, `EXECUTED_FAILED`, `NOT_AVAILABLE`, `NOT_APPLICABLE`, `NOT_EXECUTED`).
- **Pruebas y Cobertura:** Consume de `repo-testing` los resultados de `npm test`, `test:coverage`, `test:fuzz` y Playwright E2E.
- **Seguridad y SAST:** Consume de `repo-security` los escaneos de Semgrep, Gitleaks, Trivy y Dependency Review.
- **Cierre Documental:** Consume de `repo-docs` la verificación de drift y la ejecución del Markdown Quality Gate (`0 errores MDxxx`).

### 3. PR Readiness Gate Contractual

Antes de dar por preparado o aprobado un PR, valida los 15 controles del Readiness Gate clasificando cada dimensión en:

- `PASS`: Verificación ejecutada y exitosa con evidencia comprobable.
- `FAIL`: Verificación fallida con errores pendientes de corrección.
- `NOT_APPLICABLE`: Comprobación no aplicable según la matriz de impacto.
- `NOT_EXECUTED`: Comprobación pendiente de ejecución. **Nunca equivale a PASS**.
- `BLOCKED`: Impedimentos estructurales que impiden abrir o procesar el PR.

Consulta los criterios y el checklist en [pr-validation-policy.md](references/pr-validation-policy.md).

### 4. Política Transversal de Idioma

Todo contenido generado para interacción humana debe cumplir estrictamente con [language-policy.md](../_shared/language-policy.md):

- **Español Obligatorio:** Títulos de PR (Conventional Commits con descripción en español), cuerpo de la descripción, resúmenes de impacto, notas explicativas, checklists y comentarios de revisión.
- **Inglés Preservado:** Comandos, rutas de archivos, nombres propios de herramientas (GitHub Actions, Helm, pre-commit, ArgoCD), identificadores de código, endpoints y trazas literales de error.

### 5. Coherencia con el Modelo de Estados

Alineación estricta con los cuatro niveles de [state-model.md](../_shared/state-model.md):

- Un cambio en PR solo afecta al estado candidato (`MAIN`).
- Prohibido describir funcionalidades como "desplegadas en producción" o "activas en runtime" dentro del PR. Utilizar términos precisos: `IMPLEMENTED`, `CONFIGURED` o `PENDIENTE DE RELEASE/GITOPS`.

### 6. Revisión Estructurada de Código

Cuando opera en modo de revisión sobre un PR existente o delta:

- Clasifica las observaciones en **Bloqueantes** (P0/P1 que impiden el merge) y **No Bloqueantes** (P2/P3 sugerencias de mejora o estilo).
- Verifica la higiene del diff: ausencia de archivos no relacionados, limpieza de temporales y consistencia de Conventional Commits.

---

## Comandos

- `/repo-pr`: Orquesta el flujo completo de evaluación y preparación de un PR para el cambio activo.
- `/repo-pr prepare`: Descubre el template real, recopila evidencias y genera el título y descripción canónicos en español.
- `/repo-pr gate`: Evalúa exhaustivamente los 15 puntos del PR Readiness Gate emitiendo el veredicto formal (`PASS`, `FAIL` o `BLOCKED`).
- `/repo-pr review`: Ejecuta una revisión técnica estructurada sobre un diff o PR existente, segregando observaciones P0-P3.
- `/repo-pr security`: Revisión focalizada en seguridad, secretos y permisos mínimos (delega en `repo-security`).
- `/repo-pr architecture`: Revisión de contratos, límites y acoplamiento (delega en `repo-architecture` y `repo-quality`).
- `/repo-pr tests`: Verificación de suficiencia de pruebas automatizadas para el cambio (delega en `repo-testing`).

---

## Referencias Especializadas

- **Descubrimiento y Mapeo del Template:** [references/pr-template-policy.md](references/pr-template-policy.md)
- **Readiness Gate y Consumo de Validaciones:** [references/pr-validation-policy.md](references/pr-validation-policy.md)

---

## Formato de Salida y Gobernanza

- **Metodología y Reglas:** Consultar [methodology.md](../_shared/methodology.md) para el orden de fuentes de verdad, el ciclo de 8 pasos y las reglas comunes (Evidence-first, P0-P3, Read-only).
- **Política de Idioma:** Toda comunicación humana, descripción de PR o comentario de revisión debe redactarse en español conforme a [language-policy.md](../_shared/language-policy.md).
- **Estructura de Hallazgos:** Utilizar el formato atómico definido en [finding.md](../_shared/finding.md).
- **Reporte:** Estructurar los informes de revisión siguiendo [report-template.md](../_shared/report-template.md).
- **Planes de Cambio:** Si la preparación del PR evidencia drift no resuelto, planificarlo mediante [change-plan.md](../_shared/change-plan.md).
- **Quality Gate de Markdown:** Todo archivo Markdown generado o modificado debe validarse obligatoriamente con [markdown-quality.md](../_shared/markdown-quality.md) (`npm run lint:md -- <archivos>`), garantizando 0 errores `MDxxx` antes de finalizar.
