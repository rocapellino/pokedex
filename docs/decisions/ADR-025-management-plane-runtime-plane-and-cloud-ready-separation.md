# ADR-025: Separación Conceptual entre Management Plane, Runtime Plane y Cloud-Ready Target

## Estado
Aceptado

## Contexto
El crecimiento de componentes en la infraestructura on-premise (Proxmox VE) y cloud (AWS) generó ambigüedad respecto a si el proyecto mantiene dos plataformas productivas concurrentes y si ciertos nodos (como el contenedor Bastion o HashiCorp Vault) representaban infraestructura redundante o sobrearquitectura.

Resulta fundamental evitar tanto la sobrearquitectura como la minimización ciega de componentes, estableciendo una separación clara entre el plano de administración, el plano de ejecución y los objetivos de portabilidad cloud.

## Decisión

Se adopta formalmente el siguiente marco arquitectónico:

### 1. Separación Conceptual de Planos

| Plano | Componentes | Responsabilidad |
| :--- | :--- | :--- |
| **Management Plane** | Bastion LXC, OpenTofu, Ansible, kubectl, Helm, Vault CLI, GitHub Actions, ArgoCD | Orquestación, configuración, auditoría, automatización, GitOps y operaciones excepcionales (break-glass). |
| **Runtime Plane** | K3s (Pods API, Web, PostgreSQL, Redis, Grafana Alloy), HashiCorp Vault CE | Ejecución de cargas de trabajo de la aplicación, servicios de backend, persistencia y almacenamiento de secretos en caliente. |
| **External Services** | GitHub (SCM & GHCR), Grafana Cloud (Métricas y Logs), AWS EKS/S3 (Cloud-Ready Skeleton) | Servicios SaaS delegados y targets de nube pública. |

---

### 2. Rol y Frontera del Bastion Host como Management Plane On-Premise

El contenedor LXC **Bastion** (`10.10.13.120`) se define formalmente como el punto único de entrada y control administrativo de la infraestructura on-premise:

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

#### Guardarraíl Operativo del Bastion (Anti-Drift):
- **Prohibido:** El Bastion **NO** es un servidor para ejecutar cambios manuales permanentes, `kubectl apply` ad-hoc, `git pull` manuales ni edición de manifiestos en caliente.
- **Permitido:** Exclusivamente para administración controlada, diagnóstico, operaciones *break-glass* (recuperación ante desastres) e inicialización automatizada.
- **SSOT Inmutable:** Git sigue siendo la única fuente de verdad. El flujo normal es siempre `Git -> CI -> ArgoCD -> K3s`.

---

### 3. AWS como "Cloud-Ready Skeleton", Proxmox como Entorno Operativo

- **On-Premise (Proxmox VE):** Es la plataforma operacionalmente activa donde corren los entornos de Pre-producción y Producción.
- **Cloud (AWS):** Se clasifica como **Target Arquitectónico Cloud-Ready (No Activo)**. Su función es garantizar que los contratos de infraestructura y Helm chart puedan migrar a un entorno cloud empresarial (EKS, ALB, IRSA, AWS Secrets Manager) sin necesidad de rediseñar la aplicación.

---

### 4. Reutilización Universal de Lógica: Helm Chart Canónico vs Overlays

Se prohíbe duplicar lógica de empaquetado entre plataformas:
- **Lógica Compartida (`infra/helm/pokedex/`):** Contiene la definición canónica y universal de la aplicación: Deployments, Services, Ingress, NetworkPolicies, HPA, PDB, Health Probes, SecurityContext, Redis, PostgreSQL y telemetría OTLP.
- **Diferencias de Plataforma (`gitops/environments/`):**
  - `gitops/environments/proxmox/values.yaml`: Define storage local, Traefik ingress, Cilium eBPF L7, ESO con Vault backend y recursos fijos Lean.
  - `gitops/environments/aws/values.yaml`: Define EBS gp3 CSI, AWS Load Balancer Controller, AWS VPC CNI, Secrets Manager / IRSA y autoscaling HPA elástico.

---

### 5. Cadena Estricta de Responsabilidad On-Premise (Source of Truth)

