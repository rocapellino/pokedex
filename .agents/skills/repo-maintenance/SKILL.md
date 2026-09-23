---
name: repo-maintenance
description: Ejecutar un health check periódico y convertir hallazgos en backlog accionable.
---

# repo-maintenance

## Objetivo

Ejecutar controles periódicos de salud técnica (*health checks*), evaluar regresiones respecto al baseline histórico y estructurar los hallazgos en un backlog accionable y priorizado para `rocapellino/pokedex`.

## Alcance y Verificaciones de Dominio

- **Monitoreo de Salud Periódico:** Coordinar subconjuntos de `repo-security`, `repo-dependencies`, `repo-quality`, `repo-ci` y `repo-docs`.
- **Detección de Regresiones:** Comparar el estado actual contra los informes base documentados en `docs/audits/` para identificar reaparición de problemas resueltos o degradación de métricas.
- **Gestión del Backlog Técnico:**
  - Clasificar ítems pendientes según impacto (P0-P3) y esfuerzo.
  - Marcar formalmente hallazgos como cerrados únicamente cuando exista prueba de resolución en código o CI.
  - Reabrir hallazgos históricos si una prueba de regresión falla o un contrato se rompe.
- **Higiene Operacional:** Validar rotación de credenciales, frescura de backups en Google Drive/NAS y estado de certificados TLS.
- **Modo No Intrusivo:** Operación estrictamente analítica y de reporte, sin modificaciones en caliente salvo solicitud expresa.

## Comandos

- `/repo-maintenance`: Health check general y diagnóstico del estado de mantenimiento.
- `/repo-maintenance weekly`: Chequeo rápido semanal enfocado en dependencias, alertas de seguridad y estado de CI.
- `/repo-maintenance monthly`: Evaluación mensual exhaustiva de arquitectura, higiene de Docker/Kubernetes y deuda técnica.
- `/repo-maintenance delta`: Análisis enfocado exclusivamente en las desviaciones respecto al último baseline guardado.

## Formato de Salida y Gobernanza

- **Metodología y Reglas:** Consultar [methodology.md](../_shared/methodology.md) para el orden de fuentes de verdad, el ciclo de 8 pasos y las reglas comunes (Evidence-first, P0-P3, Read-only).
- **Estructura de Hallazgos:** Utilizar el formato atómico definido en [finding.md](../_shared/finding.md).
- **Reporte:** Estructurar el entregable siguiendo [report-template.md](../_shared/report-template.md).
- **Planes de Cambio:** Coordinar acciones correctivas con `repo-impact` utilizando [change-plan.md](../_shared/change-plan.md).
