---
name: repo-metrics
description: Medir evolución técnica sin convertir una métrica en una calificación global.
---

# repo-metrics

## Objetivo

Medir, auditar y documentar la evolución técnica de `rocapellino/pokedex` a lo largo del tiempo, identificando tendencias de deuda técnica, cobertura de pruebas, hotspots y tiempos de entrega sin imponer calificaciones numéricas artificiales o subjetivas.

## Alcance y Verificaciones de Dominio

- **Distribución de Código y Complejidad:**
  - Volumen de líneas de código (LOC) segmentadas por workspace (`apps/backend`, `apps/frontend`, `infra/`, `scripts/`).
  - Detección de funciones y módulos con alta complejidad ciclomática o acoplamiento excesivo.
- **Métricas de Calidad y Pruebas:**
  - Cantidad y tipología de pruebas (unitarias, integración, E2E, seguridad de infraestructura).
  - Cobertura LCOV en componentes críticos (`coverage/lcov.info`).
- **Rendimiento de Pipelines de CI:**
  - Tiempos de ejecución por job en GitHub Actions (`build`, `test`, `lint`, `security-sast`).
  - Tasa de éxito y cuellos de botella en la compilación y test suites.
- **Hotspots de Modificación:** Identificar archivos con alta frecuencia de cambios (*churn*) y correlacionarlos con áreas de mayor incidencia de defectos.
- **Evolución de Deuda Técnica:** Tendencia de hallazgos P0, P1, P2 y P3 a lo largo de los sucesivos baselines en `docs/audits/`.

## Comandos

- `/repo-metrics`: Tablero consolidado de métricas técnicas actuales.
- `/repo-metrics trend`: Comparativa de tendencias históricas contra el baseline previo.
- `/repo-metrics ci`: Análisis de tiempos y fiabilidad de los workflows de integración continua.
- `/repo-metrics debt`: Cuantificación y distribución del inventario de deuda técnica pendiente.

## Formato de Salida y Gobernanza

- **Metodología y Reglas:** Consultar [methodology.md](../_shared/methodology.md) para el orden de fuentes de verdad, el ciclo de 8 pasos y las reglas comunes (Evidence-first, P0-P3, Read-only).
- **Estructura de Hallazgos:** Utilizar el formato atómico definido en [finding.md](../_shared/finding.md).
- **Reporte:** Estructurar el entregable siguiendo [report-template.md](../_shared/report-template.md).
- **Planes de Cambio:** Si las métricas demandan refactors estructurales, articular la propuesta con [change-plan.md](../_shared/change-plan.md).
- **Quality Gate de Markdown:** Todo archivo Markdown generado o modificado (reportes de métricas) debe validarse obligatoriamente con [markdown-quality.md](../_shared/markdown-quality.md) (`npm run lint:md -- <archivos>`), garantizando 0 errores `MDxxx` antes de finalizar.
