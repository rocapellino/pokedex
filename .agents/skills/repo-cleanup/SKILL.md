---
name: repo-cleanup
description: Identificar y preparar limpieza segura del repositorio.
---

# repo-cleanup

## Objetivo

Identificar, auditar y preparar la limpieza segura y reversible de artefactos huérfanos, scripts obsoletos, configuraciones heredadas y documentación redundante en `rocapellino/pokedex`.

## Alcance y Verificaciones de Dominio

- **Archivos y Código Huérfano:** Localizar archivos, componentes y utilidades no referenciadas en el monorepo.
- **Gobernanza de Scripts (ADR-020):** Detectar scripts `.sh` no autorizados (restringidos estrictamente a `scripts/dr_verify_restore.sh`) y asegurar que las tareas se ejecuten mediante TypeScript (`tsx` / Node) o Taskfile.
- **Configuraciones Heredadas / Sustituidas:**
  - Archivos remanentes de migraciones anteriores (ej. configs residuales de Terraform tras migrar a OpenTofu).
  - Configuraciones duplicadas entre Docker Compose y K8s/Helm.
- **Higiene de Archivos de Ignorado (`.*ignore`):** Contrastar `.gitignore`, `.dockerignore`, `.helmignore`, etc., contra la estructura real para asegurar que no se filtren artefactos (`dist`, `coverage`, `.turbo`, logs) ni secretos.
- **Dependencias No Utilizadas:** Identificar paquetes npm obsoletos o sin imports activos mediante análisis estático.
- **Documentación Obsoleta:** Señalar documentos en `docs/` que hagan referencia a componentes eliminados o arquitecturas abandonadas.
- **Procedimiento de Eliminación Segura:** Toda eliminación es precedida por un reporte de impacto, confirmación de cero dependencias cruzadas y estrategia de reversibilidad.

## Comandos

- `/repo-cleanup`: Diagnóstico integral de candidatos de limpieza en todo el repositorio.
- `/repo-cleanup candidates`: Lista detallada de archivos, scripts y dependencias huérfanas con evidencia de no uso.
- `/repo-cleanup docs`: Auditoría enfocada en documentación obsoleta o desincronizada.
- `/repo-cleanup scripts`: Auditoría de cumplimiento de la política de scripts (ADR-020).

## Formato de Salida y Gobernanza

- **Metodología y Reglas:** Consultar [methodology.md](../_shared/methodology.md) para el orden de fuentes de verdad, el ciclo de 8 pasos y las reglas comunes (Evidence-first, P0-P3, Read-only).
- **Estructura de Hallazgos:** Utilizar el formato atómico definido en [finding.md](../_shared/finding.md).
- **Reporte:** Estructurar el entregable siguiendo [report-template.md](../_shared/report-template.md).
- **Planes de Cambio:** Toda propuesta de supresión requiere documentar el plan de reversibilidad mediante [change-plan.md](../_shared/change-plan.md) y validación previa con `repo-impact`.
