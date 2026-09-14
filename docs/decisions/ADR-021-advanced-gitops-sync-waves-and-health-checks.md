# ADR-021: Orquestación GitOps Avanzada con ArgoCD: Sync Waves, Hooks de Ciclo de Vida, Health Checks Declarativos y Patrón App-of-Apps

## Estado

Aceptado

## Contexto

En [ADR-003](./ADR-003-gitops-with-argocd.md) se formalizó la adopción de ArgoCD bajo el paradigma GitOps como el estándar de entrega continua. Con la evolución de la plataforma —incorporando migraciones declarativas con Drizzle ORM ([ADR-011](./ADR-011-persistence-drizzle-orm-and-pgbouncer.md)), autoescalado horizontal HPA y PDB ([ADR-014](./ADR-014-elastic-autoscaling-hpa-and-pod-disruption-budget.md)), terminación grácil ([ADR-015](./ADR-015-pod-lifecycle-graceful-shutdown-and-probes.md)), Ingress perimetral con TLS ([ADR-016](./ADR-016-ingress-tls-and-http-hardening.md)) y control de admisión ([ADR-017](./ADR-017-kyverno-admission-control-and-pod-security.md))— se identificaron las siguientes limitaciones en el ciclo de despliegue por defecto:

1. **Condiciones de Carrera en Despliegue Paralelo**: ArgoCD aplica los manifiestos de Kubernetes concurrentemente sin orden determinista salvo que se definan ondas de sincronización (*Sync Waves*). Esto provocaba que los Pods de `pokemon-api` iniciaran antes de que PostgreSQL alcanzara el estado `Ready` y se completara la migración y siembra de esquemas relacionales, generando reinicios espurios (`CrashLoopBackOff`) y alertas ruidosas en Prometheus.
2. **Incompatibilidad entre Hooks de Helm y GitOps**: Los jobs de inicialización utilizaban anotaciones `helm.sh/hook`, ignoradas por los ciclos nativos de reconciliación de ArgoCD cuando no se opera a través del CLI imperativo de Helm.
3. **Opacidad de Recursos Personalizados (CRDs)**: ArgoCD carecía de evaluadores de salud nativos para `ExternalSecret` (ESO), `SealedSecret` (Bitnami) y `ClusterPolicy` (Kyverno), reportando estados ambiguos (*Progressing* indefinido o *Missing* transitorio) en la consola de operaciones.
4. **Desconexión de Gobernanza Multi-Entorno**: La administración de aplicaciones por entorno (`pokedex-proxmox` y `pokedex-cloud`) requería invocaciones independientes sin una raíz declarativa unificada (*App-of-Apps*).

## Decisión

Se adopta una arquitectura de **Orquestación GitOps Avanzada** en ArgoCD basada en cuatro pilares:

### 1. Topología Determinista de Sync Waves

Se implementan anotaciones `argocd.argoproj.io/sync-wave` en las plantillas del Chart de Helm, garantizando el despliegue secuencial por capas de dependencia:

- **Ola 0 (Capa Base y Persistencia)**: `ConfigMap`, `Secret`, `ClusterSecretStore`, `ExternalSecret`, `PostgreSQL StatefulSet` y `Redis Deployment`. Garantiza que el almacenamiento, las credenciales y el motor relacional estén disponibles y saludables antes de cualquier otra acción.
- **Ola 1 (Capa de Migraciones y Ciclo de Vida)**: `Job/pokedex-db-seed`. Anotado adicionalmente con `argocd.argoproj.io/hook: PreSync` y `argocd.argoproj.io/hook-delete-policy: BeforeHookCreation,HookSucceeded`, asegura que el esquema relacional y los datos canónicos se apliquen de forma previa e idempotente.
- **Ola 2 (Capa de Servicios y Negocio)**: `PgBouncer Deployment`, `pokemon-api Deployment` y `ServiceAccount`. La API solo se despliega y recibe tráfico interno una vez que la base de datos ha completado las migraciones.
- **Ola 3 (Capa de Presentación y Autoescalado)**: `pokedex-web Deployment` (Nginx reverse proxy), `HorizontalPodAutoscaler` y `PodDisruptionBudget`.
- **Ola 4 (Capa de Perímetro y Enrutamiento L7)**: `Ingress`, `NetworkPolicies` y `CiliumNetworkPolicy`. El tráfico externo solo se habilita cuando la totalidad del stack de backend y frontend está validada como `Healthy`.

### 2. Custom Health Checks Declarativos en Lua

Se formaliza el ConfigMap `gitops/health-checks/argocd-cm-healthchecks.yaml` extendiendo `argocd-cm` con scripts Lua para evaluar el ciclo de vida de los CRDs críticos:
- **`external-secrets.io/ExternalSecret`**: Evalúa la condición `Ready == True` y `Synced`, reportando `Degraded` si la sincronización con Vault o AWS Secrets Manager falla.
- **`bitnami.com/SealedSecret`**: Evalúa la condición `Synced == True`, alertando de inmediato si el controlador no logra descifrar el secreto sellado.
- **`kyverno.io/ClusterPolicy`**: Evalúa `status.ready == true` o la condición `Ready == True` para confirmar que las reglas de admisión criptográfica y PSS están activas antes de continuar.

### 3. Patrón Canónico App-of-Apps

Se establece `gitops/apps/root-application.yaml` como el orquestador raíz de la plataforma (`pokedex-root`), gobernando declarativamente la totalidad de aplicaciones de la infraestructura desde un único punto de entrada en el namespace `argocd`.

### 4. Políticas de Sincronización Endurecidas y Ventanas de Despliegue

Los manifiestos `app-proxmox.yaml` y `app-cloud.yaml` incorporan:
- `ServerSideApply=true`: Para reconciliación eficiente y control preciso de propiedad de campos (*field management*).
- `RespectIgnoreDifferences=true`: Para coexistencia armoniosa con controladores dinámicos (e.g. HPA escalando réplicas).
- `syncWindows`: Ventanas de sincronización declarativas para prevenir cambios imprevistos en horarios de alta demanda.
- Reintentos con retroceso exponencial (`backoff: duration: 5s, factor: 2, maxDuration: 3m`).

## Consecuencias

### Positivas
- **Cero Downtime y Cero Condiciones de Carrera**: Arranque 100% determinista sin errores transitorios de conexión durante promociones de versión.
- **Observabilidad de Salud Real en CRDs**: Visibilidad precisa del estado de secretos sellados, externos y políticas de admisión en la interfaz y API de ArgoCD.
- **Operación Simplificada**: Despliegue de clústeres completos con una sola orden mediante `task gitops:apps:root`.
- **Auditoría GitOps Estricta**: Cada ola y hook queda registrado en los eventos inmutables del clúster de Kubernetes.

### Compensaciones y Mitigaciones
- **Mayor Tiempo de Despliegue Total**: El avance secuencial por olas (0 a 4) añade una latencia controlada mientras cada recurso alcanza el estado `Healthy`. Esto es el comportamiento deseado para proteger la estabilidad del servicio en producción.
- **Dependencia de Scripts Lua en `argocd-cm`**: Requiere aplicar el ConfigMap de health checks durante el aprovisionamiento de ArgoCD (`task gitops:health-checks`).
