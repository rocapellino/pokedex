---
name: repo-quality
description: Mejorar mantenibilidad y calidad del código sin imponer una reescritura.
---

# repo-quality

## Objetivo

Mejorar mantenibilidad y calidad del código sin imponer una reescritura.

## Contexto específico de `rocapellino/pokedex`

Esta skill debe asumir como punto de partida un monorepo con:
- `apps/backend` y `apps/frontend`
- Node.js 22 / npm 11 / TypeScript
- Express, Vanilla TypeScript/Vite, PostgreSQL, Redis
- Docker Compose para desarrollo
- Kubernetes + Helm + Kind
- ArgoCD/GitOps
- OpenTofu y Ansible
- GitHub Actions
- seguridad SAST/SCA/secrets/IaC, SBOM y firma de imágenes
- OpenTelemetry/observabilidad
- documentación extensa bajo `docs/`

No asumir que cada componente documentado está vigente: comprobarlo contra el código y configuración actuales.

## Alcance

- TypeScript strict y coherencia de tipos.
- Complejidad, duplicación, funciones/clases grandes, errores silenciosos y acoplamiento.
- Separación de rutas, controladores, servicios, repositorios, validadores y utilidades.
- Consistencia frontend React/TS y backend Express/TS.
- Logging estructurado con Pino, manejo de errores y contratos.
- Configuración, naming, imports, módulos y límites.
- Analizar si lint/typecheck/formatters actuales son suficientes.
- Proponer cambios incrementales y medibles.

## Flujo

1. Ejecutar `repo-context` si el contexto no está disponible.
2. Inspeccionar fuentes de verdad antes de documentación derivada.
3. Comparar estado actual con prácticas aplicables al stack real.
4. Registrar evidencia exacta.
5. Clasificar hallazgos por prioridad, confianza y esfuerzo.
6. Proponer acciones incrementales.
7. Si el usuario pide cambios, generar primero un plan y usar `repo-impact` cuando corresponda.
8. Si el hallazgo o cambio afecta comportamiento documentado (README, `docs/`, ADRs, runbooks), señalar los documentos impactados y delegar en `repo-docs` antes de dar el ciclo por cerrado.

## Comandos

- `/repo-quality`
- `/repo-quality backend`
- `/repo-quality frontend`
- `/repo-quality hotspots`

## Salida mínima

| ID | Área | Hallazgo | Evidencia | Riesgo | Prioridad | Confianza | Esfuerzo | Acción |
|---|---|---|---|---|---|---|---|---|

# Reglas comunes
- Evidence-first: no afirmar algo que no pueda sustentarse en archivos, configuración, ejecución o documentación verificable.
- Separar estado actual, recomendación y decisión.
- No inventar CVEs, versiones, arquitectura, cobertura ni compliance.
- No introducir una herramienta si otra existente ya cubre el objetivo, salvo beneficio demostrado.
- Prioridad: P0 crítico, P1 alto, P2 medio, P3 bajo.
- Confidence: HIGH/MEDIUM/LOW.
- Effort: XS/S/M/L/XL.
- Toda eliminación requiere evidencia de no uso y propuesta reversible.
- Las skills de análisis son read-only salvo que el usuario solicite explícitamente ejecución.
- Para cambios, usar repo-impact -> repo-refactor -> repo-testing -> repo-pr/release.

