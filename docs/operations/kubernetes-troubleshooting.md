# Runbook: Diagnóstico y Resolución de Problemas en Kubernetes

## 1. Propósito

Runbook de referencia rápida para identificar y mitigar fallos frecuentes en Pods, Servicios, Ingress, cuotas y políticas de admisión en el clúster de Kubernetes.

## 2. Árbol de Diagnóstico

### Fallo 1: Pod en CrashLoopBackOff o Error

- **Causa común**: Fallo en arranque de la aplicación o variables de entorno críticas faltantes.
- **Acción**:

  ```bash
  kubectl logs -n pokemon-app deploy/pokemon-api --previous
  kubectl describe pod -n pokemon-app -l app=pokemon-api
  ```

  Verificar que `DATABASE_URL`, `REDIS_URL` o `ADMIN_API_KEY` estén inyectadas por External Secrets.

### Fallo 2: Pod en ImagePullBackOff o ErrImagePull

- **Causa común**: Imagen no firmada bloqueada por política Kyverno o secreto de GHCR ausente.
- **Acción**:

  ```bash
  kubectl get events -n pokemon-app --field-selector reason=FailedCreate
  kubectl describe clusterpolicy/check-image-signature
  ```

### Fallo 3: Pods no reciben tráfico (Endpoints 502 / 503)

- **Causa común**: Fallo de `readinessProbe` o NetworkPolicy bloqueando tráfico entre Ingress y API.
- **Acción**:

  ```bash
  kubectl get endpoints -n pokemon-app
  kubectl describe service pokemon-api-svc -n pokemon-app
  ```

### Fallo 4: ExternalSecret en estado `SecretSyncedError`

- **Causa común**: Falta de permisos en IAM / Vault o secreto ausente en el almacén externo.
- **Acción**:

  ```bash
  kubectl describe externalsecret -n pokemon-app
  kubectl describe secretstore -n pokemon-app
  ```
