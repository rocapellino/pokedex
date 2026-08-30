# 🖥️ Guía de Despliegue en Proxmox VE (On-Premise & Private Cloud)

Esta guía detalla los métodos para desplegar la plataforma Pokédex en servidores **Proxmox Virtual Environment (PVE)** utilizando contenedores **LXC** (Linux Containers) de alto rendimiento o **Máquinas Virtuales (QEMU/KVM)**.

---

## 📑 Tabla de Contenidos
1. [Arquitectura de Despliegue en Proxmox](#1-arquitectura-de-despliegue-en-proxmox)
2. [Método 1: Despliegue Automatizado en 1 Clic (Script / VS Code)](#2-método-1-despliegue-automatizado-en-1-clic-script--vs-code)
3. [Método 2: Aprovisionamiento con Terraform (`infra/terraform/modules/proxmox`)](#3-método-2-aprovisionamiento-con-terraform)
4. [Método 3: Orquestación y Hardening con Ansible](#4-método-3-orquestación-y-hardening-con-ansible)
5. [Configuración de LXC con Docker (Nesting & Keyctl)](#5-configuración-de-lxc-con-docker-nesting--keyctl)

---

## 1. Arquitectura de Despliegue en Proxmox

```
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
                     │  • FastAPI ASGI Backend (:5000)           │
                     │  • PostgreSQL 16 Alpine (:5432)           │
                     │  • Redis 7 Alpine In-Memory Cache (:6379) │
                     │  • Prometheus & Grafana Monitoring        │
                     └───────────────────────────────────────────┘
```

---

## 2. Método 1: Despliegue Automatizado en 1 Clic (Script / VS Code)

### Opción A: Vía Tareas de VS Code
1. Presiona `Ctrl + Shift + P` en VS Code.
2. Selecciona `Tasks: Run Task` -> **`🚀 Proxmox: Desplegar en Servidor Proxmox VE`**.
3. Ingresa la IP o Hostname de tu servidor o contenedor LXC (ej: `192.168.1.150`).

### Opción B: Vía PowerShell (Windows):
```powershell
.\scripts\proxmox_deploy.ps1 -ProxmoxHost "192.168.1.150" -User "root"
```

### Opción C: Vía Bash (Linux / Mac):
```bash
chmod +x scripts/proxmox_deploy.sh
./scripts/proxmox_deploy.sh 192.168.1.150 root 22
```

---

## 3. Método 2: Aprovisionamiento con Terraform

El módulo en [`infra/terraform/modules/proxmox/`](file:///c:/Users/Rodrigo/Documents/Git/introducci%C3%B3n_devops/test_prueba/infra/terraform/modules/proxmox) utiliza el provider oficial `bpg/proxmox` para crear el contenedor LXC con Docker preconfigurado.

```bash
cd infra/terraform/modules/proxmox
terraform init
terraform apply \
  -var="proxmox_api_url=https://192.168.1.100:8006/api2/json" \
  -var="proxmox_api_token_id=root@pam!terraform" \
  -var="proxmox_api_token_secret=tu-token-aqui" \
  -var="target_node=pve"
```

---

## 4. Método 3: Orquestación y Hardening con Ansible

El playbook [`infra/ansible/playbooks/deploy_proxmox.yml`](file:///c:/Users/Rodrigo/Documents/Git/introducci%C3%B3n_devops/test_prueba/infra/ansible/playbooks/deploy_proxmox.yml) actualiza paquetes, instala Docker si no existe, sincroniza el código fuente y levanta la pila productiva:

```bash
ansible-playbook -i "192.168.1.150," -u root infra/ansible/playbooks/deploy_proxmox.yml
```

---

## 5. Configuración de LXC con Docker (Nesting & Keyctl)

Para ejecutar Docker dentro de un contenedor LXC sin privilegios en Proxmox:

1. **Desde la interfaz Web de Proxmox:**
   * Ve a tu contenedor LXC -> **Options** -> **Features** -> Marca **Nesting** y **Keyctl**.
2. **Desde la consola del host Proxmox (`/etc/pve/lxc/<vmid>.conf`):**
   ```ini
   features: nesting=1,keyctl=1
   ```
   *(Ver plantilla lista en [`infra/proxmox/lxc-template.conf`](file:///c:/Users/Rodrigo/Documents/Git/introducci%C3%B3n_devops/test_prueba/infra/proxmox/lxc-template.conf))*.
