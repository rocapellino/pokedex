# Runbook: Diagnóstico y Mitigación de Alertas de Observabilidad (Prometheus)

## 1. Propósito

Proveer los procedimientos operativos estándar (SOP) para investigar, contener y resolver las alertas emitidas por Prometheus y Alertmanager definidas en `infra/monitoring/alerts.yml`.

---

## 2. Matriz de Alertas y Severidades
 
| Alerta | Severidad | Métrica / Expresión PromQL | Impacto |
| :--- | :--- | :--- | :--- |
| **PokedexAPIDown** | `critical` | `up{job=~".*pokedex.*"} == 0` | Microservicio Pokédex API caído o inalcanzable por scraping. |
| **PokedexDegradedMode** | `critical` | `pokedex_degraded_mode == 1` | API operando en modo degradado con almacenamiento volátil en memoria. |
| **PokedexPostgresDisconnected** | `critical` | `pokedex_storage_status == 0` | Fallo de persistencia; API opera en modo degradado fail-closed (HTTP 503 para mutaciones). |
| **PostgresDown** | `critical` | `pg_up == 0` | Instancia de PostgreSQL inaccesible según postgres_exporter. |
| **PostgresHighConnections** | `warning` | `(sum by (instance) (pg_stat_database_numbackends) / sum by (instance) (pg_settings_max_connections)) * 100 > 80` | Saturación del pool de conexiones en PostgreSQL por instancia (> 80%). |
| **PokedexRedisDisconnected** | `warning` | `pokedex_redis_status == 0` | Fallo de conectividad con Redis desde la API; revocación de sesiones de admin bloqueada en fail-closed (HTTP 503). |
| **RedisDown** | `critical` | `redis_up == 0` | Instancia de Redis caída o no responde al PING según redis_exporter (Infraestructura). |
| **ContainerHighMemoryUsage** | `warning` | `(container_memory_working_set_bytes / (container_spec_memory_limit_bytes > 0)) * 100 > 85` | Contenedor consumiendo > 85% de su límite de RAM asignado (filtrando límites > 0). |
| **PokedexHighErrorRate5xx** | `critical` | `rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.01` | Más del 1% de peticiones fallando con código 5xx. |
| **PokedexHighLatencyP99** | `warning` | `histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le)) > 2.0` | Percentil 99 de tiempo de respuesta superior a 2 segundos sostenidos. |
| **PokedexHpaMaxReplicasReached** | `warning` | `kube_hpa_status_current_replicas >= kube_hpa_spec_max_replicas` | Autoescalador al límite máximo de réplicas durante más de 15 minutos. |
| **PokedexContainerRestartLoop** | `critical` | `increase(kube_pod_container_status_restarts_total[15m]) > 2` | Contenedores reiniciándose en bucle (CrashLoopBackOff u OOMKilled). |
| **PokedexAICircuitBreakerOpen** | `warning` | `pokedex_ai_circuit_breaker_open == 1` | Disyuntor de llamadas a Gemini abierto por fallos consecutivos; servicio opera con fallback heurístico local. |
| **PokedexPvcStorageFillingUp** | `warning` | `(kubelet_volume_stats_used_bytes / kubelet_volume_stats_capacity_bytes) * 100 > 85` | Volumen persistente (PVC) próximo al límite (> 85%). |
| **PokedexDbBackupFailed** | `critical` | `kube_job_status_failed{job_name=~".*backup.*"} > 0` | Fallo de ejecución de Job de respaldo automatizado de PostgreSQL. |
| **PokedexDbBackupStale** | `critical` | `(time() - kube_cronjob_status_last_successful_time) > 93600` | Copia de seguridad desactualizada (> 26 horas). |
| **DatabaseRestoreDrillFailed** | `critical` | `kube_job_status_failed{job_name=~".*dr-restore-verify.*"} > 0` | Fallo en el simulacro periódico de restauración DR; posible corrupción de respaldos o incompatibilidad. |
| **TlsCertExpiringSoon** | `warning` | `(certmanager_certificate_expiration_timestamp_seconds - time()) / 86400 < 15` | Certificado TLS próximo a expirar (< 15 días). |
| **ArgoCDAppOutOfSync** | `warning` | `argocd_app_info{sync_status!="Synced"} == 1` | Aplicación GitOps desincronizada con el repositorio. |
| **ArgoCDAppDegraded** | `critical` | `argocd_app_info{health_status="Degraded"} == 1` | Aplicación GitOps con recursos degradados en el clúster. |
| **ExternalSecretSyncFailed** | `critical` | `externalsecret_status_condition{status="False",type="Ready"} == 1` | Fallo en la sincronización de secretos externos desde Vault/AWS Secrets Manager. |

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

### 3.7. PokedexAICircuitBreakerOpen

1. **Inspección de Métricas y Estado del Disyuntor**:

   ```bash
   curl -s http://<API_URL>/metrics | grep pokedex_ai_circuit_breaker
   ```

2. **Revisión de Logs del Servicio de IA**:

   ```bash
   kubectl logs -n pokemon-app -l app=pokemon-api --tail=100 | grep -i 'AI Service'
   ```

