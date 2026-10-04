# ADR-003: Modelo de Despliegue Declarativo y Orquestación GitOps Avanzada con ArgoCD

## Estado

Aceptado (enmendado el 2026-10-04 por el modelo de entornos de ADR-030; ver la sección
*Enmienda 2026-10-04*)

## Contexto

Los despliegues manuales mediante comandos imperativos (`kubectl apply`) generan deriva de configuración (*drift*), falta de auditoría y riesgo de desincronización entre el código fuente y el estado activo del clúster.

Asimismo, con la evolución de la plataforma —incorporando migraciones declarativas con Drizzle ORM ([ADR-011](./ADR-011-persistence-drizzle-orm-and-pgbouncer.md)), autoescalado horizontal HPA y PDB ([ADR-014](./ADR-014-elastic-autoscaling-hpa-and-pod-disruption-budget.md)), terminación grácil ([ADR-015](./ADR-015-pod-lifecycle-graceful-shutdown-and-probes.md)), Ingress perimetral con TLS ([ADR-016](./ADR-016-ingress-tls-and-http-hardening.md)) y control de admisión ([ADR-017](./ADR-017-kyverno-admission-control-and-pod-security.md))— se identificaron limitaciones operativas críticas en el ciclo de reconciliación por defecto:

1. **Condiciones de Carrera en Despliegue Concurrente**: ArgoCD aplica los recursos sin orden secuencial intrínseco si no se definen ondas de sincronización (*Sync Waves*). Esto provocaba que los pods de `pokemon-api` iniciaran antes de que PostgreSQL estuviese en estado `Ready` y se completara la migración y siembra de esquemas relacionales, derivando en `CrashLoopBackOff` transitorios.
2. **Incompatibilidad entre Hooks de Helm y GitOps**: Los jobs de inicialización con anotaciones `helm.sh/hook` no son gestionados de forma determinista por el reconciliador nativo de ArgoCD.
3. **Opacidad de Recursos Personalizados (CRDs)**: ArgoCD carecía de evaluadores de salud nativos para `ExternalSecret` (ESO) y `ClusterPolicy` (Kyverno), reportando estados ambiguos (*Progressing* indefinido o *Missing* transitorio).
4. **Desconexión de Gobernanza Multi-Entorno**: La administración de aplicaciones por entorno (`pokedex-proxmox` y `pokedex-cloud`) requería invocaciones independientes sin una raíz declarativa unificada (*App-of-Apps*).

## Decisión

Se adopta **ArgoCD** bajo el paradigma **GitOps** como el **mecanismo oficial y exclusivo de sincronización continua** en Kubernetes, articulado sobre cinco directrices fundamentales:

### 1. Principios Fundamentales GitOps

1. El repositorio Git es la **única fuente de verdad** (*single source of truth*) para el estado deseado de las aplicaciones y recursos de infraestructura de clúster.
2. Las aplicaciones se declaran exclusivamente mediante recursos `Application` de ArgoCD (`gitops/apps/`).
3. El uso de `kubectl apply` queda estrictamente restringido a procedimientos iniciales de bootstrap de clúster, simulaciones de contingencia y diagnóstico de emergencia documentado.

### 2. Topología Determinista de Sync Waves

Se implementan anotaciones `argocd.argoproj.io/sync-wave` en las plantillas del Chart de Helm, garantizando el despliegue secuencial por capas de dependencia:

