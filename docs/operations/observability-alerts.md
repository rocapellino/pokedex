# Runbook: Diagnóstico y Mitigación de Alertas de Observabilidad (Prometheus)

## 1. Propósito
Proveer los procedimientos operativos estándar (SOP) para investigar, contener y resolver las alertas emitidas por Prometheus y Alertmanager definidas en `infra/monitoring/alerts.yml`.

---

## 2. Matriz de Alertas y Severidades

| Alerta | Severidad | Métrica / Expresión PromQL | Impacto |
| :--- | :--- | :--- | :--- |
| **PokedexPostgresDisconnected** | `critical` | `pokedex_storage_status == 0` | Fallo de persistencia; API opera en modo degradado fail-closed (HTTP 503 para mutaciones). |
| **PokedexRedisDisconnected** | `warning` | `pokedex_redis_status == 0` | Fallo de caché distribuida; rate limiting y revocación de sesiones operan con fallback local. |
| **PokedexHighErrorRate5xx** | `critical` | `rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.01` | Más del 1% de peticiones fallando con código 5xx. |
| **PokedexHighLatencyP99** | `warning` | `histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le)) > 2.0` | Percentil 99 de tiempo de respuesta superior a 2 segundos sostenidos. |
| **PokedexHpaMaxReplicasReached** | `warning` | `kube_hpa_status_current_replicas >= kube_hpa_spec_max_replicas` | Autoescalador al límite máximo de réplicas durante más de 15 minutos. |
| **PokedexContainerRestartLoop** | `critical` | `increase(kube_pod_container_status_restarts_total[15m]) > 2` | Contenedores reiniciándose en bucle (CrashLoopBackOff u OOMKilled). |

---

## 3. Procedimientos Operativos de Resolución

### 3.1. PokedexPostgresDisconnected
1. **Verificación Inmediata**:
   ```bash
   kubectl get statefulset,pods -n pokemon-app -l app=postgres
   kubectl logs -n pokemon-app -l app=postgres --tail=100
   ```
2. **Inspección de Endpoint de Diagnóstico**:
   ```bash
   curl -s http://<API_URL>/version | jq .database
   curl -s http://<API_URL>/metrics | grep pokedex_storage_status
   ```
3. **Acciones de Remediación**:
   - Si el Pod está en `Pending`: verificar capacidad de almacenamiento en el PersistentVolumeClaim (`kubectl get pvc -n pokemon-app`).
   - Si el Pod está en `CrashLoopBackOff`: verificar logs de inicialización en `/var/lib/postgresql/data`.
   - Si PgBouncer está habilitado: verificar saturación del pool con `kubectl logs -n pokemon-app -l app=pgbouncer`.

### 3.2. PokedexRedisDisconnected
1. **Verificación Inmediata**:
   ```bash
   kubectl get deployment,pods -n pokemon-app -l app=redis
   kubectl logs -n pokemon-app -l app=redis --tail=100
   ```
2. **Diagnóstico de Conectividad**:
   ```bash
   kubectl exec -it -n pokemon-app deployment/pokemon-api -- nc -zv redis-service 6379
   ```
3. **Acciones de Remediación**:
   - Reiniciar el Deployment si el proceso está bloqueado: `kubectl rollout restart deployment/redis -n pokemon-app`.
   - Verificar límites de memoria del contenedor de Redis (`resources.limits.memory`).

### 3.3. PokedexHighErrorRate5xx
1. **Identificación de Endpoints Afectados**:
   ```bash
   curl -s http://<API_URL>/metrics | grep 'http_requests_total{.*status="5'
   ```
2. **Triage de Logs con Correlation ID**:
   ```bash
   kubectl logs -n pokemon-app -l app=pokemon-api --tail=200 | jq 'select(.level=="error")'
   ```
3. **Acciones de Remediación**:
   - Si los errores provienen de validación o base de datos: aislar la consulta o aplicar rollback si es producto de un despliegue reciente: `helm rollback pokedex <REVISION> -n pokemon-app`.

### 3.4. PokedexHighLatencyP99
1. **Análisis de Buckets de Duración**:
   ```bash
   curl -s http://<API_URL>/metrics | grep 'http_request_duration_seconds'
   ```
2. **Inspección de Recursos de CPU y Memoria**:
   ```bash
   kubectl top pods -n pokemon-app -l app=pokemon-api
   ```
3. **Acciones de Remediación**:
   - Escalar réplicas manualmente si la carga es atípica: `kubectl scale deployment/pokemon-api -n pokemon-app --replicas=5`.
   - Verificar tiempos de respuesta de PostgreSQL y presencia de consultas lentas (`pg_stat_activity`).

### 3.5. PokedexHpaMaxReplicasReached
1. **Inspección del Autoescalador**:
   ```bash
   kubectl describe hpa pokemon-api-hpa -n pokemon-app
   ```
2. **Acciones de Remediación**:
   - Evaluar si el pico de tráfico es legítimo o un ataque DoS.
   - Si el tráfico es legítimo, incrementar temporalmente `maxReplicas` en `values.yaml` o mediante: `kubectl patch hpa pokemon-api-hpa -n pokemon-app -p '{"spec":{"maxReplicas":10}}'`.

### 3.6. PokedexContainerRestartLoop
1. **Extracción del Motivo de Terminación**:
   ```bash
   kubectl get pod <POD_NAME> -n pokemon-app -o jsonpath='{.status.containerStatuses[0].lastState.terminated.reason}'
   ```
2. **Acciones de Remediación**:
   - Si el motivo es `OOMKilled`: incrementar límites de memoria en el Helm Chart (`resources.limits.memory`).
   - Si el motivo es `Error`: revisar logs previos con `kubectl logs -n pokemon-app <POD_NAME> --previous`.
