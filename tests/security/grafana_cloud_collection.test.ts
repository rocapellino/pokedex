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
 * El render se parsea como documentos YAML: los recursos (Alloy, ExternalSecret) se comprueban por sus campos y
 * la configuracion de Alloy (lenguaje River, que no es YAML) se busca solo dentro de los ConfigMap renderizados.
 * Los values y las reglas de alerta se leen parseados, no como texto.
 *
 * Requiere `helm` y acceso a https://grafana.github.io/helm-charts (igual que el
 * job de Helm de CI). Sin `helm` el test se omite de forma explicita.
 * =============================================================================
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { isHelmAvailable, runHelm } from '../../scripts/lib/helm.js';
import { ROOT_DIR } from '../helpers/repo.js';
import { readYaml } from '../helpers/yaml.js';

const DEPLOY_SCRIPT = path.join(ROOT_DIR, 'scripts/deploy-grafana-cloud.mjs');
const VALUES_PATH = path.join(ROOT_DIR, 'infra/monitoring/grafana-cloud-values.yaml');

// Fuera de CI, sin Helm ni Docker el render se omite; en CI no hay skip y runHelm falla de forma explicita.
const HELM_SKIP = !isHelmAvailable() && process.env.CI !== 'true' && 'helm no disponible (ni local ni via Docker)';

interface Manifest {
  kind?: string;
  metadata?: { name?: string; namespace?: string };
  spec?: Record<string, any>;
  data?: Record<string, string>;
}

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
  renderedCache = runHelm([
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
  ]);
  return renderedCache;
}

/** Recursos del render, ya parseados. */
function renderedManifests(): Manifest[] {
  return (yaml.loadAll(renderCollection()) as Array<Manifest | null>).filter((doc): doc is Manifest => Boolean(doc));
}

/** Recursos de un tipo, opcionalmente filtrados por nombre. */
function renderedKind(kind: string, name?: string): Manifest[] {
  return renderedManifests().filter((doc) => doc.kind === kind && (name === undefined || doc.metadata?.name === name));
}

/** Configuracion de Alloy (River) de los ConfigMap renderizados que contienen todas las cadenas dadas. */
function renderedConfig(...needles: string[]): string | undefined {
  return renderedKind('ConfigMap')
    .flatMap((configMap) => Object.values(configMap.data ?? {}))
    .find((config) => needles.every((needle) => config.includes(needle)));
}

/** Metricas de Kubernetes que consultan las alertas (cAdvisor, kubelet y kube-state-metrics). */
function alertKubernetesMetrics(): string[] {
  const alerts = readYaml<{ groups: Array<{ rules: Array<{ expr?: string }> }> }>('infra/monitoring/alerts.yaml');
  const exprs = alerts.groups.flatMap((group) => group.rules.map((rule) => String(rule.expr ?? '')));
  const names = exprs.flatMap((e) => [...e.matchAll(/\b((?:container|kube|kubelet)_[a-z_]+)\b/g)].map(([, n]) => n));
  return [...new Set(names)].sort();
}

test('📡 OBS-002: el chart que instala el script renderiza con los values del repo', {
  skip: HELM_SKIP,
}, () => {
  assert.doesNotThrow(
    () => renderCollection(),
    'helm template debe renderizar: una version de chart incompatible con el esquema de los values rompe task monitoring:grafana-cloud:install',
  );
  assert.ok(renderedManifests().length > 0, 'el render debe producir recursos');
});

test('📡 OBS-002: se scrapean cAdvisor, kubelet, kube-state-metrics y node-exporter hacia Grafana Cloud', {
  skip: HELM_SKIP,
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
  skip: HELM_SKIP,
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

  const metrics = alertKubernetesMetrics();
  assert.ok(metrics.length > 0, 'alerts.yaml debe consultar metricas de Kubernetes');
  const dropped = metrics.filter((m) => !keepRegexes.some((re) => re.test(m)));
  assert.deepEqual(dropped, [], 'Metricas usadas por alertas que el colector descarta: las alertas nunca evaluarian');
});

test('📡 OBS-002: el endpoint OTLP que usa la API sigue existiendo en el colector', {
  skip: HELM_SKIP,
}, () => {
  const appValues = readYaml('infra/helm/pokedex/values.yaml');
  const otelEndpoint: string | undefined = appValues.api?.env?.otelEndpoint;
  const endpoint = otelEndpoint?.match(/^http:\/\/([a-z0-9-]+)\.([a-z0-9-]+)\.svc[^:]*:(\d+)$/);
  assert.ok(endpoint, 'infra/helm/pokedex/values.yaml debe declarar api.env.otelEndpoint');
  const [, service, namespace, port] = endpoint;

  const alloyCr = renderedKind('Alloy', service)[0];
  assert.ok(alloyCr, `El colector debe llamarse ${service}: la API envia OTLP a ${service}.${namespace}`);
  assert.equal(alloyCr.metadata?.namespace, namespace, `El colector debe vivir en el namespace ${namespace}`);
  const ports = (alloyCr.spec?.alloy?.alloy?.extraPorts ?? []).map((p: { port: number }) => String(p.port));
  assert.ok(ports.includes(port), `El colector debe exponer el puerto OTLP ${port}`);
});