- **Ola 0 (Capa Base y Persistencia)**: `ConfigMap`, `Secret`, `ClusterSecretStore`, `ExternalSecret`, `PostgreSQL StatefulSet` y `Redis Deployment`. Garantiza que el almacenamiento, las credenciales y los motores de datos estén disponibles y saludables antes de cualquier otra acción.
- **Ola 1 (Capa de Migraciones y Ciclo de Vida)**: las migraciones de esquema las aplica la API al arrancar (`connectPg`). El `Job/pokedex-db-seed` corre como hook `argocd.argoproj.io/hook: PostSync` (`hook-delete-policy: BeforeHookCreation,HookSucceeded`), una vez que PostgreSQL, Redis y la API están sanos, y siembra los datos canónicos de forma idempotente. Antes era `PreSync`, que corría antes de crear el StatefulSet de PostgreSQL y fallaba en la primera instalación (ADR-030).
- **Ola 2 (Capa de Servicios y Negocio)**: `PgBouncer Deployment`, `pokemon-api Deployment` y `ServiceAccount`. La API solo se despliega y recibe tráfico interno una vez que la base de datos ha completado las migraciones.
- **Ola 3 (Capa de Presentación y Autoescalado)**: `pokedex-web Deployment` (Nginx reverse proxy), `HorizontalPodAutoscaler` y `PodDisruptionBudget`.
- **Ola 4 (Capa de Perímetro y Enrutamiento L7)**: `Ingress`, `NetworkPolicies` y `CiliumNetworkPolicy`. El tráfico externo solo se habilita cuando la totalidad del stack de backend y frontend está validada como `Healthy`.

### 3. Custom Health Checks Declarativos en Lua

Se formaliza el manifiesto `gitops/health-checks/argocd-cm-healthchecks.yaml`, que se inyecta como parche de tipo `merge` sobre el ConfigMap `argocd-cm` con scripts Lua para evaluar el ciclo de vida de los CRDs críticos:

> [!IMPORTANT]
> **GITOPS-001:** ArgoCD carga los scripts `resource.customizations.health.*` **únicamente** desde el ConfigMap `argocd-cm` del namespace `argocd`. Declarar un ConfigMap homónimo separado (`argocd-cm-healthchecks`) se aplicaba sin error pero era **ignorado en silencio**, con lo que los CRDs no sincronizados se reportaban `Healthy` por ausencia de condición. El manifiesto actual parchea `argocd-cm` y la tarea `task gitops:health-checks` lo inyecta con `kubectl patch --type merge` para no sobrescribir el resto de la configuración de ArgoCD.

- **`external-secrets.io/ExternalSecret`**: Evalúa la condición `Ready == True` y `Synced`, reportando `Degraded` si la sincronización con Vault o AWS Secrets Manager falla.
- **`kyverno.io/ClusterPolicy`**: Evalúa `status.ready == true` o la condición `Ready == True` para confirmar que las reglas de admisión criptográfica y PSS están activas antes de continuar.

> [!NOTE]
> El health check de `bitnami.com/SealedSecret` se **retiró** junto con la adopción de Vault CE + ESO (ver [ADR-005](./ADR-005-secret-management.md) y la sección 3.3 de [SECRETS_MANAGEMENT.md](../architecture/SECRETS_MANAGEMENT.md)). El script residual fue purgado del manifiesto y su ausencia está verificada por `tests/security/k8s_workload_hardening.test.ts`.

### 4. Patrón Canónico App-of-Apps

Se establece `gitops/apps/root-application.yaml` como el orquestador raíz de la plataforma (`pokedex-root`), gobernando declarativamente la totalidad de aplicaciones de la infraestructura desde un único punto de entrada en el namespace `argocd`.

### 5. Políticas de Sincronización Endurecidas y Ventanas de Despliegue

Los manifiestos `app-proxmox.yaml` y `app-cloud.yaml` incorporan:

- `ServerSideApply=true`: Para reconciliación eficiente y control preciso de propiedad de campos (*field management*).
- `RespectIgnoreDifferences=true`: Para coexistencia armoniosa con controladores dinámicos (e.g. HPA escalando réplicas).
- `syncWindows`: Ventanas de sincronización declarativas para prevenir cambios imprevistos en horarios de alta demanda.
- Reintentos con retroceso exponencial (`backoff: duration: 5s, factor: 2, maxDuration: 3m`).

## Enmienda 2026-10-04: Entornos Gobernados por el App-of-Apps (ADR-030)

