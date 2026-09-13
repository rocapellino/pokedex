# ADR-008: Seguridad de Cadena de Suministro (Supply Chain), Inmutabilidad de Artefactos y Atestaciones Criptográficas

## Estado

Aceptado

## Contexto

Los vectores de ataque contra la cadena de suministro de software (inyección de dependencias comprometidas, manipulación de imágenes en registros OCI y despliegue de artefactos alterados en tránsito o no trazables al código fuente) constituyen un riesgo crítico en arquitecturas cloud-native y de microservicios.

Para asegurar la plataforma Pokédex ante estos riesgos y garantizar conformidad con estándares internacionales como NIST SP 800-218 (Secure Software Development Framework) y SLSA (Supply-chain Levels for Software Artifacts), se requiere una arquitectura integral que garantice autenticidad, inmutabilidad y no repudio desde el commit hasta el pod en ejecución en Kubernetes.

## Decisión

Se adopta una estrategia de seguridad de cadena de suministro estructurada en cinco pilares complementarios:

1. **Inmutabilidad Criptográfica Estricta (Digest Pinning)**:
   - Toda imagen publicada en GitHub Container Registry (GHCR) es identificada y consumida por su digest criptográfico SHA-256 inmutable (`image@sha256:...`).
   - Se prohíbe de forma taxativa el uso de etiquetas mutables (`:latest`) en manifiestos de producción y charts de Helm, validado automáticamente por políticas de admisión Kyverno (`disallow-latest-tag`) y gates de CI.

2. **Inventario de Dependencias Mandatorio (CycloneDX SBOM)**:
   - Generación automatizada de un Software Bill of Materials (SBOM) en formato estándar CycloneDX mediante escaneo con Trivy en el pipeline de CI (`ci.yml`).
   - El SBOM es auditado como un artefacto obligatorio (*fail-closed*): la ausencia o corrupción del archivo detiene inmediatamente el pipeline antes de la fase de publicación.

3. **Firma Criptográfica Keyless (Sigstore Cosign & GitHub OIDC)**:
   - Las imágenes y los Helm Charts empaquetados como artefactos OCI se firman digitalmente utilizando **Cosign** en modalidad *keyless*.
   - Se elimina la necesidad de almacenar claves privadas de larga duración en secretos de CI, apalancando la identidad criptográfica efímera emitida por el proveedor OIDC de GitHub Actions (`https://token.actions.githubusercontent.com`).

4. **Procedencia y Atestaciones de Compilación (SLSA Nivel 3)**:
   - Generación y publicación de atestaciones de procedencia de compilación (*SLSA Build Provenance Level 3*) mediante `actions/attest-build-provenance`.
   - Se atesta in-toto el archivo SBOM CycloneDX contra el digest inmutable de la imagen, vinculando permanentemente el commit SHA, el workflow de compilación y el repositorio de origen.
   - Verificación criptográfica obligatoria en el pipeline (`cosign verify` y `cosign verify-attestation`) antes de dar por completado el release.

5. **Control de Admisión en Tiempo de Ejecución (Kyverno ClusterPolicy)**:
   - Despliegue de la política declarativa `verify-image-signature` en el clúster Kubernetes.
   - Kyverno intercepta las solicitudes de creación de Pods y valida criptográficamente que la firma provenga de la identidad OIDC autorizada del repositorio `rocapellino/pokedex`.

## Consecuencias

- **Positivas**:
  - Trazabilidad y no repudio absolutos: es posible auditar el código fuente exacto y el pipeline que generaron cada contenedor en producción.
  - Mitigación integral de ataques de sustitución de imágenes (man-in-the-middle, registry poisoning).
  - Cumplimiento verificable con las directrices de ciberseguridad NIST SSDF y SLSA Nivel 3.
  - Cero gestión manual de certificados o claves privadas gracias a Sigstore Keyless.

- **Compensaciones**:
  - Requiere soporte OCI 1.1 o almacenamiento de atestaciones de Sigstore en el registro de artefactos (provisto de forma nativa por GHCR).
  - Incremento marginal en el tiempo de ejecución del workflow de release debido a la firma y atestación de artefactos.
