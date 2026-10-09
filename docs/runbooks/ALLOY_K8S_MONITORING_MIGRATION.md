# Runbook: Migración del Alloy de Pre-prod al Chart `k8s-monitoring`

> [!IMPORTANT]
> Aplica una sola vez a pre-prod. Reemplaza el release `grafana-cloud` (chart simple `alloy`) por el chart
> `k8s-monitoring` descrito en [`grafana-cloud-values.yaml`](../../infra/monitoring/grafana-cloud-values.yaml).
> Hay un corte breve de métricas y logs durante el reemplazo. En un laboratorio es tolerable.

## 1. Por qué existe

Pre-prod corría el Alloy con el chart simple `alloy`, con la configuración en un ConfigMap. Solo recolectaba la
API, el OTLP y los logs. No llegaba ninguna serie de kube-state-metrics, cAdvisor ni kubelet, de modo que las
alertas de respaldos, Jobs, reinicios y volúmenes de
[`alerts.yaml`](../../infra/monitoring/alerts.yaml) no podían evaluarse. El fallo de la copia a Drive pasó
días sin aviso por esa razón.

| Capacidad | Antes (chart `alloy`) | Después (`k8s-monitoring`) |
| :--- | :--- | :--- |
| Scrape de `/metrics` de la API con token | Sí, en el ConfigMap | Sí, en `collectors.alloy.extraConfig` |
| Receptor OTLP (:4317 y :4318) | Sí | Sí, mismo Service `grafana-cloud-alloy` |
| Logs de pods (`pokemon-app`, `monitoring`) | Sí, `loki.source.kubernetes` | Sí, `podLogsViaLoki` |
| kube-state-metrics, cAdvisor, kubelet, node-exporter | No | Sí |
| Beyla (eBPF) | No | No: el nodo es un LXC sin privilegios de host |

Etiquetas de logs: `namespace`, `pod` y `container` se conservan (los dashboards solo usan esas). La etiqueta
`app` pasa a llamarse `app_kubernetes_io_name`.

## 2. Antes de empezar

En el Bastion, con acceso al clúster:

```bash
mkdir -p ~/alloy-backup && cd ~/alloy-backup
helm get values grafana-cloud -n monitoring -o yaml > values-alloy-rev2.yaml
helm get manifest grafana-cloud -n monitoring > manifest-alloy-rev2.yaml
kubectl -n monitoring get cm grafana-cloud-alloy -o yaml > configmap-alloy.yaml
kubectl -n monitoring get secret grafana-cloud-credentials >/dev/null && echo "credenciales: ok"
kubectl -n monitoring get externalsecret alloy-metrics-token \
  -o jsonpath='{.metadata.annotations.meta\.helm\.sh/release-name}{"\n"}'
```

El último comando indica quién es dueño del `ExternalSecret`:

- Imprime `grafana-cloud`: lo recrea el nuevo release, no hay que hacer nada.
- Imprime una línea vacía: no pertenece a ningún release y el nuevo chart no puede adoptarlo. Borrarlo antes de
  instalar (`kubectl -n monitoring delete externalsecret alloy-metrics-token`); el chart lo vuelve a crear y ESO
  sincroniza el Secret desde Vault.

La propiedad `METRICS_BEARER_TOKEN` debe existir en `secret/pokedex/preprod` (ya existe desde `AUD-SEC-OBS-001`).

Los values de este PR deben estar copiados en el Bastion:

```bash
scp infra/monitoring/grafana-cloud-values.yaml root@10.10.13.120:~/alloy-backup/
```

## 3. Reemplazo

El chart nuevo no puede actualizar sobre el release anterior: los dos crean un DaemonSet y un Service llamados
`grafana-cloud-alloy`. Se desinstala y se instala de nuevo.

El token de Grafana Cloud se toma del Secret existente y se entrega por archivo, sin imprimirlo. Debe tener los
scopes `metrics:write` y `logs:write` (el Alloy previo usaba el mismo token para ambos destinos).

```bash
cd ~/alloy-backup
umask 077
kubectl -n monitoring get secret grafana-cloud-credentials -o jsonpath='{.data.GRAFANA_CLOUD_TOKEN}' | base64 -d > .token

helm uninstall grafana-cloud -n monitoring
helm repo add grafana https://grafana.github.io/helm-charts --force-update
helm upgrade --install grafana-cloud grafana/k8s-monitoring --version 4.5.2 \
  --namespace monitoring --create-namespace \
  --values grafana-cloud-values.yaml \
  --set cluster.name=pokedex-k8s-cluster \
  --set collectorCommon.alloy.remoteConfig.enabled=true \
  --set-string collectorCommon.alloy.remoteConfig.url=https://fleet-management-prod-015.grafana.net \
  --set-string collectorCommon.alloy.remoteConfig.auth.username=1832819 \
  --set-file collectorCommon.alloy.remoteConfig.auth.password=.token \
  --set-file destinations.grafana-cloud-metrics.auth.password=.token \
  --set-file destinations.grafana-cloud-logs.auth.password=.token

shred -u .token
```

Los flags son los mismos que usa [`scripts/deploy-grafana-cloud.mjs`](../../scripts/deploy-grafana-cloud.mjs); la
versión del chart se fija allí y la valida el contrato OBS-002.

Si el token no tuviera el scope de Fleet Management, el Alloy registra errores de configuración remota, pero sigue
funcionando con la configuración local.

## 4. Verificación

```bash
kubectl -n monitoring get pods,svc
kubectl -n monitoring logs ds/grafana-cloud-alloy --tail=30
```

Todos los pods deben quedar `Running`. El Service `grafana-cloud-alloy` debe conservar los puertos 4317 y 4318.

En Grafana Cloud, con la fuente `grafanacloud-prom`:

```promql
pokedex_uptime_seconds                         # la API sigue llegando
http_requests_total                            # el OTLP y el scrape de la API siguen llegando
kube_job_status_failed                         # llega kube-state-metrics
kube_cronjob_status_last_successful_time{cronjob=~".*gdrive-sync.*"}
container_memory_working_set_bytes{namespace="pokemon-app"}   # llega cAdvisor
```

En Explore con la fuente de Loki: `{namespace="pokemon-app"}` debe mostrar logs recientes. Después de unos
minutos, `curl` a `/metrics` sin token debe seguir respondiendo `401`.

## 5. Reversión

Si algo falla y hay que volver al Alloy anterior:

```bash
helm uninstall grafana-cloud -n monitoring
helm repo add grafana https://grafana.github.io/helm-charts --force-update
helm install grafana-cloud grafana/alloy --version 1.12.1 -n monitoring -f ~/alloy-backup/values-alloy-rev2.yaml
```

Los CRD que instala el operador (`Alloy`) no se borran con `helm uninstall`. No estorban al chart simple.

## 6. Después de migrar

- Cargar las reglas de `alerts.yaml` en Grafana Cloud: hoy no hay ninguna regla cargada.
- Las alertas de PostgreSQL, Redis, cert-manager, ArgoCD y ESO siguen sin datos: sus exporters no se recolectan
  todavía (`pg_*`, `redis_*`, `certmanager_*`, `argocd_*`, `externalsecret_*`).
