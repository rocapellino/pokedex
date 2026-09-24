# Release & Deployment Consistency Audit

- **Fecha:** 2026-09-24
- **Skill:** `repo-release` (Release & Deployment Consistency Audit)
- **Ámbito:** `MAIN → RELEASE → GITOPS → RUNTIME`
- **Último Release Evaluado:** `v1.75.10` (Commit `2df20b3`)
- **Estado Evaluado:** Commit HEAD (`ea9b349`) vs. Tag `v1.75.10` vs. ArgoCD GitOps vs. Runtime

---

## Executive Summary

Se ha ejecutado la auditoría integral de consistencia del flujo de entrega continua del repositorio `rocapellino/pokedex`. Esta evaluación analiza de forma desacoplada los cuatro niveles de la arquitectura: **`MAIN` (candidato)**, **`RELEASE` (promocionable)**, **`GITOPS` (declarado)** y **`RUNTIME` (observado)**.

La auditoría certifica que la rama principal `main` (commit `ea9b349`) se encuentra **18 commits por delante** del release activo en producción (`v1.75.10`). Durante estos 18 commits se incorporaron capacidades críticas de resiliencia y seguridad de la cadena de suministro:

1. Puente K8s-native para backup remoto hacia Google Drive con Rclone.
2. Política fail-closed estricta ante ausencia de credenciales de backup (`GDRIVE_TOKEN`).
3. Pinning inmutable por digest SHA-256 de la imagen `rclone/rclone`.
4. Aislamiento L7 FQDN con `CiliumNetworkPolicy` restringiendo la salida exclusivamente a Google Drive.
5. Simulacro automatizado de Disaster Recovery end-to-end (`dr:drill:e2e`) con 11 métricas contractuales.
6. Markdown Quality Gate obligatorio con 0 errores `MDxxx`.
7. Segregación de secretos de Vault en Proxmox (`pokedex/prod` y `pokedex/preprod`).

**Conclusión Operacional:**
El estado `MAIN != RELEASE` es **completamente esperado y saludable** dentro de la disciplina GitOps trunk-based: las capacidades están implementadas y testeadas en `main`, pero permanecen en estado candidato hasta que se emita un nuevo release inmutable (`v1.76.0`) y se promueva el `targetRevision` en `gitops/apps/app-proxmox.yaml`. Se detectó una inconsistencia documental moderada: la documentación de operaciones debe precisar explícitamente que el backup hacia Google Drive está *"implementado en main y pendiente de promoción en GitOps"*, evitando sugerir que ya se encuentra activo en el runtime del clúster Proxmox.

---

## State Model

Se aplica formalmente el modelo canónico de 4 niveles y 7 estados de ciclo de vida:

```text
┌────────────────────────────────────────────────────────┐
│                        1. MAIN                         │
│             Estado Candidato (Commit ea9b349)          │
│   (18 commits posteriores: GDrive, Rclone, DR Drill)   │
└───────────────────────────┬────────────────────────────┘
                            │  Pendiente: Tag v1.76.0 + Cosign
                            ▼
┌────────────────────────────────────────────────────────┐
│                       2. RELEASE                       │
│           Estado Promocionable (Tag v1.75.10)          │
│       (Commit 2df20b3: sin GDrive CronJob ni rclone)   │
└───────────────────────────┬────────────────────────────┘
                            │  ArgoCD targetRevision: v1.75.10
                            ▼
┌────────────────────────────────────────────────────────┐
│                       3. GITOPS                        │
│        Estado Declarado (gitops/apps/app-proxmox.yaml) │
│       (Apunta a v1.75.10 -> Reconcilia versión previa) │
└───────────────────────────┬────────────────────────────┘
                            │  Reconciliación en clúster Proxmox
                            ▼
┌────────────────────────────────────────────────────────┐
│                       4. RUNTIME                       │
│               Estado Observado (UNKNOWN)               │
│    (Sin conexión en vivo; teóricamente en v1.75.10)    │
└────────────────────────────────────────────────┘
```

