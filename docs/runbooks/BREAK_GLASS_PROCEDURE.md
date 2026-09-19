# Procedimiento Operativo de Emergencia: Break-Glass (Bastion Host)

Este documento formaliza el procedimiento de **Break-Glass (Operación Excepcional)** para el cluster Kubernetes (K3s) y la infraestructura Proxmox VE del proyecto Pokédex, dando cumplimiento a lo establecido en el [ADR-025](../decisions/ADR-025-management-plane-runtime-plane-and-cloud-ready-separation.md).

---

## 1. Topología Operativa: Flujo Normal vs Break-Glass

El principio fundamental de la plataforma es **Zero Drift**: en condiciones normales, ningún operador interactúa directamente con la API de Kubernetes ni con los contenedores. Todo cambio debe originarse en Git (GitOps).

```text
Flujo Normal (Declarativo / GitOps):
=====================================
Developer ──▶ Git Commit / PR ──▶ GitHub Actions (CI) ──▶ ArgoCD (CD) ──▶ K3s Runtime

Flujo Excepcional Break-Glass (Emergencia Auditada):
===================================================
Administrador ──▶ SSH (Ed25519) ──▶ Bastion Host (LXC 820) ──▶ kubectl / helm / vault / ansible ──▶ K3s / Proxmox
                                            │
                                            ▼
                                Auditoría Inmutable
                          (/var/log/bastion/audit.log & syslog)
```

| Dimensión | Flujo Normal (GitOps) | Flujo Break-Glass (Bastion) |
|---|---|---|
| **Actor** | Developer / Bot CI | Administrador SRE / Infraestructura |
| **Punto de Entrada** | Pull Request en GitHub | SSH al LXC Bastion (10.10.13.120) |
| **Herramientas** | ArgoCD, OpenTofu Cloud, CI | `kubectl`, `helm`, `vault`, `ansible` |
| **Latencia de Despliegue** | 2-5 minutos (pipelines CI/CD) | Inmediata (< 10 segundos) |
| **Casos de Uso** | Features, releases, parches estándar | Caída de GitHub/ArgoCD, outage severo, incidentes P1 |
| **Rastro de Auditoría** | Git commit log & PR review | `/var/log/bastion/audit.log` & syslog local |

---

## 2. Criterios de Activación

El acceso Break-Glass **solo** debe invocarse ante situaciones excepcionales debidamente justificadas:

1. **Fallo de conectividad o indisponibilidad de GitHub / ArgoCD:**
   - ArgoCD ApplicationController en estado de degradación crítica o CrashLoopBackOff.
   - GitHub Actions fuera de línea impidiendo despliegues urgentes de mitigación.
2. **Incidente de Seguridad o Filtración Inminente (P1):**
   - Necesidad inmediata de aislar pods comprometidos (`kubectl isolate` o aplicar `NetworkPolicy` de emergencia).
   - Revocación o rotación forzada de tokens de HashiCorp Vault.
3. **Rescate Criptográfico de Vault (Unseal / Quórum Perdido):**
   - Reinicio imprevisto del nodo Proxmox requiriendo la inyección del quórum Shamir (3 de 5 llaves) desde el Bastion.
4. **Restauración de Desastre (DR) o Split-Brain:**
   - Fallo en el datastore SQLite/etcd de K3s o restauración desde snapshot de backup.

---

## 3. Acceso y Autenticación al Bastion Host

El acceso al Bastion Host está restringido por clave SSH pública Ed25519 y firewall perimetral UFW:

```bash
# Conexión SSH al Bastion Host desde la estación del Administrador
ssh -i ~/.ssh/pokedex_admin_ed25519 sysadmin@10.10.13.120
```

Una vez iniciada la sesión interactiva, el entorno carga automáticamente las credenciales necesarias:
- `KUBECONFIG=/etc/rancher/k3s/k3s.yaml` (con permisos de cluster-admin hacia el K3s VM 801).
- `VAULT_ADDR=https://10.10.13.110:8200` y `VAULT_CACERT=/etc/ssl/vault/vault-ca.crt`.
- Variables de entorno de Ansible con inventario Proxmox en `/etc/ansible/hosts`.

---

## 4. Auditoría Activa de Comandos en Bastion

Para garantizar la rendición de cuentas (accountability) y prevenir abusos sin control, **todos** los comandos interactivos ejecutados en el Bastion son interceptados a través de `/etc/profile.d/bastion-audit.sh` mediante el hook `PROMPT_COMMAND`.

### Formato de Registro de Auditoría

Cada comando genera una entrada estructurada en `/var/log/bastion/audit.log` y una notificación en syslog (`authpriv.notice`):

```text
[2026-09-18T17:15:02-03:00] [BREAK-GLASS] USER=sysadmin UID=1000 IP=192.168.1.50 PWD=/home/sysadmin EXIT=0 CMD=kubectl get nodes -o wide
[2026-09-18T17:16:30-03:00] [BREAK-GLASS] USER=sysadmin UID=1000 IP=192.168.1.50 PWD=/home/sysadmin EXIT=0 CMD=kubectl rollout restart deployment pokedex-api -n pokedex
[2026-09-18T17:20:12-03:00] [BREAK-GLASS] USER=sysadmin UID=1000 IP=192.168.1.50 PWD=/home/sysadmin EXIT=1 CMD=helm rollback pokedex-app 3 -n pokedex
```

