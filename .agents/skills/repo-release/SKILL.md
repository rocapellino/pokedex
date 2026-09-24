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
- **Sincronización GitOps (ArgoCD):** Paridad declarativa entre `gitops/apps/` (`pokedex-preprod`, `pokedex-proxmox`, `pokedex-cloud`) y las plantillas base.
- **Readiness de Persistencia:** Revisión de migraciones Drizzle pendientes y validación de compatibilidad hacia atrás para evitar downtime.
- **Procedimientos de Rollback y Runbooks:** Confirmar que los runbooks de contingencia y rollback estén vigentes.

## Comandos

- `/repo-release`: Auditoría completa de preparación de release.
- `/repo-release dry-run`: Simulación de validación de gates sin realizar cambios ni tags.
- `/repo-release production`: Certificación formal de release para despliegue en producción.

## Formato de Salida y Gobernanza

- **Metodología y Reglas:** Consultar [methodology.md](../_shared/methodology.md) para el orden de fuentes de verdad, el ciclo de 8 pasos y las reglas comunes (Evidence-first, P0-P3, Read-only).
- **Estructura de Hallazgos:** Utilizar el formato atómico definido en [finding.md](../_shared/finding.md).
- **Reporte:** Estructurar el entregable siguiendo [report-template.md](../_shared/report-template.md).
- **Planes de Cambio:** Formalizar cualquier ajuste pre-release con [change-plan.md](../_shared/change-plan.md).
- **Quality Gate de Markdown:** Todo archivo Markdown generado o modificado (reportes de readiness) debe validarse obligatoriamente con [markdown-quality.md](../_shared/markdown-quality.md) (`npm run lint:md -- <archivos>`), garantizando 0 errores `MDxxx` antes de finalizar.
