/**
 * =============================================================================
 * Gate de portabilidad del despliegue de Grafana Cloud [PORT-001]
 * =============================================================================
 *
 * `infra/monitoring/deploy-grafana-cloud.ps1` ataba el despliegue de telemetria a
 * Windows: en Linux o macOS la tarea `task monitoring:grafana-cloud:install`
 * fallaba con "powershell no encontrado". Se sustituyo por
 * `scripts/deploy-grafana-cloud.mjs`, que es multiplataforma.
 *
 * Este gate blinda dos cosas que una sustitucion silenciosa romperia:
 *
 *   1. EQUIVALENCIA DE FLAGS: ambos scripts deben pasar EXACTAMENTE el mismo
 *      conjunto de flags a `helm upgrade`. Un despliegue con un flag distinto
 *      (por ejemplo, sin `--create-namespace`) fallaria en el cluster real, no en
 *      la suite.
 *
 *   2. NO REGRESION A POWERSHELL: ningun consumidor (Taskfile, VS Code,
 *      documentacion) debe volver a invocar el .ps1 ni a `powershell`, porque la
 *      perdida de portabilidad es silenciosa: el script seguiria "funcionando"
 *      en la maquina de quien lo desarrollo y fallando en todos lados mas.
 * =============================================================================
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getCompleteTaskfileContent } from '../helpers/taskfile.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../');

const PS1_PATH = path.join(ROOT_DIR, 'infra/monitoring/deploy-grafana-cloud.ps1');
const MJS_PATH = path.join(ROOT_DIR, 'scripts/deploy-grafana-cloud.mjs');
const VSCODE_TASKS_PATH = path.join(ROOT_DIR, '.vscode/tasks.json');

/** Ejecuta un comando devolviendo stdout, o cadena vacia si falla. */
function execFileSyncSafe(command: string, args: string[]) {
  try {
    return execFileSync(command, args, { encoding: 'utf-8' }).trim();
  } catch {
    return '';
  }
}

/**
 * Extrae los flags de Helm citados en la invocacion `helm upgrade`.
 *
 * Se comparan solo los NOMBRES de flag, no sus valores: los valores varian por
 * ambiente (token, cluster, URL) y son precisamente lo que el script parametriza.
 */
function extractHelmFlags(source: string) {
  const start = source.indexOf('upgrade');
  assert.ok(start > -1, 'No se encontro la invocacion de `helm upgrade`');

  const isPowerShell = source.includes('`');
  // En PowerShell el comando se cierra con un salto de linea en blanco; en Node
  // el array de argumentos cierra con `]);`.
  const slice = isPowerShell
    ? source.slice(start, source.indexOf('\n\n', start))
    : source.slice(start, source.indexOf(']);', start));

  const flags = new Set();
  for (const m of slice.matchAll(/(--[a-z][a-z-]*)/g)) flags.add(m[1]);
  return [...flags].sort();
}

/**
 * INFRA-006 — `alloy-proxmox-values.yaml` no debe reaparecer.
 *
 * Ese archivo era un values de Grafana Alloy para el clúster de Proxmox que
 * **no tenía ningún consumidor**: ni `Taskfile`, ni `.vscode/tasks.json`, ni
 * workflows, ni tests, ni documentación. La configuración equivalente y vigente
 * vive en `infra/monitoring/grafana-cloud-values.yaml`, que sí consume
 * `scripts/deploy-grafana-cloud.mjs` (invocado por `task monitoring:grafana-cloud:install`
 * y por el task de VS Code).
 *
 * Un values huérfano es peor que un values ausente: sugiere que el despliegue de
 * telemetría está parametrizado por ese archivo cuando no lo está, e invita a
 * editar configuración que nada aplica.
 *
 * Este gate comprueba el EFECTO (que el archivo no exista y que su sustituto
 * tenga consumidores), no la presencia de una referencia textual.
 */
