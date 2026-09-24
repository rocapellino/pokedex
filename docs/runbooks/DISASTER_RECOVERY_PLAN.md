# Plan de Recuperación ante Desastres (Disaster Recovery Plan - DRP)

Este documento define la política oficial, las métricas de servicio (RPO/RTO), los mecanismos de respaldo cifrado y los procedimientos de restauración paso a paso para la base de datos de la plataforma **Pokédex**.

---

## 1. Objetivos de Nivel de Servicio (SLAs de DR)

| Métrica | Definición | Objetivo Oficial | Mecanismo de Garantía |
| :--- | :--- | :---: | :--- |
| **Disponibilidad (SLA)** | Disponibilidad mensual del servicio | **99.5% mensual** | Arquitectura lean mononodo con recuperación rápida (< 3.65h de indisponibilidad máxima no planificada/mes). |
| **RPO** *(Recovery Point Objective)* | Pérdida máxima tolerable de datos | **< 24 horas** | `CronJob` de backup diario ejecutado a las `02:00 UTC` con retención rotativa de 7 días. |
| **RTO** *(Recovery Time Objective)* | Tiempo máximo para restaurar el servicio | **< 2 horas** | Restauración automatizada mediante script `dr_verify_restore.sh` (< 5 minutos en BD; PBS ~15-20 min; reconstrucción IaC ~30-45 min). |

### 1.1. Comparativa de SLAs: Objetivos Declarados vs. Mediciones Empíricas

| Métrica | SLA Teórico Declarado | Medición Real (Benchmark Empírico) | Método de Validación Empírica |
| :--- | :---: | :---: | :--- |
| **SLA Disponibilidad** | 99.5% mensual | **≥ 99.9% operacional** | Monitoreo continuo mediante sondas de salud k8s, métricas en Prometheus/Grafana y presupuesto de error mensual de ~3.65h. |
| **RPO** | < 24 horas | **≤ 24 horas** (Snapshot diario garantizado) | Periodicidad del `CronJob` de backup ejecutado a las 02:00 UTC con retención de 7 snapshots rotativos inmutables. |
| **RTO (Tier 1 - BD/App)** | < 2 horas | **~1.5 segundos** (Restauración completa verificada) | Benchmark automatizado con `scripts/dr_verify_restore.sh --dry-run` en contenedor efímero `postgres:16-alpine` (descifrado AES-256-CBC PBKDF2 + verificación SHA-256 + descompresión gzip + importación DDL/DML real con 21 índices y aserciones de consistencia). |
| **RTO (Tier 2 - VM/PBS)** | < 2 horas | **~15 - 20 minutos** (Restauración de imagen de disco) | Restauración de imagen completa de VM 801 o LXC 810 desde Proxmox Backup Server (PBS) a través de enlace de red local. |
| **RTO (Tier 3 - Host/IaC)** | < 2 horas | **~30 - 45 minutos** (Reconstrucción bare-metal) | Provisión automatizada de infraestructura reproducible mediante OpenTofu y playbooks de Ansible sobre host reinstalado. |

---

## 2. Arquitectura de Copias de Seguridad

```mermaid
flowchart LR
    PG[(PostgreSQL 16\npokedex_db)] -->|pg_dump| GZ[Compresión\ngzip -9]
    GZ -->|openssl enc| AES[Cifrado Simétrico\nAES-256-CBC + PBKDF2]
    AES -->|sha256sum| HASH[Suma de Integridad\nSHA-256]
    AES --> PVC[Copia Local: PVC\n/backups (RTO Inmediato)]
    HASH --> PVC
    AES -.->|Off-site Sync| S3[(Almacenamiento Off-site\nS3 / MinIO / B2)]
    HASH -.->|Off-site Sync| S3
```

### 2.1. Estrategia de Respaldo 3-2-1 y Características de Seguridad