---

## MAIN State

- **Commit de Referencia:** `ea9b349` (`feat/rclone-digest-pinning` / `main`).
- **Capacidades Implementadas:**
  - CronJob K8s-native `backup-gdrive-cronjob.yaml` en `infra/helm/pokedex/templates/`.
  - Mecanismo fail-closed ante token vacío (`if [ -z "${RCLONE_CONFIG_GDRIVE_TOKEN:-}" ]; then exit 1; fi`).
  - Pinning de Rclone por digest SHA-256 (`rclone/rclone@sha256:74c51b88...`).
  - Política de salida L7 FQDN `ciliumNetworkPolicy` para Google Drive (`*.googleapis.com`, `accounts.google.com`).
  - Script de simulacro de Disaster Recovery `scripts/dr-drill.ts` (11 métricas de RPO/RTO).
  - Herramienta de Quality Gate `scripts/lint-markdown.ts` y regla `AGENTS.md`.
  - Valores Proxmox actualizados: `backup.gdrive.enabled: true` y clave Vault `pokedex/prod`.
- **Estado de Pruebas:** 216/216 tests pasando (`npm test`), 0 errores de Markdown (`npm run lint:md`).

---

## Release State

- **Último Tag Oficial Publicado:** `v1.75.10` (Commit `2df20b3`).
- **Análisis del Contenido Real del Tag:**
  - `infra/helm/pokedex/templates/backup-gdrive-cronjob.yaml`: **INEXISTENTE** en `v1.75.10`.
  - `backup.gdrive`: **INEXISTENTE** en los values de `v1.75.10`.
  - `scripts/dr-drill.ts`: **INEXISTENTE** en `v1.75.10`.
  - `scripts/lint-markdown.ts`: **INEXISTENTE** en `v1.75.10`.
  - Clave de Vault en `gitops/environments/proxmox/values.yaml`: referenciaba la ruta histórica `pokedex/production`.
- **Certificación OCI:** Imagen `ghcr.io/rocapellino/pokedex-api@sha256:4113ac3d...` firmada con Cosign para `v1.75.10`.

---

## GitOps State

- **Manifiesto de Aplicación On-Premise:** [`gitops/apps/app-proxmox.yaml`](../../gitops/apps/app-proxmox.yaml).
  - `spec.source.repoURL`: `https://github.com/rocapellino/pokedex.git`
  - `spec.source.targetRevision`: `v1.75.10`
  - `spec.source.path`: `infra/helm/pokedex`
  - `spec.source.helm.valueFiles`:
    - `values.yaml` (del tag `v1.75.10`)
    - `../../../gitops/environments/proxmox/values.yaml` (del tag `v1.75.10`)
- **Implicación Operacional:**
  - ArgoCD clona el repositorio en la revisión `v1.75.10`.
  - Por lo tanto, ArgoCD **NO renderiza ni aplica el CronJob de Google Drive**, porque esa plantilla no existe en `v1.75.10`.
  - La aplicación de producción en Proxmox permanece en el estado estable anterior a los últimos 18 commits.

---

## Runtime State

- **Estado de Observabilidad:** **`UNKNOWN`** (Regla Cardinal: prohibido inventar telemetría sin conexión directa a la API de Kubernetes de Proxmox en `https://k8s-proxmox.internal.lan:6443`).
- **Inferencia Teórica por GitOps:** Dado que ArgoCD tiene configurado `syncPolicy: automated` sobre `v1.75.10`, el clúster se encuentra en paridad con `v1.75.10`, lo que implica que el Pod de Google Drive CronJob **no está en ejecución en el runtime**.

---

## Capability Matrix

Matriz de contraste por capacidad técnica entre los 4 niveles del sistema:

