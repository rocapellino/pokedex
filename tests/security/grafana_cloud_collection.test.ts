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
  const entry = [...source.matchAll(/^\s+([a-zA-Z]+):\s*'([^']+)',?$/gm)].find(([, k]) => k === key);
  assert.ok(entry, `deploy-grafana-cloud.mjs debe definir DEFAULTS.${key}`);
  return entry[2];
}

let renderedCache: string | undefined;

/** Renderiza el chart con la misma version y los mismos flags que el script. */
function renderCollection(): string {
  if (renderedCache !== undefined) return renderedCache;
  renderedCache = execFileSync(
    'helm',
    [
      'template',
      deployDefault('release'),
      'k8s-monitoring',
      '--repo',
      'https://grafana.github.io/helm-charts',
      '--version',
      deployDefault('chartVersion'),
      '--namespace',
      deployDefault('namespace'),
      '--values',
      VALUES_PATH,
      '--set',
      'cluster.name=pokedex-k8s-cluster',
      '--set',
      'collectorCommon.alloy.remoteConfig.enabled=true',
      '--set-string',
      `collectorCommon.alloy.remoteConfig.url=${deployDefault('remoteConfig')}`,
      '--set-string',
      `collectorCommon.alloy.remoteConfig.auth.username=${deployDefault('username')}`,
      // Credenciales ficticias: el render no las valida y el test no debe tocar secretos.
      '--set-string',
      'collectorCommon.alloy.remoteConfig.auth.password=ci-dummy-token',
      '--set-string',
      'destinations.grafana-cloud-metrics.auth.password=ci-dummy-token',
      '--set-string',
      'destinations.grafana-cloud-logs.auth.password=ci-dummy-token',
    ],
    { encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] },
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

test('📡 OBS-002: el chart que instala el script renderiza con los values del repo', {
  skip: !HELM_AVAILABLE && 'helm no disponible',
}, () => {
  assert.doesNotThrow(
    () => renderCollection(),
    'helm template debe renderizar: una version de chart incompatible con el esquema de los values rompe task monitoring:grafana-cloud:install',
  );
});

test('📡 OBS-002: se scrapean cAdvisor, kubelet, kube-state-metrics y node-exporter hacia Grafana Cloud', {
  skip: !HELM_AVAILABLE && 'helm no disponible',
}, () => {
  const rendered = renderCollection();
  for (const job of [
    'integrations/kubernetes/cadvisor',
    'integrations/kubernetes/kubelet',
    'integrations/kubernetes/kube-state-metrics',
    'integrations/node_exporter',
  ]) {
    assert.ok(rendered.includes(`job_name = "${job}"`), `Falta el scrape ${job}`);
  }
  assert.match(
    rendered,
    /prometheus\.remote_write "grafana_cloud_metrics"[\s\S]*?url = "https:\/\/prometheus-prod-40-prod-sa-east-1\.grafana\.net\/api\/prom\/push"/,
    'Las metricas del cluster deben enviarse al Prometheus de Grafana Cloud',
  );
});

test('📡 OBS-002: las metricas de Kubernetes de alerts.yaml sobreviven a las allowlists', {
  skip: !HELM_AVAILABLE && 'helm no disponible',
}, () => {
  const rendered = renderCollection();
  // Las allowlists se renderizan como reglas `keep` con un regex de nombres de metrica.
  const keepRegexes = [
    ...rendered.matchAll(/source_labels = \["__name__"\]\s*\n\s*regex = "([^"]+)"\s*\n\s*action = "keep"/g),
  ].map(
    // El regex sale del render del chart fijado en el repo, no de entrada de usuario:
    // evaluarlo es lo que verifica este contrato.
    // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
    ([, r]) => new RegExp(`^(?:${r})$`),
  );
  assert.ok(keepRegexes.length > 0, 'Se esperaban allowlists en el render');

  const dropped = alertKubernetesMetrics().filter((m) => !keepRegexes.some((re) => re.test(m)));
  assert.deepEqual(dropped, [], 'Metricas usadas por alertas que el colector descarta: las alertas nunca evaluarian');
});

