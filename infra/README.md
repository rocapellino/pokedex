# ⚙️ Infraestructura y Orquestación Cloud-Native

Este directorio centraliza la **Infraestructura como Código (IaC)**, orquestación de contenedores, empaquetado Cloud-Native y automatización para el ecosistema **Pokédex**.

---

## 📑 Estructura del Directorio

```text
infra/
├── helm/                    # Helm 3 Chart oficial y orquestación unificada en Kubernetes
│   └── pokedex/             # Chart parametrizable (Deployments, HPA, Services, PDB, Ingress)
│       ├── templates/       # Plantillas Kubernetes estandarizadas
│       ├── values.yaml      # Configuración base / desarrollo local
│       └── values.prod.yaml # Perfil endurecido de producción
├── opentofu/                # Aprovisionamiento declarativo híbrido con OpenTofu
│   └── environments/
│       ├── proxmox/         # Provisión bi-modal en Proxmox VE (LXC Pre-Prod / VM Prod)
│       └── aws/             # Provisión de clúster EKS gestionado en AWS
├── ansible/                 # Playbooks de automatización y hardening
│   ├── inventory/hosts.ini  # Inventario de servidores y nodos de clúster
│   └── playbooks/           # Configuración de nodos (host_baseline.yml), seguridad UFW y despliegue
├── k8s/                     # Manifiestos canónicos de plataforma (ESO, políticas Kyverno)
│   ├── eso/                 # External Secrets Operator y ClusterSecretStores (AWS & Vault)
│   └── policies/            # Políticas de seguridad de pods y firmas de imágenes
└── docker/                  # Scripts de inicialización de base de datos
    └── postgres/init.sql    # Schema inicial de PostgreSQL
```

> [!NOTE]
> Los manifiestos declarativos de **ArgoCD** para la arquitectura híbrida (Proxmox y Cloud) y los `values.yaml` específicos de cada ambiente se encuentran centralizados en el directorio raíz [`gitops/`](../gitops/).

---

## 🚀 Componentes Principales

### 1. Kubernetes con Helm 3 (`infra/helm/`)

La orquestación en clúster está 100% estandarizada en **Helm 3**:

* **Servicios:** API backend (`pokedex-api`), Frontend proxy (`pokedex-web`), PostgreSQL StatefulSet con persistencia PVC y Redis caché.
* **Resiliencia & Escalamiento:** Horizontal Pod Autoscaler (**HPA v2**) para web y API, Pod Disruption Budgets (**PDB**) y NetworkPolicies Zero-Trust.
* **Gestión de Entornos:** `values.yaml` para desarrollo local y `values.prod.yaml` para entornos de producción.
* **GitOps:** Integración nativa con ArgoCD vía [`gitops/apps/`](../gitops/apps/).

### 2. Infraestructura como Código con OpenTofu (`infra/opentofu/`)

* **Proxmox VE (On-Premise - `infra/opentofu/environments/proxmox/`):** Provisión bi-modal declarativa de nodos Kubernetes: contenedores **LXC** ultralivianos para Pre-Prod/Laboratorio y máquinas virtuales **KVM** con aislamiento estricto de hardware para Producción.
* **AWS Cloud (Pública - `infra/opentofu/environments/aws/`):** Provisión de VPC segregada, Internet Gateway, Subnets y clúster gestionado AWS EKS.
* Totalmente compatible con la sintaxis HCL y proveedores del Registry bajo licenciamiento open-source (MPL-2.0).

### 3. Automatización con Ansible (`infra/ansible/`)

* Hardening de seguridad con cortafuegos UFW y configuración SSH.
* Preparación de nodos Kubernetes (instalación de runtime, módulos `overlay`/`br_netfilter`, sysctl y desactivación de Swap vía `host_baseline.yml`).

---

## 🛠️ Comandos de Uso Frecuente (vía Taskfile)

```bash
# Validar sintaxis del Chart de Helm
task helm:lint

# Desplegar en clúster local de Kubernetes
task k8s:up

# Ver estado de los recursos desplegados
task k8s:status

# Validar sintaxis de entornos OpenTofu
task tofu:validate

# Planificar aprovisionamiento en Proxmox VE
task tofu:plan:proxmox

# Planificar aprovisionamiento en AWS EKS
task tofu:plan:cloud
```