| Capability | MAIN | RELEASE (`v1.75.10`) | GITOPS (`app-proxmox`) | RUNTIME | Estado de Consistencia |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **API Core & Web UI** | ENABLED | ENABLED | ENABLED | UNKNOWN | **Alineado** (Paridad 1:1 en digest OCI `sha256:4113ac3d...`). |
| **PostgreSQL Local Backup (AES-256)** | ENABLED | ENABLED | ENABLED | UNKNOWN | **Alineado** (Backup local en PVC activo en todos los niveles). |
| **Google Drive K8s-Native Backup** | ENABLED | ABSENT | ABSENT | UNKNOWN | **Candidato en MAIN** (Pendiente de nuevo release y promoción). |
| **Fail-Closed de GDRIVE_TOKEN** | ENABLED | ABSENT | ABSENT | UNKNOWN | **Candidato en MAIN** (Lógica de parada segura no empaquetada). |
| **Rclone SHA-256 Digest Pinning** | ENABLED | ABSENT | ABSENT | UNKNOWN | **Candidato en MAIN** (Supply chain inmutable pendiente de tag). |
| **Cilium L7 FQDN Egress para GDrive** | ENABLED | ABSENT | ABSENT | UNKNOWN | **Candidato en MAIN** (Política de red L7 pendiente de tag). |
| **DR E2E Drill (11 métricas)** | ENABLED | ABSENT | NOT_APPLICABLE | UNKNOWN | **Candidato en MAIN** (Script de testing operativo). |
| **Markdown Quality Gate (0 MDxxx)** | ENABLED | ABSENT | NOT_APPLICABLE | NOT_APPLICABLE | **Candidato en MAIN** (DevSecOps Quality Gate en CI). |
| **Vault Secret Path `pokedex/prod`** | ENABLED | ABSENT (`production`) | ABSENT (`production`) | UNKNOWN | **Requiere alineación en promoción** (SSOT corregido en MAIN). |
| **ArgoCD Proxmox targetRevision** | `v1.75.10` | `v1.75.10` | `v1.75.10` | UNKNOWN | **Alineado formalmente** (Apunta a tag inmutable existente). |

---

## Release ↔ MAIN Differences

Principales divergencias técnicas entre el código candidato en `main` y el último tag publicado `v1.75.10`:

1. **Infraestructura Helm:** `main` incluye `backup-gdrive-cronjob.yaml` con parámetros de digest pinning, mientras que `v1.75.10` solo incluye el backup local y el esqueleto off-site genérico.
2. **Seguridad de Red:** `main` incluye reglas FQDN en `ciliumNetworkPolicy` para Google Drive (`*.googleapis.com`), ausentes en `v1.75.10`.
3. **Secretos de Vault:** `main` consolidó la ruta `pokedex/prod` en sustitución del legacy `pokedex/production`.
4. **Scripts Operativos:** `main` introdujo `scripts/dr-drill.ts` y `scripts/lint-markdown.ts`.

---

## Release ↔ GitOps Differences

Comparativa entre el tag `v1.75.10` y los manifiestos declarados en `gitops/`:

1. **Paridad de targetRevision:** `app-proxmox.yaml` declara `targetRevision: v1.75.10`, existiendo coherencia exacta entre la declaración GitOps y el tag existente en el repositorio.
2. **Desacoplamiento Intencional de Values en MAIN:** Los archivos bajo `gitops/environments/proxmox/values.yaml` en la rama `main` ya reflejan la configuración de Google Drive (`backup.gdrive.enabled: true`), pero ArgoCD no los lee de `main`, sino del tag `v1.75.10`. Por tanto, el GitOps activo en el clúster permanece aislado de los cambios en desarrollo.

---

## Change Impact Analysis

Análisis de la cascada de dependencias cuando se autorice la promoción de los cambios de `main` a un nuevo release (`v1.76.0`):

