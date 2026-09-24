# Documentation Consistency & Drift Audit

- **Fecha:** 2026-09-24
- **Skill:** `repo-docs` (Documentation Drift Audit)
- **Ámbito:** `IMPLEMENTACIÓN ↔ CONFIGURACIÓN ↔ RELEASE ↔ GITOPS ↔ RUNTIME ↔ DOCUMENTACIÓN`
- **Caso de Estudio Crítico:** `docs/decisions/ADR-006-disaster-recovery-strategy.md` vs. Implementación real de Backup Off-Site

---

## Executive Summary

Se ha ejecutado la primera auditoría formal de consistencia y deriva documental (*Documentation Drift Audit*) en el repositorio `rocapellino/pokedex`.

El objetivo central de esta evaluación es contrastar las afirmaciones semánticas presentes en la documentación técnica frente a la realidad fáctica de la implementación en `main`, las configuraciones en Helm, los tags de release y los manifiestos de ArgoCD, superando la validación sintáctica de Markdown para verificar la fidelidad de los *Document Claims*.

### Conclusiones Principales

1. **Contradicción Arquitectónica en ADR-006:**
   Se detectó una discrepancia severa entre la decisión formal [`docs/decisions/ADR-006-disaster-recovery-strategy.md`](../../docs/decisions/ADR-006-disaster-recovery-strategy.md) y el código activo en `main`. ADR-006 restringe la estrategia off-site exclusivamente a esqueletos inactivos de S3/MinIO y Proxmox Backup Server (PBS), omitiendo por completo la solución K8s-native de **Google Drive con Rclone**, la cual ya cuenta con plantillas Helm, scripts de sincronización y runbooks operativos.
2. **Tergiversación de Estado (*State Misrepresentation*) en DR Plan:**
   En [`docs/runbooks/DISASTER_RECOVERY_PLAN.md`](../../docs/runbooks/DISASTER_RECOVERY_PLAN.md), la tabla de componentes declara que el backup a Google Drive en Proxmox está **"ACTIVO (Renderizado K8s-Native)"**. Sin embargo, la Fuente Única de Verdad de despliegue ([`gitops/apps/app-proxmox.yaml`](../../gitops/apps/app-proxmox.yaml)) mantiene `targetRevision: v1.75.10`, versión donde la plantilla `backup-gdrive-cronjob.yaml` no existe. La afirmación documental confunde el estado candidato en `main` con el estado desplegado en producción.
3. **Consistencia de Demarcación Histórica:**
   Los informes previos bajo `docs/audits/2026-09-23/` permanecen adecuadamente delimitados como evidencia histórica, cumpliendo con la regla de SSOT definida en `AGENTS.md`.

---

## Documentation Inventory

Inventario de la documentación técnica evaluada durante la auditoría:

```text
docs/
├── decisions/
│   ├── ADR-001 a ADR-005       # Decisiones fundacionales de framework, testing y persistencia
│   ├── ADR-006                  # Estrategia de DR 3-2-1 (AUDITADO / DRIFT DETECTADO)
│   └── ADR-007 a ADR-021       # Vault, Ingress, Kyverno, Supply Chain, GitOps Promotion
├── architecture/
│   ├── ARCHITECTURE_SPECIFICATION.md  # Especificación de capas y microarquitectura
│   ├── APPLICATION_LIFECYCLE.md       # SDLC, branching, CI/CD y rulesets
│   ├── GITOPS_PROMOTION_WORKFLOW.md   # Flujo de promoción, digests y paridad
│   └── VAULT_PROXMOX_ARCHITECTURE.md  # Topología Zero-Trust Vault CE + ESO
├── runbooks/
│   └── DISASTER_RECOVERY_PLAN.md      # Procedimientos de restore y SLAs (AUDITADO)
├── operations/
│   ├── GDRIVE_BACKUP_GUIDE.md         # Guía de backup Google Drive con Rclone (AUDITADO)
│   ├── OFFSITE_BACKUP_BLUEPRINTS.md   # Blueprints de S3 y PBS
│   └── secret-rotation.md             # Rotación de credenciales
└── audits/
    ├── 2026-09-23/                    # Evidencia histórica (Baseline Hito 1)
    └── 2026-09-24/                    # Auditorías actuales de arquitectura y release
```

