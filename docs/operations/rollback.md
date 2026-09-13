# Runbook: Reversión Controlada de Despliegues (Rollback)

## 1. Propósito

Proveer las instrucciones de emergencia para revertir de manera inmediata una versión defectuosa o inestable en Kubernetes sin pérdida de disponibilidad ni corrupción de datos.

## 2. Escenarios de Reversión

### Escenario A: Reversión Rápida vía ArgoCD (Recomendado)

1. Conectar con la interfaz o CLI de ArgoCD:

   ```bash
   argocd app history pokedex-cloud
   ```

2. Revertir a la revisión estable previa (ID N):

   ```bash
   argocd app rollback pokedex-cloud <REVISION_ID>
   ```

3. Comprobar la estabilización de los pods:

   ```bash
   kubectl get pods -n pokemon-app -w
   ```

### Escenario B: Reversión de Emergencia vía Helm

Si el controlador de ArgoCD está inactivo:

```bash
helm history pokedex -n pokemon-app
helm rollback pokedex <REVISION_ID> -n pokemon-app
```

### Escenario C: Reversión en Git (GitOps Puro)

Crear un commit de reversión sobre `main`:

```bash
git revert <COMMIT_HASH>
git push origin main
```

ArgoCD sincronizará automáticamente el commit revertido como el nuevo estado deseado.