test('🧹 INFRA-006: no debe haber values de Grafana huérfanos en infra/monitoring', () => {
  const monitoringDir = path.join(ROOT_DIR, 'infra/monitoring');

  // 1. El values huérfano no debe existir.
  const orphanPath = path.join(monitoringDir, 'alloy-proxmox-values.yaml');
  assert.ok(
    !fs.existsSync(orphanPath),
    'INFRA-006: alloy-proxmox-values.yaml no debe existir; no tiene consumidores y su ' +
      'configuración vive en grafana-cloud-values.yaml (consumido por scripts/deploy-grafana-cloud.mjs)',
  );

  // 2. El sustituto vigente debe existir y tener consumidores REALES. Si en el
  //    futuro se renombrara o moviera, este gate obliga a actualizar la referencia
  //    en lugar de dejar otro archivo sin conectar.
  const canonicalPath = path.join(monitoringDir, 'grafana-cloud-values.yaml');
  assert.ok(
    fs.existsSync(canonicalPath),
    'INFRA-006: grafana-cloud-values.yaml debe existir como configuracion canonica de telemetria',
  );

  const deployScript = fs.readFileSync(MJS_PATH, 'utf-8');
  assert.match(
    deployScript,
    /grafana-cloud-values\.yaml/,
    'INFRA-006: scripts/deploy-grafana-cloud.mjs debe referenciar grafana-cloud-values.yaml',
  );

  // 3. La cadena operativa completa debe seguir cableada: Taskfile y VS Code.
  const taskfile = getCompleteTaskfileContent(ROOT_DIR);
  const vscodeTasks = fs.readFileSync(VSCODE_TASKS_PATH, 'utf-8').replace(/^\s*\/\/.*$/gm, '');
  for (const [label, source] of [
    ['Taskfile.yaml', taskfile],
    ['.vscode/tasks.json', vscodeTasks],
  ] as const) {
    assert.match(
      source,
      /scripts\/deploy-grafana-cloud\.mjs/,
      `INFRA-006: ${label} debe seguir invocando el desplegador de Grafana Cloud`,
    );
  }

  // 4. Ningun otro values de Grafana Alloy puede quedar sin consumidor. Se
  //    listan los *.yaml de nivel superior y se exige que cada uno este en la
  //    lista blanca de consumidores conocidos.
  const topLevelYaml = fs.readdirSync(monitoringDir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));

  const knownConsumers = new Set(['alerts.yaml', 'grafana-cloud-values.yaml']);
  const unconsumed = topLevelYaml.filter((f) => !knownConsumers.has(f));

  assert.deepEqual(
    unconsumed,
    [],
    `INFRA-006: hay values YAML en infra/monitoring sin consumidor declarado: ${unconsumed.join(', ')}. ` +
      'Todo values de esa ruta debe ser consumible por el script de despliegue o estar en la lista blanca.',
  );

  // 5. El README de la ruta debe estar clasificado en el motor de impacto. Si no,
  //    el fail-closed lo enmascara y este archivo puede publicarse sin validar.
  const config = fs.readFileSync(path.join(ROOT_DIR, '.github', 'ci-impact.yaml'), 'utf-8');
  assert.match(
    config,
    /infra\/\*\*\/README\.md/,
    'INFRA-006: los README de ruta bajo infra/ deben estar clasificados en ci-impact.yaml',
  );
});

test('🔀 PORT-001: el despliegue de Grafana Cloud es multiplataforma (sin PowerShell)', () => {
  assert.ok(fs.existsSync(MJS_PATH), 'scripts/deploy-grafana-cloud.mjs debe existir');

  // 1. Ningun consumidor operativo debe invocar el .ps1 ni a powershell/pwsh.
  const taskfile = getCompleteTaskfileContent(ROOT_DIR);
  assert.ok(
    !/deploy-grafana-cloud\.ps1/.test(taskfile),
    'Taskfile.yaml no debe invocar el script PowerShell de Grafana Cloud',
  );
  assert.match(
    taskfile,
    /node scripts\/deploy-grafana-cloud\.mjs/,
    'Taskfile.yaml debe delegar en el script Node multiplataforma',
  );

  const vscodeTasks = fs.readFileSync(VSCODE_TASKS_PATH, 'utf-8').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(
    !/deploy-grafana-cloud\.ps1/.test(vscodeTasks),
    '.vscode/tasks.json no debe invocar el script PowerShell de Grafana Cloud',
  );
  assert.ok(
    !/\bpowershell\b/i.test(vscodeTasks),
    '.vscode/tasks.json no debe depender de powershell: ataria las tareas a Windows',
  );

  // 2. No debe quedar ningun .ps1 versionado en el repositorio.
  const ps1Files = execFileSyncSafe('git', ['ls-files', '*.ps1']);
  assert.equal(ps1Files, '', `Persisten scripts PowerShell, que atan la operacion a Windows: ${ps1Files}`);
});

