---
name: repo-quality
description: Mejorar mantenibilidad y calidad del código sin imponer una reescritura.
---

# repo-quality

## Objetivo

Evaluar y elevar la mantenibilidad, legibilidad, robustez y adherencia a estándares de ingeniería en el código fuente de `rocapellino/pokedex`, promoviendo refactorizaciones incrementales y seguras sin requerir reescrituras masivas.

## Alcance y Verificaciones de Dominio

- **Tipado Estricto TypeScript:** Eliminación de tipos `any`, coherencia de genéricos y compilación sin errores (`npm run typecheck`).
- **Arquitectura de Software y Separación de Capas:**
  - En `apps/backend`: Separación clara entre rutas, middlewares, controladores, servicios de dominio, repositorios Drizzle y validadores Zod.
  - En `apps/frontend`: Organización modular en Vanilla TypeScript, separación de UI del estado, encapsulamiento de llamadas API y saneamiento con DOMPurify.
- **Prevención de God Files y Monolitos Relocalizados:** Detección de módulos sobrecargados (*God files*), funciones desproporcionadas y carpetas cajón de sastre sin cohesión (control de regresión histórica estilo `server.ts` 1.178 LOC → 280 LOC).
- **Métricas Estructurales y Acoplamiento:** Evaluación multidimensional de acoplamiento aferente/eferente ($C_a$, $C_e$), índice de inestabilidad ($I$), cohesión (LCOM), complejidad ciclomática y detección de dependencias circulares.
- **Manejo Robusto de Errores y Logging:**
  - Registro estructurado con Pino incorporando correlación (`X-Request-Id`).
  - Prohibición estricta de captura silenciosa de excepciones (`catch (e) {}` sin log o manejo).
  - Códigos de estado HTTP semánticos y esquemas de error normalizados.
- **Gobernanza Dinámica de Pre-Commit y Quality Gates Locales:**
  - Inspección dinámica de configuración: Verificar si existe archivo de configuración de hooks en la raíz del repositorio (`.pre-commit-config.yaml`). Si no existe, clasificar el estado como `NOT_CONFIGURED`.
  - Si existe configuración, parsear dinámicamente los repositorios y hooks declarados en tiempo de ejecución, determinando su aplicabilidad frente a las extensiones y rutas de los archivos modificados en el diff.
  - Verificación de disponibilidad del CLI en el entorno local (`pre-commit --version`). Si el comando no está disponible en el PATH, reportar `NOT_AVAILABLE_LOCAL / CI_REQUIRED` delegando la validación a CI sin registrar falsos fallos locales.
  - Si el CLI está disponible y aplican hooks, ejecutar selectivamente sobre los archivos modificados (`pre-commit run --files <archivos>`).
  - Clasificación fáctica del resultado: `EXECUTED_SUCCESS`, `EXECUTED_FAILED`, `NOT_AVAILABLE_LOCAL / CI_REQUIRED`, `NOT_CONFIGURED`, `NOT_APPLICABLE` o `NOT_EXECUTED`.
  - Principio de complementariedad: `pre-commit` es un control previo local que complementa y no sustituye los pipelines integrales de CI/CD.

## Comandos

- `/repo-quality`: Evaluación integral de calidad y mantenibilidad del código en el monorepo.
- `/repo-quality precommit`: Detección dinámica, auditoría y ejecución selectiva de hooks de pre-commit sobre el diff activo.

- `/repo-quality backend`: Auditoría específica de patrones, middlewares y rutas en `apps/backend`.
- `/repo-quality frontend`: Auditoría de componentes, manipulación de DOM y modularidad en `apps/frontend`.
- `/repo-quality structure`: Evaluación multidimensional de cohesión, acoplamiento ($C_a, C_e, I$) y dependencias circulares.
- `/repo-quality godfiles`: Detección precoz de archivos o módulos con acumulación patológica de responsabilidades.
- `/repo-quality hotspots`: Identificación de los archivos con mayor deuda técnica, complejidad y churn.

## Referencias Especializadas

- **Métricas Estructurales:** [references/structural-metrics.md](references/structural-metrics.md)
- **Acoplamiento y Cohesión:** [references/coupling-and-cohesion.md](references/coupling-and-cohesion.md)
- **Detección de Monolitos:** [references/monolith-detection.md](references/monolith-detection.md)
- **Guías de Refactorización:** [references/refactoring-guidelines.md](references/refactoring-guidelines.md)

## Formato de Salida y Gobernanza

- **Metodología y Reglas:** Consultar [methodology.md](../_shared/methodology.md) para el orden de fuentes de verdad, el ciclo de 8 pasos y las reglas comunes (Evidence-first, P0-P3, Read-only).
- **Estructura de Hallazgos:** Utilizar el formato atómico definido en [finding.md](../_shared/finding.md).
- **Reporte:** Estructurar el entregable siguiendo [report-template.md](../_shared/report-template.md).
- **Planes de Cambio:** Planificar las mejoras incrementales mediante [change-plan.md](../_shared/change-plan.md) y coordinar con `repo-refactor`.
- **Política de Idioma:** Toda comunicación humana, reporte o recomendación generada debe adherirse a [language-policy.md](../_shared/language-policy.md) (comunicación en español, identificadores técnicos en inglés).
- **Quality Gate de Markdown:** Todo archivo Markdown generado o modificado (reportes de calidad, planes) debe validarse obligatoriamente con [markdown-quality.md](../_shared/markdown-quality.md) (`npm run lint:md -- <archivos>`), garantizando 0 errores `MDxxx` antes de finalizar.
