# ☁️ Diseño de Infraestructura Multi-Entorno y GitOps Universal

Este documento define la arquitectura de infraestructura, la topología de red y la sincronización declarativa GitOps de la plataforma **Pokédex**. Establece a **Kubernetes como el runtime universal y agnóstico de producción** y describe el modelo de entornos de ADR-030: **Dev** local, **Pre-Prod** en Proxmox VE y **Prod** en la nube como blueprint agnóstico e inactivo.

---

## 📑 Tabla de Contenidos

1. [Arquitectura Agnóstica y Núcleo Portable](#1-arquitectura-agnóstica-y-núcleo-portable)
2. [Modelo de Entornos](#2-modelo-de-entornos)
3. [Diagrama de Flujo: Aprovisionamiento y Despliegue GitOps](#3-diagrama-de-flujo-aprovisionamiento-y-despliegue-gitops)
4. [Blueprint Prod Cloud: Puntos de Variación del Proveedor](#4-blueprint-prod-cloud-puntos-de-variación-del-proveedor)
5. [Topología de Red y Aislamiento (Zero-Trust)](#5-topología-de-red-y-aislamiento-zero-trust)
6. [Estructura del Código IaC y GitOps](#6-estructura-del-código-iac-y-gitops)
7. [Política de Runtime Oficial y Experiencia de Desarrollo Dual](#7-política-de-runtime-oficial-y-experiencia-de-desarrollo-dual)
8. [Matriz de Estado Real de Soporte de Infraestructura](#8-matriz-de-estado-real-de-soporte-de-infraestructura)

---

## 1. Arquitectura Agnóstica y Núcleo Portable

El principio rector es la **portabilidad del núcleo de la aplicación**: la lógica de negocio, el empaquetado de contenedores y los manifiestos de despliegue no dependen de un proveedor de nube ni de un hardware particular.

```text
                                POKÉDEX
                                   │
                ┌──────────────────┴──────────────────┐
                │                                     │
         NÚCLEO PORTABLE                      INFRAESTRUCTURA
                │                                     │
       ┌────────┴────────┐                ┌───────────┼───────────┐
       │                 │                │           │           │
    Backend           Frontend           Dev       Pre-Prod      Prod
 (Node.js API)     (Vite/Nginx)      (Compose /   (Proxmox VE   (Cloud,
       │                 │             Kind)       K3s LXC)    blueprint)
       └────────┬────────┘                │           │           │
                ▼                         │           ▼           ▼
         Helm Universal Chart             │        ArgoCD      ArgoCD
       (infra/helm/pokedex) ──────────────┴───── (activo) ── (inactivo)
```

### Principios de Aislamiento de Capas

1. **Contratos Estándar CNCF:** La aplicación consume exclusivamente interfaces estándar de Kubernetes (>= 1.28): `Deployment`, `Service`, `Ingress`, `ConfigMap`, `Secret`, `HorizontalPodAutoscaler` y `PersistentVolumeClaim` mediante `storageClassName`.
2. **Cero Vendor Lock-in en el Helm Chart:** El chart ([`infra/helm/pokedex`](../../infra/helm/pokedex)) no contiene anotaciones propietarias de un proveedor. Lo específico de cada entorno se inyecta con capas de values: `gitops/environments/proxmox-preprod/` para pre-prod, y `values.prod.yaml` + `gitops/environments/cloud/` para el blueprint prod.
3. **Inmutabilidad de Imágenes de Contenedor:** Las imágenes OCI se compilan una sola vez en CI, se firman con Cosign (Sigstore) y se publican en GitHub Container Registry (`ghcr.io/rocapellino/pokedex-*`). El mismo digest se ejecuta en Kind, pre-prod y, al activarse, prod.

---

## 2. Modelo de Entornos

| Entorno | Runtime | Despliegue | Catálogo | Estado |
| :--- | :--- | :--- | :--- | :--- |
| **Dev** | Docker Compose y Kind | Local, fuera de ArgoCD | Muestra (35 Pokémon) | Activo |
| **Pre-Prod** | K3s en LXC sobre Proxmox VE (`k8s-preprod`) | ArgoCD `pokedex-preprod` | Completo (1025), desde el paso 4 de ADR-030 | Activo, único target desplegado |
| **Prod** | Kubernetes gestionado en una nube a elegir | ArgoCD `pokedex-cloud`, excluida del App-of-Apps | Completo | Blueprint declarado, inactivo |

> [!NOTE]
> La Application `pokedex-proxmox` (VM 801, `k8s-proxmox`) se retiró en el paso 5 de ADR-030. El relevamiento del 2026-10-04 confirmó que la VM nunca se había aprovisionado: el único clúster Proxmox es el LXC 800 (`10.10.13.100`).

---

## 3. Diagrama de Flujo: Aprovisionamiento y Despliegue GitOps

```mermaid
flowchart TD
    subgraph SCM["📦 Repositorio Git (Monorepo)"]
        CODE["💻 Código Fuente\n(apps/backend, apps/frontend)"]
        HELM_CHART["⚙️ Helm Chart Universal\n(infra/helm/pokedex)"]
        GITOPS_DIR["📋 Manifiestos GitOps\n(gitops/apps, gitops/environments)"]
        TOFU_DIR["🏗️ IaC OpenTofu\n(infra/opentofu/environments)"]
    end

    subgraph CI_PIPELINE["🤖 GitHub Actions (CI & Supply Chain)"]
        CODE --> CI_BUILD["Build Docker + SBOM CycloneDX"]
        CI_BUILD --> COSIGN_SIGN["Cosign Keyless OIDC (Sigstore)"]
        COSIGN_SIGN --> GHCR["📦 GitHub Container Registry (GHCR)"]
    end

    subgraph IAC_ENGINE["🏗️ OpenTofu IaC Engine"]
        TOFU_DIR -->|environments/proxmox| TOFU_PROX["tofu apply (Proxmox)"]
        TOFU_DIR -->|environments/cloud-template| TOFU_CLOUD["tofu validate (blueprint)"]
        TOFU_PROX --> PROX_INFRA["🖥️ LXC K3s, Vault y Bastion en Proxmox VE"]
        TOFU_CLOUD --> CLOUD_INFRA["☁️ Clúster gestionado del proveedor elegido"]
    end

    subgraph GITOPS_SYNC["☸️ ArgoCD GitOps Engine"]
        GITOPS_DIR --> ARGO["ArgoCD Server"]
        HELM_CHART --> ARGO
        GHCR --> ARGO

        ARGO -->|app-proxmox-preprod.yaml\nvalues.yaml + proxmox-preprod| ENV_PREPROD["🖥️ Pre-Prod (Proxmox LXC)\n• Traefik + TLS CA interna\n• StatefulSet Postgres + Redis\n• Catálogo completo (seed job)"]
        ARGO -.->|app-cloud.yaml (inactiva)\nvalues.yaml + values.prod.yaml + cloud| ENV_CLOUD["☁️ Prod Cloud (blueprint)\n• Ingress + cert-manager\n• HA: HPA, PDB, PgBouncer\n• Kyverno Cosign Enforcer"]
    end

    classDef git fill:#3b82f6,stroke:#1d4ed8,color:#fff;
    classDef ci fill:#8b5cf6,stroke:#6d28d9,color:#fff;
    classDef iac fill:#f59e0b,stroke:#d97706,color:#fff;
    classDef gitops fill:#10b981,stroke:#047857,color:#fff;

    class CODE,HELM_CHART,GITOPS_DIR,TOFU_DIR git;
    class CI_BUILD,COSIGN_SIGN,GHCR ci;
    class TOFU_PROX,TOFU_CLOUD,PROX_INFRA,CLOUD_INFRA iac;
    class ARGO,ENV_PREPROD,ENV_CLOUD gitops;
```

---

## 4. Blueprint Prod Cloud: Puntos de Variación del Proveedor

El blueprint prod se compone de tres capas de values ([`app-cloud.yaml`](../../gitops/apps/app-cloud.yaml)):

1. `infra/helm/pokedex/values.yaml`: base segura del chart.
2. `infra/helm/pokedex/values.prod.yaml`: postura endurecida e independiente del proveedor (HA, PgBouncer, Reloader, Zero-Trust L7, ResourceQuota, backups).
3. [`gitops/environments/cloud/values.yaml`](../../gitops/environments/cloud/values.yaml): solo los puntos de variación del proveedor.

| Punto de variación | Parámetro | Valor actual del blueprint |
| :--- | :--- | :--- |
| Controlador de ingress | `ingress.className` | `nginx` (portable; se reemplaza por el del proveedor) |
| Emisor TLS | `ingress.annotations["cert-manager.io/cluster-issuer"]` | `letsencrypt-prod` |
| Backend de secretos | `externalSecrets.secretStoreRef.name` | `cloud-secret-store` sobre la ruta reservada `pokedex/prod` |
| Almacenamiento | `postgresql`, `redis` y `backup` `.persistence.storageClass` | `""` (StorageClass por defecto del clúster) |
| Exposición pública | `ingress.hosts`, `ingress.tls`, `api.env.corsOrigins` | `pokedex.cloud.rodrigo.dev` |
| Clúster destino | `app-cloud.yaml` `destination.server` | Marcador `.invalid` hasta registrar el clúster |

Activar prod cloud requiere un ADR que fije el proveedor, completar estos parámetros, aprovisionar el clúster, declarar el `ClusterSecretStore` y quitar `app-cloud.yaml` del `exclude` de [`root-application.yaml`](../../gitops/apps/root-application.yaml).

---

## 5. Topología de Red y Aislamiento (Zero-Trust)

La segmentación es la misma en cualquier sustrato; cambia el mecanismo que la implementa.

1. **Borde público:** solo el ingress controller recibe tráfico externo. Todo el tráfico HTTP se redirige a HTTPS.
2. **Cómputo:** los nodos de Kubernetes no tienen IPs públicas. El egreso se limita con NetworkPolicies (`antiSsrf`, `externalHttps: false`) y la allowlist FQDN de Cilium (Gemini, GitHub raw y PokeAPI).
3. **Datos:** PostgreSQL y Redis solo aceptan conexiones desde los Pods autorizados en `5432` y `6379`.

En pre-prod la red de gestión es `10.10.13.0/24` sobre el bridge de Proxmox (ADR-025). En prod cloud, la VPC o red equivalente del proveedor se declara al activarlo.

---

## 6. Estructura del Código IaC y GitOps

```text
infra/opentofu/
├── modules/                          # Módulos reutilizables agnósticos
│   ├── compute/                      # Especificación genérica de nodos
│   ├── naming/                       # Nombres estandarizados
│   ├── security_baseline/            # Restricciones de red y cifrado
│   └── tagging/                      # Metadata y etiquetas
└── environments/
    ├── proxmox/                      # ✅ Pre-Prod: LXC K3s, Vault y Bastion en Proxmox VE
    ├── lab/                          # ✅ Entorno efímero de pruebas
    └── cloud-template/               # ℹ️ Base agnóstica del blueprint prod cloud
```

```text
gitops/
├── apps/
│   ├── root-application.yaml         # App-of-Apps (excluye app-cloud.yaml)
│   ├── app-proxmox-preprod.yaml      # ✅ Pre-Prod activo
│   └── app-cloud.yaml                # ⚪ Blueprint prod cloud (inactivo)
└── environments/
    ├── proxmox-preprod/values.yaml   # Perfil Lean de pre-prod
    └── cloud/values.yaml             # Puntos de variación del proveedor
```

---

## 7. Política de Runtime Oficial y Experiencia de Desarrollo Dual

| Entorno / Propósito | Tecnología Oficial | Responsabilidad y Alcance |
| :--- | :--- | :--- |
| **Producción Universal** | **Kubernetes (Helm + ArgoCD)** | **Único runtime oficial de pre-prod y prod**. Gestiona Pods, balanceo L7, HPA, NetworkPolicies y la validación de firmas con Kyverno. |
| **Aprovisionamiento Infra** | **OpenTofu (`infra/opentofu`)** | Declaración inmutable de cómputo, red y almacenamiento en Proxmox o en la nube elegida. |
| **Baseline y Hardening** | **Ansible (`host_baseline.yaml`)** | Configuración de sistema operativo en los nodos de Proxmox: containerd, `sysctl` y `ufw`. **No despliega contenedores de la aplicación**. |
| **Desarrollo: Perfil Rápido** | **Docker Compose (`task dev:compose`)** | Iteración local con API, Frontend, Postgres y Redis, con recarga en caliente. |
| **Desarrollo: Paridad K8s** | **Kind (`task dev:k8s:up`)** | Clúster Kind con mapeo de Ingress y el mismo Helm chart. Es también el entorno de integración de CI. |

### Regla de Oro Operativa

> **No se despliegan contenedores de aplicación en pre-prod ni prod mediante Docker Compose ni scripts aislados.**
> Todo despliegue se origina en un commit auditado, pasa los controles de CI (tests, SBOM, firma Cosign) y se sincroniza declarativamente con ArgoCD.

---

## 8. Matriz de Estado Real de Soporte de Infraestructura

| Target de Infraestructura | Nivel de Soporte | Entorno IaC / GitOps | Propósito y Garantías Operativas |
| :--- | :--- | :--- | :--- |
| **Proxmox VE Pre-Prod (LXC)** | **Activo** | `infra/opentofu/environments/proxmox` + `gitops/environments/proxmox-preprod` | Único target desplegado. Host baseline con Ansible y TLS con la CA interna. El catálogo completo se siembra desde el paso 4 de ADR-030. |
| **Proxmox Lab** | **Soportado (Lab)** | `infra/opentofu/environments/lab` | Pruebas destructivas, validación de playbooks y simulación de fallos. |
| **Prod Cloud** | **Blueprint inactivo** | `infra/opentofu/environments/cloud-template` + `gitops/environments/cloud` | Renderizado y validado en CI, con digests fijados en cada promoción. Sin SLA ni RTO hasta su activación. |
| **Kind (Local / CI)** | **Soportado (CI/CD / Dev)** | `infra/k8s/kind-cluster.yaml` | Tests de integración en GitHub Actions (`infra.yaml`) y paridad local. |
