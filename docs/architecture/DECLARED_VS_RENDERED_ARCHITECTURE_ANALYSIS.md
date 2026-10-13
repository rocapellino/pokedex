# Comparativa: Arquitectura Declarada vs. Arquitectura Realmente Renderizada

Este documento presenta una auditoría técnica profunda que compara la **arquitectura declarada** (documentación, diagramas y especificaciones teóricas) frente a la **arquitectura realmente renderizada** (manifiestos generados por Helm y aplicados por ArgoCD en GitOps).

Su objetivo es responder con precisión:

1. ¿Qué componentes están **realmente desplegados** en ejecución?
2. ¿Qué componentes son **código preparado para el futuro** (templates durmientes)?
3. ¿Qué componentes son **herencia histórica** (ej. vestigios de Docker Compose)?

---

## 1. Matriz Canónica: Declarado vs. Renderizado por Entorno

| Componente | Prod Cloud (blueprint) | Proxmox Pre-prod (LXC 800) | Estado Real en el Repositorio | Diagnóstico y Clasificación |
| --- | :---: | :---: | --- | --- |
| **K3s Runtime** | `-` (Kubernetes gestionado) | `✓` (LXC 800) | **Desplegado Real** | K3s es el motor exclusivo on-premise (la VM de prod Proxmox se retiró con ADR-030); el blueprint prod cloud usará el Kubernetes gestionado del proveedor elegido. |
| **Cilium (eBPF)** | `(P)` (Renderizado) | `-` (`cilium.enabled: false`) | **Diferenciado por Perfil / CNI** | El blueprint prod cloud renderiza `CiliumNetworkPolicy` L7 (`cilium.enabled: true`). En Proxmox LXC 800 está desactivado (`cilium.enabled: false`, ADR-009) porque el contenedor LXC usa Flannel + `NetworkPolicy` L3/L4 estándar. |
| **HashiCorp Vault CE** | `-` (Secrets Mgr) | `✓` (LXC 810) | **Desplegado Real** | Vault corre en LXC dedicado con partición lógica `secret/data/pokedex/preprod/*` (reservando `secret/data/pokedex/prod/*` para el blueprint cloud). |
| **External Secrets (ESO)** | `✓` (`cloud-secret-store`) | `✓` (`vault-backend-preprod`) | **Desplegado Real** | Renderizado activamente en Helm. En el blueprint prod cloud referencia `cloud-secret-store`; en Proxmox pre-prod conecta a `vault-backend-preprod`. |
| **Stakater Reloader** | `✓` (Activo) | `-` (Inactivo) | **Diferenciado por Perfil** | En el blueprint prod cloud renderiza `reloader.stakater.com/auto: "true"`. En Proxmox está desactivado (`reloader.enabled: false`) por ADR-030 (perfil Lean de pre-prod). |
| **PgBouncer** | `-` (Inactivo en GitOps) | `-` (Inactivo) | **Código Preparado (Activo en `values.prod.yaml`)** | Existe template `pgbouncer-deployment.yaml` y está habilitado en `values.prod.yaml`, pero los overlays de GitOps (`proxmox-preprod/values.yaml` y `cloud/values.yaml`) usan `pgbouncer.enabled: false` por defecto con `pg.Pool` nativo. |
| **Grafana Alloy** | `✓` (Cloud values) | `✓` (Proxmox values) | **Desplegado Real** | Agente único desplegado en K8s para métricas, logs y trazas hacia Grafana Cloud. |
| **cAdvisor** | `-` (Nativo Kubelet) | `-` (Nativo Kubelet) | **Herencia de Docker Compose** | **NO corre como pod en Kubernetes**. Kubelet expone cAdvisor nativamente en `:10250/metrics/cadvisor`. Solo corre como contenedor auxiliar en `docker-compose.dev.yaml`. |
| **ArgoCD** | `(P)` (Plantilla) | `✓` (Sincronizado) | **Desplegado Real (On-prem)** | `app-proxmox-preprod.yaml` sincroniza activamente K3s. `app-cloud.yaml` existe como plantilla de referencia no conectada a un clúster vivo (ADR-030). |
| **HPA (HorizontalPodAutoscaler)** | `✓` (Renderizado) | `-` (Inactivo) | **Diferenciado por Perfil** | Renderizado en el blueprint prod cloud (`minReplicas: 2`, `maxReplicas: 6` API / `5` Web). En Proxmox `autoscaling.enabled: false` (`replicaCount: 1`) para capacidad garantizada fija. |
| **PostgreSQL 16 StatefulSet** | `✓` (Renderizado) | `✓` (Renderizado) | **Desplegado Real** | Base de datos persistente única con volumen PVC `10Gi` (StorageClass por defecto del clúster cloud / Proxmox `local-path`). |
| **Redis 7 Deployment** | `✓` (Renderizado) | `✓` (Renderizado) | **Desplegado Real** | Caché sub-3ms con PVC (`8Gi` en base/cloud, `2Gi` en pre-prod) y persistencia AOF/RDB. |
| **CronJobs de Backup y DR** | `✓` (Renderizado) | `✓` (Renderizado) | **Desplegado Real** | Backup nocturno cifrado, réplica a Google Drive y certificación periódica de restauración en base temporal. |

---

## 2. Hallazgos Detallados por Componente

### 2.1. PgBouncer: El caso del "Código Preparado no Activado"

- **En la documentación y `values.prod.yaml`:** PgBouncer aparece como habilitado (`enabled: true`, 2 réplicas, poolSize: 25).
- **En el GitOps real (`gitops/environments/proxmox-preprod/values.yaml`):**

  ```yaml
  pgbouncer:
    enabled: false
  ```

