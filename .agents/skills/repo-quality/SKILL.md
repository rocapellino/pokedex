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
- **Complejidad y Acoplamiento:** Detección de módulos sobrecargados (*God files*), funciones de excesiva longitud o lógica profundamente anidada.
- **Manejo Robusto de Errores y Logging:**
  - Registro estructurado con Pino incorporando correlación (`X-Request-Id`).
  - Prohibición estricta de captura silenciosa de excepciones (`catch (e) {}` sin log o manejo).
  - Códigos de estado HTTP semánticos y esquemas de error normalizados.
- **Higiene de Naming y Organización:** Nombres descriptivos, eliminación de código muerto o comentado y consistencia en la estructura de imports.

## Comandos

- `/repo-quality`: Evaluación integral de calidad de código en el monorepo.
- `/repo-quality backend`: Auditoría específica de mantenibilidad y patrones en `apps/backend`.
- `/repo-quality frontend`: Auditoría de componentes, manipulación de DOM y modularidad en `apps/frontend`.
- `/repo-quality hotspots`: Identificación de los archivos con mayor deuda técnica o complejidad.

## Formato de Salida y Gobernanza

- **Metodología y Reglas:** Consultar [methodology.md](../_shared/methodology.md) para el orden de fuentes de verdad, el ciclo de 8 pasos y las reglas comunes (Evidence-first, P0-P3, Read-only).
- **Estructura de Hallazgos:** Utilizar el formato atómico definido en [finding.md](../_shared/finding.md).
- **Reporte:** Estructurar el entregable siguiendo [report-template.md](../_shared/report-template.md).
- **Planes de Cambio:** Planificar las mejoras incrementales mediante [change-plan.md](../_shared/change-plan.md) y coordinar con `repo-refactor`.
