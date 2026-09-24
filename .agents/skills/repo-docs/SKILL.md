---
name: repo-docs
description: Mantener documentación útil, coherente y verificable.
---

# repo-docs

## Objetivo

Garantizar que la documentación técnica del repositorio (`README.md`, `docs/architecture/`, `docs/runbooks/`, `docs/decisions/`, etc.) se mantenga precisa, verificable, libre de contradicciones y fiel reflejo del código y la infraestructura real.

## Alcance y Verificaciones de Dominio

- **Detección de Drift Documental:** Contrastar afirmaciones documentadas contra la realidad fáctica de manifests, `package.json`, Dockerfiles, playbooks y scripts.
- **Auditoría de Verificabilidad Fáctica:** Aplicar estrictamente el principio *Código -> Render -> Tests -> Runtime -> Documentación*. Prohibido certificar capacidades basadas únicamente en texto descriptivo. Si un documento afirma que un componente está activo (ej. "PVC backup", "HA", "Reloader"), verificar qué sets de Helm values realmente lo renderizan y cuáles lo tienen inactivo, forzando la corrección del documento para reflejar la realidad granular por entorno.
- **Trazabilidad Arquitectónica y ADRs:** Verificar que las decisiones en `docs/decisions/` concuerden con la arquitectura implementada y señalar aquellas que requieran superseding o enmiendas.
- **Consistencia de Runbooks:** Validar que los procedimientos de despliegue, backup, restauración y rollback contengan rutas existentes, comandos vigentes y parámetros exactos.
- **Unificación y Eliminación de Duplicados:** Evitar la duplicación de guías entre `README.md` y documentos bajo `docs/`, favoreciendo enlaces cruzados y un único Source of Truth (SSOT).
- **Distinción Histórica vs. SSOT:** Los documentos bajo `docs/audits/<fecha>/` son evidencia histórica y registros de diagnósticos pasados, **NO son SSOT**. La arquitectura vigente reside exclusivamente en `docs/architecture/` (contrastada con el código). Marcar o advertir explícitamente secciones obsoletas para que ningún agente las interprete erróneamente como configuraciones vigentes.
- **Cierre Documental en Refactors:** Cuando otra skill o cambio de código altere un contrato o comportamiento, asegurar que los documentos impactados queden actualizados antes de cerrar el ciclo.

## Comandos

- `/repo-docs`: Auditoría completa de coherencia y cobertura documental.
- `/repo-docs drift`: Detección específica de discrepancias entre código fuente y documentación.
- `/repo-docs api`: Verificación de contratos de endpoints, esquemas OpenAPI y DTOs frente a la documentación de API.
- `/repo-docs architecture`: Validación de diagramas, topología de clústeres y documentos de diseño.

## Formato de Salida y Gobernanza

- **Metodología y Reglas:** Consultar [methodology.md](../_shared/methodology.md) para el orden de fuentes de verdad, el ciclo de 8 pasos y las reglas comunes (Evidence-first, P0-P3, Read-only).
- **Estructura de Hallazgos:** Utilizar el formato atómico definido en [finding.md](../_shared/finding.md).
- **Reporte:** Estructurar el entregable siguiendo [report-template.md](../_shared/report-template.md).
- **Planes de Cambio:** Si se requiere una reestructuración documental masiva, modelar el cambio con [change-plan.md](../_shared/change-plan.md).
- **Quality Gate de Markdown:** Todo archivo Markdown generado o modificado debe validarse obligatoriamente con [markdown-quality.md](../_shared/markdown-quality.md) (`npm run lint:md -- <archivos>`), garantizando 0 errores `MDxxx` antes de finalizar.
