---
name: repo-modernize
description: Evaluar modernización tecnológica con criterio de costo, riesgo y beneficio. Usar ante propuestas de migrar runtime, frameworks, ingress o tooling, o cuando un componente quede sin soporte upstream.
---

# repo-modernize

## Objetivo

Evaluar objetivamente oportunidades de modernización del stack tecnológico, frameworks, herramientas y dependencias en `rocapellino/pokedex`, aplicando criterios estrictos de retorno de inversión, costo de migración, riesgo operativo y beneficios medibles.

## Alcance y Verificaciones de Dominio

- **Criterio Anti-Hype:** Queda prohibido recomendar migraciones o sustitución de herramientas únicamente por novedad o tendencia. Todo reemplazo debe sustentarse en ventajas funcionales, de seguridad o de rendimiento cuantificables.
- **Runtime y Plataforma:**
  - Evaluación de versiones de Node.js (manteniendo una LTS activa; versión vigente en `.tool-versions`), npm (`packageManager`) y TypeScript.
  - Opciones de orquestación de monorepos y aceleración de builds (esbuild, vite).
- **Herramientas de Validación y Testing:**
  - Modernización de test runners (ej. node:test vs suites legacy).
  - Optimización de linters, formateadores y reglas de compilación estricta (`tsconfig.json`).
- **Infraestructura, Contenedores e IaC:**
  - Oportunidades de optimización en imágenes Docker multi-stage (Alpine, distroless).
  - Capacidades avanzadas de Cilium CNI, Traefik o Helm charts.
- **Análisis Comparativo Cuádruple:**
  - Para cada componente analizado, contrastar las cuatro alternativas: *Mantener*, *Actualizar in-place*, *Reemplazar* o *Eliminar*.
- **Plan de Migración y Rollback:** Toda propuesta aprobada debe incluir estrategia de transición incremental, validación de paridad y plan de marcha atrás.

## Comandos

- `/repo-modernize`: Diagnóstico integral de modernización técnica.
- `/repo-modernize runtime`: Evaluación de Node.js, TypeScript y motores de ejecución.
- `/repo-modernize tooling`: Análisis de compiladores, linters, empaquetadores y scripts de build.
- `/repo-modernize platform`: Oportunidades en Kubernetes, contenedores, Ingress y CI/CD.

## Formato de Salida y Gobernanza

Aplica el contrato común de [skill-contract.md](../_shared/skill-contract.md): metodología, formato de hallazgos y reporte, Markdown Quality Gate e idioma.

Reglas propias de esta skill:

- **Planes de Cambio:** Formalizar toda propuesta de migración tecnológica mediante [change-plan.md](../_shared/change-plan.md).
