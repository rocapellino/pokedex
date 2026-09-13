# Plan de Recuperación ante Desastres (Disaster Recovery Plan - DRP)

Este documento define la política oficial, las métricas de servicio (RPO/RTO), los mecanismos de respaldo cifrado y los procedimientos de restauración paso a paso para la base de datos de la plataforma **Pokédex**.

---

## 1. Objetivos de Nivel de Servicio (SLAs de DR)

| Métrica | Definición | Objetivo Oficial | Mecanismo de Garantía |
| :--- | :--- | :---: | :--- |
| **RPO** *(Recovery Point Objective)* | Pérdida máxima tolerable de datos | **< 24 horas** | `CronJob` de backup diario ejecutado a las `02:00 UTC` con retención rotativa de 7 días. |
| **RTO** *(Recovery Time Objective)* | Tiempo máximo para restaurar el servicio | **< 2 horas** | Restauración automatizada mediante script `dr_verify_restore.sh` (< 5 minutos en pruebas reales). |

### 1.1. Comparativa de SLAs: Objetivos Declarados vs. Mediciones Empíricas

| Métrica | SLA Teórico Declarado | Medición Real (Benchmark Empírico) | Método de Validación Empírica |
| :--- | :---: | :---: | :--- |
| **RPO** | < 24 horas | **≤ 24 horas** (Snapshot diario garantizado) | Periodicidad del `CronJob` de backup ejecutado a las 02:00 UTC con retención de 7 snapshots rotativos inmutables. |
| **RTO** | < 2 horas | **~1.5 segundos** (Restauración completa verificada) | Benchmark automatizado con `scripts/dr_verify_restore.sh --dry-run` en contenedor efímero `postgres:16-alpine` (descifrado AES-256-CBC PBKDF2 + verificación SHA-256 + descompresión gzip + importación DDL/DML real con 21 índices y aserciones de consistencia). |

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

El repositorio incluye el script de validación `scripts/dr_verify_restore.sh`, el cual se puede ejecutar de forma no destructiva en cualquier entorno o pipeline de CI/CD:

```bash
bash scripts/dr_verify_restore.sh --dry-run
```

Este script ejecuta:
- Generación de clave efímera dinámica con `openssl rand -hex 32` en modo simulación (sin claves predeterminadas).
- Verificación criptográfica SHA-256, descifrado AES-256 y descompresión gzip.
- Prueba de restauración real en base de datos PostgreSQL efímera (vía Docker) o remota (`DR_POSTGRES_URL`), validando existencia de la tabla `pokedex_entries`, conteo de filas, lectura representativa e integridad de índices.
- Medición del tiempo transcurrido contra el objetivo oficial de RTO (< 2 horas).