test('📡 OBS-002: el endpoint OTLP que usa la API sigue existiendo en el colector', {
  skip: !HELM_AVAILABLE && 'helm no disponible',
}, () => {
  const appValues = fs.readFileSync(APP_VALUES_PATH, 'utf-8');
  const endpoint = appValues.match(/otelEndpoint:\s*"http:\/\/([a-z0-9-]+)\.([a-z0-9-]+)\.svc[^:]*:(\d+)"/);
  assert.ok(endpoint, 'infra/helm/pokedex/values.yaml debe declarar otelEndpoint');
  const [, service, namespace, port] = endpoint;

  const rendered = renderCollection();
  const lines = (doc: string) => doc.split(/\r?\n/);
  const alloyCr = rendered
    .split(/^---$/m)
    .find((doc) => lines(doc).includes('kind: Alloy') && lines(doc).includes(`  name: ${service}`));
  assert.ok(alloyCr, `El colector debe llamarse ${service}: la API envia OTLP a ${service}.${namespace}`);
  assert.ok(
    lines(alloyCr).includes(`  namespace: ${namespace}`),
    `El colector debe vivir en el namespace ${namespace}`,
  );
  const ports = [...alloyCr.matchAll(/^\s+port: (\d+)$/gm)].map(([, p]) => p);
  assert.ok(ports.includes(port), `El colector debe exponer el puerto OTLP ${port}`);
});

/** Documento YAML renderizado (separado por `---`) que contiene todas las cadenas dadas. */
function renderedDocument(rendered: string, ...needles: string[]): string | undefined {
  return rendered.split(/^---$/m).find((doc) => needles.every((needle) => doc.includes(needle)));
}

test('🔐 AUD-SEC-OBS-001: el scrape de /metrics de la API vive en el repo y envía el token Bearer', {
  skip: !HELM_AVAILABLE && 'helm no disponible',
}, () => {
  const rendered = renderCollection();
  const config = renderedDocument(rendered, 'prometheus.scrape "pokemon_api"');
  assert.ok(config, 'El scrape pokemon_api debe declararse en los values (ya no solo en Fleet Management)');

  const block = config.slice(config.indexOf('prometheus.scrape "pokemon_api"'));
  assert.match(block, /pokemon-api-svc\.pokemon-app\.svc\.cluster\.local:3000/);
  assert.match(block, /"__metrics_path__"\s*=\s*"\/metrics"/);
  assert.match(
    block,
    /authorization\s*\{[^}]*type\s*=\s*"Bearer"[^}]*credentials\s*=\s*sys\.env\("METRICS_BEARER_TOKEN"\)/,
    'El scrape debe presentar el token que la API exige en /metrics',
  );
  assert.match(
    block,
    /forward_to\s*=\s*\[prometheus\.remote_write\.grafana_cloud_metrics\.receiver\]/,
    'Las series deben llegar al mismo destino que el resto de métricas',
  );
});