1. **Estrategia 3-2-1**:
   - **3 Copias de los datos**: Datos en vivo (PostgreSQL), copia local cifrada (PVC) y réplica remota off-site (S3 / MinIO).
   - **2 Medios distintos**: Almacenamiento en bloque del clúster (PVC) y almacenamiento de objetos externo inmutable.
   - **1 Copia Off-site**: Réplica fuera del centro de datos/nodo para proteger contra pérdida catastrófica de infraestructura.
2. **Zero-Trust Egress**: El pod de backup solo se comunica con PostgreSQL (5432), CoreDNS (53) y opcionalmente con el endpoint HTTPS (443) del bucket off-site cuando `backup.offsite.enabled` está activo.
3. **Hardening de Contenedor**: Corre con usuario no root (`UID 70`), sistema de archivos de solo lectura (`readOnlyRootFilesystem: true`) y descarte total de capacidades Linux (`capabilities.drop: [ALL]`).
4. **Cifrado Criptográfico Estricto**:
   - Algoritmo: `AES-256-CBC` con derivación de clave `PBKDF2` y salting criptográfico aleatorio.
   - La clave se inyecta de forma segura mediante variable de entorno `BACKUP_ENCRYPTION_KEY` proveniente de Kubernetes Secret / External Secrets Operator. Sin fallback hardcodeado.
5. **Verificación de Integridad**: Cada volcado genera un archivo anexo `.sha256` para validar que el archivo no fue manipulado ni se corrompió durante la transferencia o almacenamiento.

### 2.2. Estado de Implementación: Respaldo Local Activo vs. Esqueletos Off-Site Inactivos

> [!WARNING]
> **Riesgo Residual Transitorio (SPOF de Host Físico):**
> La arquitectura implementa con éxito la generación de respaldos, cifrado criptográfico, verificación de checksums y drills periódicos de restauración dentro del clúster K8s. Sin embargo, **las copias se almacenan actualmente en el PVC local del host Proxmox**. La pérdida total del servidor físico destruiría simultáneamente la base de datos primaria y los respaldos locales hasta que se active una vía remota.
>
> Los dos esqueletos off-site están diseñados, parametrizados y listos para activar (*Cloud-Ready* y *PBS-Ready*), pero permanecen **INACTIVOS** (`backup.offsite.enabled: false`) hasta la contratación/asignación de storage externo.

| Componente | Nivel / Entorno | Estado Renderizado / Operacional | Destino de los Datos |
| :--- | :--- | :---: | :--- |
| **Respaldo Local PostgreSQL** | Proxmox Prod (VM 801 K3s) | **ACTIVO (Renderizado)** | PVC dedicado `pokedex-backup-pvc` (`5Gi`, montado solo en pods de backup) |
| **Respaldo Local Pre-prod** | Proxmox Pre-prod (LXC 800) | **INACTIVO (`enabled: false`)** | Desactivado intencionalmente para evitar saturación de I/O en LXC de lab |
| **Respaldo Local Dev** | Local (Docker / Kind) | **INACTIVO (`enabled: false`)** | Base de datos efímera; respaldos puntuales vía script `dev-backup-gdrive.ts` |
| **Restore Verification Semanal** | Proxmox Prod (`dr-restore-verify`) | **ACTIVO (Renderizado)** | Verificación en contenedor efímero aislado semanal (domingos 04:00 UTC) |
| **Off-Site Cloud Backup (S3-compat)** | Object Storage Agnóstico | **ESQUELETO (INACTIVO)** | Endpoint remoto S3/R2/B2/MinIO (Documentado en [OFFSITE_BACKUP_BLUEPRINTS.md](../operations/OFFSITE_BACKUP_BLUEPRINTS.md)) |
| **Off-Site PBS Remote Sync** | Hipervisor (Proxmox VE) | **ESQUELETO (INACTIVO)** | Sync Job hacia PBS secundario (Documentado en [setup_pbs_backup_blueprint.yml](../../infra/ansible/playbooks/setup_pbs_backup_blueprint.yml)) |
| **Off-Site Google Drive (Proxmox)** | Proxmox Prod (K8s / K3s) | **ACTIVO (Renderizado K8s-Native)** | CronJob `pokedex-gdrive-sync` montando `pokedex-backup-pvc` en `readOnly: true` (Ver [GDRIVE_BACKUP_GUIDE.md](../operations/GDRIVE_BACKUP_GUIDE.md)) |
| **Off-Site Google Drive (Dev)** | Local (Docker) | **ACTIVO (Orquestado)** | Orquestado end-to-end con `dev-backup-gdrive.ts` (`pg_dump` -> cifrado -> Rclone) |

