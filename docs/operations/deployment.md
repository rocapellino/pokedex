# Runbook: Despliegue y Promoción de Versiones

## 1. Propósito

Establecer el procedimiento estándar para la entrega continua y promoción de versiones de la plataforma Pokédex desde el código fuente hasta los entornos de producción en Kubernetes.

## 2. Flujo de Promoción

```text
Push/Merge a main
       │
       ▼
CI Pipeline (.github/workflows/ci.yml)
  ├── Tests unitarios, integración y fuzzing
  ├── Análisis SAST (Semgrep, CodeQL) y Secretos (Gitleaks)
  ├── Auditoría de dependencias y Checkov IaC
  ├── Build Docker multi-stage
  ├── Generación de SBOM CycloneDX
  ├── Firma criptográfica Cosign y SLSA Provenance
  └── Push a GitHub Packages (ghcr.io)
       │
       ▼
Sincronización GitOps (ArgoCD)
  ├── Detección de nueva versión/digest
  ├── Verificación de políticas Kyverno en admisión
  └── Despliegue RollingUpdate con zero-downtime
```

## 3. Procedimiento Operativo

### Verificación previa

Antes de fusionar un cambio a `main`:

```bash
task validate
```

### Sincronización Manual de ArgoCD (si la auto-sincronización está pausada)

```bash
task gitops:sync:cloud     # Para AWS EKS
task gitops:sync:proxmox   # Para Proxmox VE
```

### Comprobación posterior

```bash
task k8s:status
curl -f http://<INGRESS_IP>/readyz
curl -f http://<INGRESS_IP>/version
```

## 4. Gobernanza de Despliegue y Retiro de Scripts Legados (ADR-020)

Conforme a lo establecido en [ADR-020](../decisions/ADR-020-unified-deployment-governance-and-script-retirement.md):

1. **CLI Canónico Único**: Todas las operaciones de compilación, validación, pruebas, infraestructura y despliegue se ejecutan exclusivamente mediante `Taskfile.yml` (`task --list`) o scripts tipados en `package.json`. Consulte la [Referencia Oficial del CLI Canónico](./TASKFILE_CLI_REFERENCE.md) y [ADR-026](../decisions/ADR-026-taskfile-cli-alias-deprecation-and-lifecycle.md) para el catálogo canónico y la estrategia de retiro de aliases en cuatro fases.
2. **Prohibición de Scripts Imperativos**: Queda estrictamente prohibido el uso o creación de scripts shell imperativos de despliegue (`deploy*.sh`, `*deploy.sh`). El aprovisionamiento y entrega es 100% declarativo vía Helm 3, ArgoCD y OpenTofu.
3. **Inventario Canónico Auditable**: La única secuencia shell autorizada en el repositorio es `scripts/dr_verify_restore.sh` para pruebas de DR. Para verificar el cumplimiento:

```bash
task governance:audit-scripts
```

## 5. Orquestación GitOps Avanzada, Sync Waves y App-of-Apps (ADR-021)

Conforme a [ADR-021](../decisions/ADR-021-advanced-gitops-sync-waves-and-health-checks.md), los despliegues con ArgoCD eliminan condiciones de carrera y ordenan el ciclo de vida mediante ondas de sincronización deterministas:

| Ola de Sincronización | Componentes / Recursos | Rol en el Despliegue |
| :---: | :--- | :--- |
| **Ola 0** | `ConfigMap`, `Secret`, `ClusterSecretStore`, `ExternalSecret`, `PostgreSQL StatefulSet`, `Redis` | Aprovisiona almacenamiento de datos, secretos y dependencias base. |
| **Ola 1** | `PreSync` / `Sync` Job de Siembra y Esquema DB (`pokedex-db-seed`) | Ejecuta migraciones Drizzle y verificación relacional previa al tráfico. |
| **Ola 2** | `PgBouncer`, `Deployment/pokemon-api`, `ServiceAccount` | Inicia la capa de servicios backend cuando la base de datos está migrada. |
| **Ola 3** | `Deployment/pokedex-web`, `HPA v2`, `PodDisruptionBudget` | Inicia la capa web y políticas de autoescalado elástico. |
| **Ola 4** | `Ingress`, `NetworkPolicies`, `CiliumNetworkPolicy` | Habilita enrutamiento perimetral L7 una vez que la aplicación es saludable. |

### Orquestación Centralizada con App-of-Apps

Para desplegar y sincronizar todos los entornos desde la aplicación raíz unificada:

```bash
task gitops:apps:root
```

### Health Checks Declarativos para CRDs

Para aplicar la evaluación de salud personalizada de `ExternalSecret`, `SealedSecret` y `ClusterPolicy` en el controlador de ArgoCD:

```bash
task gitops:health-checks
```