test('🔀 PORT-001: el script Node preserva la mitigacion de exposicion del token', () => {
  const source = fs.readFileSync(MJS_PATH, 'utf-8');

  // El token debe viajar por --set-file, nunca por --set/--set-string: en la linea
  // de comandos queda visible en `ps aux` / `auditd` durante toda la ejecucion.
  assert.match(source, /--set-file/, 'El token debe pasarse con --set-file (no aparece en la tabla de procesos)');
  assert.doesNotMatch(
    source,
    /--set-string[^']*password=\$\{token/i,
    'El token NO debe interpolarse en un --set-string: lo expone en la linea de comandos',
  );

  // El archivo temporal debe crearse restringido y borrarse en finally.
  assert.match(source, /mode:\s*0o600/, 'El archivo del token debe crearse con permisos 0600');
  assert.match(source, /finally\s*\{[\s\S]*rmSync\(/, 'El token debe borrarse en un finally');
});

test('🔀 PORT-001: los flags de Helm son equivalentes a los del script PowerShell retirado', () => {
  // Solo tiene sentido mientras el .ps1 exista como referencia de paridad.
  if (!fs.existsSync(PS1_PATH)) return;

  const ps1Flags = extractHelmFlags(fs.readFileSync(PS1_PATH, 'utf-8'));
  const mjsFlags = extractHelmFlags(fs.readFileSync(MJS_PATH, 'utf-8'));

  assert.deepEqual(
    mjsFlags,
    ps1Flags,
    'Los flags de `helm upgrade` deben ser identicos a los del script PowerShell. ' +
      'Un flag divergente (por ejemplo, sin --create-namespace) solo fallaria en el ' +
      'cluster real, no en la suite.',
  );
});

test('🔀 PORT-001: Taskfile y VS Code invocan el mismo script de Grafana Cloud', () => {
  const taskfile = getCompleteTaskfileContent(ROOT_DIR);
  const vscodeTasks = fs.readFileSync(VSCODE_TASKS_PATH, 'utf-8').replace(/^\s*\/\/.*$/gm, '');

  assert.match(taskfile, /node scripts\/deploy-grafana-cloud\.mjs/);
  assert.match(
    vscodeTasks,
    /node scripts\/deploy-grafana-cloud\.mjs/,
    '.vscode/tasks.json debe invocar el mismo script Node que el Taskfile',
  );
});

// =============================================================================
// Contrato de consultas contra las etiquetas reales de Grafana Cloud [OBS-001]
// =============================================================================
//
// El dashboard `pokedex-metrics-dashboard` mostraba "No data" en la mayoria de
// los paneles: consultaba etiquetas de cAdvisor de Docker (`name`, `id=~"/docker/.*"`)
// y exporters (`pg_*`, `redis_*`) que no existen en pre-prod. Los conjuntos de
// etiquetas de abajo se observaron en vivo el 2026-10-05 en el datasource
// `grafanacloud-prom` (unico job ingerido: `prometheus.scrape.pokemon_api`). Si la
// recoleccion cambia, se actualizan estas fixtures desde Grafana, no a ojo.

const DASHBOARD_PATH = path.join(ROOT_DIR, 'infra/monitoring/dashboards/pokedex-application.json');
const ALERTS_PATH = path.join(ROOT_DIR, 'infra/monitoring/alerts.yaml');
const METRICS_SOURCE_PATH = path.join(ROOT_DIR, 'apps/backend/src/middleware/metrics.ts');

/** Etiquetas comunes que el pipeline de Fleet Management agrega a cada serie de la API. */
const LIVE_API_TARGET_LABELS = {
  job: 'prometheus.scrape.pokemon_api',
  app: 'pokemon-api',
  cluster: 'pokedex-k8s-cluster',
  environment: 'onprem-proxmox',
  instance: 'pokedex-k8s-node',
};

/** Etiquetas estandar del cAdvisor del kubelet que publica el chart k8s-monitoring. */
const K8S_CADVISOR_API_LABELS = {
  cluster: 'pokedex-k8s-cluster',
  namespace: 'pokemon-app',
  pod: 'pokemon-api-7c9d8b6f5-x2k4q',
  container: 'api',
};

type Matcher = { name: string; op: '=' | '!=' | '=~' | '!~'; value: string };

function parseMatchers(body: string): Matcher[] {
  return [...body.matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)\s*(=~|!~|!=|=)\s*"([^"]*)"/g)].map(([, name, op, value]) => ({
    name,
    op: op as Matcher['op'],
    value,
  }));
}

