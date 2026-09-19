# Comparativa: Arquitectura Declarada vs. Arquitectura Realmente Renderizada

Este documento presenta una auditoría técnica profunda que compara la **arquitectura declarada** (documentación, diagramas y especificaciones teóricas) frente a la **arquitectura realmente renderizada** (manifiestos generados por Helm y aplicados por ArgoCD en GitOps).

Su objetivo es responder con precisión:
1. ¿Qué componentes están **realmente desplegados** en ejecución?
2. ¿Qué componentes son **código preparado para el futuro** (templates durmientes)?
3. ¿Qué componentes son **herencia histórica** (ej. vestigios de Docker Compose)?

---

## 1. Matriz Canónica: Declarado vs. Renderizado por Entorno

| Componente | AWS Cloud-Ready | Proxmox Pre-prod | Proxmox Prod | Estado Real en el Repositorio | Diagnóstico y Clasificación |
|---|:---:|:---:|:---:|---|---|
| **K3s Runtime** | `-` (EKS) | `✓` (LXC 800) | `✓` (VM 801) | **Desplegado Real** | K3s es el motor exclusivo on-premise; AWS target utiliza EKS. |
| **Cilium (eBPF)** | `(P)` (Renderizado) | `✓` (Renderizado) | `✓` (Renderizado) | **Renderizado en Helm / Dependiente de CNI** | Helm renderiza `CiliumNetworkPolicy` L7 en todos los entornos. En Proxmox requiere instalación de Cilium CNI vía Helm (`kube-system`). En AWS requiere Cilium CNI chaining. |
| **HashiCorp Vault CE** | `-` (Secrets Mgr) | `✓` (LXC 810) | `✓` (LXC 810) | **Desplegado Real** | Vault corre en LXC dedicado con partición lógica `secret/data/pokedex/preprod/*` y `secret/data/pokedex/prod/*`. |
| **External Secrets (ESO)** | `✓` (AWS SM) | `✓` (Vault) | `✓` (Vault) | **Desplegado Real** | Renderizado activamente en Helm. En AWS conecta a `aws-secrets-manager`; en Proxmox conecta a `vault-backend`. |
| **Stakater Reloader** | `✓` (Activo) | `-` (Inactivo) | `-` (Inactivo) | **Diferenciado por Perfil** | En AWS renderiza anotación `reloader.stakater.com/auto: "true"`. En Proxmox está desactivado (`reloader.enabled: false`, anotación `null`) por ADR-024 (Lean MVP). |
| **PgBouncer** | `-` (Inactivo) | `-` (Inactivo) | `-` (Inactivo) | **Código Preparado (No Renderizado)** | Existe template `pgbouncer-deployment.yaml` y está habilitado en `values.prod.yaml`, pero **ninguna aplicación de ArgoCD** (`app-proxmox.yaml`, `app-cloud.yaml`) lo activa. Se usa pool nativo `pg.Pool` (40 conns). |
| **Grafana Alloy** | `✓` (Cloud values) | `✓` (Proxmox values) | `✓` (Proxmox values) | **Desplegado Real** | Agente único desplegado en K8s para métricas, logs y trazas hacia Grafana Cloud. |
| **cAdvisor** | `-` (Nativo Kubelet) | `-` (Nativo Kubelet) | `-` (Nativo Kubelet) | **Herencia de Docker Compose** | **NO corre como pod en Kubernetes**. Kubelet expone cAdvisor nativamente en `:10250/metrics/cadvisor`. Solo corre como contenedor auxiliar en `docker-compose.dev.yml`. |
| **ArgoCD** | `(P)` (Plantilla) | `✓` (Sincronizado) | `✓` (Sincronizado) | **Desplegado Real (On-prem)** | `app-proxmox.yaml` sincroniza activamente K3s. `app-cloud.yaml` existe como plantilla de referencia no conectada a un cluster vivo. |
| **HPA (HorizontalPodAutoscaler)** | `✓` (Renderizado) | `-` (Inactivo) | `-` (Inactivo) | **Diferenciado por Perfil** | Renderizado en AWS (`minReplicas: 3, maxReplicas: 10`). En Proxmox `autoscaling.enabled: false` para capacidad garantizada fija. |
| **PostgreSQL 16 StatefulSet** | `✓` (Renderizado) | `✓` (Renderizado) | `✓` (Renderizado) | **Desplegado Real** | Base de datos persistente única con volumen PVC `10Gi` (AWS gp3 / Proxmox local-path). |
| **Redis 7 Deployment** | `✓` (Renderizado) | `✓` (Renderizado) | `✓` (Renderizado) | **Desplegado Real** | Caché sub-3ms con PVC `8Gi` y persistencia AOF/RDB. |
| **CronJobs de Backup y DR** | `✓` (Renderizado) | `✓` (Renderizado) | `✓` (Renderizado) | **Desplegado Real** | Backup nocturno cifrado y certificación periódica de restauración en base temporal. |

---

## 2. Hallazgos Detallados por Componente

### 2.1. PgBouncer: El caso del "Código Preparado no Activado"
- **En la documentación y `values.prod.yaml`:** PgBouncer aparece como habilitado (`enabled: true`, 2 réplicas, poolSize: 50).
- **En el GitOps real (`gitops/environments/proxmox/values.yaml`):**
  ```yaml
  pgbouncer:
    enabled: false
  ```
