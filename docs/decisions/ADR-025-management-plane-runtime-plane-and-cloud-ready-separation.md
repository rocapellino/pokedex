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

## Consecuencias
- **Positivas:** 
  - Justificación arquitectónica sólida: la infraestructura existente no es redundante, sino modular y estructurada por planos.
  - Elimina la confusión sobre dos plataformas activas al clarificar que AWS es un esqueleto cloud-ready.
  - Previene que el Bastion degenere en un punto de divergencia manual (snowflake server).
- **Negativas:** 
  - Requiere mantener la disciplina de no realizar cambios manuales desde el Bastion que no provengan del repositorio Git.
