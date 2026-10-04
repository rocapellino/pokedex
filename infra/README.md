# ⚙️ Infraestructura y Orquestación Cloud-Native

Este directorio centraliza la **Infraestructura como Código (IaC)**, orquestación de contenedores, empaquetado Cloud-Native y automatización para el ecosistema **Pokédex**.

---

## 🏛️ Taxonomía de Estados Operativos

Para garantizar que ningún blueprint o referencia de laboratorio sea confundido con la infraestructura productiva real, todos los artefactos de este directorio se clasifican bajo cuatro estados normativos:

| Estado | Significado | Componentes |
| :--- | :--- | :--- |
| 🟢 **ACTIVE** | Plataforma operativa de pre-producción (ADR-030). Entorno de pruebas sin SLA de producción. | Proxmox VE (`infra/opentofu/environments/proxmox/`), K3s + Cilium (`setup_k3s.yaml`), Helm Chart (`values.yaml`), ESO consolidado (`cluster-secret-store.yaml`), Vault LXC. |
| 🔵 **SUPPORTED** | Entornos mantenidos y probados para desarrollo local, CI o laboratorio efímero. | Kind (`infra/k8s/kind-cluster.yaml`), Helm local (`values.dev.yaml`), Entorno Lab (`infra/opentofu/environments/lab/`), Bastion host. |
| 🟡 **REFERENCE** | Blueprints de portabilidad multi-cloud o perfiles estáticos de validación sin runtime activo. | Blueprint prod cloud agnóstico (ADR-030): `infra/opentofu/environments/cloud-template/`, `gitops/environments/cloud/` y Helm `values.prod.yaml` como su base endurecida (INFRA-011). |
| ⚪ **BLUEPRINT** | Esqueletos inactivos preservados para extensión futura, fuera de pipelines activos. | `setup_pbs_backup_blueprint.yaml` (Proxmox Backup Server), esquemas de storage agnósticos. |

---

## 📁 Estructura del Directorio

```text
infra/
├── helm/                    # Helm 3 Chart oficial y orquestación unificada en Kubernetes
│   └── pokedex/             # Chart parametrizable (Deployments, HPA, Services, PDB, Ingress)
│       ├── README.md        # Documentación de arquitectura y values del Chart
│       ├── templates/       # Plantillas Kubernetes estandarizadas
│       ├── values.yaml      # [ACTIVE] Configuración base segura (Secure by Default)
│       ├── values.dev.yaml  # [SUPPORTED] Overrides para desarrollo local / Kind
│       └── values.prod.yaml # [REFERENCE] Perfil estático de referencia endurecido (INFRA-011)
├── opentofu/                # Aprovisionamiento declarativo híbrido con OpenTofu
│   ├── README.md            # Guía de arquitectura IaC, comandos canónicos y backends
│   ├── environments/        # Entornos por plataforma (proxmox, lab, aws, cloud-template)
│   └── modules/             # Módulos reutilizables (compute, naming, security_baseline, tagging)
├── ansible/                 # Playbooks de automatización y hardening del sistema operativo
│   ├── README.md            # Guía operativa y catálogo de playbooks y roles
│   ├── inventories/         # Inventarios por entorno (Proxmox VE y Lab en YAML estructurado)
│   └── playbooks/           # Preparación integral (prepare_hosts.yaml), baseline, Vault y K3s
├── k8s/                     # Manifiestos canónicos de plataforma y controles de seguridad
│   ├── README.md            # Controles de seguridad de plataforma, PSS y políticas Kyverno
│   ├── kind-cluster.yaml    # [SUPPORTED] Configuración de clúster local y CI con Kind
│   ├── namespace-pod-security.yaml # [ACTIVE] Admisión de Pod Security Standards (PSS)
│   ├── kyverno-cosign-policy.yaml  # [ACTIVE] Verificación criptográfica de firmas Cosign
│   ├── eso/                 # [ACTIVE] External Secrets Operator y ClusterSecretStore consolidado
│   ├── jobs/                # [SUPPORTED] Sondas activas de verificación de red y seguridad (anti-SSRF)
│   ├── policies/            # [ACTIVE] Políticas de admisión Kyverno en clúster
│   └── kyverno-test/        # [SUPPORTED] Suite declarativa de pruebas para Kyverno CLI
└── monitoring/              # Configuración de observabilidad (Grafana Cloud, Alloy, Dashboards)
    ├── README.md            # Inventario, despliegue multiplataforma y reglas de alerta
    ├── alerts.yaml          # Reglas unificadas de alerta de infraestructura, DB y API
    ├── grafana-cloud-values.yaml # Values canónicos del stack de telemetría Alloy
    ├── alloy/               # Configuración de Grafana Alloy para desarrollo local
    └── dashboards/          # Tableros de control canónicos de la plataforma
```

