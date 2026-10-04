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
    ├── pokedex-preprod        → gitops/environments/proxmox-preprod/values.yaml 🟢 ACTIVO
    └── (pokedex-cloud)         → values.prod.yaml + gitops/environments/cloud/values.yaml ⚪ INACTIVO
```

## Estructura

| Ruta | Contenido |
| :--- | :--- |
| [`apps/root-application.yaml`](apps/root-application.yaml) | Application raíz. Declara el App-of-Apps y el `exclude` |
| [`apps/app-proxmox-preprod.yaml`](apps/app-proxmox-preprod.yaml) | Pre-producción (LXC 800, in-cluster). Continuous Delivery, sin ventanas de bloqueo |
| [`apps/app-cloud.yaml`](apps/app-cloud.yaml) | **Blueprint prod cloud agnóstico e inactivo** (GITOPS-001, ADR-030) |
| [`environments/`](environments/) | Overrides de valores por entorno |
| [`health-checks/argocd-cm-healthchecks.yaml`](health-checks/argocd-cm-healthchecks.yaml) | Evaluadores Lua de salud para CRDs (ADR-003) |

---

## Entornos: cuál está activo y cuál no

> [!WARNING]
> **Sólo pre-prod está desplegado** (LXC 800, `10.10.13.100`). Prod cloud es un
> **blueprint inactivo** sin proveedor fijado (ADR-030). La antigua prod Proxmox
> (VM 801) se retiró en el paso 5 de ADR-030.

| Entorno | Application | Clasificación | Estado | Cluster destino |
| :--- | :--- | :--- | :--- | :--- |
| Pre-producción | `pokedex-preprod` | 🟢 **ACTIVE** | Activo | in-cluster (`https://kubernetes.default.svc`, LXC 800) |
| Prod cloud (agnóstico) | `pokedex-cloud` | ⚪ **REFERENCE** | Inactivo (Blueprint) | marcador `.invalid`, sin clúster registrado |

La exclusión de `app-cloud.yaml` está declarada en `root-application.yaml:38-40` con el motivo
escrito dentro del propio manifiesto: sin ella, ArgoCD descubriría el blueprint y lo
sincronizaría contra un endpoint inexistente. Además, `app-cloud.yaml` porta las anotaciones
normativas `architecture.pokedex.io/tier: "reference-template"` y `architecture.pokedex.io/status: "inactive"`,
y no define sincronización automatizada (`syncPolicy.automated`) para prevenir reconciliaciones accidentales.

### Activar prod cloud (decisión de arquitectura, no trivial)

```bash
task gitops:bootstrap:cloud    # aplica app-cloud.yaml fuera del App-of-Apps
```

Para declararlo **activo de forma permanente** hay que hacer varias cosas, no una:

1. Fijar el proveedor en un ADR y completar los puntos de variación de `environments/cloud/values.yaml`.
2. Registrar el clúster en ArgoCD y reemplazar el marcador `destination.server`.
3. Eliminar `app-cloud.yaml` del `exclude` de `root-application.yaml`.
4. Actualizar el estado declarado en `CLOUD_INFRASTRUCTURE_DESIGN.md`.

---

## Versión desplegada y pinning

El `targetRevision` de las Applications hijas (`app-proxmox-preprod.yaml` y `app-cloud.yaml`) es
idéntico y **debe apuntar a un tag inmutable** (`vX.Y.Z`), nunca a una rama.

> [!NOTE]
> **Modelo de promoción (ADR-003, enmienda 2026-10-04):** la Application raíz (`root-application.yaml`)
> sigue `main` y solo lee **qué tag** fija cada hija. Al integrar un PR de promote, ArgoCD aplica el
> nuevo tag sin reaplicar la raíz. El chart, los values y las imágenes que se despliegan siguen
> resolviéndose desde el tag inmutable de cada hija, y `main` solo cambia mediante PRs revisados.
> Antes, la raíz fijada a un tag leía `gitops/apps` desde ese tag y nunca veía los pines nuevos.

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
task gitops:apps:root        # 1. Aplicar la Application raíz (App-of-Apps canónico, ADR-003)
task gitops:health-checks    # 2. Configurar Custom Health Checks en ArgoCD (PRERREQUISITO)
task gitops:sync:proxmox     # Forzar sincronización declarativa en pre-prod Proxmox (ADR-030)
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
3. **Pre-prod es entrega continua.** `pokedex-preprod` no declara `syncWindows`; la ventana
   de fin de semana pertenecía a la prod Proxmox retirada.
4. **`infra/helm/pokedex/values.prod.yaml` es la base del blueprint prod cloud.** Solo lo
   consume `app-cloud.yaml`, inactiva (INFRA-011, ADR-030). El perfil desplegado es
   `environments/proxmox-preprod/values.yaml`.

## Trazabilidad

| Documento | Cubre |
| :--- | :--- |
| [ADR-003](../docs/decisions/ADR-003-gitops-with-argocd.md) | GitOps declarativo, sync waves, health checks, App-of-Apps |
| [ADR-005](../docs/decisions/ADR-005-secret-management.md) | Gestión de secretos, rotación automatizada y Reloader |
| [`docs/operations/deployment.md`](../docs/operations/deployment.md) | Procedimiento de promoción y rollback |
| [`docs/architecture/APPLICATION_LIFECYCLE.md`](../docs/architecture/APPLICATION_LIFECYCLE.md) | Ciclo de vida de releases |
