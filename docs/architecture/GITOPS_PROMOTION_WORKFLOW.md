# Arquitectura del Flujo de Promoción GitOps y Paridad de Digests

Este documento define la especificación formal del ciclo de vida de promoción de versiones, el desacoplamiento entre compilación y despliegue, y los dos conceptos de paridad de digests en `rocapellino/pokedex`.

---

## 1. Desacoplamiento Arquitectónico: Compilación vs. Despliegue

Bajo el modelo GitOps canónico (ADR-003 y ADR-008), la **fase de compilación y publicación de artefactos** está deliberadamente separada de la **fase de despliegue y promoción**:

```text
Commit en main
     ↓
CI Pipeline (ci.yaml)
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
  • Promoción de imagen: api.image.digest y web.image.digest en gitops/environments/*/values.yaml
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
  $$\text{Digest(Cloud)} = \text{Digest(Proxmox Pre-prod)} = \text{Digest(Helm Prod)}$$
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

1. **Cálculo de Versión y Pull Request de Promoción (`.github/workflows/release-tag.yaml`, fase `promote`):**
   - Determina el siguiente tag SemVer (`vX.Y.Z`) mediante un `dry-run` del bump convencional.
   - Sincroniza `package.json` y `package-lock.json` (versión raíz) de forma atómica con `npm version --no-git-tag-version`, y `infra/helm/pokedex/Chart.yaml` con la nueva versión.
   - Ejecuta `scripts/update-gitops-pin.ts --tag=<new_tag>` para fijar el `targetRevision` de las aplicaciones de ArgoCD.
   - Fija los digests de las imágenes (etapa 2) en el mismo commit.
   - Abre (o actualiza) la rama `release/promote-vX.Y.Z` con un único PR atómico. **No crea el tag ni el GitHub Release en esta etapa.**

2. **Promoción Automática de Digests de Imagen:**
   - `ci.yaml` publica `ghcr.io/rocapellino/pokedex-api` y `pokedex-web` con el tag del SHA completo de cada commit de `main`, firmadas con Cosign, con SBOM y procedencia SLSA.
   - La fase `promote` (pasos 8a y 8b de `release-tag.yaml`) espera a que ambas imágenes de **su mismo commit** estén publicadas y verifica su firma con la identidad `ci.yaml@refs/heads/main`, la misma que exige Kyverno. Sin imagen firmada no hay PR de promoción.
   - `scripts/update-image-digests.ts --api <digest> --web <digest>` reemplaza el digest de cada componente en:
     - `gitops/environments/cloud/values.yaml`
     - `gitops/environments/proxmox-preprod/values.yaml`
     - `infra/helm/pokedex/values.prod.yaml`
   - El CI del PR de promoción certifica la paridad entre entornos (`tests/contracts/delivery/gitops_image_parity.test.ts`); localmente: `npm run gitops:verify-parity:strict`.

   > [!IMPORTANT]
   > Hasta esta automatización la etapa dependía del operador y nunca se ejecutó: entre el 2026-09-23 y el 2026-10-03 cada release movió versión y `targetRevision` pero desplegó las mismas imágenes, y `ci.yaml` publicaba un repositorio (`ghcr.io/rocapellino/pokedex`) distinto del que GitOps desplegaba.

3. **Pull Request de Promoción:**
   - La rama bot `release/promote-vX.Y.Z` abre un único PR contra `main` con metadata de release y manifiestos GitOps.
   - Las reejecuciones actualizan esa rama con `--force-with-lease` y reutilizan el PR abierto, sin generar duplicados.
   - CI ejecuta los gates de seguridad, validando que el nuevo digest satisfaga la paridad 1:1 entre todos los entornos.

4. **Tag y GitHub Release (fase `tag`, tras el merge del PR):**
   - El merge del PR de promoción dispara nuevamente `release-tag.yaml`, que detecta la fase `tag` por el mensaje `chore(release): promote`.
   - **Verificación previa del binario de Gitsign (SEC-001):** antes de instalar o ejecutar nada, el binario descargado de Sigstore se somete a dos controles independientes:
     1. **Autenticidad:** `cosign verify-blob` contra el bundle de firma keyless publicado por Sigstore (certificado Fulcio + prueba de transparencia en Rekor), validando la identidad exacta `https://github.com/sigstore/gitsign/.github/workflows/release.yml@refs/tags/vX.Y.Z` y el emisor OIDC de GitHub Actions.
     2. **Integridad:** digest SHA-256 fijado en el propio repositorio, contrastado además con el manifiesto `checksums.txt` publicado por Sigstore.

     El binario solo se instala (`sudo install`) y ejecuta si ambos controles pasan; cualquier divergencia aborta el release. El verificador (`sigstore/cosign-installer`) está pinneado por SHA con el mismo control que `ci.yaml` usa para firmar la imagen OCI.
   - **Coherencia versión ↔ digests en runtime:** antes de descargar nada, el propio paso consulta la API de GitHub y contrasta los tres digests fijados contra los que Sigstore publica para `GITSIGN_VERSION`. Esto convierte el error de mantenimiento más probable (subir la versión sin refrescar los digests) en un diagnóstico accionable en lugar de un fallo opaco. Para regenerar los digests se ejecuta el workflow con el input `gitsign_refresh` de `workflow_dispatch`, que imprime el bloque `env:` correcto listo para pegar, sin transcripción manual.
   - Verifica la coherencia 1:1: `package.json` == `package-lock.json` (`packages[""].version`) == `Chart.yaml` (`version`/`appVersion`) == `targetRevision` GitOps (gate automático también en `tests/version_consistency.test.ts`).
   - Crea el tag SemVer firmado con Gitsign **sobre el commit de promoción** (`GITHUB_SHA`) y publica el GitHub Release.
   - El changelog del release lo genera GitHub mediante `generate_release_notes` a partir del `tag_name` (`current_tag`), por lo que siempre corresponde exactamente a la versión publicada. El paso de cálculo de versión (`github-tag-action` en dry-run) se ejecuta **únicamente en la fase `promote`**: en la fase `tag` calcularía la *siguiente* versión sobre el rango de commits del último tag, y usar ese changelog publicaría metadata inconsistente entre el tag y sus notas (REL-003).
   - Si el tag ya existe apuntando a otro commit, el workflow falla explícitamente (detección de trazabilidad rota, REL-001).

5. **Sincronización en ArgoCD:**
   - Tras la aprobación y merge del PR, y una vez creado el tag sobre ese commit, ArgoCD detecta la actualización del `targetRevision` y de los values, desplegando la imagen firmada en el runtime de Kubernetes.
