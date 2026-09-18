# Runbook: Rotación Controlada de Secretos y Credenciales

## 1. Propósito

Establecer el protocolo para la rotación periódica y de emergencia de claves criptográficas, contraseñas de base de datos, API keys administrativas y credenciales de backup.

## 2. Inventario de Secretos y Periodicidad

| Secreto | Mecanismo de Inyección | Periodicidad de Rotación | Impacto de Rotación |
| :--- | :--- | :--- | :--- |
| **`POSTGRES_PASSWORD`** | ExternalSecret / SealedSecret | 90 días | Reinicio de conexiones en PgBouncer |
| **`REDIS_PASSWORD`** | ExternalSecret / SealedSecret | 90 días | Reinicio de conexiones del pool Redis |
| **`ADMIN_API_KEY`** | ExternalSecret / SealedSecret | 60 días | Exige actualizar clientes de administración |
| **`ADMIN_SESSION_SECRET`** | ExternalSecret / SealedSecret | 60 días | Invalida sesiones activas en curso |
| **`BACKUP_ENCRYPTION_KEY`** | Secret de Kubernetes / CI | 180 días | Cifra volcados futuros (no altera pasados) |

## 3. Procedimiento de Rotación

### Paso 1: Actualizar el secreto en el proveedor upstream (AWS Secrets Manager o Vault)

Actualizar el valor de la clave correspondiente en el almacén de secretos.

### Paso 2: Forzar sincronización en External Secrets Operator

```bash
kubectl annotate es pokedex-secrets -n pokemon-app force-sync=$(date +%s) --overwrite
```

### Paso 3: Propagación y Rolling Restart

El mecanismo de propagación depende del entorno de ejecución:

* **Entorno Cloud (AWS EKS):**
  Gracias al controlador de **Stakater Reloader** y la anotación declarativa en los Deployments (`reloader.stakater.com/auto: "true"` formalizado en [ADR-022](../decisions/ADR-022-automated-credential-rotation-and-reloader.md)), el clúster detecta la mutación del Secret y ejecuta automáticamente un *RollingUpdate* progresivo sin tiempo de inactividad.

* **Entorno On-Premise (Proxmox VE / K3s - Perfil Lean MVP):**
  Stakater Reloader está **desactivado intencionalmente** (`reloader.enabled: false`) para reducir la sobrecarga de controladores en clúster y mantener un footprint ultraliviano (< 1 GB RAM total).
  - Los cambios en configuración (`ConfigMap`) provocan automáticamente un *RollingUpdate* mediante la anotación nativa de Helm **`checksum/config`** (`spec.template.metadata.annotations`).
  - Para aplicar la rotación de secretos inmediatamente tras la sincronización de ESO sin esperar a un nuevo release de Helm, ejecute un reinicio progresivo:
    ```bash
    kubectl rollout restart deployment/pokemon-api deployment/pokemon-web -n pokemon-app
    ```

Monitorear el estado del despliegue:
```bash
kubectl rollout status deployment/pokemon-api -n pokemon-app
```

## 4. Auditoría Automatizada de Rotación (ADR-022)

Conforme a [ADR-022](../decisions/ADR-022-automated-credential-rotation-and-reloader.md), todos los despliegues de Kubernetes que consumen secretos están obligados a incorporar la anotación de recarga dinámica `reloader.stakater.com/auto: "true"`, y los manifiestos `ExternalSecret` aplican un `refreshInterval: 1h`.

Para auditar la conformidad de toda la plataforma en CI o localmente:

```bash
task secrets:audit-rotation
```