- **Razón Arquitectónica:** Conforme al ADR-024 (Perfil Lean MVP), desplegar dos réplicas de PgBouncer consume ~128MB de RAM y añade un salto de red innecesario para un clúster con 2 réplicas de API. El pool interno de Node.js (`pg.Pool` con `max: 20` por pod = 40 conexiones totales) es más que suficiente para PostgreSQL mononodo.
- **Conclusión:** El template `pgbouncer-deployment.yaml` **no es código muerto**, sino código preparado para cuando el tráfico exceda 50 conexiones simultáneas.

---

### 2.2. cAdvisor: El mito del pod de observabilidad
- **En debates de arquitectura:** Se suele listar a cAdvisor como un componente a desplegar o evaluar en Kubernetes.
- **En el render real:** **No existe ningún manifiesto ni Helm template para cAdvisor en Kubernetes**.
- **Realidad Técnica:** Kubelet incluye cAdvisor compilado en su propio binario (`/metrics/cadvisor` en el puerto 10250). Grafana Alloy hace scraping directamente desde Kubelet.
- **Origen de la Confusión:** En desarrollo local (`docker-compose.dev.yml`), Docker Engine no expone métricas de cgroups nativamente en formato Prometheus, por lo que se requiere el contenedor satélite `gcr.io/cadvisor/cadvisor:v0.49.1`.
- **Conclusión:** cAdvisor es **herencia de desarrollo local**; en Kubernetes su presencia es nativa e invisible.

---

### 2.3. Cilium: La brecha entre Manifiesto Renderizado y Runtime CNI
- **En el render de Helm:** Tanto en AWS como en Proxmox se renderiza:
  ```yaml
  apiVersion: "cilium.io/v2"
  kind: CiliumNetworkPolicy
  metadata:
    name: pokedex-proxmox-api-cilium-l7-policy
  ```
- **Realidad en el Clúster:** Si K3s se instaló con Flannel por defecto (`k3s.service` estándar sin flags), el recurso CRD `CiliumNetworkPolicy` no tiene ningún agente eBPF procesándolo y las reglas FQDN no se aplican.
- **Requisito Operativo:** Para que el render tenga efecto en tiempo de ejecución, el clúster K3s **debe** haberse instalado con `--flannel-backend=none` y el chart de Cilium desplegado en `kube-system` (tal como especifica la sección 7 de [`PROXMOX_DEPLOYMENT_GUIDE.md`](../runbooks/PROXMOX_DEPLOYMENT_GUIDE.md)).

---

### 2.4. Stakater Reloader: Dualidad intencional Cloud vs On-Premise
- **En AWS:** Renderiza `reloader.stakater.com/auto: "true"`. Es necesario porque en AWS Secrets Manager las rotaciones son automáticas y los pods deben refrescarse elásticamente.
- **En Proxmox:** Anotación removida (`reloader.stakater.com/auto: null`). Se evita correr el pod controlador de Reloader para ahorrar memoria. El refresco de secretos se realiza mediante el script canónico `k8s-rollout-restart.ts`.

---

## 3. Síntesis de Recursos Generados en Helm (`helm template`)

Al comparar la salida cruda de `helm template` entre perfiles:

```text
Recursos Idénticos en Ambos Entornos (Núcleo Universal):
├── NetworkPolicy (default-deny, allow-web, allow-api, allow-postgres, allow-redis, allow-backup)
├── ResourceQuota & LimitRange
├── PodDisruptionBudget (api-pdb, web-pdb)
├── ConfigMap (pokemon-config, postgres-init-sql)
├── PersistentVolumeClaim (redis-data)
├── Service (api, web, postgres, redis)
├── Deployment (pokemon-api, pokedex-web, redis)
├── StatefulSet (postgres)
├── CronJob (db-backup, dr-restore-verify)
└── CiliumNetworkPolicy (api-cilium-l7-policy)

Divergencias Específicas por Entorno:
┌───────────────────────────┬───────────────────────────┐
│       AWS Cloud-Ready     │       Proxmox On-Premise  │
├───────────────────────────┼───────────────────────────┤
│ • HPA (api-hpa, web-hpa)  │ • Sin HPA (capacidad fija)│
│ • Ingress class: alb      │ • Ingress class: traefik  │
│ • ESO: aws-secrets-manager│ • ESO: vault-backend      │
│ • Reloader: habilitado    │ • Reloader: deshabilitado │
└───────────────────────────┴───────────────────────────┘
```

---

## 4. Conclusión y Recomendación de Higiene Arquitectónica

1. **No eliminar templates "durmientes" como PgBouncer:** Mantenerlos en `infra/helm/pokedex/templates/` con `enabled: false`. No generan recursos en el clúster ni consumen memoria, y preservan la capacidad de escalar a futuro.
2. **Clarificar cAdvisor en la documentación:** Documentar explícitamente que cAdvisor es un artefacto exclusivo de Docker Compose local, no una pieza a gestionar en K8s.
3. **Validar instalación de Cilium CNI en K3s:** Mantener en el CI el test de contrato que valida que las políticas L7 eBPF y la sonda Anti-SSRF correspondan a la configuración de K3s.