### Inspección de Logs por el Equipo de Seguridad

```bash
# Ver las últimas acciones de break-glass en tiempo real
sudo tail -f /var/log/bastion/audit.log

# Buscar comandos ejecutados durante un incidente específico
sudo grep "kubectl scale" /var/log/bastion/audit.log
```

Los registros rotan semanalmente mediante `logrotate` (`/etc/logrotate.d/bastion-audit`), conservando 12 semanas de histórico comprimido.

---

## 5. Procedimiento de Ejecución en Caso de Emergencia

### 5.0. Inmutabilidad de Código en Bastion: Fijar Commit SHA Conocido (Known-Good State)

> [!IMPORTANT]
> **Nunca opere sobre una rama mutable (`main`) durante una emergencia.**
> Durante un incidente crítico, la rama remota `main` puede contener commits no probados, merges incompletos o regresiones en curso. Toda intervención manual u orquestación desde el Bastion debe anclarse estrictamente a un **Commit SHA verificado (Known-Good State)** o a un Tag de release oficial (`vX.Y.Z`).

```bash
# 1. Acceder al repositorio local del Bastion
cd /opt/devops/pokedex

# 2. Obtener los últimos objetos, referencias y tags remotos sin alterar el working tree
git fetch --all --tags

# 3. Mover el HEAD a un Commit SHA o Tag inmutable de versión conocida y estable
git checkout <KNOWN_GOOD_COMMIT_SHA>

# 4. Confirmar estado inmutable y detached HEAD
git status
```

**Garantías del Modelo Inmutable:**
- **Determinismo Absoluto:** Garantiza que los manifiestos, scripts y playbooks ejecutados reflejen el estado criptográfico deseado.
- **Trazabilidad Forense:** El checkout del SHA queda registrado en `/var/log/bastion/audit.log` vinculando inequívocamente la acción del operador a la versión exacta del código.
- **Aislamiento ante Drift:** Evita que pushes concurrentes a ramas remotas contaminen la operación de recuperación.

### Escenario A: Reinicio de Emergencia de Pods / Despliegue
Si los pods se encuentran bloqueados o una rotación de secretos en Vault no ha sido propagada:
```bash
# 1. Comprobar estado de pods y pods atascados
kubectl get pods -n pokemon-app -o wide

# 2. Reiniciar deployment de forma progresiva
kubectl rollout restart deployment/pokedex-api -n pokemon-app

# 3. Monitorear estado de actualización
kubectl rollout status deployment/pokedex-api -n pokemon-app --timeout=60s
```

### Escenario B: Unseal Manual de Vault tras Reinicio de Proxmox
Si el LXC 810 (Vault) se reinicia y entra en estado sellado (HTTP 503):
```bash
# 1. Verificar estado de sellado
vault status

# 2. Solicitar la presencia de 3 de los 5 custodios de llaves Shamir
vault operator unseal <KEY_1>
vault operator unseal <KEY_2>
vault operator unseal <KEY_3>

# 3. Comprobar que Vault está operativo
vault status
```

### Escenario C: Parche Directo de Manifiesto / Rollback
Si ArgoCD está inoperativo y se requiere aplicar un Hotfix urgente:
```bash
# 1. Realizar backup del manifiesto vivo
kubectl get deployment pokedex-api -n pokemon-app -o yaml > /tmp/pokedex-api-backup.yaml

# 2. Aplicar corrección de emergencia
kubectl patch deployment pokedex-api -n pokemon-app -p '{"spec":{"replicas":3}}'
```

---

## 6. Regla Inquebrantable de Reconciliación Post-Incidente (Zero-Drift)

> [!CAUTION]
> Cualquier cambio manual ejecutado desde el Bastion que no sea reflejado en Git será **automáticamente sobrescrito** tan pronto como ArgoCD recupere la conectividad.

Una vez mitigada la emergencia, el operador que utilizó el procedimiento Break-Glass **debe** seguir estos pasos obligatorios dentro de las siguientes 4 horas:

1. **Abrir Issue / Ticket de Incidente:** Documentar causa raíz y registrar los comandos extraídos de `/var/log/bastion/audit.log`.
2. **Reconciliación en Git (Backporting):**
   - Si se modificaron réplicas, variables o imágenes en K8s, actualizar `gitops/environments/proxmox/values.yaml` o el Helm Chart correspondiente.
   - Enviar Pull Request con etiqueta `incident-remediation` y mergear a `main`.
3. **Verificar GitOps Sync:**
   - Confirmar en ArgoCD que el estado `Synced` y `Healthy` se restableció sin discrepancias (`OutOfSync`).
4. **Cierre Formal del Incidente:** Registrar el hash del commit reconciliador en el ticket de auditoría.