/** Extrae los matchers del primer selector `<metric>{...}` de una expresion PromQL. */
function selectorMatchers(expr: string, metric: string): Matcher[] {
  for (const [, name, body] of expr.matchAll(/\b([a-zA-Z_:][a-zA-Z0-9_:]*)\s*\{([^}]*)\}/g)) {
    if (name === metric) return parseMatchers(body);
  }
  return [];
}

/** Evalua matchers con semantica de Prometheus (regex anclada, etiqueta ausente = ""). */
function matchesLabels(matchers: Matcher[], labels: Record<string, string>): boolean {
  return matchers.every(({ name, op, value }) => {
    const actual = labels[name] ?? '';
    // El regex proviene de un matcher PromQL versionado en el repo (dashboard o alerts.yaml),
    // no de entrada de usuario: evaluarlo es justamente lo que verifica este contrato.
    // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
    const re = new RegExp(`^(?:${value})$`);
    if (op === '=') return actual === value;
    if (op === '!=') return actual !== value;
    if (op === '=~') return re.test(actual);
    return !re.test(actual);
  });
}

/** Metricas que la API expone en /metrics, derivadas de las lineas `# TYPE` del colector. */
function emittedMetricNames(): Set<string> {
  const source = fs.readFileSync(METRICS_SOURCE_PATH, 'utf-8');
  const names = new Set<string>(['up']);
  for (const [, name, type] of source.matchAll(/# TYPE ([a-z_:][a-z0-9_:]*) (\w+)/g)) {
    names.add(name);
    if (type === 'histogram')
      ['_bucket', '_sum', '_count'].forEach((s) => {
        names.add(name + s);
      });
  }
  return names;
}

const PROMQL_KEYWORDS = new Set([
  'sum',
  'max',
  'min',
  'avg',
  'count',
  'rate',
  'irate',
  'increase',
  'histogram_quantile',
  'clamp_min',
  'clamp_max',
  'time',
  'vector',
  'scalar',
  'abs',
  'by',
  'without',
  'or',
  'and',
  'unless',
  'on',
  'ignoring',
  'group_left',
  'group_right',
  'bool',
  'offset',
  'sort_desc',
  'topk',
  'changes',
  'resets',
  'max_over_time',
  'min_over_time',
  'avg_over_time',
  'label_replace',
  'absent',
  'deriv',
  'delta',
  'round',
]);

/** Nombres de metrica citados en una expresion PromQL (sin funciones ni etiquetas). */
function referencedMetrics(expr: string): string[] {
  const stripped = expr
    .replace(/"[^"]*"/g, '""')
    .replace(/\{[^}]*\}/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\b(by|without|on|ignoring)\s*\([^)]*\)/g, '')
    .replace(/\$\{?[a-zA-Z_]+\}?/g, '');
  return [...stripped.matchAll(/\b([a-zA-Z_:][a-zA-Z0-9_:]*)\b/g)]
    .map(([, id]) => id)
    .filter((id) => !PROMQL_KEYWORDS.has(id));
}

type DashboardPanel = {
  title: string;
  datasource?: { type?: string; uid?: string };
  targets?: { datasource?: { type?: string; uid?: string }; expr?: string }[];
  panels?: DashboardPanel[];
};

function dashboardTargets() {
  const dashboard = JSON.parse(fs.readFileSync(DASHBOARD_PATH, 'utf-8'));
  const out: { panel: string; type?: string; uid?: string; expr: string }[] = [];
  const walk = (panels: DashboardPanel[]) => {
    for (const p of panels) {
      for (const t of p.targets ?? []) {
        const ds = t.datasource ?? p.datasource ?? {};
        // Las variables del tablero se resuelven con el valor vivo antes de evaluar.
        const expr = (t.expr ?? '').replace(/\$\{?environment\}?/g, LIVE_API_TARGET_LABELS.environment);
        out.push({ panel: p.title, type: ds.type, uid: ds.uid, expr });
      }
      if (p.panels) walk(p.panels);
    }
  };
  walk(dashboard.panels);
  return out;
}

