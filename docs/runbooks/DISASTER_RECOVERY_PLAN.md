# Plan de Recuperación ante Desastres (Disaster Recovery Plan - DRP)

Este documento define la política oficial, las métricas de servicio (RPO/RTO), los mecanismos de respaldo cifrado y los procedimientos de restauración paso a paso para la base de datos de la plataforma **Pokédex**.

---

## 1. Objetivos de Nivel de Servicio (SLAs de DR)

| Métrica | Definición | Objetivo Oficial | Mecanismo de Garantía |
| :--- | :--- | :---: | :--- |
| **RPO** *(Recovery Point Objective)* | Pérdida máxima tolerable de datos | **< 24 horas** | `CronJob` de backup diario ejecutado a las `02:00 UTC` con retención rotativa de 7 días. |
| **RTO** *(Recovery Time Objective)* | Tiempo máximo para restaurar el servicio | **< 2 horas** | Restauración automatizada mediante script `dr_verify_restore.sh` (< 5 minutos en pruebas reales). |

---

## 2. Arquitectura de Copias de Seguridad

```mermaid
flowchart LR
    PG[(PostgreSQL 16\npokedex_db)] -->|pg_dump| GZ[Compresión\ngzip -9]
    GZ -->|openssl enc| AES[Cifrado Simétrico\nAES-256-CBC + PBKDF2]
    AES -->|sha256sum| HASH[Suma de Integridad\nSHA-256]
    AES --> PVC[Volumen Persistente\n/backups (7 días)]
    HASH --> PVC
```

### 2.1. Características de Seguridad del Backup

1. **Zero-Trust Egress**: El pod de backup no tiene salida a Internet pública; su comunicación está estrictamente limitada a PostgreSQL (puerto 5432) y CoreDNS (puerto 53).
2. **Hardening de Contenedor**: Corre con usuario no root (`UID 70`), sistema de archivos de solo lectura (`readOnlyRootFilesystem: true`) y descarte total de capacidades Linux (`capabilities.drop: [ALL]`).
3. **Cifrado Criptográfico Estricto**:
   - Algoritmo: `AES-256-CBC` con derivación de clave `PBKDF2` y salting criptográfico aleatorio.
   - La clave se inyecta de forma segura mediante variable de entorno `BACKUP_ENCRYPTION_KEY` proveniente de Kubernetes Secret / External Secrets Operator.
4. **Verificación de Integridad**: Cada volcado genera un archivo anexo `.sha256` para validar que el archivo no fue manipulado ni se corrompió durante la transferencia o almacenamiento.

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
4. Montar el volumen de backup y ejecutar la restauración con el comando del Escenario A.
5. Iniciar los pods de la API y Frontend web una vez validada la integridad de PostgreSQL.

---

## 4. Simulacro y Verificación Automatizada

El repositorio incluye el script de validación `scripts/dr_verify_restore.sh`, el cual se puede ejecutar de forma no destructiva en cualquier entorno o pipeline de CI/CD:

```bash
bash scripts/dr_verify_restore.sh --dry-run
```

Este script prueba el ciclo completo de verificación SHA-256, descifrado AES-256, descompresión gzip y validación estructural del DDL de `pokedex_entries`, midiendo el tiempo transcurrido contra el objetivo de RTO.
