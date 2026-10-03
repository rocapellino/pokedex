---
name: repo-impact
description: Fase 2 (Matriz de cambios): radio de impacto, referencias inversas y plan de cambio con gates derivados. Usar antes de modificar archivos, renombrar o eliminar artefactos, o al convertir un hallazgo en trabajo.
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

Aplica el contrato común de [skill-contract.md](../_shared/skill-contract.md): metodología, formato de hallazgos y reporte, Markdown Quality Gate e idioma.

Reglas propias de esta skill:

- **Formato de Salida:** Generar la tabla de impacto para Pull Requests según el contrato [`.github/ci-impact.yaml`](../../../.github/ci-impact.yaml) utilizando [`scripts/detect-change-impact.ts`](../../../scripts/detect-change-impact.ts).
- **Planes de Cambio:** Formalizar siempre el resultado del análisis mediante la plantilla [change-plan.md](../_shared/change-plan.md).
- **Matriz de Impacto:** Consultar [change-impact-matrix.md](../_shared/change-impact-matrix.md) para verificar la cascada obligatoria y los criterios de no-afectación.
- **Modelo de Estados:** Evaluar el impacto transversal en los 4 niveles ([state-model.md](../_shared/state-model.md)): candidato (`main`), release (`tag`), declarado (`gitops`) y observado (`runtime`).