function alertExpr(alertName: string): string {
  const source = fs.readFileSync(ALERTS_PATH, 'utf-8').replace(/\r\n/g, '\n');
  const block = source.split(/\n\s*- alert: /).find((b) => b.startsWith(`${alertName}\n`));
  assert.ok(block, `alerts.yaml debe definir ${alertName}`);
  const m = block.match(/expr:\s*\|?\s*\n?([\s\S]*?)\n\s*for:/);
  assert.ok(m, `${alertName} debe tener expr`);
  return m[1].trim();
}

test('📈 OBS-001: el dashboard de aplicacion solo consulta metricas que la API emite', () => {
  const emitted = emittedMetricNames();
  const missing = dashboardTargets()
    .filter((t) => t.type === 'prometheus')
    .flatMap((t) =>
      referencedMetrics(t.expr)
        .filter((m) => !emitted.has(m))
        .map((m) => `${t.panel}: ${m}`),
    );

  assert.deepEqual(
    missing,
    [],
    'Paneles que consultan metricas inexistentes en pre-prod (se veran como "No data"). ' +
      'Las metricas de cAdvisor y de exporters vuelven al tablero cuando su recoleccion este declarada en el repo.',
  );
});

test('📈 OBS-001: los paneles resuelven el datasource por variable, no por UID vacio', () => {
  for (const t of dashboardTargets()) {
    const expected = t.type === 'loki' ? '${logs_datasource}' : '${datasource}';
    assert.equal(t.uid, expected, `${t.panel}: el datasource debe ser ${expected}`);
  }
});

test('📈 OBS-001: trafico y latencia excluyen probes y series sinteticas', () => {
  const httpTargets = dashboardTargets().filter((t) => /\bhttp_request/.test(t.expr));
  assert.ok(httpTargets.length > 0, 'El dashboard debe tener paneles de trafico HTTP');

  const at = (endpoint: string) => ({ ...LIVE_API_TARGET_LABELS, endpoint, method: 'GET', status: '200' });
  for (const t of httpTargets) {
    const metric = t.expr.match(/\b(http_request[a-z_]*)\s*\{/)?.[1];
    assert.ok(metric, `${t.panel}: la consulta HTTP debe usar un selector con matchers`);
    // Se evalua solo la dimension de endpoint: el numerador de 5xx filtra ademas por status.
    const matchers = selectorMatchers(t.expr, metric).filter((m) => m.name !== 'status');

    assert.ok(matchesLabels(matchers, at('/pokemons')), `${t.panel}: debe incluir trafico de negocio`);
    for (const probe of ['/healthz', '/readyz', '/metrics', '/']) {
      assert.ok(!matchesLabels(matchers, at(probe)), `${t.panel}: no debe incluir ${probe}`);
    }
  }
});

test('🚨 OBS-001: PokedexAPIDown selecciona el target real de scraping de la API', () => {
  const matchers = selectorMatchers(alertExpr('PokedexAPIDown'), 'up');
  assert.ok(matchers.length > 0, 'PokedexAPIDown debe filtrar `up` por etiquetas');
  assert.ok(
    matchesLabels(matchers, LIVE_API_TARGET_LABELS),
    'PokedexAPIDown no coincide con el target vivo: la alerta nunca dispararia con la API caida',
  );
});

test('🚨 OBS-001: ContainerHighMemoryUsage usa etiquetas de Kubernetes, no de Docker', () => {
  const expr = alertExpr('ContainerHighMemoryUsage');
  for (const metric of ['container_memory_working_set_bytes', 'container_spec_memory_limit_bytes']) {
    const matchers = selectorMatchers(expr, metric);
    assert.ok(
      matchesLabels(matchers, K8S_CADVISOR_API_LABELS),
      `${metric}: debe coincidir con el contenedor de la API en K3s`,
    );
    assert.ok(
      !matchesLabels(matchers, { ...K8S_CADVISOR_API_LABELS, container: '' }),
      `${metric}: debe excluir la serie agregada del pod (container="")`,
    );
  }
});
