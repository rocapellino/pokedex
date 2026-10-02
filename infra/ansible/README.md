# 🛡️ Automatización de Sistema Operativo y Hardening con Ansible

Este directorio contiene el inventario, configuración y playbooks de **Ansible** para la preparación base de nodos, configuración de runtime de contenedores y endurecimiento de seguridad (hardening) en servidores Proxmox VE y clústeres Kubernetes.

---

## 🏛️ Matriz de Responsabilidades y Arquitectura

Para mantener una separación clara de incumbencias (*separation of concerns*):

```text
                    ┌────────────────────────┐
                    │       OpenTofu         │
                    │ Infraestructura Base   │
                    │ (Proxmox VMs / Cloud)  │
                    └───────────┬────────────┘
                                │
                                ▼
                    ┌────────────────────────┐
                    │        Ansible         │
                    │ Configuración de OS    │
                    │ Hardening SSH / UFW    │
                    │ Prerrequisitos K8s/CRI │
                    └───────────┬────────────┘
                                │
                                ▼
                    ┌────────────────────────┐
                    │   Kubernetes + GitOps  │
                    │    Helm 3 + ArgoCD     │
                    │ Despliegue Pokédex App │
                    └────────────────────────┘
```

| Capa / Herramienta | Responsabilidad Primaria | Fuera de Alcance |
| :--- | :--- | :--- |
| **OpenTofu** | Provisión de máquinas virtuales, LXC, redes e infraestructura cloud. | Configuración interna de paquetes y usuarios de OS. |
| **Ansible** | Configuración base del SO, módulos de kernel, sysctl, container runtime y firewall UFW. | Despliegue de la aplicación (reservado a Kubernetes/Helm/GitOps). |
| **Kubernetes (Helm / ArgoCD)** | Orquestación, configuración de réplicas, balanceo, HPA y despliegues continuos. | Aprovisionamiento de VMs o tuning a nivel de kernel de nodos. |

---

## 📁 Estructura del Directorio

```text
infra/ansible/
├── ansible.cfg              # Configuración de ejecución, SSH pipelining y rutas de inventario
├── deploy_excludes.txt      # Lista canónica de exclusión de secretos (.env) y artefactos en rsync
├── README.md                # Este documento de arquitectura y guía operativa
├── requirements.yaml        # Dependencias de colecciones y roles externos
├── inventories/
│   ├── proxmox/
│   │   └── hosts.yaml        # Inventario de Proxmox VE (control plane, workers, vault, bastion)
│   └── lab/
│       └── hosts.yaml        # Inventario para entorno de laboratorio y pruebas
├── playbooks/
│   ├── prepare_hosts.yaml    # [ACTIVE] Preparación integral (base OS + CRI + firewall + hardening)
│   ├── host_baseline.yaml    # [ACTIVE] Aprovisionamiento de SO, Docker/containerd y sysctl
│   ├── security_hardening.yaml # [ACTIVE] Hardening de SSH y reglas de cortafuegos UFW Zero-Trust
│   ├── validate_hosts.yaml   # [ACTIVE] Verificación de estado de CRI, firewall UFW y swap
│   ├── setup_k3s.yaml        # [ACTIVE] Despliegue declarativo de K3s y CNI Cilium eBPF
│   ├── setup_vault.yaml      # [ACTIVE] Aprovisionamiento de HashiCorp Vault en LXC
│   ├── setup_bastion.yaml    # [SUPPORTED] Gestión y configuración del host bastion de administración
│   ├── setup_gdrive_backup.yaml # [SUPPORTED] Respaldo off-site a nivel host (alternativa a K8s CronJob)
│   └── setup_pbs_backup_blueprint.yaml # [BLUEPRINT] Esqueleto referencial Proxmox Backup Server (inactivo)
└── roles/
    ├── base_os/             # Repositorios base, paquetes esenciales y tuning de kernel
    ├── container_runtime/   # Instalación y validación de Docker Engine / containerd
    ├── firewall/            # Configuración perimetral UFW
    ├── hardening/           # Restricciones SSH, límites de sistema y mitigaciones OS
    └── kubernetes_prerequisites/ # sysctl (br_netfilter, ip_forward) y swap off
```

---

## 🔒 Política de Firewall UFW (Zero-Trust)

El playbook `security_hardening.yaml` aplica una política de **denegación por defecto** (`default deny incoming`) con segmentación estricta:

- **SSH (`22/tcp`):** Permitido únicamente desde la subred administrativa (`mgmt_cidr`, por defecto `192.168.1.0/24`).
- **Web Pública (`80/tcp`, `443/tcp`):** Permitido para proxies reversos Nginx / Ingress.
- **Puerto de Desarrollo/Proxy (`8080/tcp`):** Restringido a la subred de administración (`mgmt_cidr`).
- **Kubernetes API Server (`6443/tcp`):** Restringido exclusivamente al clúster (`k8s_nodes_cidr`).
- **Kubelet API (`10250/tcp`):** Restringido exclusivamente al tráfico interno del clúster.
- **etcd Peering & Client (`2379-2380/tcp`):** Restringido estrictamente a los nodos del plano de control (`k8s_nodes_cidr`), evitando exposición externa.

---

## 🚀 Guía de Ejecución

### 1. Preparación Completa de Hosts

```bash
ansible-playbook -i infra/ansible/inventories/proxmox/hosts.yaml infra/ansible/playbooks/prepare_hosts.yaml
```

### 2. Validación de Cumplimiento y Estado (Dry-Run / Verification)

```bash
ansible-playbook -i infra/ansible/inventories/proxmox/hosts.yaml infra/ansible/playbooks/validate_hosts.yaml
```

### 3. Aplicación de Hardening y Firewall Zero-Trust

```bash
ansible-playbook -i infra/ansible/inventories/proxmox/hosts.yaml infra/ansible/playbooks/security_hardening.yaml \
  -e "mgmt_cidr=10.10.13.0/24" \
  -e "k8s_nodes_cidr=10.10.13.0/24"
```
