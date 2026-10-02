# ⚙️ Infraestructura y Orquestación Cloud-Native

Este directorio centraliza la **Infraestructura como Código (IaC)**, orquestación de contenedores, empaquetado Cloud-Native y automatización para el ecosistema **Pokédex**.

---

## 🏛️ Taxonomía de Estados Operativos

Para garantizar que ningún blueprint o referencia de laboratorio sea confundido con la infraestructura productiva real, todos los artefactos de este directorio se clasifican bajo cuatro estados normativos:

| Estado | Significado | Componentes |
| :--- | :--- | :--- |
| 🟢 **ACTIVE** | Plataforma operativa en producción y pre-producción. Sujeto a SLAs y monitoreo continuo. | Proxmox VE (`infra/opentofu/environments/proxmox/`), K3s + Cilium (`setup_k3s.yaml`), Helm Chart (`values.yaml`), ESO consolidado (`cluster-secret-store.yaml`), Vault LXC. |
| 🔵 **SUPPORTED** | Entornos mantenidos y probados para desarrollo local, CI o laboratorio efímero. | Kind (`infra/k8s/kind-cluster.yaml`), Helm local (`values.dev.yaml`), Entorno Lab (`infra/opentofu/environments/lab/`), Bastion host. |
| 🟡 **REFERENCE** | Blueprints de portabilidad multi-cloud o perfiles estáticos de validación sin runtime activo. | AWS EKS (`infra/opentofu/environments/aws/`), `cloud-template`, Helm `values.prod.yaml` (perfil de referencia para `helm template/lint`, INFRA-011). |
| ⚪ **BLUEPRINT** | Esqueletos inactivos preservados para extensión futura, fuera de pipelines activos. | `setup_pbs_backup_blueprint.yaml` (Proxmox Backup Server), esquemas de storage agnósticos. |

---

## 📁 Estructura del Directorio

```text
infra/
├── helm/                    # Helm 3 Chart oficial y orquestación unificada en Kubernetes
│   └── pokedex/             # Chart parametrizable (Deployments, HPA, Services, PDB, Ingress)
│       ├── templates/       # Plantillas Kubernetes estandarizadas
│       ├── values.yaml      # [ACTIVE] Configuración base segura (Secure by Default)
│       ├── values.dev.yaml  # [SUPPORTED] Overrides para desarrollo local / Kind
│       └── values.prod.yaml # [REFERENCE] Perfil estático de referencia endurecido (INFRA-011)
├── opentofu/                # Aprovisionamiento declarativo híbrido con OpenTofu
│   └── environments/
│       ├── proxmox/         # [ACTIVE] Provisión bi-modal en Proxmox VE (LXC Pre-Prod / VM Prod)
│       ├── lab/             # [SUPPORTED] Provisión de VMs efímeras de laboratorio (900+)
│       ├── aws/             # [REFERENCE] Blueprint de portabilidad clúster EKS gestionado en AWS
│       └── cloud-template/  # [REFERENCE] Plantilla multi-cloud desacoplada
├── ansible/                 # Playbooks de automatización y hardening
│   ├── inventories/         # Inventarios por entorno (Proxmox VE y Lab en YAML estructurado)
│   └── playbooks/           # Preparación integral (prepare_hosts.yaml), baseline, Vault y K3s
├── k8s/                     # Manifiestos canónicos de plataforma
│   ├── eso/                 # External Secrets Operator y ClusterSecretStores (Vault & AWS)
│   ├── kind-cluster.yaml    # [SUPPORTED] Configuración de clúster local y CI con Kind
│   └── policies/            # Políticas Kyverno de seguridad de pods y firmas Cosign
└── monitoring/              # Configuración de observabilidad (Grafana Cloud, Alloy, Dashboards)
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

- **Proxmox VE (On-Premise - `infra/opentofu/environments/proxmox/` - ACTIVE):** Provisión bi-modal declarativa de nodos Kubernetes: contenedores **LXC** ultralivianos para Pre-Prod y máquinas virtuales **KVM** con aislamiento estricto de hardware para Producción.
- **AWS Cloud (Pública - `infra/opentofu/environments/aws/` - REFERENCE):** Provisión de VPC segregada, Internet Gateway, Subnets y clúster gestionado AWS EKS como blueprint de portabilidad.
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

# Planificar aprovisionamiento en AWS EKS (referencia)
task infra:plan:aws
```
