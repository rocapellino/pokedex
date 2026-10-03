---
name: repo-metrics
description: Telemetría auxiliar de evolución técnica (LOC, churn, cobertura, tiempos de CI) sin calificaciones globales. Usar cuando se pidan métricas o tendencias, o como soporte de repo-maintenance y repo-quality hotspots.
---

# repo-metrics

## Objetivo

Medir, auditar y documentar la evolución técnica de `rocapellino/pokedex` a lo largo del tiempo, identificando tendencias de deuda técnica, cobertura de pruebas, hotspots y tiempos de entrega sin imponer calificaciones numéricas artificiales o subjetivas.

## Rol Arquitectónico (Telemetría Auxiliar)

`repo-metrics` opera como un módulo analítico **auxiliar** y de sólo lectura. No constituye un paso bloqueante ni secuencial obligatorio en el flujo estándar de `repo-lifecycle`. Su función principal es proveer soporte de telemetría a `repo-maintenance` (salud periódica y baselines), a `repo-quality hotspots` (complejidad y churn) y a reportes ejecutivos bajo demanda.

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

Aplica el contrato común de [skill-contract.md](../_shared/skill-contract.md): metodología, formato de hallazgos y reporte, Markdown Quality Gate e idioma.

Reglas propias de esta skill:

- **Planes de Cambio:** Si las métricas demandan refactors estructurales, articular la propuesta con [change-plan.md](../_shared/change-plan.md).
