---
name: repo-maintenance
description: Ejecutar un health check periódico y convertir hallazgos en backlog accionable.
---

# repo-maintenance

## Objetivo

Ejecutar controles periódicos de salud técnica (*health checks*), evaluar regresiones respecto al baseline histórico y estructurar los hallazgos en un backlog accionable y priorizado para `rocapellino/pokedex`.

## Alcance y Verificaciones de Dominio

- **Monitoreo de Salud Periódico:** Coordinar subconjuntos de `repo-security`, `repo-dependencies`, `repo-quality`, `repo-ci` y `repo-docs`.
- **Detección de Regresiones:** Comparar el estado actual contra los informes base documentados en `docs/audits/` para identificar reaparición de problemas resueltos o degradación de métricas (utilizando `repo-metrics` como soporte de telemetría).
- **Higiene y Limpieza del Repositorio:**
  - **Archivos y Código Huérfano:** Localizar archivos, componentes y utilidades no referenciadas en el monorepo.
  - **Gobernanza de Scripts (ADR-020):** Detectar scripts `.sh` no autorizados (restringidos estrictamente a `scripts/dr_verify_restore.sh`) y asegurar que las tareas se ejecuten mediante TypeScript (`tsx` / Node) o Taskfile.
  - **Higiene de Archivos de Ignorado (`.*ignore`):** Contrastar `.gitignore`, `.dockerignore`, `.helmignore`, etc., contra la estructura real para evitar fuga de artefactos o secretos.
  - **Configuraciones Heredadas / Sustituidas:** Archivos residuales de migraciones pasadas o configs duplicadas entre Compose y K8s/Helm.
  - *(Nota: Para dependencias npm huérfanas, delegar formalmente en `repo-dependencies unused`)*.
- **Gestión del Backlog Técnico:**
  - Clasificar ítems pendientes según impacto (P0-P3) y esfuerzo.
  - Marcar formalmente hallazgos como cerrados únicamente cuando exista prueba de resolución en código o CI.
  - Reabrir hallazgos históricos si una prueba de regresión falla o un contrato se rompe.
- **Higiene Operacional:** Validar rotación de credenciales, frescura de backups en Google Drive/NAS y estado de certificados TLS.
- **Modo No Intrusivo:** Operación estrictamente analítica y de reporte; toda supresión de archivos exige plan de reversibilidad previo.

## Comandos

- `/repo-maintenance`: Health check general y diagnóstico del estado de mantenimiento.
- `/repo-maintenance cleanup`: Diagnóstico y preparación de candidatos de limpieza segura (archivos huérfanos, configs residuales, `.*ignore`).
- `/repo-maintenance scripts`: Auditoría de cumplimiento de la política de scripts (ADR-020).
- `/repo-maintenance weekly`: Chequeo rápido semanal enfocado en dependencias, alertas de seguridad y estado de CI.
- `/repo-maintenance monthly`: Evaluación mensual exhaustiva de arquitectura, higiene de Docker/Kubernetes y deuda técnica.
- `/repo-maintenance delta`: Análisis enfocado exclusivamente en las desviaciones respecto al último baseline guardado.

## Formato de Salida y Gobernanza

- **Metodología y Reglas:** Consultar [methodology.md](../_shared/methodology.md) para el orden de fuentes de verdad, el ciclo de 8 pasos y las reglas comunes (Evidence-first, P0-P3, Read-only).
- **Estructura de Hallazgos:** Utilizar el formato atómico definido en [finding.md](../_shared/finding.md).
- **Reporte:** Estructurar el entregable siguiendo [report-template.md](../_shared/report-template.md).
- **Planes de Cambio:** Coordinar acciones correctivas con `repo-impact` utilizando [change-plan.md](../_shared/change-plan.md).
- **Quality Gate de Markdown:** Todo archivo Markdown generado o modificado (reportes de mantenimiento, backlog) debe validarse obligatoriamente con [markdown-quality.md](../_shared/markdown-quality.md) (`npm run lint:md -- <archivos>`), garantizando 0 errores `MDxxx` antes de finalizar.
