/**
 * =============================================================================
 * Contrato de recoleccion de metricas del cluster hacia Grafana Cloud [OBS-002]
 * =============================================================================
 *
 * Validacion en vivo (2026-10-05, datasource `grafanacloud-prom`): en 30 dias no
 * llego ninguna serie `container_*`, `kube_*` ni `kubelet_*`, aunque
 * `infra/monitoring/alerts.yaml` alerta sobre ellas. Causas encontradas en el repo:
 *
 *   1. `scripts/deploy-grafana-cloud.mjs` fijaba `k8s-monitoring` 2.0.12, pero los
 *      values usan el esquema v4: el render fallaba con "No features are enabled"
 *      y `task monitoring:grafana-cloud:install` no podia ejecutarse.
 *   2. Los values no declaraban ningun destino de metricas ni `clusterMetrics`: el
 *      Alloy solo recibia pipelines remotos de Fleet Management.
 *
 * Este gate renderiza el chart EXACTO que instala el script (version y flags) y
 * verifica el efecto: que se scrapean cAdvisor, kubelet, kube-state-metrics y
 * node-exporter, que las metricas de las alertas sobreviven a las allowlists, y
 * que el endpoint OTLP que usa la API sigue existiendo tras el cambio.
 *
 * Requiere `helm` y acceso a https://grafana.github.io/helm-charts (igual que el
 * job de Helm de CI). Sin `helm` el test se omite de forma explicita.
 * =============================================================================
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '../../');

const DEPLOY_SCRIPT = path.join(ROOT_DIR, 'scripts/deploy-grafana-cloud.mjs');
const VALUES_PATH = path.join(ROOT_DIR, 'infra/monitoring/grafana-cloud-values.yaml');
const ALERTS_PATH = path.join(ROOT_DIR, 'infra/monitoring/alerts.yaml');
const APP_VALUES_PATH = path.join(ROOT_DIR, 'infra/helm/pokedex/values.yaml');

const HELM_AVAILABLE = (() => {
  try {
    execFileSync('helm', ['version', '--short'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

/** Valor de una clave del objeto DEFAULTS del script de despliegue. */
function deployDefault(key: string): string {
  const source = fs.readFileSync(DEPLOY_SCRIPT, 'utf-8');
  const m = source.match(new RegExp(`\\b${key}:\\s*'([^']+)'`));
  assert.ok(m, `deploy-grafana-cloud.mjs debe definir DEFAULTS.${key}`);
  return m[1];
}

let renderedCache: string | undefined;

/** Renderiza el chart con la misma version y los mismos flags que el script. */
function renderCollection(): string {
  if (renderedCache !== undefined) return renderedCache;
  renderedCache = execFileSync(
    'helm',
    [
      'template', deployDefault('release'), 'k8s-monitoring',
      '--repo', 'https://grafana.github.io/helm-charts',
      '--version', deployDefault('chartVersion'),
      '--namespace', deployDefault('namespace'),
      '--values', VALUES_PATH,
      '--set', 'cluster.name=pokedex-k8s-cluster',
      '--set', 'collectorCommon.alloy.remoteConfig.enabled=true',
      '--set-string', `collectorCommon.alloy.remoteConfig.url=${deployDefault('remoteConfig')}`,
      '--set-string', `collectorCommon.alloy.remoteConfig.auth.username=${deployDefault('username')}`,
      // Credenciales ficticias: el render no las valida y el test no debe tocar secretos.
      '--set-string', 'collectorCommon.alloy.remoteConfig.auth.password=ci-dummy-token',
      '--set-string', 'destinations.grafana-cloud-metrics.auth.password=ci-dummy-token',
    ],
    { encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  return renderedCache;
}

/** Metricas de Kubernetes que consultan las alertas (cAdvisor, kubelet y kube-state-metrics). */
function alertKubernetesMetrics(): string[] {
  const source = fs.readFileSync(ALERTS_PATH, 'utf-8');
  const exprs = [...source.matchAll(/expr:\s*\|?\s*([\s\S]*?)\n\s*for:/g)].map(([, e]) => e);
  const names = exprs.flatMap((e) => [...e.matchAll(/\b((?:container|kube|kubelet)_[a-z_]+)\b/g)].map(([, n]) => n));
  return [...new Set(names)].sort();
}

test('📡 OBS-002: el chart que instala el script renderiza con los values del repo', { skip: !HELM_AVAILABLE && 'helm no disponible' }, () => {
  assert.doesNotThrow(
    () => renderCollection(),
    'helm template debe renderizar: una version de chart incompatible con el esquema de los values rompe task monitoring:grafana-cloud:install'
  );
});

test('📡 OBS-002: se scrapean cAdvisor, kubelet, kube-state-metrics y node-exporter hacia Grafana Cloud', { skip: !HELM_AVAILABLE && 'helm no disponible' }, () => {
  const rendered = renderCollection();
  for (const job of ['integrations/kubernetes/cadvisor', 'integrations/kubernetes/kubelet', 'integrations/kubernetes/kube-state-metrics', 'integrations/node_exporter']) {
    assert.ok(rendered.includes(`job_name = "${job}"`), `Falta el scrape ${job}`);
  }
  assert.match(
    rendered,
    /prometheus\.remote_write "grafana_cloud_metrics"[\s\S]*?url = "https:\/\/prometheus-prod-40-prod-sa-east-1\.grafana\.net\/api\/prom\/push"/,
    'Las metricas del cluster deben enviarse al Prometheus de Grafana Cloud'
  );
});

test('📡 OBS-002: las metricas de Kubernetes de alerts.yaml sobreviven a las allowlists', { skip: !HELM_AVAILABLE && 'helm no disponible' }, () => {
  const rendered = renderCollection();
  // Las allowlists se renderizan como reglas `keep` con un regex de nombres de metrica.
  const keepRegexes = [...rendered.matchAll(/source_labels = \["__name__"\]\s*\n\s*regex = "([^"]+)"\s*\n\s*action = "keep"/g)].map(
    ([, r]) => new RegExp(`^(?:${r})$`)
  );
  assert.ok(keepRegexes.length > 0, 'Se esperaban allowlists en el render');

  const dropped = alertKubernetesMetrics().filter((m) => !keepRegexes.some((re) => re.test(m)));
  assert.deepEqual(dropped, [], 'Metricas usadas por alertas que el colector descarta: las alertas nunca evaluarian');
});

test('📡 OBS-002: el endpoint OTLP que usa la API sigue existiendo en el colector', { skip: !HELM_AVAILABLE && 'helm no disponible' }, () => {
  const appValues = fs.readFileSync(APP_VALUES_PATH, 'utf-8');
  const endpoint = appValues.match(/otelEndpoint:\s*"http:\/\/([a-z0-9-]+)\.([a-z0-9-]+)\.svc[^:]*:(\d+)"/);
  assert.ok(endpoint, 'infra/helm/pokedex/values.yaml debe declarar otelEndpoint');
  const [, service, namespace, port] = endpoint;

  const rendered = renderCollection();
  const alloyCr = rendered.split(/^---$/m).find((doc) => /^kind: Alloy$/m.test(doc) && new RegExp(`^  name: ${service}$`, 'm').test(doc));
  assert.ok(alloyCr, `El colector debe llamarse ${service}: la API envia OTLP a ${service}.${namespace}`);
  assert.match(alloyCr, new RegExp(`^  namespace: ${namespace}$`, 'm'));
  assert.match(alloyCr, new RegExp(`port: ${port}\\b`), `El colector debe exponer el puerto OTLP ${port}`);
});
