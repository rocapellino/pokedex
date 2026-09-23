---
name: repo-pr
description: Revisión estructurada de Pull Requests.
---

# repo-pr

## Objetivo

Revisión estructurada de Pull Requests.

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

- Correctitud, arquitectura, seguridad, pruebas, dependencias, CI/CD, observabilidad y documentación.
- Detectar cambios fuera de alcance.
- Separar blocking/non-blocking.
- Verificar que tests cubran el comportamiento cambiado.
- Revisar permisos y workflows si cambia .github.
- Revisar Helm/K8s/OpenTofu/Ansible si cambia infraestructura.
- No aprobar por defecto: entregar evidencia y preguntas concretas.

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

- `/repo-pr`
- `/repo-pr security`
- `/repo-pr architecture`
- `/repo-pr tests`

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

