# 🖥️ Guía de Despliegue en Proxmox VE (On-Premise & Private Cloud)

Esta guía detalla los métodos para desplegar la plataforma Pokédex en servidores **Proxmox Virtual Environment (PVE)** utilizando contenedores **LXC** (Linux Containers) de alto rendimiento o **Máquinas Virtuales (QEMU/KVM)** con inicialización automatizada mediante **Cloud-Init**, **Ansible** u **OpenTofu**.

---

## 📑 Tabla de Contenidos

1. [Arquitectura de Despliegue en Proxmox](#1-arquitectura-de-despliegue-en-proxmox)
2. [Gestión Segura de Secretos en Proxmox (Cero Fugas Locales)](#2-gestión-segura-de-secretos-en-proxmox-cero-fugas-locales)
3. [Método 1: Aprovisionamiento y Hardening Automatizado con Ansible & Taskfile](#3-método-1-aprovisionamiento-y-hardening-automatizado-con-ansible--taskfile)
4. [Método 2: Despliegue Automatizado con Cloud-Init (VM / LXC)](#4-método-2-despliegue-automatizado-con-cloud-init-vm--lxc)
5. [Método 3: Aprovisionamiento con OpenTofu](#5-método-3-aprovisionamiento-con-opentofu)
6. [Método 4: Orquestación y Hardening con Ansible](#6-método-4-orquestación-y-hardening-con-ansible)
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
                     │          Docker Compose Production        │
                     │  • Web Nginx Reverse Proxy (:8080)        │
                     │  • Node.js 22 LTS / Express (:3000)       │
                     │  • PostgreSQL 16 Alpine (:5432)           │
                     │  • Redis 7 Alpine In-Memory Cache (:6379) │
                     │  • Prometheus & Grafana Monitoring        │
                     └───────────────────────────────────────────┘
```

---

## 2. Gestión Segura de Secretos en Proxmox (Cero Fugas Locales)

* **Exclusión de Secretos en Tránsito:** Los playbooks de Ansible (`deploy_proxmox.yml`, `deploy_app.yml` y `host_baseline.yml`) aplican la lista canónica de exclusiones [`infra/ansible/deploy_excludes.txt`](../../infra/ansible/deploy_excludes.txt). Esto garantiza que los archivos locales `.env` y `.env.*` **nunca se empaqueten ni viajen al host remoto**.
* **Inicialización Segura en Remoto:** Al desplegarse por primera vez en Proxmox (vía Ansible o Cloud-Init), el sistema detecta si `/opt/pokedex/.env` existe:
  * Si no existe: copia `/opt/pokedex/.env.example` y autogenera credenciales criptográficamente seguras con `openssl rand`:
    * `ADMIN_SESSION_SECRET` (64 caracteres hex / 256 bits).
    * `POSTGRES_PASSWORD` (32 caracteres hex).
    * `REDIS_PASSWORD` (32 caracteres hex).
    * `ADMIN_API_KEY` (48 caracteres hex).
  * Asigna permisos estrictos `chmod 600 /opt/pokedex/.env` restringidos al usuario operador.
* **Consulta de Credenciales Generadas:**

  ```bash
  ssh root@<PROXMOX_HOST> "cat /opt/pokedex/.env"
  ```

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

## 4. Método 2: Despliegue Automatizado con Cloud-Init (VM / LXC)

La plantilla [`infra/proxmox/cloud-init/user-data.yaml`](../../infra/proxmox/cloud-init/user-data.yaml) automatiza la instalación completa al aprovisionar la máquina virtual:

1. Instala Docker Engine y el plugin de Compose.
2. Aplica reglas de firewall UFW (solo SSH 22 y Web DMZ 8080).
3. Clona el repositorio oficial en `/opt/pokedex`.
4. Inicializa `/opt/pokedex/.env` con credenciales fuertes aleatorias si no existe.
5. Inicia el stack con `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build`.

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

## 6. Método 4: Orquestación y Hardening con Ansible

El playbook [`infra/ansible/playbooks/deploy_proxmox.yml`](../../infra/ansible/playbooks/deploy_proxmox.yml) actualiza paquetes, instala Docker, sincroniza el código excluyendo secretos locales y levanta la pila productiva:

```bash
ansible-playbook -i "192.168.1.150," -u root infra/ansible/playbooks/deploy_proxmox.yml
```

---

## 7. Configuración de LXC con Docker (Nesting & Keyctl)

Para ejecutar Docker dentro de un contenedor LXC sin privilegios en Proxmox:

1. **Desde la interfaz Web de Proxmox:**
   * Ve a tu contenedor LXC -> **Options** -> **Features** -> Marca **Nesting** y **Keyctl**.
2. **Desde la consola del host Proxmox (`/etc/pve/lxc/<vmid>.conf`):**

   ```ini
   features: keyctl=1,nesting=1
   ```
