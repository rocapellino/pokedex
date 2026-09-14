# ADR-017: Control de Admisión con Kyverno ClusterPolicies y Pod Security Standards

## Estado

Aceptado

## Contexto

La plataforma Pokédex despliega sus cargas de trabajo en Kubernetes bajo el principio de
*defense-in-depth*. Las políticas de seguridad declaradas en los manifiestos de Helm
(`securityContext`, `readOnlyRootFilesystem`, `capabilities.drop: [ALL]`) dependen de que los
operadores y desarrolladores respeten dichas especificaciones. Sin un mecanismo de imposición en
tiempo de admisión, un Pod malicioso o mal configurado puede escalar al plano de datos del clúster
incumpliendo estos controles.

Los vectores de riesgo sin control de admisión son:

1. **Deriva de configuración**: Un `Deployment` sin `runAsNonRoot: true` o con
   `privileged: true` puede ser admitido silenciosamente por el API Server, exponiendo el kernel
   del nodo anfitrión a escaladas de privilegios.
2. **Imágenes con etiqueta mutable**: El uso del tag `:latest` impide reproducibilidad y puede
   introducir artefactos no auditados en el clúster.
3. **Firma de imágenes no verificada**: Sin verificación criptográfica de la cadena de suministro,
   un atacante que comprometiera el registro de imágenes (GHCR) podría inyectar una imagen maliciosa.
4. **Ausencia de perfil seccomp**: Sin `seccompProfile: RuntimeDefault`, los contenedores heredan
   la política permisiva `Unconfined`, ampliando la superficie de ataque a nivel de syscall.
5. **Falta de estándar a nivel de namespace**: Los controles dispersos en manifiestos individuales
   no ofrecen garantías *fail-closed*; requieren complementarse con etiquetas PSA
   (*Pod Security Admission*) al nivel del namespace.

## Decisión

Se adopta una arquitectura de control de admisión en tres capas complementarias:

1. **Capa 1 — Pod Security Admission (PSA) del Namespace**:
   - El namespace `pokemon-app` se etiqueta con el nivel `restricted` en las tres modalidades:
     `enforce`, `audit` y `warn` (`namespace-pod-security.yaml`).
   - PSA actúa como primera línea de defensa nativa de Kubernetes sin dependencia de un webhook
     externo, rechazando a nivel del API Server Pods que violen el perfil Restricted.

2. **Capa 2 — ClusterPolicies de Kyverno en modo Enforce**:
   Cuatro `ClusterPolicy` con `validationFailureAction: Enforce` imponen los controles críticos
   en tiempo de admisión mediante webhooks de validación:

   - **`pod-security-standards`** (`infra/k8s/policies/pod-security-standards.yaml`):
     Cinco reglas: `require-run-as-non-root`, `disallow-privileged-containers`,
     `disallow-privilege-escalation`, `require-readonly-rootfs` y `require-drop-all-capabilities`.
   - **`disallow-latest-tag`** (`infra/k8s/policies/disallow-latest-tag.yaml`):
     Prohíbe el tag `:latest` en cualquier imagen de contenedor. Exige digest o semver inmutable.
   - **`require-seccomp-profile`** (`infra/k8s/policies/require-seccomp-profile.yaml`):
     Exige `seccompProfile.type: RuntimeDefault` o `Localhost` para filtrar syscalls peligrosas
     con el perfil de seccomp del runtime del contenedor, cerrando la superficie de ataque a nivel
     de kernel.
   - **`check-pokedex-cosign-signature`** (`infra/k8s/kyverno-cosign-policy.yaml`):
     Política autoritativa en modo `Enforce` que valida la firma Cosign keyless (OIDC + Rekor)
     estrictamente para los artefactos de la aplicación principal (`ghcr.io/rocapellino/pokedex:*`).
     Rechaza en tiempo de admisión cualquier imagen de la app no firmada por el workflow canónico de CI.
   - **`verify-image-signature`** (`infra/k8s/policies/verify-image-signature.yaml`):
     Política complementaria de gobernanza amplia en modo `Audit` sobre todo el registro de la
     organización (`ghcr.io/rocapellino/*`). Proporciona observabilidad de cumplimiento sin bloquear
     cargas auxiliares o en transición, estableciendo una arquitectura clara de dos niveles (Enforce
     para la app de negocio, Audit para el registro general).

3. **Capa 3 — Verificación Automatizada en CI con `kyverno test`**:
   - El workflow `infra.yml` ejecuta `kyverno test` contra las suites de prueba declarativas
     (`infra/k8s/kyverno-test/`) antes de autorizar el merge a `main`.
   - Cada política dispone de su propia suite de prueba con recursos Pod válidos e inválidos que
     validan el comportamiento `pass`/`fail` esperado.

## Consecuencias

- **Positivas**:
  - Imposición *fail-closed* en tiempo de admisión: ningún Pod que viole los controles puede
    ser admitido en el clúster, independientemente del origen del manifiesto.
  - Detección temprana en CI mediante `kyverno test` antes de que los cambios lleguen a producción.
  - Complementación de la defensa en profundidad: PSA (nativa) + Kyverno (webhook) son capas
    independientes que se refuerzan mutuamente.
  - La política de seccomp `RuntimeDefault` activa el filtrado de syscalls mediante seccomp BPF,
    reduciendo la superficie de ataque a nivel del kernel Linux.
  - Integración nativa con la cadena de suministro del ADR-008: la política Cosign extiende
    la verificación SLSA L3 desde el registro hasta el runtime de producción.

- **Compensaciones**:
  - Los webhooks de Kyverno añaden latencia de admisión (típicamente < 100 ms). Un fallo del
    webhook Kyverno con `failurePolicy: Fail` puede bloquear la admisión de Pods críticos.
    Se recomienda mantener réplicas del controlador Kyverno en HA.
  - La política `require-seccomp-profile` requiere que todos los manifiestos Helm declaren
    explícitamente `seccompProfile.type: RuntimeDefault` (ya implementado en `values.yaml`).
  - En entornos de CI/Kind sin Kyverno instalado, las políticas se validan offline con
    `kyverno test`; en producción se despliegan como recursos del clúster.
