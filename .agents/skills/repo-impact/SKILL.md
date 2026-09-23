---
name: repo-impact
description: Analizar impacto antes de implementar un cambio.
---

# repo-impact

## Objetivo

Analizar de forma exhaustiva, en modo de sólo lectura, el radio de impacto, dependencias cruzadas, riesgos de regresión y consecuencias arquitectónicas de cualquier cambio propuesto antes de su implementación en `rocapellino/pokedex`.

## Alcance y Verificaciones de Dominio

- **Mapeo de Referencias:** Rastrear dependencias directas e indirectas de los archivos o símbolos a modificar (imports, re-exports, llamadas a funciones y tipos).
- **Contratos de API y Frontend:** Evaluar si las modificaciones en rutas, esquemas Zod o DTOs del backend impactan al cliente frontend (`apps/frontend`).
- **Persistencia y Base de Datos:** Detectar si el cambio requiere migraciones Drizzle, alteración de esquemas PostgreSQL o invalidación de cachés Redis.
- **Infraestructura y GitOps:** Evaluar si el cambio impacta valores Helm, variables de entorno, plantillas de ArgoCD o configuraciones de OpenTofu/Ansible.
- **Suites de Pruebas Afectadas:** Identificar con precisión qué tests unitarios, de integración o de seguridad deben ejecutarse o actualizarse.
- **Pipelines y Gates de CI/CD:** Determinar si se afectan jobs de GitHub Actions, secretos de CI o políticas de calidad.
- **Diseño del Plan de Cambio:** Generar un plan secuencial, de bajo acoplamiento y con estrategia de rollback explícita.

## Comandos

- `/repo-impact <cambio>`: Análisis integral de impacto para un cambio o requerimiento específico.
- `/repo-impact file`: Análisis enfocado en la modificación o supresión de un archivo determinado.
- `/repo-impact dependency`: Evaluación del impacto de agregar, actualizar o remover una dependencia.
- `/repo-impact api`: Análisis de compatibilidad hacia atrás ante modificaciones en endpoints o DTOs.

## Formato de Salida y Gobernanza

- **Metodología y Reglas:** Consultar [methodology.md](../_shared/methodology.md) para el orden de fuentes de verdad, el ciclo de 8 pasos y las reglas comunes (Evidence-first, P0-P3, Read-only).
- **Estructura de Hallazgos:** Utilizar el formato atómico definido en [finding.md](../_shared/finding.md).
- **Reporte:** Estructurar el entregable siguiendo [report-template.md](../_shared/report-template.md).
- **Planes de Cambio:** Formalizar siempre el resultado del análisis mediante la plantilla [change-plan.md](../_shared/change-plan.md).
