# Comparativa: Arquitectura Declarada vs. Arquitectura Realmente Renderizada

Este documento compara la **arquitectura declarada** (documentación y ADRs) con la **arquitectura realmente
renderizada** (manifiestos que genera Helm y aplica ArgoCD) para cada entorno de [ADR-030](../decisions/ADR-030-environment-model-local-dev-proxmox-preprod-cloud-prod.md).

Responde tres preguntas:

1. ¿Qué componentes se **renderizan** en cada entorno?
2. ¿Qué componentes son **código preparado** que un entorno no activa?
3. ¿Qué componentes son **exclusivos del desarrollo local** con Docker Compose?

> [!NOTE]
> **Fuente de los datos:** `helm template` sobre `infra/helm/pokedex` con las cadenas de values de
> [`app-proxmox-preprod.yaml`](../../gitops/apps/app-proxmox-preprod.yaml) y
> [`app-cloud.yaml`](../../gitops/apps/app-cloud.yaml). Las versiones, réplicas y tamaños citados cambian con el
> código: ante cualquier duda, el render es la fuente de verdad. Que un recurso se renderice no implica que opere en
> runtime ([methodology.md](../../.agents/skills/_shared/methodology.md) §1).

---

## 1. Matriz Canónica: Declarado vs. Renderizado por Entorno

| Componente | Prod Cloud (blueprint inactivo) | Proxmox Pre-prod (LXC 800) | Clasificación | Detalle |
| --- | :---: | :---: | --- | --- |
| **K3s Runtime** | `-` | `✓` | **Runtime activo (pre-prod)** | K3s es el único runtime activo. El blueprint prod cloud usará el Kubernetes gestionado del proveedor que fije un ADR. |
| **Cilium (eBPF)** | `✓` `CiliumNetworkPolicy` L7 | `-` | **Diferenciado por perfil / CNI** | `ciliumNetworkPolicy.enabled` es `true` en cloud y `false` en pre-prod, cuyo K3s corre Flannel (excepción temporal de [ADR-013](../decisions/ADR-013-zero-trust-network-architecture.md)). |
| **HashiCorp Vault CE** | `-` | `✓` (LXC 810, fuera del clúster) | **Infraestructura externa** | Pre-prod lee `pokedex/preprod`; `pokedex/prod` queda reservado al blueprint. |
| **External Secrets (ESO)** | `✓` `cloud-secret-store` | `✓` `vault-backend-preprod` | **Renderizado en ambos** | Pre-prod sincroniza además el certificado TLS del Ingress (`pokedex-ingress-tls`). |
| **Stakater Reloader** | `✓` | `-` | **Diferenciado por perfil** | Solo cloud renderiza `reloader.stakater.com/auto`. Pre-prod refresca secretos con `task k8s:rollout-restart`. |
| **PgBouncer** | `✓` (2 réplicas) | `-` | **Diferenciado por perfil** | `values.prod.yaml` lo activa y el overlay de cloud no lo sobrescribe. Pre-prod lo desactiva ([ADR-011](../decisions/ADR-011-persistence-drizzle-orm-and-pgbouncer.md), perfil Lean). |
| **Job de migración** | `✓` | `✓` | **Renderizado en ambos** | `pokedex-db-migrate`, hook `Sync` en la wave 1, antes de la API (ADR-011, enmienda 2026-10-28). |
| **Seed Job** | `-` | `✓` | **Diferenciado por perfil** | Solo pre-prod siembra el catálogo (`seedJob.enabled`, hook `PostSync`). |
| **HPA** | `✓` API 3-10, Web 2-6 | `-` (1 réplica fija) | **Diferenciado por perfil** | Pre-prod usa `autoscaling.enabled: false`. |
| **PostgreSQL 17 StatefulSet** | `✓` (10Gi) | `✓` (1Gi) | **Renderizado en ambos** | Volumen de `volumeClaimTemplates`; StorageClass por defecto del clúster ([ADR-031](../decisions/ADR-031-adopcion-valkey-y-actualizacion-postgresql-17.md)). |
| **Valkey 8 Deployment** | `✓` (PVC 8Gi) | `✓` (PVC 1Gi) | **Renderizado en ambos** | Service `pokemon-redis-svc` (ADR-031). |
| **CronJobs de backup y DR** | `✓` | `✓` | **Renderizado en ambos** | `db-backup`, `gdrive-sync` y `dr-restore-verify`. |
| **ServiceMonitor** | `✓` | `-` | **Diferenciado por perfil** | Solo para clústeres con Prometheus Operator. Pre-prod usa el scrape de Alloy. |
| **Grafana Alloy** | `-` | Release aparte | **Fuera del chart** | No forma parte del chart: se instala en `monitoring` con [`grafana-cloud-values.yaml`](../../infra/monitoring/grafana-cloud-values.yaml). El receptor OTLP reenvía métricas y logs; las trazas no se reenvían. |
| **cAdvisor** | `-` | `-` | **Solo desarrollo local** | No hay manifiesto en el chart: en Kubernetes lo expone el kubelet. Solo corre como contenedor en `docker-compose.dev.yaml`. |
| **ArgoCD** | `(P)` plantilla | `✓` in-cluster | **Runtime activo (pre-prod)** | `app-proxmox-preprod.yaml` sincroniza el K3s del LXC 800. `app-cloud.yaml` queda excluida del App-of-Apps (GITOPS-001). |