[ADR-030](./ADR-030-environment-model-local-dev-proxmox-preprod-cloud-prod.md) redefine los
entornos y modifica los apartados 4 y 5:

- **Único target sincronizado:** `pokedex-preprod` (`app-proxmox-preprod.yaml`, clúster
  `k8s-preprod`). `app-proxmox.yaml` (`pokedex-proxmox`) se retiró en el paso 5 del plan de
  ADR-030; pre-prod se sincroniza in-cluster (`https://kubernetes.default.svc`).
- **Prod como blueprint:** `app-cloud.yaml` (`pokedex-cloud`) apunta al entorno agnóstico
  `cloud`, sigue excluida de `pokedex-root` y sin `syncPolicy.automated`. La promoción de
  releases mantiene su `targetRevision` y sus digests alineados con pre-prod.
- **Dev fuera de ArgoCD:** Docker Compose y Kind no tienen Application.
- **Retiro seguro de Applications:** `pokedex-root` usa `prune: true` y las Applications
  llevan `resources-finalizer.argocd.argoproj.io`. Quitar un manifiesto de `gitops/apps/` borra
  en cascada los recursos del clúster destino. Antes de retirar una Application con datos
  persistentes, hay que respaldarlos y quitar el finalizer en vivo.
- **La raíz sigue `main`:** con `pokedex-root` fijada a un tag, ArgoCD leía `gitops/apps` desde
  ese tag y nunca veía los pines nuevos. v1.92.1 no llegó a pre-prod hasta reaplicar la raíz a
  mano. Ahora la raíz usa `targetRevision: main` y las hijas siguen fijadas a `vX.Y.Z`: el
  contenido desplegado (chart, values y digests) sigue siendo inmutable, y lo que cambia por
  `main` es solo qué tag usa cada hija, siempre vía PR de promote revisado.
  `update-gitops-pin --check` exige que la raíz siga `main`.

## Consecuencias

### Positivas

- **Trazabilidad Absoluta**: Cada cambio queda registrado en Git, con reversión y detección automática de drift (*self-healing*).
- **Cero Downtime y Cero Condiciones de Carrera**: Arranque 100% determinista sin errores transitorios de conexión durante promociones de versión.
- **Observabilidad de Salud Real en CRDs**: Visibilidad precisa del estado de secretos externos y políticas de admisión en la interfaz y API de ArgoCD.
- **Operación Simplificada**: Despliegue de clústeres completos con una sola orden mediante `task gitops:apps:root`.
- **Auditoría GitOps Estricta**: Cada ola y hook queda registrado en los eventos inmutables del clúster de Kubernetes.

### Compensaciones y Mitigaciones

- **Requisito de Controladores en el Clúster**: Requiere que el controlador de ArgoCD esté operativo y configurado en el clúster.
- **Mayor Tiempo de Despliegue Total**: El avance secuencial por olas (0 a 4) añade una latencia controlada mientras cada recurso alcanza el estado `Healthy`. Esto es el comportamiento deseado para proteger la estabilidad del servicio en producción.
- **Dependencia de Scripts Lua en `argocd-cm`**: Requiere inyectar el manifiesto de health checks durante el aprovisionamiento de ArgoCD (`task gitops:health-checks`). La inyección se realiza con `kubectl patch --type merge` para preservar el resto de la configuración de `argocd-cm`.

---

## Trazabilidad y Decisiones Consolidadas

- **ADR-021 (Orquestación GitOps Avanzada: Sync Waves, Hooks, Health Checks y App-of-Apps)**: Consolidado dentro de este registro. La adopción de ondas de sincronización deterministas (Olas 0 a 4), scripts Lua de Custom Health Checks para CRDs (`argocd-cm`), el patrón raíz *App-of-Apps* (`root-application.yaml`) y las políticas de Server-Side Apply y sync windows forman ahora el cuerpo integral de la arquitectura GitOps oficial de la plataforma Pokédex.
