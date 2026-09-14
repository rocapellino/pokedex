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

### Paso 3: Propagación y Rolling Restart automático

Gracias a la anotación de Stakater Reloader (`secret.reloader.stakater.com/reload: "pokedex-secrets"` o `reloader.stakater.com/auto: "true"` formalizado en [ADR-022](../decisions/ADR-022-automated-credential-rotation-and-reloader.md)), el Deployment ejecutará un RollingUpdate automático sin tiempo de inactividad:

```bash
kubectl rollout status deployment/pokemon-api -n pokemon-app
```

## 4. Auditoría Automatizada de Rotación (ADR-022)

Conforme a [ADR-022](../decisions/ADR-022-automated-credential-rotation-and-reloader.md), todos los despliegues de Kubernetes que consumen secretos están obligados a incorporar la anotación de recarga dinámica `reloader.stakater.com/auto: "true"`, y los manifiestos `ExternalSecret` aplican un `refreshInterval: 1h`.

Para auditar la conformidad de toda la plataforma en CI o localmente:

```bash
task secrets:audit-rotation
```
