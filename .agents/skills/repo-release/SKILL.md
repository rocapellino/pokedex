---
name: repo-release
description: Verificar readiness y promoción de release (MAIN → RELEASE → GITOPS → RUNTIME) con supply chain. Usar al cortar una versión, promover pines de GitOps o validar un tag.
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
- **Validación de Integridad de Supply Chain (RELEASE):**
  Descompone el nivel `RELEASE` en 6 comprobaciones atómicas e independientes, evaluando cada una estrictamente como `PASS`, `FAIL`, `UNKNOWN` o `NOT_APPLICABLE`:
  1. `Git Tag`: Existencia, inmutabilidad y firma (GPG/SSH/Sigstore; tags *unsigned* catalogados como `P2 / WARNING`).
  2. `OCI Image`: Publicación confirmada de la imagen en GHCR bajo la etiqueta SemVer.
  3. `OCI Digest`: Presencia de digest SHA-256 inmutable y paridad estricta entre Helm y GitOps (`npm run gitops:verify-parity:strict`).
  4. `Cosign Signature`: Firma criptográfica keyless verificada en imagen y Helm Chart (`cosign verify`).
  5. `SBOM`: Existencia de SBOM CycloneDX generado y adjunto al digest OCI como atestación (`cosign verify-attestation --type cyclonedx`).
  6. `SLSA Provenance`: Atestación *in-toto* de procedencia generada y verificable (`gh attestation verify`; el CI hoy no la verifica, por lo que sin verificación manual es `UNKNOWN`).
- **Auditoría de Consistencia de Despliegue (MAIN → RELEASE → GITOPS → RUNTIME):**
  - Mapeo y contraste de capacidades entre estado candidato (`main`), estado promocionable (`git tag`), estado declarado (`gitops/apps/`) y estado observado (`runtime`).
  - Detección de drift entre templates implementados y el `targetRevision` activo en ArgoCD.
  - Verificación de consistencia documental: auditar afirmaciones de "activo" o "desplegado" en runbooks y documentación frente a la evidencia fáctica.
- **Sincronización GitOps (ArgoCD):** Paridad declarativa entre `gitops/apps/` (`pokedex-preprod` operativo; `pokedex-cloud` es el blueprint prod cloud inactivo) y las plantillas base.
- **Readiness de Persistencia:** Revisión de migraciones Drizzle pendientes y validación de compatibilidad hacia atrás para evitar downtime.
- **Procedimientos de Rollback y Runbooks:** Confirmar que los runbooks de contingencia y rollback estén vigentes.

## Comandos

- `/repo-release`: Auditoría completa de preparación de release.
- `/repo-release consistency`: Auditoría de consistencia entre MAIN, RELEASE, GITOPS y RUNTIME.
- `/repo-release matrix`: Generación de la Capability Matrix comparativa.
- `/repo-release dry-run`: Simulación de validación de gates sin realizar cambios ni tags.
- `/repo-release production`: Certificación formal de release para despliegue en producción.

## Formato de Salida y Gobernanza

Aplica el contrato común de [skill-contract.md](../_shared/skill-contract.md): metodología, formato de hallazgos y reporte, Markdown Quality Gate e idioma.

Reglas propias de esta skill:

- **Modelo de Estados:** Consultar [state-model.md](../_shared/state-model.md) para los 4 niveles (`MAIN → RELEASE → GITOPS → RUNTIME`) y los 7 estados de ciclo de vida.
- **Consistencia y Matriz de Capacidades:** Consultar [release-consistency.md](references/release-consistency.md) para la matriz y la lista de chequeo de preparación de promoción.
- **Matriz de Impacto:** Consultar [change-impact-matrix.md](../_shared/change-impact-matrix.md) para evaluar la propagación de cambios.
- **Planes de Cambio:** Formalizar cualquier ajuste pre-release con [change-plan.md](../_shared/change-plan.md).
- **Referencias Externas Aprobadas (AAS):** para control de inmutabilidad y reconciliación GitOps en promoción de versiones, consultar `gitops-workflow` en [aas-references.md](../_shared/aas-references.md).