---

## Source of Truth

De acuerdo con el registro formal [source-of-truth.md](../../.agents/skills/_shared/source-of-truth.md), las autoridades de información aplicadas son:

- **Estrategia Formal de DR:** `docs/decisions/ADR-006-*.md`.
- **Despliegue GitOps:** `gitops/apps/app-proxmox.yaml` (`targetRevision`) y `gitops/environments/proxmox/values.yaml`.
- **Plantillas Helm Canónicas:** `infra/helm/pokedex/templates/` y `infra/helm/pokedex/values.yaml`.
- **Código y Herramientas Ejecutables:** `apps/backend/`, `scripts/dr-drill.ts`, `docker-compose.dev.yml`.

---

## Changed Domains

Dominios modificados en los últimos 18 commits (`v1.75.10..HEAD`):

1. **Disaster Recovery:** Introducción de `backup-gdrive-cronjob.yaml`, Rclone digest pinning, fail-closed ante token vacío y script de benchmark E2E `dr-drill.ts`.
2. **Aislamiento de Red:** Política `CiliumNetworkPolicy` L7 FQDN para Google Drive API y Anti-SSRF.
3. **Gobernanza de Agentes y Calidad:** Reglas de demarcación SSOT en `AGENTS.md` y Markdown Quality Gate en CI.
4. **GitOps Values:** Declaración de `backup.gdrive.enabled: true` en el values de Proxmox.

---

## Documentation Impact

Impacto detectado a partir de la [documentation-impact-matrix.md](../../.agents/skills/_shared/documentation-impact-matrix.md):

| Documento | Dominio Impactado | Estado Actual | Razón del Impacto |
| :--- | :--- | :---: | :--- |
| `docs/decisions/ADR-006-*.md` | Arquitectura DR | **CONTRADICTED** | No contempla la estrategia de Google Drive ni Rclone. |
| `docs/runbooks/DISASTER_RECOVERY_PLAN.md` | Operaciones DR | **STATE_MISREPRESENTATION** | Afirma que Google Drive está activo en Proxmox cuando ArgoCD apunta a `v1.75.10`. |
| `docs/operations/GDRIVE_BACKUP_GUIDE.md` | Operaciones DR | **CURRENT (Con matiz)** | Describe fielmente el mecanismo técnico, pero debe clarificar la etapa de despliegue. |
| `docs/operations/OFFSITE_BACKUP_BLUEPRINTS.md` | Infraestructura DR | **CURRENT** | Describe correctamente los blueprints de S3 y PBS como inactivos. |
| `README.md` | General | **CURRENT** | Refleja la arquitectura general sin aseveraciones prematuras de runtime. |

---

## Document Claims

Extracción de afirmaciones fácticas y contraste contra evidencia:

### Claim 1: "La topología off-site se limita a esqueletos inactivos S3 y PBS"

- **Documento:** `docs/decisions/ADR-006-disaster-recovery-strategy.md` (Líneas 19-21)
- **Source of Truth:** Código ejecutable en `infra/helm/pokedex/templates/backup-gdrive-cronjob.yaml` y `gitops/environments/proxmox/values.yaml`.
- **Evidencia Actual:** Existe un CronJob completo de Google Drive con Rclone implementado en `main`.
- **Resultado:** **MISMATCH (CONTRADICTION)**. La decisión arquitectónica quedó rezagada respecto a la implementación.

### Claim 2: "Off-Site Google Drive (Proxmox): ACTIVO (Renderizado K8s-Native)"

- **Documento:** `docs/runbooks/DISASTER_RECOVERY_PLAN.md` (Línea 69)
- **Source of Truth:** `gitops/apps/app-proxmox.yaml` (`targetRevision`).
- **Evidencia Actual:** `targetRevision` apunta a `v1.75.10`, tag donde la plantilla `backup-gdrive-cronjob.yaml` no existe.
- **Resultado:** **MISMATCH (STATE MISREPRESENTATION)**. Está implementado en `main`, pero pendiente de release y promoción en GitOps.

