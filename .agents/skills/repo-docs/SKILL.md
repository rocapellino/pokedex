---
name: repo-docs
description: Mantener documentación útil, coherente y verificable.
---

# repo-docs

## Objetivo

Garantizar que la documentación técnica del repositorio (`README.md`, `docs/architecture/`, `docs/runbooks/`, `docs/decisions/`, etc.) se mantenga precisa, verificable, libre de contradicciones y fiel reflejo del código y la infraestructura real.

## Alcance y Verificaciones de Dominio

- **Auditoría de Drift Documental (Documentation Drift Audit):**
  - Detección de las 4 categorías críticas: `STALE DOCUMENTATION`, `MISSING DOCUMENTATION`, `CONTRADICTORY DOCUMENTATION` y `STATE MISREPRESENTATION`.
  - Extracción y validación de afirmaciones verificables (*Document Claims*): `CLAIM → SSOT → CURRENT EVIDENCE → RESULT`.
  - Clasificación en los 8 estados canónicos: `CURRENT`, `STALE`, `CONTRADICTED`, `MISSING`, `HISTORICAL`, `UNKNOWN`, `NOT_APPLICABLE`, `PENDING_PROMOTION`.
- **Gobernanza de Decisiones Arquitectónicas (ADR Drift):**
  - Detección de divergencias entre decisiones formalizadas (`docs/decisions/ADR-*.md`) y el código/infraestructura activo en `main`.
  - Prohibición estricta de modificación automática de ADRs: todo desfasaje se marca como `ADR REVIEW REQUIRED` para evaluación y enmienda formal.
- **Trazabilidad y Runbooks:** Validar que los procedimientos de despliegue, backup, restauración y rollback contengan rutas existentes, comandos vigentes y parámetros exactos.
- **Consistencia de Estados (MAIN → RELEASE → GITOPS → RUNTIME):**
  - Auditar afirmaciones terminológicas como *"activo"*, *"habilitado"*, *"desplegado"* o *"disponible en producción"* contrastándolas con [state-model.md](../_shared/state-model.md).
  - Prohibido afirmar que una capacidad está activa en producción si solo existe como código en `main` o si el `targetRevision` de ArgoCD apunta a un release previo que carece de ella.
  - Exigir terminología rigurosa: *"implementado en main"*, *"pendiente de release"* o *"no desplegado aún en producción"*.
- **Cierre Documental en Refactors:** Cuando otra skill o cambio de código altere un contrato o comportamiento, asegurar que los documentos impactados queden actualizados antes de cerrar el ciclo.

## Comandos

- `/repo-docs`: Auditoría completa de coherencia y cobertura documental.
- `/repo-docs drift`: Detección específica de discrepancias semánticas y temporales entre código fuente y documentación.
- `/repo-docs claims`: Extracción y verificación fáctica de afirmaciones individuales frente al SSOT.
- `/repo-docs adr`: Auditoría de vigencia y consistencia de ADRs frente a la implementación.
- `/repo-docs api`: Verificación de contratos de endpoints, esquemas OpenAPI y DTOs frente a la documentación de API.
- `/repo-docs architecture`: Validación de diagramas, topología de clústeres y documentos de diseño.

## Formato de Salida y Gobernanza

- **Metodología y Reglas:** Consultar [methodology.md](../_shared/methodology.md) para el orden de fuentes de verdad, el ciclo de 8 pasos y las reglas comunes (Evidence-first, P0-P3, Read-only).
- **Registro de Fuentes de Verdad:** Consultar [source-of-truth.md](../_shared/source-of-truth.md) para la tabla de autoridad formal por tipo de información.
- **Matriz de Impacto en Documentación:** Consultar [documentation-impact-matrix.md](../_shared/documentation-impact-matrix.md) para relacionar cambios en código con documentos a revisar.
- **Metodología de Drift y Claims:** Consultar [documentation-drift.md](references/documentation-drift.md) para el flujo de extracción y clasificación.
- **Estructura de Hallazgos:** Utilizar el formato atómico definido en [finding.md](../_shared/finding.md).
- **Reporte:** Estructurar el entregable en `docs/audits/<fecha>/documentation/documentation-consistency.md` siguiendo [report-template.md](../_shared/report-template.md).
- **Planes de Cambio:** Si se requiere actualización documental, modelar el cambio con [change-plan.md](../_shared/change-plan.md).
- **Quality Gate de Markdown:** Todo archivo Markdown generado o modificado debe validarse obligatoriamente con [markdown-quality.md](../_shared/markdown-quality.md) (`npm run lint:md -- <archivos>`), garantizando 0 errores `MDxxx` antes de finalizar.
