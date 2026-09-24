---
name: repo-release
description: Verificación de readiness antes de release.
---

# repo-release

## Objetivo

Verificar exhaustivamente los criterios de preparación y *readiness* operacional antes de autorizar un release, etiquetado (*tagging*) o despliegue a producción en `rocapellino/pokedex`.

## Alcance y Verificaciones de Dominio

- **Semántica de Versiones y Changelog:** Coherencia de tags semver (`vX.Y.Z`) en `package.json`, Helm `Chart.yaml` y actualización del historial de cambios.
- **Estado del Árbol Git:** Verificar que el working tree esté limpio, sin archivos sin rastrear ni commits no integrados.
- **Gates de Calidad y Seguridad Bloqueantes:**
  - Compilación limpia (`npm run build`).
  - Cero vulnerabilidades críticas o altas no remediadas (SCA / SAST).
  - 100% de tests unitarios, de integración y seguridad pasando (`npm test`).
- **Validación de Artefactos e Inmutabilidad:**
  - Existencia de SBOM CycloneDX generado.
  - Firma criptográfica Cosign y atestación SLSA Provenance.
  - OCI digest pinning verificado y consistente entre Helm y GitOps (`npm run gitops:verify-parity:strict`).
- **Auditoría de Consistencia de Despliegue (MAIN → RELEASE → GITOPS → RUNTIME):**
  - Mapeo y contraste de capacidades entre estado candidato (`main`), estado promocionable (`git tag`), estado declarado (`gitops/apps/`) y estado observado (`runtime`).
  - Detección de drift entre templates implementados y el `targetRevision` activo en ArgoCD.
  - Verificación de consistencia documental: auditar afirmaciones de "activo" o "desplegado" en runbooks y documentación frente a la evidencia fáctica.
- **Sincronización GitOps (ArgoCD):** Paridad declarativa entre `gitops/apps/` (`pokedex-preprod`, `pokedex-proxmox`, `pokedex-cloud`) y las plantillas base.
- **Readiness de Persistencia:** Revisión de migraciones Drizzle pendientes y validación de compatibilidad hacia atrás para evitar downtime.
- **Procedimientos de Rollback y Runbooks:** Confirmar que los runbooks de contingencia y rollback estén vigentes.

## Comandos

- `/repo-release`: Auditoría completa de preparación de release.
- `/repo-release consistency`: Auditoría de consistencia entre MAIN, RELEASE, GITOPS y RUNTIME.
- `/repo-release matrix`: Generación de la Capability Matrix comparativa.
- `/repo-release dry-run`: Simulación de validación de gates sin realizar cambios ni tags.
- `/repo-release production`: Certificación formal de release para despliegue en producción.

## Formato de Salida y Gobernanza

- **Metodología y Reglas:** Consultar [methodology.md](../_shared/methodology.md) para el orden de fuentes de verdad, el ciclo de 8 pasos y las reglas comunes (Evidence-first, P0-P3, Read-only).
- **Modelo de Estados:** Consultar [state-model.md](../_shared/state-model.md) para los 4 niveles (`MAIN → RELEASE → GITOPS → RUNTIME`) y los 7 estados de ciclo de vida.
- **Consistencia y Matriz de Capacidades:** Consultar [release-consistency.md](references/release-consistency.md) para la matriz y la lista de chequeo de preparación de promoción.
- **Matriz de Impacto:** Consultar [change-impact-matrix.md](../_shared/change-impact-matrix.md) para evaluar la propagación de cambios.
- **Estructura de Hallazgos:** Utilizar el formato atómico definido en [finding.md](../_shared/finding.md).
- **Reporte:** Estructurar el entregable siguiendo [report-template.md](../_shared/report-template.md) en `docs/audits/<fecha>/release/release-deployment-consistency.md`.
- **Planes de Cambio:** Formalizar cualquier ajuste pre-release con [change-plan.md](../_shared/change-plan.md).
- **Quality Gate de Markdown:** Todo archivo Markdown generado o modificado (reportes de readiness) debe validarse obligatoriamente con [markdown-quality.md](../_shared/markdown-quality.md) (`npm run lint:md -- <archivos>`), garantizando 0 errores `MDxxx` antes de finalizar.
