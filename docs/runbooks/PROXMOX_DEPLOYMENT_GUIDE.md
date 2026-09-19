# 🖥️ Guía de Operación y Despliegue en Proxmox VE (On-Premises & Private Cloud)

Esta guía detalla los procedimientos oficiales para aprovisionar, configurar y operar la infraestructura de **Pokédex** en servidores **Proxmox Virtual Environment (PVE)**.

De acuerdo con **ADR-024 (Cómputo Bi-Modal)** y **ADR-025 (Separación de Management Plane y Runtime Plane)**:
- **On-Premise (Proxmox VE):** Es la plataforma operacionalmente activa donde corren los entornos de Pre-producción y Producción.
- **Cloud (AWS):** Se define como un **Target Arquitectónico Cloud-Ready (no activo concurrentemente)**, garantizando que el Helm chart universal y los contratos de la aplicación puedan migrar a la nube sin rediseñar la arquitectura.

---

## 📑 Tabla de Contenidos

1. [Arquitectura por Planos (Management Plane vs Runtime Plane)](#1-arquitectura-por-planos-management-plane-vs-runtime-plane)
2. [Gestión Canónica de Secretos (ESO + Vault) y Justificación de Redeploy](#2-gestión-canónica-de-secretos-eso--vault-y-justificación-de-redeploy)
3. [Aprovisionamiento de Infraestructura con OpenTofu (IaaS)](#3-aprovisionamiento-de-infraestructura-con-opentofu-iaas)
4. [Bastion Host como Management Plane On-Premise (LXC 820)](#4-bastion-host-como-management-plane-on-premise-lxc-820)
5. [Hardening del Sistema Operativo y Firewall con Ansible](#5-hardening-del-sistema-operativo-y-firewall-con-ansible)
6. [Aprovisionamiento y Configuración Endurecida de Vault CE con Ansible](#6-aprovisionamiento-y-configuración-endurecida-de-vault-ce-con-ansible)
7. [Instalación de Kubernetes Runtime (K3s) y CNI Cilium](#7-instalación-de-kubernetes-runtime-k3s-y-cni-cilium)
8. [Despliegue y Sincronización GitOps con ArgoCD](#8-despliegue-y-sincronización-gitops-con-argocd)
9. [Verificación en Vivo de Aislamiento Egress y Anti-SSRF](#9-verificación-en-vivo-de-aislamiento-egress-y-anti-ssrf)
10. [Procedimiento de Rotación de Secretos y Reinicio Progresivo (Rollout Restart)](#10-procedimiento-de-rotación-de-secretos-y-reinicio-progresivo-rollout-restart)

---

## 1. Arquitectura por Planos (Management Plane vs Runtime Plane)

```text
                               GitHub
                                 │
                          GitHub Actions
                                 │
                   ┌─────────────┴─────────────┐
                   │                           │
             Cloud-Ready                  On-Premise
              AWS / EKS                    Proxmox
             (Preparado)                  (Operativo)
                                               │
                                ┌──────────────┴──────────────┐
                                ▼                             ▼
                     ┌─────────────────────┐       ┌─────────────────────┐
                     │  Management Plane   │       │    Runtime Plane    │
                     │  • Bastion (LXC 820)│       │  • K3s (ID 800)     │
                     │  • OpenTofu (IaaS)  │       │    - API & Web      │
                     │  • Ansible (Config) │       │    - PostgreSQL/Redis│
                     │  • ArgoCD (GitOps)  │       │    - Grafana Alloy  │
                     │  • Vault/K8s CLIs   │       │  • Vault CE (LXC 810│
                     └─────────────────────┘       └─────────────────────┘
```

### Cadena Estricta de Responsabilidad On-Premise (Source of Truth)
1. **OpenTofu (IaaS):** Crea infraestructura inmutable (VMs, LXCs, CPU, RAM, disco, redes, IPs y firewall perimetral).
2. **Ansible (Config):** Configura sistemas operativos (paquetes base, hardening de kernel/SSH, UFW, runtime K3s, HashiCorp Vault y herramientas en Bastion).
3. **ArgoCD (GitOps):** Reconcilia el estado deseado en Kubernetes (Deployments, Services, ConfigMaps, ExternalSecrets, NetworkPolicies).
4. **GitHub Actions (CI/CD):** Ejecuta validaciones de calidad y seguridad, compila y firma imágenes OCI, y publica manifiestos.

---

## 2. Gestión Canónica de Secretos (ESO + Vault) y Justificación de Redeploy

* **Cero Archivos de Secretos en Disco Productivo:** No se almacenan archivos `.env` ni credenciales en texto claro en los servidores de Proxmox.
* **Exclusión Estricta en Automatizaciones:** Las tareas de Ansible aplican la lista canónica de exclusiones [`infra/ansible/deploy_excludes.txt`](../../infra/ansible/deploy_excludes.txt), impidiendo la transferencia accidental de archivos locales hacia los nodos.
* **Mecanismo Canónico Universal (ESO):** Conforme al estándar de arquitectura consolidado, la sincronización de secretos en Proxmox se realiza exclusivamente mediante **External Secrets Operator (ESO)** conectado a **HashiCorp Vault (Community Edition)**:

  * **Topología Canónica:**

    ```text
    Proxmox (LXC 810: Vault CE @ 10.10.13.110:8200)
       ↓ (k8s auth method / pokedex-prod-role [Least Privilege])
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

## 4. Bastion Host como Management Plane On-Premise (LXC 820)

Conforme a **ADR-025**, el contenedor **`820 (bastion)`** (`10.10.13.120/24`) actúa formalmente como el componente central del **Management Plane** dentro de la infraestructura on-premise en Proxmox:

```text
Internet / GitHub Actions
           │  (SSH / Runner Automation)
           ▼
     Bastion LXC (Management Plane)
           │
           ├── kubectl / Helm
           ├── Ansible Orchestration
           ├── Vault CLI & PKI
           └── Herramientas de Diagnóstico
           │
           ▼ (Red de Administración 10.10.13.0/24)
  ┌────────┼────────┐
  ▼        ▼        ▼
Proxmox   K3s     Vault
```

### 🛡️ Guardarraíles Operativos de Bastion (Anti-Drift y SSOT)
Para evitar que el Bastion degenere en un punto de divergencia manual ("snowflake server"), se establecen las siguientes reglas estrictas:
- **Prohibido:** El Bastion **NO** se utiliza para aplicar cambios manuales persistentes, `kubectl apply` ad-hoc, `git pull` manuales ni edición de manifiestos en caliente.
- **Permitido:** Se reserva exclusivamente para:
  1. **Administración y Orquestación:** Ejecución de playbooks de Ansible controlados.
  2. **Troubleshooting y Diagnóstico:** Comprobación de conectividad de red, DNS y salud de endpoints internos.
  3. **Break-Glass:** Operaciones de emergencia y recuperación ante desastres cuando la automatización remota no esté disponible.
- **Git como Única Fuente de Verdad:** El flujo operativo normal es siempre declarativo: `Git -> CI -> ArgoCD -> K3s`. Bastion no almacena el estado del sistema.

### Herramientas Centralizadas en Bastion
- **Orquestación:** `ansible` y `ansible-playbook` con los playbooks del repositorio.
- **Kubernetes:** `kubectl` y `helm` preinstalados para interactuar con el clúster (`10.10.13.100`).
- **Secretos:** `vault` CLI para inspeccionar y operar HashiCorp Vault (`10.10.13.110:8200`).
- **DevOps Core:** `git`, `curl`, `wget`, `jq`, `python3`, `dnsutils`, `netcat-openbsd`.

### Puesta en Marcha y Centralización de Herramientas

Desde la consola web de Proxmox (LXC 820 -> `>_ Console`):

```bash
# 1. Instalar el ecosistema completo de herramientas DevOps
apt-get update && apt-get install -y ansible git curl wget jq python3-pip python3-venv dnsutils netcat-openbsd

# 2. Instalar herramientas CLI oficiales (kubectl, helm, vault)
curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" && chmod +x kubectl && mv kubectl /usr/local/bin/

# 3. Clonar el repositorio Pokédex para orquestación interna
git clone https://github.com/rocapellino/pokedex.git /opt/devops/pokedex
cd /opt/devops/pokedex

# 4. Orquestar el setup de Vault en 10.10.13.110 directamente desde la LAN
ansible-playbook -i infra/ansible/inventory/hosts.ini infra/ansible/playbooks/setup_vault.yml
```

---

## 5. Hardening del Sistema Operativo y Firewall con Ansible

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

## 6. Aprovisionamiento y Configuración Endurecida de Vault CE con Ansible

El playbook [`infra/ansible/playbooks/setup_vault.yml`](../../infra/ansible/playbooks/setup_vault.yml) automatiza el ciclo de vida y blindaje de HashiCorp Vault CE dentro del contenedor LXC (ID 810, IP `10.10.13.110`) bajo un estándar de seguridad de producción y Zero-Trust:

1. **Cifrado en Tránsito (HTTPS / TLS 1.2+):**
   - Se genera una PKI interna con una CA raíz (`vault-ca.crt`) y un certificado emitido para `vault.proxmox.internal.lan` con SANs para `10.10.13.110`, `127.0.0.1` y `localhost`.
   - Se activa el listener TLS estricto en el puerto 8200 (`tls_disable = 0`, `tls_min_version = "tls12"`).
2. **Almacenamiento Transaccional Raft y Anti-Swap:**
   - Se configura `storage "raft"` en `/opt/vault/data` con permisos restrictivos `0700` (`vault:vault`).
   - Se habilita el bloqueo de memoria física (`disable_mlock = false`) respaldado por la capacidad de Linux `CAP_IPC_LOCK` y límites de systemd `LimitMEMLOCK=infinity` para prevenir el volcado de claves criptográficas a disco swap.
3. **Firewall Perimetral UFW:**
   - Se aplica política por defecto de denegación (`default deny incoming`).
   - El puerto API `8200/tcp` se restringe de forma estricta para ser alcanzable únicamente desde los nodos del clúster K8s (`10.10.13.100`), el host Bastion (`10.10.13.120`) y loopback.
   - El puerto `22/tcp` (SSH) solo se permite desde Bastion y subredes autorizadas.
4. **Shamir Secret Sharing Multipartito (5 llaves / umbral 3):**
   - Inicialización con esquema robusto de Shamir (`key-shares=5`, `key-threshold=3`).
5. **Zero-Disk Persistence (Sin Resguardo de Root Token en LXC):**
   - El proceso de inicialización captura las claves de unseal y el root token **únicamente en la memoria volátil de Ansible**.
   - Se realiza el unseal inicial aplicando 3 llaves en memoria y se configuran las entidades de Vault.
   - Se garantiza la eliminación permanente de cualquier archivo `vault-init.json` en el contenedor LXC.
   - Las llaves maestras se entregan al operador fuera del contenedor.
6. **Integración con External Secrets Operator (ESO):**
   - El certificado público de la CA interna se exporta a [`infra/k8s/eso/vault-ca.crt`](../../infra/k8s/eso/vault-ca.crt) y se enlaza al `ClusterSecretStore/vault-backend` mediante `caProvider: { type: ConfigMap, name: vault-ca, key: ca.crt, namespace: external-secrets }`, garantizando validación TLS completa sin ignorar certificados.

```bash
# Ejecutar el playbook de aprovisionamiento endurecido de Vault:
ansible-playbook -i infra/ansible/inventory/hosts.ini infra/ansible/playbooks/setup_vault.yml

# O mediante Taskfile:
task vault:setup:proxmox

# Verificar la salud de la API de Vault vía HTTPS con la CA interna:
curl --cacert infra/k8s/eso/vault-ca.crt https://10.10.13.110:8200/v1/sys/health | jq .
```

---

## 7. Instalación de Kubernetes Runtime (K3s) y CNI Cilium

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

## 8. Despliegue y Sincronización GitOps con ArgoCD

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

## 9. Verificación en Vivo de Aislamiento Egress y Anti-SSRF

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

## 10. Procedimiento de Rotación de Secretos y Reinicio Progresivo (Rollout Restart)

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

---

## 11. Operaciones Excepcionales: Procedimiento "Break-Glass" en Bastion Host

En caso de indisponibilidad de GitHub Actions, falla en el controlador de ArgoCD o emergencias P1 que requieran intervención manual directa sobre el clúster K3s o Vault, se debe invocar el **Procedimiento Break-Glass**:

* **Topología:** `Administrador -> SSH -> Bastion Host (LXC 820) -> kubectl / helm / vault / ansible -> K3s`.
* **Auditoría Activa:** Todos los comandos ejecutados quedan registrados con usuario, IP, comando, timestamp y código de salida en `/var/log/bastion/audit.log` y en syslog (`authpriv.notice`).
* **Zero-Drift:** Cualquier modificación manual ejecutada durante la emergencia debe ser reconciliada en Git dentro de las 4 horas posteriores para evitar discrepancias con ArgoCD.
* **Guía Completa:** Ver el documento detallado en [Procedimiento Break-Glass](BREAK_GLASS_PROCEDURE.md).

---

## 12. Aislamiento de Entornos y Dominio de Fallas (SPOF) On-Premise

* **Aislamiento Lógico en Plataforma Física Única:** Pre-producción (LXC 800) y Producción (VM 801) comparten el mismo hardware físico de Proxmox VE (CPU, RAM, storage NVMe, NIC física).
* **Particionamiento Lógico de Vault:** Para no duplicar recursos, Vault utiliza aislamiento lógico de secretos (`secret/data/pokedex/preprod/*` con rol `pokedex-preprod-role` y `secret/data/pokedex/prod/*` con rol `pokedex-prod-role`).
* **SPOF Explícito y Mitigación:** La caída del hipervisor físico o corte de energía detiene ambos entornos. Las mitigaciones incluyen copias de seguridad automáticas con Proxmox Backup Server (PBS), snapshots de Raft en Vault y reprovisionamiento 100% reproducible con OpenTofu y Ansible.
* **Análisis Detallado:** Ver [Análisis de Dominios de Falla y SPOF](../architecture/ONPREM_SPOF_AND_FAILURE_DOMAIN_ANALYSIS.md).

