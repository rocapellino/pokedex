---
name: repo-pr
description: Preparación, validación y revisión estructurada de Pull Requests.
---

# repo-pr

## Objetivo

Actuar como el agregador canónico de evidencias, evaluador del PR Readiness Gate y generador estructurado de Pull Requests (PRs) en `rocapellino/pokedex`. Esta skill no orquesta auditorías ni ejecuta suites de prueba por su cuenta; consume los resultados fácticos provistos por las skills de dominio (`repo-quality`, `repo-testing`, `repo-security`, `repo-docs`) bajo la orquestación de `repo-lifecycle`, estructurando la representación final del cambio y ejecutando revisiones de código rigurosas.

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

- **Quality Gates y Pre-Commit:** Consume de `repo-quality` los resultados de `npm run lint`, `typecheck` y el estado de `pre-commit` evaluado dinámicamente (`EXECUTED_SUCCESS`, `EXECUTED_FAILED`, `NOT_AVAILABLE_LOCAL / CI_REQUIRED`, `NOT_CONFIGURED`, `NOT_APPLICABLE`).
- **Pruebas y Cobertura:** Consume de `repo-testing` los resultados de `npm test`, `test:coverage`, `test:fuzz` y Playwright E2E.
- **Seguridad y SAST:** Consume de `repo-security` los escaneos de Semgrep, Gitleaks, Trivy y Dependency Review.
- **Cierre Documental y Gobernanza:** Consume de `repo-doc-governance` y `repo-docs` la verificación de límites, presupuesto y deriva (0 hallazgos `CRITICAL` o `HIGH`), la ausencia de referencias huérfanas o componentes retirados y la ejecución del Markdown Quality Gate (`0 errores MDxxx`).

### 3. PR Readiness Gate Contractual

Antes de dar por preparado o aprobado un PR, valida los controles del Readiness Gate distinguiendo formalmente tres niveles:

- **PR Preparation State (Estado de Preparación Local):**
  - `READY_FOR_PR`: Diff higiénico, template completado con evidencia fáctica, gates locales aprobados o declarados formalmente (`CI_REQUIRED` / `NOT_APPLICABLE`), sin bloqueos P0/P1 técnicos ni documentales.
  - `NOT_READY`: Faltan verificaciones locales aplicables, documentación incompleta o fallos pendientes de resolver.
  - `BLOCKED`: Impedimentos estructurales que impiden abrir o procesar el PR (divergencia de rama base, template ausente, drift arquitectónico crítico).
- **CI State (Estado de Integración Continua):**
  - `PENDING_CI`: PR abierto en `READY_FOR_PR`; workflows remotos en GitHub Actions pendientes o en ejecución.
  - `ALL_GATES_PASSED`: 100% de los checks requeridos en CI concluidos con éxito.
  - `CI_FAILED`: Al menos un workflow requerido falló en CI.
- **Individual Gate (Control Individual de Validación):**
  - `PASS`: Comprobación ejecutada y aprobada con evidencia fáctica comprobable.
  - `FAIL`: Comprobación ejecutada con fallos no resueltos.
  - `NOT_APPLICABLE`: Comprobación no aplicable según la matriz de impacto.
  - `NOT_EXECUTED`: Comprobación aplicable que no fue ejecutada. **Nunca equivale a PASS**.
  - `CI_REQUIRED`: Herramienta no disponible localmente; delegada obligatoriamente a CI.

> [!IMPORTANT]
> **Regla de Integridad de Gates:** Queda terminantemente prohibido convertir `CI_REQUIRED` o `NOT_EXECUTED` en `PASS`.

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

- `/repo-pr`: Consolida evidencias de las skills de dominio, evalúa el PR Readiness Gate y genera la propuesta canónica de PR.
- `/repo-pr prepare`: Descubre el template real, recopila evidencias preexistentes y genera el título y descripción canónicos en español.
- `/repo-pr gate`: Evalúa exhaustivamente los controles del PR Readiness Gate a partir de las evidencias recolectadas, emitiendo el veredicto formal de preparación (`READY_FOR_PR`, `NOT_READY` o `BLOCKED`).
- `/repo-pr review`: Ejecuta una revisión técnica estructurada sobre un diff o PR existente, segregando observaciones P0-P3.

---

## Referencias Especializadas

- **Descubrimiento y Mapeo del Template:** [references/pr-template-policy.md](references/pr-template-policy.md)
- **Readiness Gate y Consumo de Validaciones:** [references/pr-validation-policy.md](references/pr-validation-policy.md)

---

## Formato de Salida y Gobernanza

- **Regla Cardenal:** Una auditoría histórica nunca puede utilizarse como evidencia del estado actual del repositorio.
- **Metodología y Reglas:** Consultar [methodology.md](../_shared/methodology.md) para el orden de fuentes de verdad, el ciclo de 8 pasos y las reglas comunes (Evidence-first, P0-P3, Read-only).
- **Estructura de Hallazgos:** Utilizar el formato atómico definido en [finding.md](../_shared/finding.md).
- **Reporte:** Estructurar los informes de revisión siguiendo [report-template.md](../_shared/report-template.md).
- **Planes de Cambio:** Si la preparación del PR evidencia drift no resuelto, planificarlo mediante [change-plan.md](../_shared/change-plan.md).
- **Quality Gate de Markdown:** Todo archivo Markdown generado o modificado debe validarse obligatoriamente con [markdown-quality.md](../_shared/markdown-quality.md) (`npm run lint:md -- <archivos>`), garantizando 0 errores `MDxxx` antes de finalizar.
