# 📊 Observabilidad y Telemetría

> [!IMPORTANT]
> Este directorio es la **fuente de verdad** de la configuración de observabilidad de la
> plataforma. No es evidencia histórica: lo que hay aquí es lo que se aplica.

## Inventario

| Ruta | Propósito | Consumidor |
| :--- | :--- | :--- |
| [`grafana-cloud-values.yaml`](grafana-cloud-values.yaml) | Values canónicos (esquema v4 de `k8s-monitoring`): destino de métricas, métricas de clúster y de host, Grafana Alloy, Beyla eBPF, Node Exporter y Kube-State-Metrics | [`scripts/deploy-grafana-cloud.mjs`](../../scripts/deploy-grafana-cloud.mjs) |
| [`alerts.yaml`](alerts.yaml) | Reglas de alerta unificadas (infraestructura, base de datos, API) | Prometheus / Grafana Cloud |
| [`alloy/config.alloy`](alloy/config.alloy) | Configuración del Alloy en modo local (Docker Compose de desarrollo) | [`docker-compose.dev.yaml`](../../docker-compose.dev.yaml) |
| [`dashboards/`](dashboards/) | Tableros canónicos de la API Pokédex y de la salud del clúster | Import manual a Grafana Cloud |

## Despliegue

El despliegue es **multiplataforma** y se ejecuta en Node, no en PowerShell:

```bash
task monitoring:grafana-cloud:install    # despliegue canónico
task monitoring:grafana-cloud:status    # estado de la release
```

Variables de entorno del despliegue:

| Variable | Uso |
| :--- | :--- |
| `GRAFANA_CLOUD_TOKEN` | Token de Access Policy para Fleet Management (obligatorio) |
| `GRAFANA_CLOUD_METRICS_TOKEN` | Token con `metrics:write` para el destino de métricas; si falta, se reutiliza `GRAFANA_CLOUD_TOKEN` |

La versión del chart vive en `DEFAULTS.chartVersion` del script y debe coincidir con el
esquema de los values. `tests/security/grafana_cloud_collection.test.ts` (OBS-002) renderiza
el chart con esa versión y falla si el render se rompe, si falta un scrape de clúster, si una
allowlist descarta una métrica que usan las alertas o si desaparece el endpoint OTLP de la API.

### Fuentes de telemetría

| Fuente | Dónde se declara |
| :--- | :--- |
| Métricas de clúster y de host (cAdvisor, kubelet, kube-state-metrics, node-exporter) | `grafana-cloud-values.yaml` |
| Scrape de `/metrics` de la API (con token Bearer) | `grafana-cloud-values.yaml` (`collectors.alloy.extraConfig`, `AUD-SEC-OBS-001`) |
| Logs de pods (`podLogsViaLoki`) y receptor OTLP (`extraConfig`) | `grafana-cloud-values.yaml` |

### Token de `/metrics` (`AUD-SEC-OBS-001`)

La API exige `Authorization: Bearer <token>` en `/metrics` cuando define `METRICS_BEARER_TOKEN`.
El Alloy lo recibe como variable de entorno desde el Secret `alloy-metrics-token` del namespace
`monitoring`. Un pod no lee Secrets de otro namespace, así que el release crea (`extraObjects`) un
`ExternalSecret` propio que lee la misma propiedad de Vault que usa la API (`pokedex/preprod`).

Orden de activación en pre-prod:

1. Crear la propiedad en Vault: `vault kv patch secret/pokedex/preprod METRICS_BEARER_TOKEN=...`.
   Sin ella el `ExternalSecret` falla y el Alloy no arranca con la variable.
2. Borrar el pipeline de scrape de `/metrics` en Fleet Management, para no duplicar las series.
3. `task monitoring:grafana-cloud:install`: despliega el scrape con token y el `ExternalSecret`.
4. Activar `externalSecrets.metricsToken: true` en los values de pre-prod: desde ese momento la API
   exige el token. Hacerlo antes del paso 3 corta la métrica hasta que el Alloy lo envíe.
5. Comprobar que `pokedex_uptime_seconds` sigue llegando y que `/metrics` sin token responde `401`.

El job de las series sigue siendo `prometheus.scrape.pokemon_api`, así que dashboards y alertas no cambian.

Estado real del Alloy en pre-prod:

> [!WARNING]
> **Deriva entre el repo y el clúster (2026-10-08).** Estos values describen el chart `k8s-monitoring`, pero el
> Alloy de pre-prod corre con el chart simple `alloy` (release `grafana-cloud`, `alloy-1.12.1`), con la
> configuración en el ConfigMap `grafana-cloud-alloy`. Ese Alloy no recolecta kube-state-metrics, cAdvisor ni
> kubelet, por lo que las alertas de Kubernetes de [`alerts.yaml`](alerts.yaml) no tienen datos. Los values ya
> replican el scrape de la API, el receptor OTLP y los logs de pods del Alloy actual. Hasta ejecutar la
> migración, no correr `task monitoring:grafana-cloud:install` sobre pre-prod: choca con los recursos del release
> existente. El procedimiento, con respaldo y reversión, está en
> [`ALLOY_K8S_MONITORING_MIGRATION.md`](../../docs/runbooks/ALLOY_K8S_MONITORING_MIGRATION.md).

Sobre el script de despliegue:

> El script [`deploy-grafana-cloud.mjs`](../../scripts/deploy-grafana-cloud.mjs) sustituyó a un
> `.ps1` que ataba el despliegue a Windows. El contrato está blindado por
> `tests/security/grafana_portability.test.ts` (PORT-001), que falla si alguien reintroduce
> PowerShell o rompe la cadena `Taskfile → script`.

## Registro de retiradas

### `alloy-proxmox-values.yaml` (retirado en `INFRA-006`)

Values de Grafana Alloy específicos del clúster de Proxmox que **no tenía ningún
consumidor**: no lo invocaba el `Taskfile`, ni `.vscode/tasks.json`, ni ningún workflow, ni
ningún test, ni ninguna documentación.

Su configuración equivalente y vigente vive en
[`grafana-cloud-values.yaml`](grafana-cloud-values.yaml), que sí consume
`scripts/deploy-grafana-cloud.mjs`.

**Motivo de la retirada:** un values huérfano es peor que un values ausente. Sugiere que el
despliegue de telemetría está parametrizado por ese archivo cuando no lo está, e invita a
editar configuración que nada aplica.

El gate `INFRA-006` en `tests/security/grafana_portability.test.ts` impide que reaparezca y
exige que cualquier values YAML nuevo en esta ruta tenga un consumidor declarado.

## Regla de higiene

> [!NOTE]
> Todo `*.yaml` de nivel superior en este directorio debe ser **consumible por el script de
> despliegue** o estar listado explícitamente en el gate `INFRA-006`. Un archivo que nadie
> aplica es deuda silenciosa, y este directorio es la SSOT de observabilidad.
