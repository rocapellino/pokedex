# 🚀 Árbol GitOps (ArgoCD App-of-Apps)

> [!IMPORTANT]
> Este directorio es la **fuente de verdad del despliegue**. Define qué versión se
> despliega (`targetRevision`) y con qué valores en cada entorno. No es evidencia
> histórica: lo que hay aquí es exactamente lo que ArgoCD reconcilia.
>
> Si buscas **qué se despliega realmente**, este es el sitio. Si buscas **qué
> contiene una imagen**, es [`infra/helm/pokedex/`](../infra/helm/pokedex/).

---

## Modelo: App-of-Apps

Un único manifiesto raíz gobierna el resto mediante el campo `directory` de ArgoCD:

```text
pokedex-root  (root-application.yaml)
    │  escanea gitops/apps/  (recurse: false)
    │
    ├── pokedex-proxmox        → gitops/environments/proxmox/values.yaml        🟢 ACTIVO
    ├── pokedex-preprod        → gitops/environments/proxmox-preprod/values.yaml 🟢 ACTIVO
    └── (pokedex-cloud)         → gitops/environments/aws/values.yaml           ⚪ INACTIVO
```

## Estructura

| Ruta | Contenido |
| :--- | :--- |
| [`apps/root-application.yaml`](apps/root-application.yaml) | Application raíz. Declara el App-of-Apps y el `exclude` |
| [`apps/app-proxmox.yaml`](apps/app-proxmox.yaml) | Producción on-premise. Freeze de fin de semana (62 h) |
| [`apps/app-proxmox-preprod.yaml`](apps/app-proxmox-preprod.yaml) | Pre-producción. Continuous Delivery, sin ventanas de bloqueo |
| [`apps/app-cloud.yaml`](apps/app-cloud.yaml) | **Referencia inactiva** para AWS/EKS (GITOPS-001) |
| [`environments/`](environments/) | Overrides de valores por entorno |
| [`health-checks/argocd-cm-healthchecks.yaml`](health-checks/argocd-cm-healthchecks.yaml) | Evaluadores Lua de salud para CRDs (ADR-021) |

---

## Entornos: cuál está activo y cuál no

> [!WARNING]
> **Sólo Proxmox y Proxmox-preprod están desplegados.** AWS/EKS es una
> **referencia inactiva**: existe para preparar una futura migración, no para
> desplegarse.

| Entorno | Application | Clasificación | Estado | Cluster destino |
| :--- | :--- | :--- | :--- | :--- |
| Producción (on-prem) | `pokedex-proxmox` | 🟢 **ACTIVE** | Activo | `k8s-proxmox.internal.lan` |
| Pre-producción | `pokedex-preprod` | 🟢 **ACTIVE** | Activo | `k8s-preprod.internal.lan` |
| Nube pública (AWS) | `pokedex-cloud` | ⚪ **REFERENCE** | Inactivo (Blueprint) | endpoint EKS no registrado |

La exclusión de `app-cloud.yaml` está declarada en `root-application.yaml:38-40` con el motivo
escrito dentro del propio manifiesto: sin ella, ArgoCD descubriría el blueprint y lo
sincronizaría contra un endpoint inexistente. Además, `app-cloud.yaml` porta las anotaciones
normativas `architecture.pokedex.io/tier: "reference-template"` y `architecture.pokedex.io/status: "inactive"`,
y no define sincronización automatizada (`syncPolicy.automated`) para prevenir reconciliaciones accidentales.

### Activar AWS (decisión de arquitectura, no trivial)

```bash
task gitops:bootstrap:cloud    # aplica app-cloud.yaml fuera del App-of-Apps
```

Para declararlo **activo de forma permanente** hay que hacer tres cosas, no una:

1. Registrar el endpoint EKS como cluster secret en ArgoCD.
2. Eliminar `app-cloud.yaml` del `exclude` de `root-application.yaml`.
3. Actualizar el estado declarado en `CLOUD_INFRASTRUCTURE_DESIGN.md`.

---

## Versión desplegada y pinning

El `targetRevision` de las cuatro Applications es idéntico y **debe apuntar a un tag
inmutable** (`vX.Y.Z`), nunca a una rama.

> [!NOTE]
> **Modelo de Promoción Inmutable:** La propia Application raíz (`root-application.yaml`)
> está fijada a un tag inmutable. Esto significa que los cambios en `gitops/` introducidos en `main`
> no son leídos por ArgoCD hasta que se promociona un nuevo tag de release (`task gitops:pin TAG=vX.Y.Z`).
> Este desacoplamiento protege el clúster contra drifts no versionados.

La paridad 1:1 es un **gate automático**, no una convención:

```bash
task gitops:pin:check        # audita la paridad de targetRevision
task gitops:verify-parity:strict   # paridad de digests OCI entre entornos
```

La igualdad `package.json` == `Chart.yaml` == `targetRevision` está institucionalizada en
`tests/version_consistency.test.ts` (VER-001).

```bash
task gitops:pin TAG=vX.Y.Z   # actualiza el targetRevision tras una promoción
```

---

## Operación

```bash
task gitops:apps:root        # 1. Aplicar la Application raíz (App-of-Apps canónico, ADR-021)
task gitops:health-checks    # 2. Configurar Custom Health Checks en ArgoCD (PRERREQUISITO)
task gitops:sync:proxmox     # Forzar sincronización declarativa en producción
task gitops:status           # Consultar estado de salud de las aplicaciones en el clúster
```

> [!IMPORTANT]
> **El orden de los health checks importa.** Son un prerrequisito de bootstrap del propio
> ArgoCD: deben existir *antes* de que el App-of-Apps gestione Applications con CRDs.
> Si se aplica al revés, ArgoCD evalúa los `ExternalSecret` y `ClusterPolicy` sin
> evaluador y puede reportarlos `Healthy` por ausencia de condición.
>
> Ver [`docs/operations/deployment.md`](../docs/operations/deployment.md) §5.

---

## Reglas de este directorio

1. **Todo entorno activo se renderiza en CI.** El job `Infra CI / ⎈ Helm Lint, Render & K8s
   Contracts` renderiza cada `values.yaml` y lo valida con kubeconform y kube-linter
   (GITOPS-005). Un entorno activo sin render es un fallo de cobertura.
2. **Los digests OCI van fijados por SHA-256** en todos los perfiles, con paridad verificada
   entre entornos (`gitops:verify-parity:strict`).
3. **Production no se toca sin ventana.** `pokedex-proxmox` declara un `syncWindow` de bloqueo
   de viernes 18:00 UTC a lunes 08:00 UTC, con `manualSync: true` para hotfix.
4. **La referencia de `infra/helm/pokedex/values.prod.yaml` no aplica.** Ese archivo es un
   perfil de referencia que ninguna Application consume (INFRA-011). El perfil de producción
   real es `environments/proxmox/values.yaml`.

## Trazabilidad

| Documento | Cubre |
| :--- | :--- |
| [ADR-021](../docs/decisions/ADR-021-advanced-gitops-sync-waves-and-health-checks.md) | Sync waves, health checks, App-of-Apps |
| [ADR-022](../docs/decisions/ADR-022-automated-credential-rotation-and-reloader.md) | Rotación automatizada de credenciales y Reloader |
| [`docs/operations/deployment.md`](../docs/operations/deployment.md) | Procedimiento de promoción y rollback |
| [`docs/architecture/APPLICATION_LIFECYCLE.md`](../docs/architecture/APPLICATION_LIFECYCLE.md) | Ciclo de vida de releases |
