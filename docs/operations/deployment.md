# Procedimiento Operativo: Despliegue y Promoción de Versiones (GitOps)

> [!NOTE]
> **Frontera de Uso:** Este procedimiento gobierna la **entrega continua canónica y automatizada mediante GitOps (ArgoCD)** para todos los entornos de la plataforma. Para pruebas manuales, empaquetado y diagnósticos aislados con Helm fuera del flujo de GitOps, consultar el runbook especializado [HELM_DEPLOYMENT_GUIDE.md](../runbooks/HELM_DEPLOYMENT_GUIDE.md).

## 1. Propósito

Establecer el procedimiento estándar para la entrega continua y promoción de versiones de la plataforma Pokédex desde el código fuente hasta los entornos de producción en Kubernetes.

## 2. Flujo de Promoción

```text
Push/Merge a main
       │
       ▼
CI Pipeline (.github/workflows/ci.yaml)
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

1. **CLI Canónico Único**: Todas las operaciones de compilación, validación, pruebas, infraestructura y despliegue se ejecutan exclusivamente mediante `Taskfile.yaml` (`task --list`) o scripts tipados en `package.json`. Consulte la [Referencia Oficial del CLI Canónico](./TASKFILE_CLI_REFERENCE.md) y [ADR-026](../decisions/ADR-026-taskfile-cli-alias-deprecation-and-lifecycle.md) para el catálogo canónico y la estrategia de retiro de aliases en cuatro fases.
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

Los Custom Health Checks **no forman parte del App-of-Apps**: son un
**prerrequisito de bootstrap** del propio ArgoCD. Extienden el ConfigMap
`argocd-cm` con evaluadores Lua, de modo que ArgoCD debe conocerlos *antes* de
gestionar las Applications que dependen de esos CRDs.

```bash
task gitops:health-checks   # 1. Configurar ArgoCD (prerrequisito)
task gitops:apps:root       # 2. Aplicar el App-of-Apps
```

> [!IMPORTANT]
> El orden importa. Si el App-of-Apps se aplica primero, ArgoCD evalúa los
> `ExternalSecret` y `ClusterPolicy` sin los health checks y puede reportarlos
> como `Healthy` por ausencia de condición, enmascarando un CRD que nunca se
> sincronizó. Aplícalos como paso previo al root.
>
> **Estado (GITOPS-001):** `root-application.yaml` gobierna únicamente entornos
> activos (Proxmox y Proxmox-preprod). `app-cloud.yaml` es una referencia
> inactiva de AWS/EKS y queda excluida del descubrimiento del App-of-Apps.