Cada herramienta tiene un límite claro e indelegable:
1. **OpenTofu:** Instancia infraestructura física/virtualizada (LXC, VM, cores, RAM, almacenamiento, bridges de red, firewall perimetral e IPs).
2. **Ansible:** Configura el sistema operativo invitado (paquetes base, hardening de kernel/SSH, UFW, runtime de K3s, HashiCorp Vault y aprovisionamiento de herramientas en Bastion).
3. **ArgoCD:** Reconcilia el estado deseado en Kubernetes (Deployments, Services, ConfigMaps, ExternalSecrets, NetworkPolicies).
4. **GitHub Actions:** Valida calidad, seguridad (SAST, SCA, IaC), compila imágenes OCI con digest inmutable, firma artefactos y publica releases.

---

### 6. Operación Excepcional Break-Glass y Auditoría en Bastion

Se formaliza la distinción estricta entre el flujo normal y el flujo de contingencia:
- **Flujo Normal:** `Developer -> Git -> GitHub Actions -> ArgoCD -> K3s`.
- **Flujo Break-Glass:** `Administrador -> Bastion -> kubectl / helm / vault / ansible -> K3s`.
- **Inmutabilidad de Código en Emergencia:** Durante operaciones de Break-Glass en el Bastion (`/opt/devops/pokedex`), se prohíbe operar a ciegas sobre la punta flotante de `main`. El operador debe fijar un **Commit SHA o Tag verificado (Known-Good State)** mediante `git fetch` y `git checkout <SHA>`, previniendo drift y garantizando determinismo absoluto durante incidentes.
- **Auditoría Local y Reenvío Remoto para No-Repudio:** Todo comando ejecutado en el Bastion queda registrado localmente en `/var/log/bastion/audit.log` y es reenviado inmediatamente en tiempo real vía `logger -p authpriv.notice` y `rsyslog` hacia el stack centralizado de logs (Grafana Alloy / Loki / SIEM). Se establece formalmente que el archivo local no es inmutable por sí mismo; la garantía de no-repudio descansa en la exportación remota inmediata hacia almacenamiento externo fuera del dominio de fallo del Bastion.
- **Reconciliación Mandatoria:** Cualquier mutación excepcional debe ser reconciliada en Git dentro de las 4 horas posteriores (Zero-Drift). Ver runbook: [Procedimiento Break-Glass](../runbooks/BREAK_GLASS_PROCEDURE.md).

---

### 7. Aislamiento Lógico de Entornos y SPOF On-Premise

- **Dominio Compartido:** Pre-producción y Producción comparten el mismo hardware físico de Proxmox (CPU, RAM, disco y red). El aislamiento es estrictamente lógico (cgroups, namespaces y KVM).
- **Particionamiento Lógico de Vault:** Para evitar duplicación de infraestructura, un único Vault CE gestiona secretos segregados por rutas (`secret/data/pokedex/preprod/*` vs `secret/data/pokedex/prod/*`) con roles de acceso diferenciados (`pokedex-preprod-role` vs `pokedex-prod-role`).
- **SPOF Documentado:** Se asume explícitamente el nodo Proxmox como Single Point of Failure (SPOF). Las mitigaciones arquitecturales comprenden copias de seguridad automáticas (Proxmox Backup Server), esquemas Shamir 5/3 para Vault y despliegues declarativos reproducibles con OpenTofu y Ansible. Ver análisis completo: [Análisis de Dominios de Falla y SPOF](../architecture/ONPREM_SPOF_AND_FAILURE_DOMAIN_ANALYSIS.md).

## Consecuencias
- **Positivas:** 
  - Justificación arquitectónica sólida: la infraestructura existente no es redundante, sino modular y estructurada por planos.
  - Elimina la confusión sobre dos plataformas activas al clarificar que AWS es un esqueleto cloud-ready.
  - El contenedor Bastion queda formalmente justificado como host de auditoría y punto de break-glass seguro.
  - La separación de ambientes en Vault se resuelve lógicamente sin sobrecosto de contenedores adicionales.
  - El SPOF del host Proxmox queda formalmente asumido, documentado y mitigado.
  - Se formaliza la demarcación canónica de responsabilidades en [Matriz de Responsabilidades](../architecture/RESPONSIBILITY_MATRIX.md).
- **Negativas:** 
  - Requiere mantener la disciplina de no realizar cambios manuales desde el Bastion sin posterior reconciliación en Git.

