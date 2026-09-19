# Blueprints de Respaldo Off-Site: Cloud-Ready (S3-Compatible) y On-Premise (PBS)

Este documento formaliza la arquitectura de referencia, los esqueletos de configuración declarativos y las guías paso a paso para la implementación de copias de seguridad fuera de sitio (**Off-Site Backups**), resolviendo el aislamiento del dominio de falla (*Failure Domain / SPOF*) del host físico Proxmox VE.

---

## 📌 1. Estado Canónico de Implementación

> [!WARNING]
> **Riesgo Residual Asumido:** En la fase actual, la arquitectura de respaldo cuenta con cifrado robusto y verificación periódica de restauración en clúster, pero **las copias residen en almacenamiento local del host**. Si el servidor físico Proxmox sufre una avería catastrófica no recuperable, tanto los datos primarios como los respaldos locales se perderían simultáneamente.
>
> Los dos esqueletos detallados a continuación están diseñados y parametrizados (*Cloud-Ready* y *PBS-Ready*), pero permanecen **INACTIVOS** (`enabled: false`) a la espera de la designación y aprovisionamiento del almacenamiento externo.

| Componente | Nivel / Capa | Estado Operativo | Ubicación de Datos |
|---|---|:---:|---|
| **Respaldo Local PostgreSQL** | Aplicación (K8s) | **ACTIVO** | PVC `/backups` cifrado con AES-256-CBC + SHA-256 (Host Proxmox) |
| **Restore Drill Semanal** | K8s (`dr-restore-verify`) | **ACTIVO** | Verificación en base efímera (Semanal domingos 04:00 UTC) |
| **Esqueleto Cloud Off-Site** | Object Storage (S3-compatible) | **PREPARADO (INACTIVO)** | Endpoint remoto agnóstico (AWS S3, Cloudflare R2, B2, MinIO) |
| **Esqueleto PBS Remote Sync** | Hipervisor (Proxmox VE) | **PREPARADO (INACTIVO)** | Servidor PBS secundario fuera de las instalaciones |

---

## ☁️ 2. Esqueleto Cloud-Ready: Almacenamiento de Objetos S3-Compatible

Diseñado bajo el principio de **agnosticismo de proveedor**: no ata la plataforma a AWS S3, sino que permite apuntar a cualquier servicio con API S3 (Cloudflare R2, Backblaze B2, Google Cloud Storage interoperable, Wasabi o MinIO remoto).

### 2.1. Declaración en Helm Values (`infra/helm/pokedex/values.yaml`)

```yaml
backup:
  enabled: true
  schedule: "0 2 * * *"
  retentionDays: 7
  persistence:
    enabled: true
    size: 5Gi
  # Esqueleto Cloud-Ready (Inactivo por defecto):
  offsite:
    enabled: false
    provider: "s3-compatible" # "s3-compatible" | "aws-s3" | "cloudflare-r2" | "backblaze-b2" | "minio"
    endpoint: ""              # Requerido si no es AWS (ej: https://<account_id>.r2.cloudflarestorage.com)
    bucket: "pokedex-backups-offsite"
    region: "us-east-1"
    prefix: "database/postgres"
    secretName: "backup-offsite-creds"
    objectLock: false         # Inmutabilidad WORM contra ataques de Ransomware
```

### 2.2. Inyección de Credenciales Zero-Trust con Vault y ExternalSecrets

Las credenciales nunca deben registrarse en Git. Se utiliza el esqueleto de plantilla [`infra/k8s/eso/backup-offsite-externalsecret.yaml.template`](../../infra/k8s/eso/backup-offsite-externalsecret.yaml.template):

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: backup-offsite-credentials-sync
  namespace: pokemon-app
spec:
  refreshInterval: "1h"
  secretStoreRef:
    name: vault-backend
    kind: ClusterSecretStore
  target:
    name: backup-offsite-creds
    creationPolicy: Owner
  data:
    - secretKey: AWS_ACCESS_KEY_ID
      remoteRef:
        key: pokedex/prod/backup-offsite
        property: AWS_ACCESS_KEY_ID
    - secretKey: AWS_SECRET_ACCESS_KEY
      remoteRef:
        key: pokedex/prod/backup-offsite
        property: AWS_SECRET_ACCESS_KEY
    - secretKey: OFFSITE_ENDPOINT
      remoteRef:
        key: pokedex/prod/backup-offsite
        property: OFFSITE_ENDPOINT