test('🔐 AUD-SEC-OBS-001: el Alloy recibe el token desde un Secret de su namespace sincronizado con Vault', {
  skip: !HELM_AVAILABLE && 'helm no disponible',
}, () => {
  const rendered = renderCollection();
  const namespace = deployDefault('namespace');

  // Un pod no lee Secrets de otro namespace: el de `pokemon-app` no le sirve al Alloy.
  const externalSecret = renderedDocument(rendered, 'kind: ExternalSecret', 'METRICS_BEARER_TOKEN');
  assert.ok(externalSecret, `Debe existir un ExternalSecret de METRICS_BEARER_TOKEN en ${namespace}`);
  assert.match(externalSecret, new RegExp(`^  namespace: ${namespace}$`, 'm'));
  assert.match(externalSecret, /name: vault-backend-preprod/);
  assert.match(externalSecret, /key: pokedex\/preprod/);
  assert.match(externalSecret, /property: METRICS_BEARER_TOKEN/);

  const alloyCr = renderedDocument(rendered, 'kind: Alloy', 'name: grafana-cloud-alloy');
  assert.ok(alloyCr, 'El colector grafana-cloud-alloy debe renderizarse');
  // Helm ordena las claves alfabéticamente (`key` antes que `name`): no se asume el orden.
  const envVar = alloyCr.match(/- name: METRICS_BEARER_TOKEN\s+valueFrom:\s+secretKeyRef:([\s\S]*?)\n\s*extraPorts:/);
  assert.ok(envVar, 'El Alloy debe declarar la variable METRICS_BEARER_TOKEN desde un secretKeyRef');
  assert.match(envVar[1], /key: METRICS_BEARER_TOKEN/);
  assert.match(
    envVar[1],
    /name: alloy-metrics-token/,
    'Debe leer el Secret que crea el ExternalSecret de este namespace',
  );
  assert.match(externalSecret, /name: alloy-metrics-token/);
});

test('📡 OBS-003: los logs de pods de la app y del monitoreo llegan a Loki desde el repo', {
  skip: !HELM_AVAILABLE && 'helm no disponible',
}, () => {
  const rendered = renderCollection();
  const lokiWrite = renderedDocument(rendered, 'loki.write "grafana_cloud_logs"');
  assert.ok(lokiWrite, 'Debe existir el destino de logs: sin él el receptor OTLP no puede reenviar logs');
  assert.match(lokiWrite, /url = "https:\/\/logs-prod-024\.grafana\.net\/loki\/api\/v1\/push"/);
  assert.match(lokiWrite, /loki\.source\.file "pod_logs"/, 'Los logs de pods deben recolectarse');
  for (const namespace of ['pokemon-app', 'monitoring']) {
    assert.match(lokiWrite, new RegExp(`"${namespace}"`), `Debe recolectar los logs del namespace ${namespace}`);
  }
});

test('📡 OBS-003: el receptor OTLP reenvía métricas a Prometheus y logs a Loki sin tocar los nombres de serie', {
  skip: !HELM_AVAILABLE && 'helm no disponible',
}, () => {
  const rendered = renderCollection();
  const config = renderedDocument(rendered, 'otelcol.receiver.otlp "pokedex_otlp"');
  assert.ok(config, 'El receptor OTLP debe declararse en los values (ya no solo en el chart simple de Alloy)');
  assert.match(config, /endpoint = "0\.0\.0\.0:4317"/);
  assert.match(config, /endpoint = "0\.0\.0\.0:4318"/);
  assert.match(config, /metrics = \[otelcol\.exporter\.prometheus\.pokedex_otlp\.input\]/);
  assert.match(config, /logs\s+= \[otelcol\.exporter\.loki\.pokedex_otlp\.input\]/);
  assert.match(
    config,
    /otelcol\.exporter\.prometheus "pokedex_otlp" \{\s*forward_to = \[prometheus\.remote_write\.grafana_cloud_metrics\.receiver\]/,
  );
  assert.match(
    config,
    /otelcol\.exporter\.loki "pokedex_otlp" \{\s*forward_to = \[loki\.write\.grafana_cloud_logs\.receiver\]/,
  );
});

test('📡 OBS-003: Beyla queda apagado y el script inyecta el token del destino de logs', () => {
  const values = fs.readFileSync(VALUES_PATH, 'utf-8');
  assert.match(
    values,
    /beyla:\s*\r?\n\s*deploy:\s*false/,
    'El nodo de pre-prod es un LXC sin privilegios de host: eBPF no está garantizado',
  );
  const script = fs.readFileSync(path.join(ROOT_DIR, 'scripts/deploy-grafana-cloud.mjs'), 'utf-8');
  assert.match(
    script,
    /destinations\.grafana-cloud-logs\.auth\.password=/,
    'El script debe inyectar la contraseña del destino de logs con --set-file',
  );
});
