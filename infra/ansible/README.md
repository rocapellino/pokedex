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
├── inventory/
│   └── hosts.ini            # Grupos de hosts (k8s_control_plane, k8s_workers, standalone_servers)
└── playbooks/
    ├── host_baseline.yml      # Aprovisionamiento de SO, Docker/containerd, sysctl y hardening
    ├── security_hardening.yml # Hardening de SSH y reglas de cortafuegos UFW Zero-Trust
    └── setup_nodes.yml        # Preparación de nodos para clúster Kubernetes
```

---

## 🔒 Política de Firewall UFW (Zero-Trust)

El playbook `security_hardening.yml` aplica una política de **denegación por defecto** (`default deny incoming`) con segmentación estricta:

* **SSH (`22/tcp`):** Permitido únicamente desde la subred administrativa (`mgmt_cidr`, por defecto `192.168.1.0/24`).
* **Web Pública (`80/tcp`, `443/tcp`):** Permitido para proxies reversos Nginx / Ingress.
* **Puerto de Desarrollo/Proxy (`8080/tcp`):** Restringido a la subred de administración (`mgmt_cidr`).
* **Kubernetes API Server (`6443/tcp`):** Restringido exclusivamente al clúster (`k8s_cluster_cidr`).
* **Kubelet API (`10250/tcp`):** Restringido exclusivamente al tráfico interno del clúster.
* **etcd Peering & Client (`2379-2380/tcp`):** Restringido estrictamente a los nodos del plano de control (`k8s_cluster_cidr`), evitando exposición externa.

---

## 🚀 Guía de Ejecución

### 1. Preparación de Nodos para Kubernetes / Docker
```bash
ansible-playbook -i infra/ansible/inventory/hosts.ini infra/ansible/playbooks/setup_nodes.yml
```

### 2. Aplicación de Hardening y Firewall Zero-Trust
```bash
ansible-playbook -i infra/ansible/inventory/hosts.ini infra/ansible/playbooks/security_hardening.yml \
  -e "mgmt_cidr=192.168.1.0/24" \
  -e "k8s_cluster_cidr=192.168.1.0/24"
```
