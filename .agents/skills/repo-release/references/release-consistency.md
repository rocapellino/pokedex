# Auditoría de Consistencia de Releases y Despliegues (Release & Deployment Consistency)

Este documento define la metodología y los criterios de evaluación para auditar la coherencia a lo largo del pipeline de entrega continua: **`MAIN → RELEASE → GITOPS → RUNTIME`** en `rocapellino/pokedex`.

---

## 1. Objetivo y Principio Rector

Detectar de forma proactiva capacidades, configuraciones y cambios que existen en `main` pero no se encuentran reflejados adecuadamente en releases, manifiestos GitOps o documentación técnica.

> [!IMPORTANT]
> **`MAIN != RELEASE` no es automáticamente un error.** En un modelo de entrega continua basado en GitOps con trunk-based development, es natural y esperado que la rama principal contenga mejoras en desarrollo pendientes de empaquetado. La inconsistencia surge cuando la documentación, las configuraciones o los manifiestos presentan como activa o desplegada una capacidad que todavía no ha sido promocionada.

---

## 2. Matriz de Capacidades (Capability Matrix)

Para cada funcionalidad relevante del repositorio, se evalúa su estado real a través de los cuatro niveles:

| Capability | MAIN | RELEASE | GITOPS | RUNTIME | Estado de Consistencia |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Nombre de la Capacidad** | *PRESENT / ABSENT / ENABLED / DISABLED* | *PRESENT / ABSENT* | *PRESENT / ABSENT / ENABLED / DISABLED* | *OBSERVED / UNKNOWN* | Evaluación de drift o coherencia |

### Definición de Estados

- **`PRESENT`:** El código, script o manifiesto existe en el nivel evaluado.
- **`ABSENT`:** No existe en el nivel evaluado.
- **`ENABLED`:** Declarado con flag de activación activo (`true`).
- **`DISABLED`:** Declarado con flag de activación inactivo (`false`).
- **`UNKNOWN`:** Sin telemetría u observación directa disponible (prohibido inventar estado en RUNTIME).
- **`NOT_APPLICABLE`:** No aplica a ese nivel (ej. un linter de código no corre en ArgoCD ni en Runtime).

---

## 3. Verificaciones de Consistencia Release ↔ GitOps

1. **`targetRevision` de ArgoCD:**
   - Debe apuntar a un Git Tag inmutable existente (`vX.Y.Z`).
   - El tag referenciado debe contener los manifiestos Helm y valores requeridos por la versión declarada.
2. **Paridad de Imágenes y Digests OCI:**
   - El digest declarado en GitOps debe coincidir con la imagen compilada y firmada en el release.
   - En producción, debe cumplirse la paridad 1:1 entre entornos (`AWS == Proxmox == Helm Prod`).
3. **Contratos de Secretos y Configuración:**
   - La clave de Vault o SecretStore apuntada en GitOps (`pokedex/prod`) debe existir en la infraestructura y ser compatible con la versión de la aplicación desplegada.

### 3.1. Desglose Atómico de Supply Chain en RELEASE

Para erradicar la asunción de *"tag existe = todo validado"*, la certificación del nivel `RELEASE` descompone su evaluación en seis comprobaciones independientes:

| Sub-dimensión | Criterio de Verificación | Evidencia Fáctica Requerida |
| :--- | :--- | :--- |
| **`Git Tag`** | Existencia inmutable y firma del tag en Git (`vX.Y.Z`). | `git rev-parse`, `gitsign verify-tag` o firma GPG. Si está *unsigned*, se reporta `WARNING (P2)`. |
| **`OCI Image`** | Existencia del artefacto en GHCR bajo la etiqueta de versión. | Consulta al registry (`ghcr.io/rocapellino/pokedex-api:vX.Y.Z`). |
| **`OCI Digest`** | Presencia de digest inmutable SHA-256 y paridad 1:1 con GitOps. | `npm run gitops:verify-parity:strict`. |
| **`Cosign Signature`** | Firma criptográfica Sigstore en imagen Docker y Helm Chart. | `cosign verify <image>@sha256:...`. |
| **`SBOM`** | SBOM CycloneDX generado y adjunto al digest OCI. | Inspección de capa SBOM en GHCR (`cosign download sbom`). |
| **`SLSA Provenance`** | Atestación *in-toto* de procedencia verificable. | `cosign verify-attestation --type cyclonedx ...`. |

Cada sub-dimensión debe clasificarse estrictamente como `PASS`, `FAIL`, `UNKNOWN` (en caso de no contar con credenciales o conectividad al registry) o `NOT_APPLICABLE`.

---

## 4. Consistencia Documental (Documentation Consistency)

Se auditan afirmaciones en `README.md`, `docs/architecture/` y `docs/operations/`:

- Si la documentación utiliza términos como *"activo"*, *"habilitado"*, *"desplegado"* o *"disponible en producción"*, debe existir evidencia fáctica en `GITOPS` y `RELEASE`.
- Si una capacidad está implementada en `main` pero su release no ha sido promovido a ArgoCD, la documentación debe utilizar estrictamente expresiones precisas:
  - *"implementado en main"*
  - *"pendiente de release"*
  - *"no desplegado aún en producción"*

---

## 5. Chequeo de Preparación para Promoción (Promotion Readiness)

Antes de autorizar la promoción de un nuevo release hacia GitOps, se evalúan 9 dimensiones críticas:

| Dimensión | Estados Posibles | Criterio de Aprobación |
| :--- | :---: | :--- |
| **Release & Tag Consistency** | PASS / WARNING / BLOCKER | El Git Tag existe, es inmutable y tiene notas de versión. Si el tag está *unsigned*, se reporta `WARNING (P2)`. |
| **Code Consistency** | PASS / WARNING / BLOCKER | Working tree limpio, tipos TypeScript verificados (`typecheck`), tests pasando. |
| **Helm Consistency** | PASS / WARNING / BLOCKER | `helm lint` y `helm template` renderizan sin errores sintácticos. |
| **OCI Artifact Consistency** | PASS / WARNING / BLOCKER | Imágenes Docker y Helm Charts publicados en GHCR y firmados con Cosign (`cosign verify`). |
| **Provenance & SBOM Attestation** | PASS / WARNING / BLOCKER | Atestación *in-toto* y SBOM CycloneDX asociados al *digest* OCI verificados (`cosign verify-attestation`). |
| **Secrets Consistency** | PASS / WARNING / BLOCKER | Claves de Vault y ExternalSecrets coinciden con el contrato del nuevo release. |
| **GitOps Consistency** | PASS / WARNING / BLOCKER | Los values por entorno no contienen flags obsoletos o incompatibles. |
| **DR Consistency** | PASS / WARNING / BLOCKER | Procedimientos de backup y restore validados (simulacro o test de restore). |
| **Documentation Consistency** | PASS / WARNING / BLOCKER | Documentación alineada con el estado de la promoción sin falsas afirmaciones. |

---

## 6. Modos de Operación

- **Modo Audit (Lectura):**
  Inspecciona repositorios, tags y manifests, genera la Capability Matrix, detecta inconsistencias y emite hallazgos estructurados sin mutar código de producción ni GitOps.
- **Modo Reconcile (Acción Controlada):**
  1. Identifica inconsistencias.
  2. Genera un plan de cambio formal ([change-plan.md](../../_shared/change-plan.md)).
  3. Aplica los ajustes autorizados (ej. actualizar documentación o alinear values).
  4. Ejecuta pruebas unitarias y Quality Gates.
  5. Ejecuta el Markdown Quality Gate (`npm run lint:md`).
  6. Re-ejecuta la auditoría para certificar la resolución.
