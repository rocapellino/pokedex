# 🖥️ Guía de Operación y Despliegue en Proxmox VE (On-Premises & Private Cloud)

Esta guía detalla los procedimientos oficiales para aprovisionar, configurar y operar la infraestructura de **Pokédex** en servidores **Proxmox Virtual Environment (PVE)**. De acuerdo con la **Política de Runtime Universal**, Proxmox actúa como el proveedor de cómputo y virtualización on-premises (alojando nodos de **Kubernetes** mediante VMs QEMU o contenedores LXC), mientras que la aplicación se despliega y sincroniza declarativamente mediante **Helm** y **ArgoCD**.

---

## 📑 Tabla de Contenidos

1. [Arquitectura de Cómputo On-Premises](#1-arquitectura-de-cómputo-on-premises)
2. [Gestión Segura de Secretos (Zero-Trust)](#2-gestión-segura-de-secretos-zero-trust)
3. [Aprovisionamiento de Infraestructura con OpenTofu](#3-aprovisionamiento-de-infraestructura-con-opentofu)
4. [Aprovisionamiento Base con Cloud-Init (VM / LXC)](#4-aprovisionamiento-base-con-cloud-init-vm--lxc)
5. [Hardening del Sistema Operativo y Firewall con Ansible](#5-hardening-del-sistema-operativo-y-firewall-con-ansible)
6. [Despliegue y Sincronización GitOps con ArgoCD](#6-despliegue-y-sincronización-gitops-con-argocd)
7. [Configuración Especial para Contenedores LXC (Nesting & Keyctl)](#7-configuración-especial-para-contenedores-lxc-nesting--keyctl)

---

## 1. Arquitectura de Cómputo On-Premises

```text
                      ┌─────────────────────────────────────────┐
                      │          Proxmox VE Node (PVE)          │
                      │  IP: 192.168.1.100 (Debian Core Kernel) │
                      └────────────────────┬────────────────────┘
                                           │
                     ┌─────────────────────┴─────────────────────┐
                     ▼                                           ▼
       ┌───────────────────────────┐               ┌───────────────────────────┐
       │   Opción A: Contenedor    │               │    Opción B: VM QEMU      │
       │    LXC (Ubuntu 22.04)     │               │    (Debian / k3s K8s)     │
       │  • Consumo: ~150 MB RAM   │               │  • Aislamiento Total      │
       │  • Features: nesting=1    │               │  • Cloud-Init automatizado│
       └─────────────┬─────────────┘               └─────────────┬─────────────┘
                     │                                           │
                     └─────────────────────┬─────────────────────┘
                                           ▼
                     ┌───────────────────────────────────────────┐
                     │          Kubernetes Runtime (k3s/k8s)     │
                     │  • Web Nginx Ingress Controller (:8080)   │
                     │  • Node.js 22 LTS / Express (:3000)       │
                     │  • PostgreSQL 16 StatefulSet (:5432)      │
                     │  • Redis 7 In-Memory Cache (:6379)        │
                     │  • Kyverno Admission Controller           │
                     │  • Prometheus & Grafana Monitoring        │
                     └─────────────────────┬─────────────────────┘
                                           │
                                           ▼
                     ┌───────────────────────────────────────────┐
                     │          Sincronización GitOps            │
                     │  ArgoCD -> gitops/apps/app-proxmox.yaml   │
                     │  Helm Chart -> infra/helm/pokedex         │
                     └───────────────────────────────────────────┘
```

---

## 2. Gestión Segura de Secretos (Zero-Trust)

* **Cero Archivos de Secretos en Disco Productivo:** No se almacenan archivos `.env` ni credenciales en texto claro en los servidores de Proxmox.
* **Exclusión Estricta en Automatizaciones:** Las tareas de Ansible aplican la lista canónica de exclusiones [`infra/ansible/deploy_excludes.txt`](file:///c:/Users/Rodrigo/Documents/Git/pokedex/infra/ansible/deploy_excludes.txt), impidiendo la transferencia accidental de archivos `.env` y `.env.*` locales hacia los nodos.
* **Inyección Desacoplada en Kubernetes:**
  * **Bitnami Sealed Secrets:** Las credenciales cifradas se versionan de forma segura en el repositorio Git (`infra/helm/pokedex/templates/sealed-secrets.yaml`) y solo el controlador en el clúster puede descifrarlas.
  * **External Secrets Operator (ESO):** En entornos corporativos híbridos, sincroniza secretos automáticamente desde un proveedor centralizado (Vault, AWS Secrets Manager o GCP Secret Manager).

---

## 3. Aprovisionamiento de Infraestructura con OpenTofu

El entorno en [`infra/opentofu/environments/proxmox/`](file:///c:/Users/Rodrigo/Documents/Git/pokedex/infra/opentofu/environments/proxmox/) aprovisiona las instancias o máquinas virtuales en Proxmox VE de forma declarativa e inmutable:

```bash
# Inicializar y planificar con OpenTofu
task tofu:init:proxmox
task tofu:plan:proxmox

# O mediante comandos directos de OpenTofu:
cd infra/opentofu/environments/proxmox
tofu init
tofu apply \
  -var="proxmox_endpoint=https://192.168.1.100:8006/" \
  -var="proxmox_api_token=root@pam!opentofu=UUID" \
  -var="ssh_public_key=$(cat ~/.ssh/id_ed25519.pub)" \
  -var="network_gateway=192.168.1.1"
```

---

## 4. Aprovisionamiento Base con Cloud-Init (VM / LXC)

La plantilla [`infra/proxmox/cloud-init/user-data.yaml`](file:///c:/Users/Rodrigo/Documents/Git/pokedex/infra/proxmox/cloud-init/user-data.yaml) automatiza la preparación inicial del sistema operativo al inicializar el nodo:

1. Actualiza paquetes base e instala dependencias del sistema (`curl`, `git`, `ufw`, `python3`).
2. Configura los parámetros de kernel (`overlay`, `br_netfilter`) y `sysctl` requeridos para redes de Kubernetes.
3. Instala y habilita el runtime de contenedores (`containerd` / Docker Engine).
4. Configura el firewall UFW por defecto en modo restrictivo (permitiendo únicamente el puerto SSH `22`).
5. Concluye la fase de inicialización dejando el nodo preparado para que Ansible aplique el baseline de configuración.

---

## 5. Hardening del Sistema Operativo y Firewall con Ansible

Una vez que el nodo Proxmox está accesible por SSH, se ejecutan los playbooks de Ansible para estandarizar la configuración del sistema operativo y blindar el perímetro de red:

### Baseline de Nodo (Recomendado)

```bash
# Vía Taskfile
task deploy:proxmox -- -e "ansible_host=192.168.1.150"

# O mediante Ansible CLI directo:
ansible-playbook -i infra/ansible/inventory/hosts.ini infra/ansible/playbooks/host_baseline.yml
```

### Hardening Perimetral y Reglas de Firewall (UFW)

Para restringir los puertos de control de Kubernetes (`6443`, `10250`, `2379`) exclusivamente a las subredes autorizadas:

```bash
ansible-playbook -i infra/ansible/inventory/hosts.ini infra/ansible/playbooks/security_hardening.yml
```

---

## 6. Despliegue y Sincronización GitOps con ArgoCD

Todo despliegue de las cargas de trabajo de Pokédex se realiza mediante **ArgoCD** consumiendo el Helm chart universal:

1. **Definición de la Aplicación ArgoCD:** [`gitops/apps/app-proxmox.yaml`](file:///c:/Users/Rodrigo/Documents/Git/pokedex/gitops/apps/app-proxmox.yaml)
2. **Capa de Valores de Entorno:** [`gitops/environments/proxmox/values.yaml`](file:///c:/Users/Rodrigo/Documents/Git/pokedex/gitops/environments/proxmox/values.yaml)

### Sincronización Manual o Automatizada

```bash
# Sincronizar el entorno Proxmox vía Taskfile
task gitops:sync:proxmox

# O verificar el estado de los Pods en el namespace pokemon-app:
task k8s:status
```

---

## 7. Configuración Especial para Contenedores LXC (Nesting & Keyctl)

Si se eligen contenedores LXC para alojar nodos de Kubernetes en lugar de máquinas virtuales completas:

1. **Desde la interfaz Web de Proxmox:**
   * Selecciona el contenedor LXC -> **Options** -> **Features** -> Marca **Nesting** y **Keyctl**.
2. **Desde la consola del host Proxmox (`/etc/pve/lxc/<vmid>.conf`):**

   ```ini
   features: keyctl=1,nesting=1
   ```

3. **Módulos de Kernel en el Host PVE:**
   Asegúrate de que los módulos `overlay` y `br_netfilter` estén cargados en el host físico Proxmox:

   ```bash
   modprobe overlay
   modprobe br_netfilter
   ```