### Claim 3: "El secreto de Vault para Proxmox reside en pokedex/prod"

- **Documento:** `gitops/environments/proxmox/values.yaml` y `docs/architecture/VAULT_PROXMOX_ARCHITECTURE.md`
- **Source of Truth:** Configuración de ExternalSecrets en `main`.
- **Evidencia Actual:** `gitops/environments/proxmox/values.yaml` declara `remoteRef.key: "pokedex/prod"`.
- **Resultado:** **MATCH**. Coincidencia exacta en la rama candidata `main`.

---

## Main / Release / GitOps / Runtime State

Matriz comparativa de la capacidad de backup a Google Drive:

```text
Capacidad: Backup Off-Site a Google Drive (K8s-Native)
- MAIN      : PRESENT + ENABLED (Plantilla, Rclone pinning, fail-closed, values Proxmox)
- RELEASE   : ABSENT (Inexistente en tag v1.75.10)
- GITOPS    : ABSENT (ArgoCD targetRevision apunta a v1.75.10)
- RUNTIME   : UNKNOWN (Sin acceso directo a telemetría de Proxmox; teóricamente no desplegado)
- DOCS      : CONTRADICTORY (ADR-006 dice inactivo; DR Plan dice activo)
```

---

## Documentation Drift

Se identifican dos derivas principales:

1. **Deriva Arquitectónica:** La evolución del código adoptó Google Drive sin registrar la decisión mediante una enmienda a ADR-006 o un ADR sucesor.
2. **Deriva Operacional:** Los runbooks describen la capacidad como desplegada y activa en lugar de documentarla como candidata pendiente de release.

---

## Contradictions

| Documento A | Afirmación en Documento A | Documento B | Afirmación en Documento B | Tipo de Contradicción |
| :--- | :--- | :--- | :--- | :--- |
| `ADR-006` | Esqueletos off-site inactivos (solo S3 y PBS agnósticos). | `DISASTER_RECOVERY_PLAN.md` | Off-Site Google Drive activo en Proxmox. | **Estrategia Off-site Contradictoria** |
| `ADR-006` | No menciona Rclone ni Google Drive. | `GDRIVE_BACKUP_GUIDE.md` | Guía completa de arquitectura Rclone y Google Drive. | **Omisión Arquitectónica Formal** |

---

## Stale Documentation

- **`docs/decisions/ADR-006-disaster-recovery-strategy.md`:** Su sección 5 describe un estado del sistema previo a la introducción del puente de Google Drive. Se encuentra en estado **STALE** y requiere revisión formal.

---

## Missing Documentation

- **Falta de ADR de Selección de Rclone / Google Drive:** No existe un ADR que documente el racional de haber seleccionado Google Drive y Rclone como proveedor off-site en lugar de aprovisionar un bucket S3/R2 o configurar PBS remoto.

---

## ADR Consistency

### Caso Canónico: Evaluación de ADR-006

- **Estado Documentado:** Aceptado.
- **Vigencia Fáctica:** Parcialmente vigente.
  - La estrategia de backup local (AES-256 + SHA-256 + restore drill) está 100% implementada y vigente.
  - La sección off-site no refleja la realidad de la plataforma.
- **Dictamen:** **`ADR REVIEW REQUIRED`**.
  - **No se modifica automáticamente el ADR** (respetando la regla de gobernanza).
  - Se recomienda emitir una enmienda (*Addendum*) a ADR-006 o aprobar el ADR-022 formalizando la adopción de Google Drive como vía off-site secundaria para entornos on-premise Proxmox.

---

## Runbook Consistency

- **`docs/runbooks/DISASTER_RECOVERY_PLAN.md`:** Los procedimientos técnicos de descifrado y restauración son 100% precisos y ejecutables. La tabla de estado operacional de la sección 2.2 debe ajustarse para corregir la tergiversación de estado de Google Drive.

---

## Historical Documents

- **Carpetas `docs/audits/2026-09-23/`:** Contienen diagnósticos pasados válidos para su fecha de emisión. No requieren modificación y se mantienen como evidencia inmutable.