- **Razón Arquitectónica:** Conforme al ADR-030 (perfil Lean de pre-prod), desplegar dos réplicas de PgBouncer consume ~128MB de RAM y añade un salto de red innecesario para un clúster con una réplica de API (`api.replicaCount: 1`). El pool interno de Node.js (`pg.Pool` con `max: 10` por pod = 10 conexiones totales) es más que suficiente para PostgreSQL mononodo.
- **Conclusión:** El template `pgbouncer-deployment.yaml` **no es código muerto**, sino código preparado (y probado en CI con KinD) para cuando el tráfico exceda las conexiones directas recomendadas.

---

### 2.2. cAdvisor: El mito del pod de observabilidad

- **En debates de arquitectura:** Se suele listar a cAdvisor como un componente a desplegar o evaluar en Kubernetes.
- **En el render real:** **No existe ningún manifiesto ni Helm template para cAdvisor en Kubernetes**.
- **Realidad Técnica:** Kubelet incluye cAdvisor compilado en su propio binario (`/metrics/cadvisor` en el puerto 10250). Grafana Alloy hace scraping directamente desde Kubelet.
- **Origen de la Confusión:** En desarrollo local (`docker-compose.dev.yaml`), Docker Engine no expone métricas de cgroups nativamente en formato Prometheus, por lo que se requiere el contenedor satélite `gcr.io/cadvisor/cadvisor`.
- **Conclusión:** cAdvisor es **herencia de desarrollo local**; en Kubernetes su presencia es nativa e invisible.

---

### 2.3. Cilium: La brecha entre Manifiesto Renderizado y Runtime CNI

- **En el render de Helm (base / cloud):** Con `networkPolicies.cilium.enabled: true` se renderiza:

  ```yaml
  apiVersion: "cilium.io/v2"
  kind: CiliumNetworkPolicy
  metadata:
    name: pokedex-api-cilium-l7-policy
  ```

- **Realidad en el Clúster LXC 800:** K3s en un contenedor LXC de Proxmox comparte el kernel del host y opera con Flannel (`cilium.enabled: false` en `gitops/environments/proxmox-preprod/values.yaml`, ADR-009), aplicando las `NetworkPolicy` L3/L4 estándar.
- **Requisito Operativo para L7:** En una VM KVM completa o en el blueprint de producción cloud, Cilium CNI procesa el CRD `CiliumNetworkPolicy` para aplicar filtrado DNS/FQDN L7.

---

### 2.4. Stakater Reloader: Dualidad intencional Cloud vs On-Premise

- **En el blueprint prod cloud:** Renderiza `reloader.stakater.com/auto: "true"`. Es necesario porque ESO actualiza el Secret de forma asíncrona tras cada rotación del backend y los pods deben refrescarse sin intervención.
- **En Proxmox:** Con `reloader.enabled: false`, el template omite la anotación `reloader.stakater.com/auto`. Se evita correr el pod controlador de Reloader para ahorrar memoria. El refresco de secretos se realiza mediante el script canónico `k8s-rollout-restart.ts`.

---

## 3. Síntesis de Recursos Generados en Helm (`helm template`)

Al comparar la salida cruda de `helm template` entre perfiles:

```text
Recursos Idénticos en Ambos Entornos (Núcleo Universal):
├── NetworkPolicy (default-deny, allow-web, allow-api, allow-postgres, allow-redis, allow-backup)
├── ResourceQuota & LimitRange
├── PodDisruptionBudget (api-pdb, web-pdb)
├── ConfigMap (pokemon-config)
├── PersistentVolumeClaim (redis-data, backup-pvc)
├── Service (pokemon-api-svc, pokemon-web-svc, postgres-service, pokemon-redis-svc)
├── Deployment (pokemon-api, pokemon-web, redis)
├── StatefulSet (postgres)
└── CronJob (db-backup, dr-restore-verify, gdrive-sync)

Divergencias Específicas por Entorno:
┌──────────────────────────────────┬──────────────────────────────────┐
│      Prod Cloud (blueprint)      │   Proxmox Pre-prod (LXC 800)     │
├──────────────────────────────────┼──────────────────────────────────┤
│ • HPA (api-hpa, web-hpa)         │ • Sin HPA (1 réplica fija)       │
│ • CiliumNetworkPolicy L7 activa  │ • Flannel L3/L4 (sin CRD Cilium) │
│ • Ingress class: nginx (*)       │ • Ingress class: traefik         │
│ • ESO: cloud-secret-store        │ • ESO: vault-backend-preprod     │
│ • Reloader: habilitado           │ • Reloader: deshabilitado        │
└──────────────────────────────────┴──────────────────────────────────┘
(*) Punto de variación del proveedor (ADR-030).
```

---

## 4. Conclusión y Recomendación de Higiene Arquitectónica

1. **No eliminar templates "durmientes" como PgBouncer:** Mantenerlos en `infra/helm/pokedex/templates/` con `enabled: false`. No generan recursos en el clúster ni consumen memoria, y preservan la capacidad de escalar a futuro.
2. **Clarificar cAdvisor en la documentación:** Documentar explícitamente que cAdvisor es un artefacto exclusivo de Docker Compose local, no una pieza a gestionar en K8s.
3. **Validar contratos CNI y NetworkPolicies por entorno:** Mantener en el CI los tests de contrato que validan las políticas L3/L4 en pre-prod y L7 `CiliumNetworkPolicy` en el perfil base/cloud.
