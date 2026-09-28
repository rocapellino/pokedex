# Arquitectura del Flujo de Promoción GitOps y Paridad de Digests

Este documento define la especificación formal del ciclo de vida de promoción de versiones, el desacoplamiento entre compilación y despliegue, y los dos conceptos de paridad de digests en `rocapellino/pokedex`.

---

## 1. Desacoplamiento Arquitectónico: Compilación vs. Despliegue

Bajo el modelo GitOps canónico (ADR-003, ADR-008 y ADR-021), la **fase de compilación y publicación de artefactos** está deliberadamente separada de la **fase de despliegue y promoción**:

```text
Commit en main
     ↓
CI Pipeline (ci.yml)
     ↓
Compilación Docker + Escaneo SAST/SCA
     ↓
Publicación OCI en GHCR
     ↓
Firma Criptográfica Cosign (Keyless)
     ↓
Atestación SBOM CycloneDX + SLSA L3
     ↓
[Artefacto OCI Publicado y Verificado en GHCR]
     │
     │  (Ventana de desacoplamiento controlado)
     ▼
Flujo de Promoción GitOps (Automático o por PR)
     ↓
Actualización declarativa:
  • PR atómico de release: package.json + Chart.yaml + targetRevision
  • Promoción de imagen: api.image.digest en gitops/environments/*/values.yaml
     ↓
Pull Request de Promoción GitOps
     ↓
CI Validation Gate (verify-image-digest-parity.ts --strict)
     ↓
Merge a main
     ↓
ArgoCD detecta el commit del release y sincroniza el clúster
```

---

## 2. Los Dos Conceptos de Paridad de Digests

Para evitar ambigüedades operativas en agentes autónomos, desarrolladores y herramientas de CI, se definen formalmente dos conceptos:

### A. Paridad Interna Inter-Entornos (*Inter-Environment Parity*)

- **Definición:** Garantía matemática de que todos los destinos declarados en GitOps consumen exactamente el mismo artefacto inmutable.
- **Ecuación:**
  $$\text{Digest(AWS)} = \text{Digest(Proxmox)} = \text{Digest(Proxmox Pre-prod)} = \text{Digest(Helm Prod)}$$
- **Mecanismo de Control:** `scripts/verify-image-digest-parity.ts --strict`.
- **Rol en CI:** **Quality Gate obligatorio y bloqueante en cada PR y push a main**. Si alguno de los archivos de values difiere, la integración falla inmediatamente.

### B. Paridad Publicado vs. Desplegado (*Published vs. Deployed Parity*)

- **Definición:** Comparación entre el digest recién generado y publicado en GHCR y el digest actualmente declarado en los manifiestos de GitOps.
- **Ecuación:**
  $$\text{Digest Publicado (GHCR)} \stackrel{?}{=} \text{Digest Declarado (GitOps)}$$
- **Mecanismo de Control:** `scripts/verify-image-digest-parity.ts --published-digest <digest>`.
- **Rol en CI:** **Desacoplado del pipeline de build/release**.
  - No forma parte del gate de publicación de imágenes para evitar el bloqueo circular (*chicken-and-egg problem*): no es posible predecir el digest criptográfico de una imagen antes de construirla, ni es deseable forzar un despliegue automático e incondicional en el mismo commit que compila el código.
  - Se utiliza en herramientas de auditoría, comprobación de drift y como validación final en los PRs de promoción.

---

## 3. Ventana Temporal entre GHCR y GitOps

Una consecuencia directa de este desacoplamiento es la existencia de una ventana temporal donde:

```text
GHCR:    ghcr.io/rocapellino/pokedex-api@sha256:<NUEVO_DIGEST> (ej. v1.75.11)
GitOps:  ghcr.io/rocapellino/pokedex-api@sha256:<DIGEST_ESTABLE> (ej. v1.75.10)
```

> [!NOTE]
> Esta discrepancia temporal **es intencional y deseable**. Garantiza que un artefacto recién publicado atraviese su ciclo de certificación, firma y atestación antes de que GitOps lo promueva al clúster de producción.

---

## 4. El Ciclo de Promoción Canónico (*Promotion Workflow*)

Para garantizar que la promoción no dependa exclusivamente de disciplina manual no controlada, el flujo se formaliza en las siguientes etapas:

1. **Cálculo de Versión y Pull Request de Promoción (`.github/workflows/release-tag.yml`, fase `promote`):**
   - Determina el siguiente tag SemVer (`vX.Y.Z`) mediante un `dry-run` del bump convencional.
   - Sincroniza `package.json` y `package-lock.json` (versión raíz) de forma atómica con `npm version --no-git-tag-version`, y `infra/helm/pokedex/Chart.yaml` con la nueva versión.
   - Ejecuta `scripts/update-gitops-pin.ts --tag=<new_tag>` para fijar el `targetRevision` de las aplicaciones de ArgoCD.
   - Abre (o actualiza) la rama `release/promote-vX.Y.Z` con un único PR atómico. **No crea el tag ni el GitHub Release en esta etapa.**

2. **Actualización Declarativa del Digest:**
   - Para actualizar la imagen que ArgoCD despliega, el workflow o el operador actualiza de forma atómica los archivos de values:
     - `gitops/environments/aws/values.yaml`
     - `gitops/environments/proxmox/values.yaml`
     - `gitops/environments/proxmox-preprod/values.yaml`
     - `infra/helm/pokedex/values.prod.yaml`
   - Comando canónico:

     ```bash
     npm run gitops:verify-parity:strict
     ```

3. **Pull Request de Promoción:**
   - La rama bot `release/promote-vX.Y.Z` abre un único PR contra `main` con metadata de release y manifiestos GitOps.
   - Las reejecuciones actualizan esa rama con `--force-with-lease` y reutilizan el PR abierto, sin generar duplicados.
   - CI ejecuta los gates de seguridad, validando que el nuevo digest satisfaga la paridad 1:1 entre todos los entornos.

4. **Tag y GitHub Release (fase `tag`, tras el merge del PR):**
   - El merge del PR de promoción dispara nuevamente `release-tag.yml`, que detecta la fase `tag` por el mensaje `chore(release): promote`.
   - Verifica la coherencia 1:1: `package.json` == `package-lock.json` (`packages[""].version`) == `Chart.yaml` (`version`/`appVersion`) == `targetRevision` GitOps (gate automático también en `tests/version_consistency.test.ts`).
   - Crea el tag SemVer firmado con Gitsign **sobre el commit de promoción** (`GITHUB_SHA`) y publica el GitHub Release con el changelog.
   - Si el tag ya existe apuntando a otro commit, el workflow falla explícitamente (detección de trazabilidad rota, REL-001).

5. **Sincronización en ArgoCD:**
   - Tras la aprobación y merge del PR, y una vez creado el tag sobre ese commit, ArgoCD detecta la actualización del `targetRevision` y de los values, desplegando la imagen firmada en el runtime de Kubernetes.