3. **Causas Raíz y Acciones de Remediación**:
   - **Cuota Excedida o Error 429**: Comprobar límites de tasa en Google AI Studio para el modelo Gemini 2.5 Flash.
   - **Credenciales Inválidas**: Verificar que `GEMINI_API_KEY` o `AI_API_KEY` no hayan sido revocadas o rotadas incorrectamente.
   - **Aislamiento de Red / Egress Bloqueado**: Comprobar que `CiliumNetworkPolicy` o el `egress-gateway` permitan tráfico HTTPS saliente hacia `generativelanguage.googleapis.com:443`.
   - **Comportamiento Esperado**: El backend protege la estabilidad de la plataforma respondiendo con diagramas y mockups en fallback heurístico local sin bloquear peticiones de usuarios ni degradar la disponibilidad del catálogo. El disyuntor intentará reabrirse automáticamente (estado `HALF_OPEN`) tras el período de enfriamiento (`cooldownMs: 30000`).

### 3.8. PokedexAPIDown & PokedexDegradedMode

1. **Inspección de Estado y Pods**:
   ```bash
   kubectl get pods -n pokemon-app -l app=pokemon-api
   kubectl describe pod -n pokemon-app -l app=pokemon-api
   ```
2. **Remediación**:
   - Si el pod está `CrashLoopBackOff`, inspeccionar logs anteriores: `kubectl logs -n pokemon-app -l app=pokemon-api --previous`.
   - Si está en `PokedexDegradedMode`: verificar conectividad con PostgreSQL y PgBouncer. La API mantiene disponibilidad de lectura usando caché en memoria mientras se restablece la base de datos.

### 3.9. PostgresDown & PostgresHighConnections

1. **Inspección de PostgreSQL y Pooler**:
   ```bash
   kubectl get pods -n pokemon-app -l app=postgres
   kubectl exec -it -n pokemon-app postgres-0 -- psql -U pokedex_app -d pokedex_db -c "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"
   ```
2. **Remediación**:
   - En caso de saturación (> 80%), verificar queries lentas o bloqueos (locks): `SELECT pid, query, age(clock_timestamp(), query_start) FROM pg_stat_activity WHERE state != 'idle' ORDER BY age DESC LIMIT 5;`.
   - Ajustar `max_connections` o parámetros de PgBouncer (`default_pool_size`, `max_client_conn`).

### 3.10. RedisDown

1. **Inspección de Instancia Redis**:
   ```bash
   kubectl get pods -n pokemon-app -l app=redis
   kubectl logs -n pokemon-app -l app=redis --tail=50
   ```
2. **Remediación**:
   - Reiniciar el pod si se encuentra en estado zombie o bloqueado por persistencia AOF/RDB.

### 3.11. ContainerHighMemoryUsage

1. **Inspección de Consumo de RAM**:
   ```bash
   kubectl top pods -n pokemon-app
   ```
2. **Remediación**:
   - Identificar si hay fuga de memoria en Node.js (V8 heap). Analizar perfiles de memoria o escalar temporalmente réplicas para distribuir la carga.

### 3.12. DatabaseRestoreDrillFailed

1. **Inspección de Logs del Job de Verificación**:
   ```bash
   kubectl get jobs,pods -n pokemon-app -l app.kubernetes.io/component=dr-verification
   kubectl logs -n pokemon-app -l app.kubernetes.io/component=dr-verification --tail=100
   ```
2. **Diagnóstico de Causa Raíz**:
   - Comprobar si el fallo responde a discrepancia en el checksum SHA-256 (`.sha256`), clave simétrica inválida (`BACKUP_ENCRYPTION_KEY`) o stream gzip corrupto.
   - Si la aserción DML/DDL falló durante la restauración temporal, inspeccionar la consistencia de los datos del volcado.
3. **Remediación**:
   - Ejecutar un simulacro local o manual controlado: `task dr:verify` o `task dr:drill`.
   - Si el volcado almacenado en el PVC está dañado, generar inmediatamente un nuevo volcado forzado con `kubectl create job --from=cronjob/pokedex-db-backup dr-backup-manual -n pokemon-app`.

---

## 4. Visualización y Telemetría en Grafana Cloud

Las métricas y alertas recolectadas por Grafana Alloy y Beyla se integran con Grafana Cloud. Los tableros canónicos se encuentran versionados en el repositorio:

- **Métricas de Aplicación Pokédex:** [`infra/monitoring/dashboards/pokedex-application.json`](../../infra/monitoring/dashboards/pokedex-application.json)
- **Observabilidad Global del Clúster:** [`infra/monitoring/dashboards/cluster-observability.json`](../../infra/monitoring/dashboards/cluster-observability.json)

Para importar estos tableros en la instancia de Grafana Cloud:
1. Acceder a la consola de Grafana Cloud (`Dashboards` > `New` > `Import`).
2. Pegar el contenido del archivo JSON correspondiente.
3. Vincular la fuente de datos al Prometheus gestionado por Grafana Cloud.