---

## 3. Procedimiento de Restauración Paso a Paso

> [!NOTE]
> **Aislamiento de Privilegios:** Por principios de Least Privilege, el Pod de PostgreSQL (`statefulset/pokedex-postgres`) **no** tiene montado el PVC de copias de seguridad (`pokedex-backup-pvc`). El PVC de backups es accedido exclusivamente por el CronJob de volcado, los jobs de verificación de DR o un pod auxiliar de inspección.

### Escenario A: Restauración sobre Clúster Operativo

1. **Obtener el último backup cifrado desde el PVC `pokedex-backup-pvc`:**

   Ejecutar un pod auxiliar efímero que monte el PVC de backups para listar o extraer el archivo más reciente:

   ```bash
   LATEST_BACKUP=$(kubectl run dr-inspector --rm -i --restart=Never \
     --image=alpine:3.20 --overrides='
     {
       "spec": {
         "volumes": [{"name": "backup-vol", "persistentVolumeClaim": {"claimName": "pokedex-backup-pvc"}}],
         "containers": [{"name": "inspector", "image": "alpine:3.20", "command": ["sh", "-c", "find /backups -name \"pokedex_*.sql.gz.enc\" | sort -r | head -n 1"], "volumeMounts": [{"name": "backup-vol", "mountPath": "/backups"}]}]
       }
     }' 2>/dev/null)
   echo "Último backup identificado en PVC: ${LATEST_BACKUP}"
   ```

2. **Ejecutar la verificación y certificación de restauración (DR Drill):**

   ```bash
   bash scripts/dr_verify_restore.sh --dry-run
   ```

3. **Restaurar directamente en la base de datos PostgreSQL activa:**

   Una vez descargado o transmitido el volcado cifrado, inyectarlo mediante pipe seguro hacia el StatefulSet de PostgreSQL (`pod/pokedex-postgres-0`):

   ```bash
   openssl enc -d -aes-256-cbc -pbkdf2 -in "${LOCAL_BACKUP_FILE}" -k "${BACKUP_ENCRYPTION_KEY}" | \
     gzip -d | \
     kubectl exec -i -n pokemon-app statefulset/pokedex-postgres -c postgresql -- psql -U pokedex_app -d pokedex_db
   ```

4. **Validar conteo y consistencia en PostgreSQL:**

   ```bash
   kubectl exec -i -n pokemon-app statefulset/pokedex-postgres -c postgresql -- \
     psql -U pokedex_app -d pokedex_db -c "SELECT COUNT(*) FROM pokedex_entries;"
   ```

---

### Escenario B: Reconstrucción Total de Infraestructura (Bare-Metal / Nuevo Clúster)

1. Aprovisionar nodos base con Ansible (`host_baseline.yml`).
2. Desplegar clúster Kubernetes y sincronizar manifiestos vía ArgoCD / Helm:

   ```bash
   helm upgrade --install pokedex infra/helm/pokedex -f infra/helm/pokedex/values.prod.yaml
   ```

3. Aprovisionar el Secret de cifrado (`pokedex-backup-secret`).
4. Descargar el backup cifrado desde el bucket off-site o montar el volumen de backup y ejecutar la restauración con el comando del Escenario A.
5. Iniciar los pods de la API y Frontend web una vez validada la integridad de PostgreSQL.

---

## 4. Simulacro y Verificación Automatizada

El repositorio implementa una estricta separación conceptual y operativa entre la prueba del mecanismo y la certificación de los datos:

### 4.1. Simulacro del Mecanismo (Smoke Test: `dr:drill`)

