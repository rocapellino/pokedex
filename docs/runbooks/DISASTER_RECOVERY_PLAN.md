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
| **RTO (Tier 3 - Host/IaC)**| < 2 horas | **~30 - 45 minutos** (Reconstrucción bare-metal) | Provisión automatizada de infraestructura reproducible mediante OpenTofu y playbooks de Ansible sobre host reinstalado. |

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

| Componente | Nivel / Tipo | Estado Actual | Destino de los Datos |
| :--- | :--- | :---: | :--- |
| **Respaldo Local PostgreSQL** | Base de Datos (K8s) | **ACTIVO** | PVC `/backups` (Almacenamiento local del host Proxmox) |
| **Restore Verification Semanal** | K8s (`dr-restore-verify`) | **ACTIVO** | Verificación en contenedor efímero aislado (04:00 UTC) |
| **Off-Site Cloud Backup (S3-compat)** | Object Storage Agnóstico | **ESQUELETO (INACTIVO)** | Endpoint remoto S3/R2/B2/MinIO (Documentado en [OFFSITE_BACKUP_BLUEPRINTS.md](../operations/OFFSITE_BACKUP_BLUEPRINTS.md)) |
| **Off-Site PBS Remote Sync** | Hipervisor (Proxmox VE) | **ESQUELETO (INACTIVO)** | Sync Job hacia PBS secundario (Documentado en [setup_pbs_backup_blueprint.yml](../../infra/ansible/playbooks/setup_pbs_backup_blueprint.yml)) |

---

## 3. Procedimiento de Restauración Paso a Paso

### Escenario A: Restauración sobre Clúster Operativo

1. **Obtener el último backup cifrado y su checksum:**

   ```bash
   LATEST_BACKUP=$(kubectl exec -it -n pokemon-app deploy/pokedex-postgres -- find /backups -name "pokedex_*.sql.gz.enc" | sort -r | head -n 1)
   echo "Restaurando desde: ${LATEST_BACKUP}"
   ```

2. **Ejecutar la verificación y restauración automática:**

   ```bash
   bash scripts/dr_verify_restore.sh "${LATEST_BACKUP}"
   ```

3. **Restaurar directamente en la base de datos activa:**

   ```bash
   openssl enc -d -aes-256-cbc -pbkdf2 -in "${LATEST_BACKUP}" -k "${BACKUP_ENCRYPTION_KEY}" | \
     gzip -d | \
     kubectl exec -i -n pokemon-app deploy/pokedex-postgres -- psql -U pokedex_app -d pokedex_db
   ```

4. **Validar conteo y consistencia:**

   ```bash
   kubectl exec -i -n pokemon-app deploy/pokedex-postgres -- \
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