> [!NOTE]
> Los manifiestos declarativos de **ArgoCD** para la arquitectura de despliegue y los `values.yaml` específicos de cada ambiente se encuentran centralizados en el directorio raíz [`gitops/`](../gitops/). La SSOT de runtime para producción es exclusivamente [`gitops/environments/proxmox/values.yaml`](../gitops/environments/proxmox/values.yaml).

---

## 🚀 Componentes Principales

### 1. Kubernetes con Helm 3 (`infra/helm/`)

La orquestación en clúster está 100% estandarizada en **Helm 3**:

- **Servicios:** API backend (`pokedex-api`), Frontend proxy (`pokedex-web`), PostgreSQL StatefulSet con persistencia PVC y Redis caché.
- **Resiliencia & Escalamiento:** Horizontal Pod Autoscaler (**HPA v2**) para web y API, Pod Disruption Budgets (**PDB**) y NetworkPolicies Zero-Trust.
- **Gestión de Entornos:** `values.yaml` como base segura (*Secure by Default*), `values.dev.yaml` para desarrollo local, `values.prod.yaml` como perfil de referencia estático (INFRA-011) y [`gitops/environments/`](../gitops/environments/) como la SSOT de runtime de producción y pre-producción.
- **GitOps:** Integración nativa con ArgoCD vía [`gitops/apps/`](../gitops/apps/).

### 2. Infraestructura como Código con OpenTofu (`infra/opentofu/`)

- **Proxmox VE (On-Premise - `infra/opentofu/environments/proxmox/` - ACTIVE):** Provisión declarativa del nodo K3s de pre-prod en un contenedor **LXC** (LXC 800, `10.10.13.100`), más Vault (LXC 810) y Bastion (LXC 820). Proxmox no aloja producción (ADR-030).
- **Cloud Template (`infra/opentofu/environments/cloud-template/` - REFERENCE):** Base agnóstica del blueprint prod cloud (ADR-030). Se valida en CI sin credenciales y se completa con los recursos del proveedor al activarlo.
- Totalmente compatible con la sintaxis HCL y proveedores del Registry bajo licenciamiento open-source (MPL-2.0).

### 3. Automatización con Ansible (`infra/ansible/`)

- Hardening de seguridad con cortafuegos UFW y configuración SSH Zero-Trust.
- Preparación integral de hosts mediante `prepare_hosts.yaml` (SO base, container runtime Docker/containerd, módulos de kernel, sysctl y swap off).
- Aprovisionamiento declarativo de K3s y CNI Cilium eBPF vía `setup_k3s.yaml`.

---

## 🛠️ Comandos de Uso Frecuente (vía Taskfile)

```bash
# Validar sintaxis del Chart de Helm
task helm:lint

# Desplegar en clúster local de Kubernetes (Kind)
task k8s:up

# Ver estado de los recursos desplegados
task k8s:status

# Validar sintaxis de entornos OpenTofu (comando canónico)
task infra:validate

# Planificar aprovisionamiento en Proxmox VE (comando canónico)
task infra:plan:proxmox

```