```

### 2.3. Procedimiento de Activación de la Vía Cloud

1. **Crear el Bucket en el Proveedor Seleccionado:**
   - Habilitar cifrado en reposo (SSE-S3 o KMS) y versionado.
   - (Recomendado) Activar política de retención inmutable (*Object Lock*) por 30 días.
2. **Cargar Credenciales en HashiCorp Vault:**
   ```bash
   vault kv put secret/pokedex/prod/backup-offsite \
     AWS_ACCESS_KEY_ID="<ACCESS_KEY>" \
     AWS_SECRET_ACCESS_KEY="<SECRET_KEY>" \
     OFFSITE_ENDPOINT="https://<account_id>.r2.cloudflarestorage.com"
   ```
3. **Desplegar el ExternalSecret:**
   ```bash
   kubectl apply -f infra/k8s/eso/backup-offsite-externalsecret.yaml
   ```
4. **Habilitar en GitOps:**
   En `gitops/environments/proxmox/values.yaml`, cambiar:
   ```yaml
   backup:
     offsite:
       enabled: true
   ```

---

## 🖥️ 3. Esqueleto On-Premise: Proxmox Backup Server (PBS) y Sync Remoto

Diseñado para respaldar no solo la base de datos, sino las **imágenes completas de disco del clúster** (VM 801 K3s y LXC 810 Vault) con deduplicación y cifrado en el origen (*client-side encryption*).

```text
               Proxmox VE (Host Físico Local)
                             │
            ┌────────────────┴────────────────┐
            ▼                                 ▼
      VM 801 (K3s)                      LXC 810 (Vault)
            │                                 │
            └───────────────┬─────────────────┘
                            │
              vzdump (Cifrado en cliente con AES-GCM)
                            │
                            ▼
               PBS Local (LAN 10.10.13.50)
               [Deduplicación / RTO Inmediato]
                            │
                            ▼ (Sync Job diario TLS 8007)
              PBS Remoto / Off-Site (Externo)
              [Fuera del dominio de fallo físico]
```

### 3.1. Automatización mediante Ansible Blueprint

El archivo [`infra/ansible/playbooks/setup_pbs_backup_blueprint.yml`](../../infra/ansible/playbooks/setup_pbs_backup_blueprint.yml) define la configuración completa del cliente y las tareas programadas:

- **Almacenamiento Seguro:** `pvesm add pbs` utilizando clave criptográfica client-side (`/etc/pve/priv/storage/pbs-pokedex.enc`).
- **Respaldo Automático:** Tarea en `/etc/pve/vzdump.cron` para VM 801 y LXC 810 diariamente a las `02:30 UTC`.
- **Remote Sync Job:** Sincronización de chunks entre el datastore local y el datastore remoto fuera de las instalaciones.
- **Retención GFS (Grandfather-Father-Son):**
  - Diarios: 7 snapshots
  - Semanales: 4 snapshots
  - Mensuales: 12 snapshots

### 3.2. Procedimiento de Activación de la Vía PBS

1. **Generar la Clave de Cifrado en Proxmox VE:**
   ```bash
   proxmox-backup-client key create /etc/pve/priv/storage/pbs-pokedex.enc
   # CRÍTICO: Exportar y custodiar el papel / archivo .enc fuera del host Proxmox
   proxmox-backup-client key paperkey /etc/pve/priv/storage/pbs-pokedex.enc
   ```
2. **Vincular el Almacenamiento en Proxmox:**
   ```bash
   pvesm add pbs pbs-pokedex-local \
     --server 10.10.13.50 \
     --datastore pokedex-datastores \
     --username backup-user@pbs \
     --fingerprint "SHA256:..." \
     --encryption-key /etc/pve/priv/storage/pbs-pokedex.enc \
     --prune-backups keep-daily=7,keep-weekly=4,keep-monthly=12
   ```
3. **Configurar el Sync Job hacia el PBS Remoto:**
   ```bash
   proxmox-backup-manager remote create pbs-offsite-replica \
     --server pbs-remote.external.example.com \
     --auth-id backup-user@pbs \
     --fingerprint "SHA256:..."
   proxmox-backup-manager sync-job create sync-to-offsite \
     --remote pbs-offsite-replica \
     --remote-store pokedex-offsite-vault \
     --store pokedex-datastores \
     --schedule '0 03 * * *'
   ```

---

## ⚖️ 4. Matriz Comparativa para la Decisión de Implementación

| Criterio | Vía A: Cloud S3-Compatible | Vía B: Proxmox Backup Server (PBS) Remoto |
|---|---|---|
| **Alcance de los Datos** | Base de datos PostgreSQL (`.sql.gz.enc` + checksum) | Imágenes completas de SO y discos (VM 801 + LXC 810 + PostgreSQL) |
| **Complejidad de Infraestructura** | Mínima (servicio SaaS administrado, ej. Cloudflare R2 / AWS S3) | Media-Alta (requiere servidor o VPS dedicado ejecutando PBS OS) |
| **Costo Operativo** | Muy bajo (pocos gigabytes mensuales, cero costo de egreso en R2) | Costo de servidor / storage mensual (VPS o máquina física secundaria) |
| **Velocidad de Recuperación (RTO)** | RTO BD: **< 5 minutos**; requiere reinstalar K8s si el host muere. | RTO Completo: **~15-20 minutos** para restaurar la VM y LXC completos. |
| **Recomendación** | **Fase Inmediata (MVP Cloud-Ready):** Activar vía Cloud S3/R2 para proteger datos de negocio. | **Fase de Consolidación:** Activar PBS Sync para recuperación total del hipervisor. |
