---
name: repo-ci
description: Optimizar el pipeline de integración y entrega sin duplicar validaciones.
---

# repo-ci

## Objetivo

Optimizar el pipeline de integración y entrega continua (CI/CD) de GitHub Actions, asegurando máxima velocidad, determinismo y seguridad sin duplicar ejecuciones ni sobrecargar los runners.

## Alcance y Verificaciones de Dominio

- **Auditoría de Workflows:** Mapeo de flujos activos (`ci.yml`, `infra.yml`, `security-dast-zap.yml`, `performance-k6.yml`, `dr-simulation.yml`, `security-linear-sync.yml`).
- **Eliminación de Redundancias:** Detectar validaciones duplicadas entre workflows principales y auxiliares.
- **Topología de Jobs:** Segmentación eficiente entre validaciones rápidas (lint, typecheck, tests unitarios) y validaciones pesadas (Kind K8s, DAST, k6).
- **Seguridad en CI:**
  - Aplicación de permisos de menor privilegio (`permissions:` mínimos explícitos por job).
  - Pinning estricto de GitHub Actions por SHA de commit o versiones inmutables.
  - Gestión segura de secretos y mitigación de riesgos en PRs de forks.
- **Eficiencia y Concurrencia:** Grupos de concurrencia (`concurrency: cancel-in-progress`), estrategias de caché de dependencias npm y Docker layer caching.
- **Gates de Calidad:** Definir qué validaciones son bloqueantes obligatorias para Pull Requests frente a tareas programadas o post-merge.
- **Artefactos y Supply Chain:** Generación de SBOM CycloneDX, firma Cosign, atestación SLSA y preservación de logs y reportes.

## Comandos

- `/repo-ci`: Diagnóstico integral de la infraestructura de CI/CD.
- `/repo-ci pr`: Evaluación de los flujos y gates que validan Pull Requests.
- `/repo-ci security`: Análisis de permisos, exposición de secretos y hardening de runners.
- `/repo-ci optimization`: Estrategias para reducir tiempos de build, mejorar cache y concurrencia.

## Formato de Salida y Gobernanza

- **Metodología y Reglas:** Consultar [methodology.md](../_shared/methodology.md) para el orden de fuentes de verdad, el ciclo de 8 pasos y las reglas comunes (Evidence-first, P0-P3, Read-only).
- **Estructura de Hallazgos:** Utilizar el formato atómico definido en [finding.md](../_shared/finding.md).
- **Reporte:** Estructurar el entregable siguiendo [report-template.md](../_shared/report-template.md).
- **Planes de Cambio:** Si se solicitan cambios en `.github/workflows/`, modelar la propuesta con [change-plan.md](../_shared/change-plan.md) y validar con `repo-impact`.