---

## 2. Hallazgos Detallados por Componente

### 2.1. PgBouncer: activo en el blueprint, inactivo en pre-prod

- **Blueprint prod cloud:** `values.prod.yaml` declara `pgbouncer.enabled: true` con 2 réplicas y el overlay
  `gitops/environments/cloud/values.yaml` no lo sobrescribe, así que el render incluye `pgbouncer`,
  `pgbouncer-service` y su NetworkPolicy. La API conecta a PgBouncer y las migraciones van directas a PostgreSQL
  por el Job de migración.
- **Pre-prod:** `gitops/environments/proxmox-preprod/values.yaml` declara `pgbouncer.enabled: false`. Con una
  réplica de API, el pool nativo (`pg.Pool`, `max: 10`) basta y se evita un salto de red y memoria adicional.
- **Conclusión:** el template `pgbouncer-deployment.yaml` no es código muerto: lo usa el blueprint de producción.

### 2.2. cAdvisor: exclusivo de Docker Compose

- **En el render:** no existe ningún manifiesto de cAdvisor en el chart.
- **En Kubernetes:** el kubelet incluye cAdvisor en su binario y expone `/metrics/cadvisor`. La recolección se
  declara en `grafana-cloud-values.yaml` (chart `k8s-monitoring`).
- **En desarrollo local:** Docker Engine no expone métricas de cgroups en formato Prometheus, por eso
  `docker-compose.dev.yaml` agrega el contenedor `cadvisor`.

### 2.3. Cilium: manifiesto renderizado frente a CNI real

- **Render de cloud y del perfil por defecto:** con `ciliumNetworkPolicy.enabled: true` se renderizan
  `pokedex-api-cilium-l7-policy` y `pokedex-gdrive-sync-cilium-l7-policy` (allowlist FQDN L7).
- **Pre-prod:** el K3s del LXC 800 corre Flannel. Sin el CRD `CiliumNetworkPolicy` el sync de ArgoCD fallaría, por
  eso `ciliumNetworkPolicy.enabled: false` y el egreso usa el fallback L4 con exclusiones anti-SSRF
  ([ADR-013](../decisions/ADR-013-zero-trust-network-architecture.md), enmienda 2026-10-04).

### 2.4. Stakater Reloader: dualidad intencional

- **Blueprint prod cloud:** renderiza `reloader.stakater.com/auto` porque ESO actualiza el Secret de forma
  asíncrona tras cada rotación y los pods deben refrescarse sin intervención.
- **Pre-prod:** con `reloader.enabled: false` no se anota ningún workload ni corre el controlador. El refresco se
  hace con `task k8s:rollout-restart`.

---

## 3. Síntesis de Recursos Generados (`helm template`)

```text
Recursos comunes a ambos entornos:
├── NetworkPolicy (default-deny, allow-web, allow-api, allow-postgres, allow-redis,
│                  allow-backup-egress, allow-gdrive-sync-egress, allow-db-migrator-egress)
├── ResourceQuota y LimitRange
├── PodDisruptionBudget (api-pdb, web-pdb)
├── ConfigMap (pokemon-config) y ExternalSecret (pokedex-external-secrets)
├── PersistentVolumeClaim (redis-data, backup-pvc)
├── Service (pokemon-api-svc, api, pokemon-web-svc, postgres-service, pokemon-redis-svc)
├── Deployment (pokemon-api, pokedex-web, redis) y StatefulSet (postgres)
├── Job (db-migrate)
├── CronJob (db-backup, gdrive-sync, dr-restore-verify)
└── Ingress

Divergencias por entorno:
┌──────────────────────────────────────┬──────────────────────────────────────┐
│      Prod Cloud (blueprint)          │   Proxmox Pre-prod (LXC 800)         │
├──────────────────────────────────────┼──────────────────────────────────────┤
│ • HPA (api-hpa, web-hpa)             │ • Sin HPA (1 réplica fija)           │
│ • PgBouncer + allow-pgbouncer-ingress│ • Pool nativo, sin PgBouncer         │
│ • CiliumNetworkPolicy L7             │ • Flannel L3/L4 (sin CRD Cilium)     │
│ • Ingress class: nginx (*)           │ • Ingress class: traefik             │
│ • ESO: cloud-secret-store            │ • ESO: vault-backend-preprod + TLS   │
│ • Reloader habilitado                │ • Reloader deshabilitado             │
│ • ServiceMonitor                     │ • Seed Job (PostSync)                │
└──────────────────────────────────────┴──────────────────────────────────────┘
(*) Punto de variación del proveedor (ADR-030).
```

---

## 4. Recomendaciones de Higiene Arquitectónica

1. **Conservar los templates diferenciados por perfil** (PgBouncer, HPA, Reloader, Cilium): los usa el blueprint
   de producción aunque pre-prod no los renderice.
2. **Tratar cAdvisor como artefacto de Docker Compose**, no como pieza a gestionar en Kubernetes.
3. **Validar los contratos CNI y NetworkPolicies por perfil en CI**: L3/L4 en pre-prod y `CiliumNetworkPolicy` L7 en
   el perfil por defecto y cloud ([`network_policies_security.test.ts`](../../tests/security/network_policies_security.test.ts)).
