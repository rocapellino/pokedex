# 🖥️ Guía de Despliegue en Proxmox VE (On-Premise & Private Cloud)

Esta guía detalla los métodos para desplegar y configurar la infraestructura de Pokédex en servidores **Proxmox Virtual Environment (PVE)** utilizando contenedores **LXC** (Linux Containers) de alto rendimiento o **Máquinas Virtuales (QEMU/KVM)** con inicialización automatizada mediante **Cloud-Init**, **Ansible** u **OpenTofu**, orquestando la aplicación sobre Kubernetes con **Helm**.

---

## 📑 Tabla de Contenidos

1. [Arquitectura de Despliegue en Proxmox](#1-arquitectura-de-despliegue-en-proxmox)
2. [Gestión Segura de Secretos en Proxmox (Cero Fugas Locales)](#2-gestión-segura-de-secretos-en-proxmox-cero-fugas-locales)
3. [Método 1: Aprovisionamiento y Hardening Automatizado con Ansible & Taskfile](#3-método-1-aprovisionamiento-y-hardening-automatizado-con-ansible--taskfile)
4. [Método 2: Aprovisionamiento Base con Cloud-Init (VM / LXC)](#4-método-2-aprovisionamiento-base-con-cloud-init-vm--lxc)
5. [Método 3: Aprovisionamiento con OpenTofu](#5-método-3-aprovisionamiento-con-opentofu)
6. [Método 4: Hardening de Nodos y Cortafuegos con Ansible](#6-método-4-hardening-de-nodos-y-cortafuegos-con-ansible)
7. [Configuración de LXC con Docker (Nesting & Keyctl)](#7-configuración-de-lxc-con-docker-nesting--keyctl)

---

## 1. Arquitectura de Despliegue en Proxmox

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
                     │          Kubernetes Runtime (K3s/k8s)     │
                     │  • Web Nginx Ingress Controller (:8080)   │
                     │  • Node.js 22 LTS / Express (:3000)       │
                     │  • PostgreSQL 16 StatefulSet (:5432)      │
                     │  • Redis 7 In-Memory Cache (:6379)        │
                     │  • Prometheus & Grafana Monitoring        │
                     └───────────────────────────────────────────┘
```

---

## 2. Gestión Segura de Secretos en Proxmox (Cero Fugas Locales)

* **Exclusión de Secretos en Tránsito:** Las tareas de Ansible aplican la lista canónica de exclusiones [`infra/ansible/deploy_excludes.txt`](../../infra/ansible/deploy_excludes.txt). Esto garantiza que los archivos locales `.env` y `.env.*` **nunca se transfieran a hosts remotos**.
* **Gestión de Secretos en Producción:** En Kubernetes, los secretos se inyectan desacopladamente mediante **External Secrets Operator** o **Sealed Secrets**, evitando la presencia de archivos `.env` en claro en el servidor.
* **Inicialización Segura en Nodos Standalone / Fallback:**
  * Si se aprovisiona un entorno aislado fuera de Kubernetes, las credenciales se autogeneran con `openssl rand`:
    * `ADMIN_SESSION_SECRET` (64 caracteres hex / 256 bits).
    * `POSTGRES_PASSWORD` (32 caracteres hex).
    * `REDIS_PASSWORD` (32 caracteres hex).
    * `ADMIN_API_KEY` (48 caracteres hex).
  * Asigna permisos estrictos `chmod 600 /opt/pokedex/.env` restringidos al usuario operador.

---

## 3. Método 1: Aprovisionamiento y Hardening Automatizado con Ansible & Taskfile

### Opción A: Vía Taskfile (Recomendado)

```bash
task deploy:proxmox -- -e "ansible_host=192.168.1.150"
```

### Opción B: Vía Ansible CLI directo

```bash
ansible-playbook -i infra/ansible/inventory/hosts.ini infra/ansible/playbooks/host_baseline.yml
```

---

## 4. Método 2: Aprovisionamiento Base con Cloud-Init (VM / LXC)

La plantilla [`infra/proxmox/cloud-init/user-data.yaml`](../../infra/proxmox/cloud-init/user-data.yaml) automatiza la preparación base del sistema operativo al aprovisionar la máquina virtual:

1. Actualiza paquetes del sistema e instala prerrequisitos (`curl`, `git`, `ufw`, `python3`).
2. Configura módulos de kernel (`overlay`, `br_netfilter`) y sysctl para Kubernetes.
3. Instala el runtime de contenedores (Docker Engine / containerd).
4. Aplica reglas de firewall UFW iniciales (solo SSH puerto 22 permitido).
5. Deja el nodo listo para que Ansible aplique el baseline y se una al clúster de Kubernetes.

---

## 5. Método 3: Aprovisionamiento con OpenTofu

El entorno en [`infra/opentofu/environments/proxmox/`](../../infra/opentofu/environments/proxmox/) aprovisiona los nodos virtuales en Proxmox VE de forma parametrizada y sin credenciales hardcodeadas:

```bash
cd infra/opentofu/environments/proxmox
tofu init
tofu apply \
  -var="proxmox_endpoint=https://192.168.1.100:8006/" \
  -var="proxmox_api_token=root@pam!opentofu=UUID" \
  -var="ssh_public_key=$(cat ~/.ssh/id_ed25519.pub)" \
  -var="network_gateway=192.168.1.1"
```

---

## 6. Método 4: Hardening de Nodos y Cortafuegos con Ansible

El playbook [`infra/ansible/playbooks/security_hardening.yml`](../../infra/ansible/playbooks/security_hardening.yml) aplica políticas Zero-Trust al firewall UFW y endurece SSH y los puertos del plano de control de Kubernetes:

```bash
ansible-playbook -i infra/ansible/inventory/hosts.ini infra/ansible/playbooks/security_hardening.yml
```

El despliegue productivo de la aplicación Pokédex se realiza mediante **Helm** y **ArgoCD** sobre el clúster Kubernetes.

---

## 7. Configuración de LXC con Docker (Nesting & Keyctl)

Para ejecutar Docker/containerd dentro de un contenedor LXC sin privilegios en Proxmox:

1. **Desde la interfaz Web de Proxmox:**
   * Ve a tu contenedor LXC -> **Options** -> **Features** -> Marca **Nesting** y **Keyctl**.
2. **Desde la consola del host Proxmox (`/etc/pve/lxc/<vmid>.conf`):**

   ```ini
   features: keyctl=1,nesting=1
   ```