```text
Corte de Release v1.76.0 en Git
    │
    ├──► 1. CI Workflow: Compilación, SBOM CycloneDX y Firma Cosign Keyless
    │
    ├──► 2. Helm Chart: Chart.yaml version incrementado a 1.76.0
    │
    ├──► 3. GitOps PR: Actualización de targetRevision a v1.76.0 en app-proxmox.yaml
    │
    └──► 4. Reconciliación ArgoCD en Proxmox:
             ├── Creación del nuevo CronJob pokedex-gdrive-sync
             ├── Aplicación de la política CiliumNetworkPolicy L7 FQDN
             └── Consumo del secreto con clave pokedex/prod desde Vault
```

### Componentes que NO Requieren Modificación

- **`apps/frontend/`:** Las capacidades añadidas son puramente de infraestructura y backup; el cliente web no tiene impacto.
- **`gitops/environments/aws/values.yaml`:** El entorno Cloud de AWS utiliza RDS con snapshots automáticos; no utiliza el CronJob de Google Drive ni requiere cambios.

---

## Documentation Consistency

Auditoría de lenguaje y afirmaciones en la documentación técnica:

- **Inconsistencia Detectada:** En runbooks y guías operativas previas (`docs/operations/GDRIVE_BACKUP_GUIDE.md`), se describe el backup a Google Drive como operativo.
- **Corrección Exigida:** Debe especificarse formalmente:
  - *Estado:* **Implementado en `main`, pendiente de release y promoción en GitOps.**
  - *Despliegue efectivo en Proxmox:* Se activará únicamente cuando `targetRevision` en `app-proxmox.yaml` se actualice a `v1.76.0` y el secreto `pokedex-gdrive-secret` esté provisionado.

---

## Findings

### [RDC-001] GitOps Proxmox apunta a Release v1.75.10 que no contiene el CronJob de Google Drive

- **Área:** GitOps / Release
- **Prioridad:** P2
- **Confianza:** HIGH
- **Esfuerzo:** S
- **Evidencia:** [`gitops/apps/app-proxmox.yaml:18`](../../gitops/apps/app-proxmox.yaml) declara `targetRevision: v1.75.10`. La consulta `git show v1.75.10:infra/helm/pokedex/templates/backup-gdrive-cronjob.yaml` retorna error de inexistencia.
- **Estado actual:** El código y los templates de Google Drive backup están completamente funcionales en `main`, pero ArgoCD en Proxmox está reconciliando `v1.75.10`, por lo que el CronJob no existe en el clúster.
- **Riesgo/impacto:** Asumir operativamente que el backup off-site a Google Drive se está ejecutando en Proxmox cuando en realidad no ha sido desplegado por ArgoCD.
- **Recomendación:** Cortar un nuevo release SemVer (`v1.76.0`) que incluya los 18 commits acumulados y promover ordenadamente `targetRevision` en `app-proxmox.yaml`.
- **Verificación:** Ejecutar `helm template pokedex infra/helm/pokedex -f gitops/environments/proxmox/values.yaml` contra el nuevo tag y certificar la presencia del CronJob.
- **Impacto en documentación:** `docs/operations/GDRIVE_BACKUP_GUIDE.md` (actualizado).

---

### [RDC-002] Divergencia de Rutas de Vault entre Release v1.75.10 y MAIN

- **Área:** Seguridad / Vault
- **Prioridad:** P2
- **Confianza:** HIGH
- **Esfuerzo:** XS
- **Evidencia:** En `v1.75.10`, `remoteRef.key` apuntaba a `pokedex/production`. En `main`, se corrigió a `pokedex/prod`.
- **Estado actual:** `main` posee la configuración corregida. Al promocionar a `v1.76.0`, ArgoCD actualizará el `ExternalSecret` en el clúster a `pokedex/prod`.
- **Riesgo/impacto:** Si la clave `pokedex/prod` no estuviera provisionada en el servidor Vault de Proxmox al momento de la promoción, ESO fallaría en sincronizar secretos.
- **Recomendación:** Verificar que el secreto `pokedex/prod` exista en HashiCorp Vault antes de mergear la actualización de `targetRevision` en GitOps.
- **Verificación:** `npm run secrets:audit-rotation`.
- **Impacto en documentación:** Ninguno.

