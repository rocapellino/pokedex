# Procedimiento Operativo: Copias de Seguridad y Restauración Local de Base de Datos

> [!NOTE]
> **Jerarquía y Fronteras de Documentación de Backups:**
>
> - **Este documento (`backup-restore.md`):** Procedimiento estándar y rutinario de copias de seguridad locales de PostgreSQL en Kubernetes / Docker, verificación de checksums y restauración manual con `psql`.
> - [**GDRIVE_BACKUP_GUIDE.md**](GDRIVE_BACKUP_GUIDE.md): Especificación e instrucciones del mecanismo off-site activo mediante sincronización con Google Drive (Rclone K8s-Native).
> - [**DISASTER_RECOVERY_PLAN.md**](../runbooks/DISASTER_RECOVERY_PLAN.md): Política general de contingencia ante desastres catastróficos, objetivos RPO/RTO y protocolos de reconstrucción del clúster.

## 1. Propósito

Describir el ciclo de vida operativo de las copias de seguridad locales de PostgreSQL, los procedimientos de restauración manual y la ejecución del simulacro automatizado de Disaster Recovery.

## 2. Parámetros Criptográficos y de Retención

- **Algoritmo de cifrado**: AES-256-CBC con derivación PBKDF2 y salt criptográfico.
- **Integridad**: Suma de comprobación SHA-256 generada simultáneamente (`.sha256`).
- **Retención local**: 30 días en volúmenes dedicados (`pokedex-backup-pvc`).
- **Retención remota/offsite**: Replicación automatizada hacia Google Drive (formalizada en [ADR-028](../decisions/ADR-028-gdrive-offsite-backup-strategy.md) y documentada en [GDRIVE_BACKUP_GUIDE.md](GDRIVE_BACKUP_GUIDE.md)), manteniendo esqueletos agnósticos en [OFFSITE_BACKUP_BLUEPRINTS.md](OFFSITE_BACKUP_BLUEPRINTS.md).

## 3. Procedimientos Operativos

### Ejecución de Simulacro del Mecanismo (Smoke Test)

```bash
# Simulación no destructiva del mecanismo en entorno de desarrollo / CI
task dr:drill
# O invocando directamente el script con bandera dry-run:
bash scripts/dr_verify_restore.sh --dry-run
```

### Certificación de Copia de Seguridad Real

```bash
# Certificación criptográfica y restauración real del snapshot productivo
export BACKUP_ENCRYPTION_KEY="<tu-clave-secreta>"
task dr:verify
# O invocando directamente el script sobre un archivo específico:
bash scripts/dr_verify_restore.sh /ruta/al/backup/pokedex_2026-09-17.sql.gz.enc
```

### Restauración Manual de Emergencia

1. Obtener el volcado cifrado y su archivo de checksum:

   ```bash
   sha256sum -c pokedex_backup_2026-09-13.sql.gz.enc.sha256
   ```

2. Descifrar el archivo con la clave simétrica autorizada:

   ```bash
   openssl enc -d -aes-256-cbc -pbkdf2 \
     -in pokedex_backup_2026-09-13.sql.gz.enc \
     -out /tmp/decrypted.sql.gz \
     -k "${BACKUP_ENCRYPTION_KEY}"
   ```

3. Descomprimir e inyectar en PostgreSQL:

   ```bash
   gzip -d -c /tmp/decrypted.sql.gz | psql "${DATABASE_URL}" -v ON_ERROR_STOP=1
   ```

4. Destruir los archivos temporales descifrados:

   ```bash
   shred -u /tmp/decrypted.sql.gz
   ```