test('🔐 AUD-SEC-OBS-001: el scrape de /metrics de la API vive en el repo y envía el token Bearer', {
  skip: HELM_SKIP,
}, () => {
  const config = renderedConfig('prometheus.scrape "pokemon_api"');
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
  skip: HELM_SKIP,
}, () => {
  const namespace = deployDefault('namespace');

  // Un pod no lee Secrets de otro namespace: el de `pokemon-app` no le sirve al Alloy.
  const externalSecret = renderedKind('ExternalSecret').find((doc) =>
    JSON.stringify(doc.spec).includes('METRICS_BEARER_TOKEN'),
  );
  assert.ok(externalSecret, `Debe existir un ExternalSecret de METRICS_BEARER_TOKEN en ${namespace}`);
  assert.equal(externalSecret.metadata?.namespace, namespace);
  assert.equal(externalSecret.spec?.secretStoreRef?.name, 'vault-backend-preprod');
  const remoteRef = (externalSecret.spec?.data ?? []).find(
    (entry: { secretKey: string }) => entry.secretKey === 'METRICS_BEARER_TOKEN',
  )?.remoteRef;
  assert.deepEqual(
    { key: remoteRef?.key, property: remoteRef?.property },
    { key: 'pokedex/preprod', property: 'METRICS_BEARER_TOKEN' },
  );

  const alloyCr = renderedKind('Alloy', 'grafana-cloud-alloy')[0];
  assert.ok(alloyCr, 'El colector grafana-cloud-alloy debe renderizarse');
  const envVar = (alloyCr.spec?.alloy?.alloy?.extraEnv ?? []).find(
    (variable: { name: string }) => variable.name === 'METRICS_BEARER_TOKEN',
  );
  assert.ok(
    envVar?.valueFrom?.secretKeyRef,
    'El Alloy debe declarar la variable METRICS_BEARER_TOKEN desde un secretKeyRef',
  );
  assert.equal(envVar.valueFrom.secretKeyRef.key, 'METRICS_BEARER_TOKEN');
  assert.equal(
    envVar.valueFrom.secretKeyRef.name,
    'alloy-metrics-token',
    'Debe leer el Secret que crea el ExternalSecret de este namespace',
  );
  assert.equal(externalSecret.spec?.target?.name, 'alloy-metrics-token');
});

test('📡 OBS-003: los logs de pods de la app y del monitoreo llegan a Loki desde el repo', {
  skip: HELM_SKIP,
}, () => {
  const lokiWrite = renderedConfig('loki.write "grafana_cloud_logs"');
  assert.ok(lokiWrite, 'Debe existir el destino de logs: sin él el receptor OTLP no puede reenviar logs');
  assert.match(lokiWrite, /url = "https:\/\/logs-prod-024\.grafana\.net\/loki\/api\/v1\/push"/);
  assert.match(lokiWrite, /loki\.source\.file "pod_logs"/, 'Los logs de pods deben recolectarse');
  for (const namespace of ['pokemon-app', 'monitoring']) {
    assert.match(lokiWrite, new RegExp(`"${namespace}"`), `Debe recolectar los logs del namespace ${namespace}`);
  }
});

test('📡 OBS-003: el receptor OTLP reenvía métricas a Prometheus y logs a Loki sin tocar los nombres de serie', {
  skip: HELM_SKIP,
}, () => {
  const config = renderedConfig('otelcol.receiver.otlp "pokedex_otlp"');
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
  const values = yaml.load(fs.readFileSync(VALUES_PATH, 'utf-8')) as {
    telemetryServices?: { beyla?: { deploy?: boolean } };
  };
  assert.equal(
    values.telemetryServices?.beyla?.deploy,
    false,
    'El nodo de pre-prod es un LXC sin privilegios de host: eBPF no está garantizado',
  );
  const script = fs.readFileSync(DEPLOY_SCRIPT, 'utf-8');
  assert.match(
    script,
    /destinations\.grafana-cloud-logs\.auth\.password=/,
    'El script debe inyectar la contraseña del destino de logs con --set-file',
  );
});