---

## Findings

### [DOC-001] Contradicción Arquitectónica entre ADR-006 y la Estrategia Off-Site Activa

- **Área:** Arquitectura / Documentación
- **Prioridad:** P1
- **Confianza:** HIGH
- **Esfuerzo:** S
- **Evidencia:** [`docs/decisions/ADR-006-disaster-recovery-strategy.md:19-21`](../../docs/decisions/ADR-006-disaster-recovery-strategy.md) declara que el off-site se limita a esqueletos inactivos de S3 y PBS. En [`infra/helm/pokedex/templates/backup-gdrive-cronjob.yaml`](../../infra/helm/pokedex/templates/backup-gdrive-cronjob.yaml) y [`docs/operations/GDRIVE_BACKUP_GUIDE.md`](../../docs/operations/GDRIVE_BACKUP_GUIDE.md) existe una implementación funcional de Google Drive.
- **Estado actual:** ADR-006 no ha sido enmendado ni sustituido formalmente tras la implementación de Google Drive.
- **Riesgo/impacto:** Pérdida de autoridad de los ADRs como Fuente Única de Verdad si las decisiones aprobadas divergen del código activo.
- **Recomendación:** Declarar `ADR-006` en estado `ADR REVIEW REQUIRED` y redactar una enmienda formal o un ADR sucesor (ADR-022) que formalice la adopción del puente K8s-native con Rclone a Google Drive.
- **Verificación:** Revisión por pares y aprobación de la enmienda arquitectónica.
- **Impacto en documentación:** `docs/decisions/ADR-006-disaster-recovery-strategy.md`.

---

### [DOC-002] Tergiversación de Estado de Google Drive en DISASTER_RECOVERY_PLAN.md

- **Área:** Operaciones / Documentación
- **Prioridad:** P2
- **Confianza:** HIGH
- **Esfuerzo:** XS
- **Evidencia:** [`docs/runbooks/DISASTER_RECOVERY_PLAN.md:69`](../../docs/runbooks/DISASTER_RECOVERY_PLAN.md) declara: `Off-Site Google Drive (Proxmox): ACTIVO (Renderizado K8s-Native)`. [`gitops/apps/app-proxmox.yaml:18`](../../gitops/apps/app-proxmox.yaml) declara `targetRevision: v1.75.10` (donde el recurso no existe).
- **Estado actual:** Se afirma que la capacidad está activa en el clúster de producción cuando en realidad está implementada en `main` pero pendiente de promoción en GitOps.
- **Riesgo/impacto:** Los operadores de guardia asumen que existe una copia remota en la nube cuando en el clúster real ArgoCD no ha desplegado el CronJob.
- **Recomendación:** Ajustar la tabla del Runbook para declarar: **`IMPLEMENTADO EN MAIN / PENDIENTE DE PROMOCIÓN GITOPS (v1.76.0)`**.
- **Verificación:** Inspección visual del documento corregido.
- **Impacto en documentación:** `docs/runbooks/DISASTER_RECOVERY_PLAN.md`.

---

## Recommended Actions

1. **Reconciliar Runbook de DR:** Actualizar la terminología en `docs/runbooks/DISASTER_RECOVERY_PLAN.md` para reflejar la realidad del ciclo de vida (`PENDING_PROMOTION`).
2. **Convocar Revisión de ADR-006:** Someter a aprobación una enmienda a ADR-006 formalizando el puente de Rclone hacia Google Drive.
3. **Promover Release `v1.76.0` en GitOps:** Al cortar la nueva versión e incrementar el `targetRevision` en `app-proxmox.yaml`, el estado documental pasará legítimamente a `DEPLOYED`.

---

## Validation Results

- **Archivos Auditados:** 18 documentos Markdown y manifiestos de arquitectura.
- **Claims Validados:** 3 afirmaciones fácticas contrastadas contra SSOT.
- **Inconsistencias Detectadas:** 2 hallazgos formales (1 Contradicción en ADR, 1 Tergiversación de estado).
- **Markdown Quality Gate:** 0 errores `MDxxx`.