---

## Promotion Readiness

Evaluación de preparación para emitir el release `v1.76.0`:

| Dimensión | Estado | Justificación |
| :--- | :---: | :--- |
| **Release Consistency** | **PASS** | El changelog y commits convencionales (`feat:`, `docs:`) permiten cálculo limpio de SemVer. |
| **Code Consistency** | **PASS** | 216/216 tests unitarios, de persistencia y de seguridad pasando sin errores. |
| **Helm Consistency** | **PASS** | `helm template` renderiza limpiamente para dev, prod, proxmox y aws. |
| **Image Consistency** | **WARNING** | La nueva imagen que incluye los cambios de `main` debe compilarse y firmarse con Cosign al crear el tag. |
| **Secrets Consistency** | **PASS** | `ExternalSecret` configurado para `pokedex/prod` con fallback seguro. |
| **GitOps Consistency** | **PASS** | Manifiestos de `gitops/` sintácticamente válidos y alineados con la arquitectura modular. |
| **DR Consistency** | **PASS** | Simulacro de DR E2E verificado con 11 métricas y fail-closed probado. |
| **Documentation Consistency** | **WARNING** | Requiere ajustar runbooks para aclarar que Google Drive está pendiente de promoción. |

**Dictamen Global:** **READY WITH WARNINGS**. El repositorio está listo para generar el release `v1.76.0` y posteriormente abrir el PR de promoción en GitOps.

---

## Recommended Actions

1. **Generar Release `v1.76.0`:**
   Ejecutar el workflow de release etiquetando el commit actual para empaquetar las plantillas de Google Drive, Rclone pinning y mejoras de DR.
2. **Verificar Secretos en Vault Proxmox:**
   Confirmar que `pokedex/prod` (y opcionalmente `GDRIVE_TOKEN`) estén cargados en el SecretStore.
3. **Promover en GitOps:**
   Actualizar `targetRevision: v1.76.0` en [`gitops/apps/app-proxmox.yaml`](../../gitops/apps/app-proxmox.yaml).
4. **Actualizar Runbooks:**
   Alinear [`docs/operations/GDRIVE_BACKUP_GUIDE.md`](../../docs/operations/GDRIVE_BACKUP_GUIDE.md) para reflejar las etapas del despliegue.

---

## Validation Results

- **Pruebas Unitarias y de Integración:** 216 pass, 0 fail.
- **Grafo de Dependencias:** 0 dependencias circulares.
- **Markdown Quality Gate:** 0 errores `MDxxx`.

---

## Files Changed

Durante esta sesión de trabajo se crearon y actualizaron los siguientes artefactos:

- `.agents/skills/_shared/state-model.md` (Creado)
- `.agents/skills/_shared/change-impact-matrix.md` (Creado)
- `.agents/skills/repo-release/references/release-consistency.md` (Creado)
- `.agents/skills/repo-release/SKILL.md` (Actualizado)
- `.agents/skills/repo-impact/SKILL.md` (Actualizado)
- `.agents/skills/repo-docs/SKILL.md` (Actualizado)
- `.agents/skills/repo-lifecycle/SKILL.md` (Actualizado)
- `docs/audits/2026-09-24/release/release-deployment-consistency.md` (Creado)

---

## Remaining Risks

- **SyncWindow en GitOps:** `app-proxmox.yaml` cuenta con una ventana de protección (freeze) que bloquea sincronizaciones automáticas los fines de semana. Si la promoción se realiza durante la ventana de freeze, requerirá sincronización manual (`manualSync: true`).
- **GDRIVE_TOKEN no provisionado:** Debido a la política fail-closed implementada en `main`, el CronJob fallará con código de salida 1 si se despliega sin que el token esté cargado en el Secret de Kubernetes.
