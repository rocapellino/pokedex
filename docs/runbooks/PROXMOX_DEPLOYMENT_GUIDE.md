# 🖥️ Guía de Operación y Despliegue en Proxmox VE (On-Premises & Private Cloud)

Esta guía detalla los procedimientos oficiales para aprovisionar, configurar y operar la infraestructura de **Pokédex** en servidores **Proxmox Virtual Environment (PVE)**. De acuerdo con la **Estrategia de Cómputo Bi-Modal (ADR-024)**, Proxmox actúa como el proveedor de cómputo on-premises (alojando nodos de **Kubernetes/K3s** mediante contenedores LXC ultralivianos en Pre-Prod/Laboratorio o Máquinas Virtuales KVM con aislamiento estricto en Producción), mientras que el hardening del sistema operativo se delega a **Ansible** y la aplicación se despliega declarativamente mediante **Helm** y **ArgoCD**.

---

## 📑 Tabla de Contenidos

1. [Arquitectura de Cómputo On-Premises (Bi-Modal)](#1-arquitectura-de-cómputo-on-premises-bi-modal)
2. [Gestión Canónica de Secretos (ESO + Vault) y Justificación de Redeploy](#2-gestión-canónica-de-secretos-eso--vault-y-justificación-de-redeploy)
3. [Aprovisionamiento de Infraestructura con OpenTofu (IaaS)](#3-aprovisionamiento-de-infraestructura-con-opentofu-iaas)
4. [Hardening del Sistema Operativo y Firewall con Ansible](#4-hardening-del-sistema-operativo-y-firewall-con-ansible)
5. [Aprovisionamiento y Configuración de Vault CE con Ansible](#5-aprovisionamiento-y-configuración-de-vault-ce-con-ansible)
6. [Instalación de Kubernetes Runtime (K3s) y CNI Cilium](#6-instalación-de-kubernetes-runtime-k3s-y-cni-cilium)
7. [Despliegue y Sincronización GitOps con ArgoCD](#7-despliegue-y-sincronización-gitops-con-argocd)
8. [Verificación en Vivo de Aislamiento Egress y Anti-SSRF](#8-verificación-en-vivo-de-aislamiento-egress-y-anti-ssrf)
9. [Procedimiento de Rotación de Secretos y Reinicio Progresivo (Rollout Restart)](#9-procedimiento-de-rotación-de-secretos-y-reinicio-progresivo-rollout-restart)

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

## 2. Gestión Canónica de Secretos (ESO + Vault) y Justificación de Redeploy

* **Cero Archivos de Secretos en Disco Productivo:** No se almacenan archivos `.env` ni credenciales en texto claro en los servidores de Proxmox.
* **Exclusión Estricta en Automatizaciones:** Las tareas de Ansible aplican la lista canónica de exclusiones [`infra/ansible/deploy_excludes.txt`](../../infra/ansible/deploy_excludes.txt), impidiendo la transferencia accidental de archivos locales hacia los nodos.
* **Mecanismo Canónico Universal (ESO):** Conforme al estándar de arquitectura consolidado, la sincronización de secretos en Proxmox se realiza exclusivamente mediante **External Secrets Operator (ESO)** conectado a **HashiCorp Vault (Community Edition)**:
  * **Topología Canónica:**
    ```text
    Proxmox (LXC 810: Vault CE @ 10.10.13.110:8200)
       ↓ (k8s auth method / pokedex-role)
    ESO (External Secrets Operator en K3s)
       ↓ (ClusterSecretStore / vault-backend)
    ExternalSecret (pokedex-secrets @ secret/data/pokedex/production)
       ↓
    pokemon-secrets (K8s Secret nativo consumido vía envFrom)
       ↓
    Deployment Pods (pokedex-api / pokedex-web)
    ```
  * **Instancia de Vault en Proxmox:** Desplegada en un contenedor LXC dedicado (ID `810`, IP `10.10.13.110`, hostname `vault`) gestionado por OpenTofu y configurado por Ansible.
  * **Definición Canónica ESO:** [`infra/k8s/eso/vault-backend.yaml`](../../infra/k8s/eso/vault-backend.yaml) (`ClusterSecretStore/vault-backend`).
  * **Secret Generado en Clúster:** `v1/Secret` llamado `pokemon-secrets` en el namespace `pokemon-app`.

### ¿Es necesario un redeploy de la app para que utilice el Vault?

**SÍ, ES ESTRICTAMENTE NECESARIO.** Las razones arquitectónicas y técnicas son:

1. **Snapshot de Variables de Entorno en Linux (`execve`):** Los servicios Node.js (`pokedex-api`, `pokedex-web`) leen sus credenciales desde `process.env` (inyectadas vía `envFrom: secretRef: name: pokemon-secrets`). En sistemas operativos basados en Linux, las variables de entorno se copian al espacio de memoria del proceso en el momento exacto de su ejecución inicial (`execve()`). Las modificaciones en Secrets de Kubernetes **no mutan** el entorno de procesos ya en ejecución.
2. **Ausencia Intencional de Stakater Reloader en Proxmox:** Conforme al ADR-024 (Perfil Lean MVP), Stakater Reloader está expresamente **desactivado** (`reloader.enabled: false`) en Proxmox para ahorrar recursos (CPU/RAM y overhead de RBAC). No existe ningún daemon automático forzando reinicios ante cambios en Secrets externos.
3. **Invisibilidad del Hash `checksum/config`:** El mecanismo nativo de Helm `checksum/config` calcula únicamente el hash de ConfigMaps renderizados estáticamente durante `helm upgrade`. No tiene visibilidad sobre cambios asíncronos generados por ESO en el Secret `pokemon-secrets`.
4. **Garantía Zero-Downtime:** El reinicio progresivo (`kubectl rollout restart`) asegura que los nuevos pods carguen las credenciales frescas de Vault pasando exitosamente las sondas de salud (`liveness` y `readiness`) antes de terminar los pods antiguos, garantizando cero tiempo de inactividad.

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

## 5. Aprovisionamiento y Configuración de Vault CE con Ansible

El playbook [`infra/ansible/playbooks/setup_vault.yml`](../../infra/ansible/playbooks/setup_vault.yml) automatiza el ciclo de vida de HashiCorp Vault CE dentro del contenedor LXC (ID 810, IP `10.10.13.110`):

1. **Instalación y Configuración del Servicio:** Instala el paquete de Vault CE, configura `/etc/vault.d/vault.hcl` con backend de almacenamiento `file` persistente en `/opt/vault/data`, listener HTTP en `0.0.0.0:8200` y habilita el servicio systemd.
2. **Inicialización y Desbloqueo (Unseal):** Comprueba el estado (`vault status`). Si no está inicializado, ejecuta `vault operator init -key-shares=1 -key-threshold=1`, persiste las claves de forma segura en `/etc/vault.d/vault.keys` con permisos `0600`, y desbloquea la instancia (`vault operator unseal`).
3. **Motores de Secretos y Políticas:** Habilita el motor KV versión 2 en `secret/` y aplica la política `pokedex-policy` (`read` sobre `secret/data/pokedex/*`).
4. **Integración con Kubernetes (Auth Method):** Habilita el método de autenticación `kubernetes` y configura el rol `pokedex-role` enlazado al ServiceAccount `external-secrets-sa` del namespace `external-secrets`.

```bash
# Ejecutar el playbook de aprovisionamiento de Vault:
ansible-playbook -i infra/ansible/inventory/hosts.ini infra/ansible/playbooks/setup_vault.yml

# O mediante Taskfile:
task vault:setup:proxmox

# Verificar la salud de la API de Vault:
curl -s http://10.10.13.110:8200/v1/sys/health | jq .
```

---

## 6. Instalación de Kubernetes Runtime (K3s) y CNI Cilium

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

## 7. Despliegue y Sincronización GitOps con ArgoCD

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

## 8. Verificación en Vivo de Aislamiento Egress y Anti-SSRF

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

---

## 9. Procedimiento de Rotación de Secretos y Reinicio Progresivo (Rollout Restart)

Una vez que Vault se encuentra aprovisionado y sincronizado por ESO en `v1/Secret pokemon-secrets`:

### Ejecución del Reinicio Progresivo Canónico

```bash
# Opción 1: Mediante la herramienta TypeScript automatizada del repositorio (con verificación de estado)
npm run k8s:rollout-restart -- --live

# Opción 2: Mediante Taskfile
task k8s:rollout-restart -- --live

# Opción 3: Comandos nativos de kubectl directos
kubectl rollout restart deployment pokedex-api pokedex-web -n pokemon-app
kubectl rollout status deployment pokedex-api -n pokemon-app --timeout=120s
kubectl rollout status deployment pokedex-web -n pokemon-app --timeout=120s
```

### Verificación de Arquitectura y Simulación de Contrato

Para validar en cualquier entorno de CI o local que la arquitectura cumple con todos los contratos de Vault y necesidad de redeploy:

```bash
npm run k8s:verify-vault-architecture
# o ejecutar la suite de pruebas de contrato:
npm test -- tests/security/vault_redeploy_contract.test.ts
```


