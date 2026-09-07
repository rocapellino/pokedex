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
├── opentofu/                # Aprovisionamiento con OpenTofu para entorno híbrido
│   └── environments/
│       ├── proxmox/         # Provisión de VMs Kubernetes en Proxmox VE
│       └── cloud/           # Provisión de clúster EKS gestionado en AWS
├── terraform/               # Aprovisionamiento declarativo Multi-Cloud legacy
│   ├── envs/                # Ambientes por proveedor (aws, azure, gcp, proxmox)
│   └── modules/             # Módulos reutilizables (compute, database, networking, storage)
├── ansible/                 # Playbooks de automatización y hardening
│   ├── inventory/hosts.ini  # Inventario de servidores y nodos de clúster
│   └── playbooks/           # Configuración de nodos, seguridad UFW y despliegue
├── proxmox/                 # Virtualización on-premise
│   ├── cloud-init/          # Configuración automatizada de instancias
│   └── lxc-template.conf    # Plantilla para contenedores LXC
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

### 2. Infraestructura Multi-Cloud con Terraform (`infra/terraform/`)
* Soporte para **AWS**, **Microsoft Azure**, **Google Cloud Platform (GCP)** y **Proxmox VE**.
* Módulos desacoplados para Redes (VPC/VNet), Cómputo (Serverless/VMs), Almacenamiento (S3/GCS/Blob) y Bases de Datos gestionadas.

### 3. Automatización con Ansible (`infra/ansible/`)
* Hardening de seguridad con cortafuegos UFW y configuración SSH.
* Preparación de nodos Kubernetes (instalación de containerd, módulos `overlay`/`br_netfilter` y desactivación de Swap).

### 4. Entornos On-Premise con Proxmox VE (`infra/proxmox/`)
* Despliegue automatizado en servidores locales mediante Cloud-Init y contenedores LXC optimizados.

---

## 🛠️ Comandos de Uso Frecuente (vía Taskfile)

```bash
# Validar sintaxis del Chart de Helm
task helm:lint

# Desplegar en clúster local de Kubernetes
task k8s:up

# Ver estado de los recursos desplegados
task k8s:status

# Validar planes de Terraform por nube
task tf:plan:gcp
task tf:plan:aws
task tf:plan:azure
task tf:plan:proxmox
```
