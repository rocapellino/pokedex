# Runbook: Copias de Seguridad y Restauración de Base de Datos

## 1. Propósito

Describir el ciclo de vida operativo de las copias de seguridad de PostgreSQL, los procedimientos de restauración manual y la ejecución del simulacro automatizado de Disaster Recovery.

## 2. Parámetros Criptográficos y de Retención

- **Algoritmo de cifrado**: AES-256-CBC con derivación PBKDF2 y salt criptográfico.
- **Integridad**: Suma de comprobación SHA-256 generada simultáneamente (`.sha256`).
- **Retención local**: 30 días en volúmenes dedicados.
- **Retención remota/offsite**: Replicación en almacenamiento compatible S3 con bloqueo de versiones (Object Lock).

## 3. Procedimientos Operativos

### Ejecución de Simulacro Automatizado (DR)

```bash
# Simulación no destructiva en entorno de desarrollo / CI
task dr:verify
# O invocando directamente el script:
bash scripts/dr_verify_restore.sh --dry-run
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
