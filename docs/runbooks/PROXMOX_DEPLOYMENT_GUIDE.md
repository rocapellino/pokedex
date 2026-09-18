# 🖥️ Guía de Operación y Despliegue en Proxmox VE (On-Premises & Private Cloud)

Esta guía detalla los procedimientos oficiales para aprovisionar, configurar y operar la infraestructura de **Pokédex** en servidores **Proxmox Virtual Environment (PVE)**. De acuerdo con la **Estrategia de Cómputo Bi-Modal (ADR-024)**, Proxmox actúa como el proveedor de cómputo on-premises (alojando nodos de **Kubernetes/K3s** mediante contenedores LXC ultralivianos en Pre-Prod/Laboratorio o Máquinas Virtuales KVM con aislamiento estricto en Producción), mientras que el hardening del sistema operativo se delega a **Ansible** y la aplicación se despliega declarativamente mediante **Helm** y **ArgoCD**.

---

## 📑 Tabla de Contenidos

1. [Arquitectura de Cómputo On-Premises (Bi-Modal)](#1-arquitectura-de-cómputo-on-premises-bi-modal)
2. [Gestión Canónica de Secretos (ESO + Vault)](#2-gestión-canónica-de-secretos-eso--vault)
3. [Aprovisionamiento de Infraestructura con OpenTofu (IaaS)](#3-aprovisionamiento-de-infraestructura-con-opentofu-iaas)
4. [Hardening del Sistema Operativo y Firewall con Ansible](#4-hardening-del-sistema-operativo-y-firewall-con-ansible)
5. [Instalación de Kubernetes Runtime (K3s)](#5-instalación-de-kubernetes-runtime-k3s)
6. [Despliegue y Sincronización GitOps con ArgoCD](#6-despliegue-y-sincronización-gitops-con-argocd)

---

## 1. Arquitectura de Cómputo On-Premises (Bi-Modal)

```text
                      ┌─────────────────────────────────────────┐
                      │          Proxmox VE Node (PVE)          │
                      │  IP: 10.10.13.10 (Debian Core Kernel)   │
                      └────────────────────┬────────────────────┘
                                           │
                     ┌─────────────────────┴─────────────────────┐
                     ▼                                           ▼
       ┌───────────────────────────┐               ┌───────────────────────────┐
       │   Pre-Prod / Lab: LXC     │               │     Producción: KVM VM    │
       │    (Debian 12 Bookworm)   │               │    (Debian 12 Cloud-Init) │
       │  • Consumo: ~800 MB RAM   │               │  • Aislamiento por HW     │
       │  • Arranque: < 5 segundos │               │  • Kernel independiente   │
       │  • compute_type = "lxc"   │               │  • compute_type = "vm"    │
       └─────────────┬─────────────┘               └─────────────┬─────────────┘
                     │                                           │
                     └─────────────────────┬─────────────────────┘
                                           ▼
                     ┌───────────────────────────────────────────┐
                     │          Kubernetes Runtime (K3s)         │
                     │  • Traefik Ingress Controller (:80/:443)  │
                     │  • Node.js 22 LTS / Express (:3000)       │
                     │  • PostgreSQL 16 StatefulSet (:5432)      │
                     │  • Redis 7 In-Memory Cache (:6379)        │
                     │  • Grafana Alloy DaemonSet (Logs & OTLP)  │
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

## 2. Gestión Canónica de Secretos (ESO + Vault)

* **Cero Archivos de Secretos en Disco Productivo:** No se almacenan archivos `.env` ni credenciales en texto claro en los servidores de Proxmox.
* **Exclusión Estricta en Automatizaciones:** Las tareas de Ansible aplican la lista canónica de exclusiones [`infra/ansible/deploy_excludes.txt`](../../infra/ansible/deploy_excludes.txt), impidiendo la transferencia accidental de archivos locales hacia los nodos.
* **Mecanismo Canónico Universal (ESO):** Conforme al estándar de arquitectura consolidado (commit #206), la sincronización de secretos en Proxmox se realiza exclusivamente mediante **External Secrets Operator (ESO)** conectado a **HashiCorp Vault (Community Edition)**:
  * **Topología Canónica:**
    ```text
    Proxmox (Hipervisor / Nodo K3s)
       ↓
    ESO (External Secrets Operator en clúster K8s)
       ↓
    Vault (HashiCorp Vault CE en contenedor LXC dedicado)
       ↓
    pokemon-secrets (K8s Secret nativo consumido por API / Postgres / Redis)
    ```
  * **Instancia de Vault en Proxmox:** Desplegada en un contenedor LXC dedicado (ID `810`, hostname `vault`) gestionado por OpenTofu.
  * **Definición Canónica ESO:** [`infra/k8s/eso/vault-backend.yaml`](../../infra/k8s/eso/vault-backend.yaml) (`ClusterSecretStore/vault-backend`).
  * **Secret Generado en Clúster:** `v1/Secret` llamado `pokemon-secrets` en el namespace `pokemon-app`.
* **Ausencia de Stakater Reloader en Proxmox (Perfil Lean MVP):** Stakater Reloader está intencionalmente **desactivado** (`reloader.enabled: false`) para no sobrecargar el clúster con pods y RBAC superfluos.
  - La recarga de cambios en configuración (`ConfigMap`) se realiza de forma nativa mediante la anotación Helm **`checksum/config`** en la plantilla de Pods.
  - Ante una rotación de secretos en Vault, la actualización de Pods se dispara mediante un reinicio progresivo: `kubectl rollout restart deployment/pokemon-api deployment/pokemon-web -n pokemon-app`.
  - **No intente desplegar ni buscar pods de Reloader en este entorno.**

---

## 3. Aprovisionamiento de Infraestructura con OpenTofu (IaaS)

El módulo en [`infra/opentofu/environments/proxmox/`](../../infra/opentofu/environments/proxmox) es la **única fuente de verdad** para aprovisionar el cómputo en Proxmox VE. No se requiere configuración manual de templates ni cloud-init externo:

### Parámetros de Seguridad Obligatorios

* **Autenticación Exclusiva por API Token:** `proxmox_api_token = "USER@REALM!TOKENID=UUID"` (se prohíbe `root@pam + password`).
* **Verificación TLS Estricta:** `proxmox_insecure = false` por defecto.
* **Acceso por SSH Key:** `ssh_public_key` obligatorio; passwords de usuario nulos.
* **Cadena de Suministro Segura:** Plantillas descargadas exclusivamente vía HTTPS con validación criptográfica SHA256.
* **Aprovisionamiento Conjunto de HashiCorp Vault CE:** El módulo aprovisiona automáticamente el contenedor LXC dedicado para HashiCorp Vault (`vault_enabled = true`, ID `810`, IP `10.10.13.110/24`) para servir como backend de secretos para ESO.

```bash
# Inicializar y planificar con OpenTofu
task tofu:init:proxmox
task tofu:plan:proxmox

# O mediante comandos directos de OpenTofu:
cd infra/opentofu/environments/proxmox
tofu init
tofu apply \
  -var="proxmox_endpoint=https://10.10.13.10:8006/" \
  -var="proxmox_api_token=devops@pve!opentofu=00000000-0000-0000-0000-000000000000" \
  -var="ssh_public_key=$(cat ~/.ssh/id_ed25519.pub)" \
  -var="compute_type=lxc" \
  -var="environment_tier=preprod" \
  -var="vault_enabled=true"
```

---

## 4. Hardening del Sistema Operativo y Firewall con Ansible

Una vez que el nodo Proxmox está accesible por SSH, se ejecutan los playbooks de Ansible para estandarizar la configuración del sistema operativo, cargar módulos de kernel y blindar el perímetro de red:

### Baseline de Nodo (Recomendado)

```bash
# Vía Taskfile
task deploy:proxmox -- -e "ansible_host=10.10.13.100"

# O mediante Ansible CLI directo:
ansible-playbook -i infra/ansible/inventory/hosts.ini infra/ansible/playbooks/host_baseline.yml
```

### Hardening Perimetral y Reglas de Firewall (UFW)

Para restringir los puertos de control de Kubernetes (`6443`, `10250`, `2379`) exclusivamente a las subredes autorizadas:

```bash
ansible-playbook -i infra/ansible/inventory/hosts.ini infra/ansible/playbooks/security_hardening.yml
```

---

## 5. Instalación de Kubernetes Runtime (K3s) y CNI Cilium

Para garantizar la política **Zero-Trust L7 Egress (FQDN Allowlist)** y bloquear destinos públicos no autorizados (como `https://example.com`) al tiempo que se permite el acceso a `generativelanguage.googleapis.com` y `pokeapi.co`, K3s se instala delegando el CNI a **Cilium eBPF**:

```bash
# 1. Instalación de K3s con Flannel desactivado (preparado para Cilium)
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="--flannel-backend=none --disable-network-policy --disable servicelb --disable local-storage" sh -s - \
  --write-kubeconfig-mode 644

# 2. Despliegue de Cilium CNI en modo ligero (sin Hubble UI para optimizar RAM < 250MB)
helm repo add cilium https://helm.cilium.io/
helm repo update
helm upgrade --install cilium cilium/cilium --version 1.16.1 \
  --namespace kube-system \
  --set operator.replicas=1 \
  --set hubble.enabled=false

# 3. Verificar estado del nodo y pods del sistema
kubectl get nodes -o wide
kubectl get pods -n kube-system -l k8s-app=cilium
```

---

## 6. Despliegue y Sincronización GitOps con ArgoCD

Todo despliegue de las cargas de trabajo de Pokédex se realiza mediante **ArgoCD** consumiendo el Helm chart universal:

1. **Definición de la Aplicación ArgoCD:** [`gitops/apps/app-proxmox.yaml`](../../gitops/apps/app-proxmox.yaml)
2. **Capa de Valores de Entorno:** [`gitops/environments/proxmox/values.yaml`](../../gitops/environments/proxmox/values.yaml) (con `ciliumNetworkPolicy.enabled: true` y `networkPolicies.egress.externalHttps: false`)

### Sincronización Manual o Automatizada

```bash
# Sincronizar el entorno Proxmox vía Taskfile
task gitops:sync:proxmox

# O verificar el estado de los Pods en el namespace pokemon-app:
task k8s:status
```

---

## 7. Verificación en Vivo de Aislamiento Egress y Anti-SSRF

Para certificar que el clúster Proxmox cumple de manera efectiva con los controles de salida de red:

```bash
# 1. Ejecutar el Job de sonda de seguridad de red en el namespace pokemon-app:
kubectl apply -f infra/k8s/jobs/egress-anti-ssrf-probe-job.yaml

# 2. Inspeccionar los resultados de la sonda:
kubectl logs -n pokemon-app job/pokedex-egress-anti-ssrf-probe -f

# 3. Validar los 6 criterios obligatorios:
#    - https://generativelanguage.googleapis.com -> OK (Permitido por Cilium toFQDNs)
#    - https://pokeapi.co                       -> OK (Permitido por Cilium toFQDNs)
#    - https://example.com                      -> FAIL (Bloqueado por Cilium eBPF L7)
#    - http://169.254.169.254                   -> FAIL (Bloqueado Anti-SSRF IMDS)
#    - http://10.0.0.1                          -> FAIL (Bloqueado Anti-SSRF RFC1918)
#    - http://192.168.1.1                       -> FAIL (Bloqueado Anti-SSRF RFC1918)
```

