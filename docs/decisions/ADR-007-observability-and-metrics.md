# ADR-007: Arquitectura de Observabilidad Unificada con Prometheus y OpenTelemetry

## Estado
Aceptado

## Contexto
Para garantizar la fiabilidad, diagnóstico proactivo y cumplimiento de SLAs (RPO/RTO y latencia P95/P99 < 2s) en entornos híbridos (Kubernetes local, Proxmox VE y AWS EKS), la plataforma Pokédex requiere una arquitectura de observabilidad estandarizada. Anteriormente existían discrepancias entre las expresiones de alertas Prometheus (`infra/monitoring/alerts.yml`) y las métricas expuestas por el backend Express, careciendo además de integración nativa con Prometheus Operator mediante `ServiceMonitor`.

## Decisión
Se establece una estrategia de observabilidad de cuatro capas:

1. **Exposición de Métricas Prometheus Nativa (`/metrics`)**:
   - El backend en Node.js expone métricas en formato texto OpenMetrics/Prometheus 0.0.4 sin dependencias externas pesadas.
   - Métricas de estado de dependencias: `pokedex_storage_status` (1/0 para PostgreSQL) y `pokedex_redis_status` (1/0 para Redis).
   - Métricas de tráfico RED: `http_requests_total` y `pokedex_http_requests_total` con labels normalizadas `{endpoint, status, method}`.
   - Histograma de latencia HTTP de alta resolución: `http_request_duration_seconds_bucket` con buckets normalizados (`[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, "+Inf"]`), además de `_sum` y `_count` para cálculo de percentiles (P95, P99).

2. **Integración Kubernetes con Prometheus Operator (`ServiceMonitor`)**:
   - Se incorpora el template declarativo `infra/helm/pokedex/templates/servicemonitor.yaml` (`monitoring.coreos.com/v1`).
   - Habilitable mediante `.Values.monitoring.serviceMonitor.enabled`, con intervalo de scraping configurable (15s por defecto) y selector al Service `pokemon-api-svc` en puerto `http` (3000).

3. **Trazabilidad Distribuida & Correlación de Logs**:
   - Propagación bidireccional de `X-Request-Id` / `traceId` mediante middleware `requestTracer` y `AsyncLocalStorage`.
   - Compatibilidad con OpenTelemetry Collector / Grafana Tempo (`otelEndpoint: "http://tempo:4317"`).

4. **Reglas de Alerta Coherentes (`infra/monitoring/alerts.yml`)**:
   - Alertas críticas para desconexión de base de datos (`PokedexPostgresDisconnected`), falla de Redis (`PokedexRedisDisconnected`), tasa de error 5xx > 1% (`PokedexHighErrorRate5xx`) y latencia P99 > 2.0s (`PokedexHighLatencyP99`).

## Consecuencias
- **Positivas**:
  - Detección instantánea de fallas en PostgreSQL y Redis antes de que degraden la experiencia de usuario.
  - Alertas 100% alineadas con las métricas reales emitidas por el runtime.
  - Integración nativa con Grafana, Alertmanager y Prometheus Operator sin adaptadores externos.
- **Compensaciones**:
  - Requiere que clústeres que activen `serviceMonitor.enabled` tengan instalados los CRDs de Prometheus Operator.