Orientado a validar en CI/CD y entornos de prueba que el pipeline, herramientas criptográficas, compresión y motor PostgreSQL efímero operan correctamente sin necesitar acceso a copias de seguridad de producción:

```bash
task dr:drill
# O directamente:
bash scripts/dr_verify_restore.sh --dry-run
```

### 4.2. Certificación de Respaldo Real (`dr:verify`)

Orientado a auditar de forma fail-closed que el último snapshot real generado en producción es descifrable con `BACKUP_ENCRYPTION_KEY`, consistente y restaura los esquemas e índices del negocio:

```bash
export BACKUP_ENCRYPTION_KEY="<clave-producción>"
task dr:verify
# O directamente:
bash scripts/dr_verify_restore.sh
```

El protocolo automatizado valida:

- Generación de clave efímera dinámica con `openssl rand -hex 32` en modo simulación (en modo real exige `BACKUP_ENCRYPTION_KEY` obligatoria).
- Verificación criptográfica SHA-256 (`.sha256`), descifrado AES-256-CBC con PBKDF2 y descompresión gzip.
- Prueba de restauración real en base de datos PostgreSQL efímera (vía Docker) o remota (`DR_POSTGRES_URL`), validando existencia de la tabla `pokedex_entries`, conteo de filas, lectura representativa e integridad de índices.
- Salvaguarda fail-closed que impide restauraciones accidentales contra bases de datos que contengan 'prod' o 'production' sin confirmación explícita (`ALLOW_PROD_RESTORE=true`).
- Medición del tiempo transcurrido contra el objetivo oficial de RTO (< 2 horas).

### 4.3. Simulacro End-to-End de Cadena Inversa (`dr:drill:e2e`)

Demuestra operacionalmente la recuperación total desde el repositorio remoto hasta la validación de negocio en el motor de base de datos:

```text
Google Drive (Off-site) -> Descarga -> Checksum SHA-256 OK -> Descifrado AES-256 OK -> Restore PostgreSQL -> Validación de Datos
```

Ejecución canónica:

```bash
npm run dr:drill:e2e
# O mediante Taskfile:
task dr:drill:e2e
```

El simulacro audita y reporta obligatoriamente 11 métricas contractuales:

1. **Backup timestamp:** Marca temporal ISO del volcado.
2. **Tamaño:** Longitud exacta en bytes y kilobytes del archivo cifrado.
3. **Checksum:** Suma SHA-256 criptográficamente inmutable del artefacto.
4. **Presencia del objeto remoto:** Confirmación de existencia y paridad de tamaño en Google Drive / storage off-site.
5. **Tiempo de copia:** Latencia de sincronización hacia el almacenamiento remoto.
6. **Tiempo de descarga:** Tiempo requerido para transferir el respaldo desde el almacenamiento remoto al entorno de recuperación.
7. **Tiempo de descifrado:** Tiempo de descifrado AES-256-CBC PBKDF2 y descompresión gzip.
8. **Tiempo de restore:** Tiempo de inyección DDL/DML en PostgreSQL aislado.
9. **Cantidad de registros restaurados:** Conteo verificado mediante consulta SQL directa sobre `pokedex_entries`.
10. **RPO efectivo:** Tiempo transcurrido entre la toma del snapshot y el incidente simulado (evaluado contra el SLA < 24h).
11. **RTO efectivo:** Duración acumulada de la cadena de recuperación (descarga + descifrado + restore + validación, evaluado contra el SLA < 2h).

### 4.4. Política Fail-Closed en Respaldo Off-Site

Cuando `backup.gdrive.enabled: true`:

- La clave `GDRIVE_TOKEN` es estrictamente obligatoria en el Secret de Kubernetes (`optional: false`).
- El contenedor ejecuta la aserción de shell fail-closed: `: "${RCLONE_CONFIG_GDRIVE_TOKEN:?GDRIVE_TOKEN is mandatory when gdrive backup is enabled}"`.
- Si el token o la conectividad remota fallan, el Job termina con error (`JOB FAILED`), alertando a los operadores y evitando falsos positivos de respaldo exitoso.
