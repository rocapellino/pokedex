---
name: repo-pr
description: Revisión estructurada de Pull Requests.
---

# repo-pr

## Objetivo

Realizar revisiones de código estructuradas, rigurosas y exhaustivas sobre Pull Requests (PRs), ramas o deltas de código en `rocapellino/pokedex`, asegurando que no se introduzcan regresiones funcionales, riesgos de seguridad ni drift arquitectónico o documental.

## Alcance y Verificaciones de Dominio

- **Correctitud y Lógica de Negocio:** Validación de algoritmos, manejo de errores asíncronos y robustez en la API Express y frontend.
- **Cobertura y Pruebas Obligatorias:** Exigir que todo cambio de lógica cuente con pruebas automatizadas que cubran tanto el camino feliz como condiciones de borde o fallo.
- **Seguridad en el Cambio:**
  - Ausencia de secretos expuestos, tokens o variables de entorno confidenciales en el diff.
  - Validación estricta con Zod en endpoints nuevos o modificados.
  - Revisión de permisos mínimos si el PR altera `.github/workflows/`.
- **Integridad de Infraestructura y GitOps:** Verificar que cambios en `infra/` o `gitops/` preserven OCI digest pinning, namespaces canónicos (`pokemon-app`) y contratos de External Secrets.
- **Segregación de Observaciones:** Distinguir claramente entre observaciones **Bloqueantes** (P0/P1 que impiden el merge) y **No Bloqueantes** (P2/P3 sugerencias o mejoras cosméticas).
- **Cierre Documental del PR:** Comprobar que cualquier alteración de configuración o flujo esté documentada en los runbooks o ADRs correspondientes.

## Comandos y Delegación por Dominio

Para evitar análisis redundantes, `repo-pr` delega en `repo-impact` para identificar el radio de cambio del diff y activar selectivamente las skills de dominio correspondientes según [change-impact-matrix.md](../_shared/change-impact-matrix.md):

- `/repo-pr`: Orquesta la revisión completa, invocando `repo-impact` para clasificar el diff y ejecutando los quality gates requeridos.
- `/repo-pr security`: Enfoque prioritario en seguridad de código, permisos y secretos (delega en `repo-security`).
- `/repo-pr architecture`: Revisión de acoplamiento, contratos y coherencia del monorepo (delega en `repo-architecture` y `repo-quality`).
- `/repo-pr tests`: Verificación de suficiencia, calidad y ejecución de tests para el diff (delega en `repo-testing`).

## Formato de Salida y Gobernanza

- **Metodología y Reglas:** Consultar [methodology.md](../_shared/methodology.md) para el orden de fuentes de verdad, el ciclo de 8 pasos y las reglas comunes (Evidence-first, P0-P3, Read-only).
- **Estructura de Hallazgos:** Utilizar el formato atómico definido en [finding.md](../_shared/finding.md).
- **Reporte:** Estructurar el entregable siguiendo [report-template.md](../_shared/report-template.md).
- **Planes de Cambio:** Si el PR requiere una reestructuración profunda, definirla mediante [change-plan.md](../_shared/change-plan.md).
- **Quality Gate de Markdown:** Todo archivo Markdown generado o modificado (revisiones de PR) debe validarse obligatoriamente con [markdown-quality.md](../_shared/markdown-quality.md) (`npm run lint:md -- <archivos>`), garantizando 0 errores `MDxxx` antes de finalizar.
