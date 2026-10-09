#!/usr/bin/env node
/**
 * =============================================================================
 * Despliegue automatizado e idempotente de Grafana Cloud en Kubernetes
 * =============================================================================
 *
 * PORTABILIDAD: este script reemplaza a `deploy-grafana-cloud.ps1`, que ataba el
 * despliegue de telemetría a Windows. Node es multiplataforma por definicion, asi
 * que la misma tarea funciona en Windows, Linux y macOS sin ramificaciones.
 *
 * No se eligio Bash a proposito: un wrapper en Bash sufre expansion de comandos
 * (backticks y `${...}` se interpretan como command substitution al viajar dentro
 * de comillas dobles). Ver el encabezado de `generate-nginx-conf.mjs` para el
 * precedente exacto de ese problema.
 *
 * SEGURIDAD DEL TOKEN (mismo contrato que el script PowerShell retirado):
 *   El token NUNCA viaja en la linea de comandos. Pasarlo como `--set token=...`
 *   lo expone en la tabla de procesos (`ps aux`, `auditd`, Get-Process) durante
 *   toda la ejecucion de Helm. Por eso se usa `--set-file`, que lee el valor de
 *   un archivo efimero creado con permisos 0600 y borrado en un `finally`, incluso
 *   si Helm lanza o el proceso se interrumpe.
 *
 * USO:
 *   node scripts/deploy-grafana-cloud.mjs
 *   GRAFANA_CLOUD_TOKEN=<token> node scripts/deploy-grafana-cloud.mjs
 *   GRAFANA_CLOUD_METRICS_TOKEN=<token> (opcional: token propio para remote_write de métricas)
 * =============================================================================
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const DEFAULT_VALUES = join(SCRIPT_DIR, 'infra', 'monitoring', 'grafana-cloud-values.yaml');

const DEFAULTS = {
  namespace: 'monitoring',
  release: 'grafana-cloud',
  values: DEFAULT_VALUES,
  username: '1832819',
  remoteConfig: 'https://fleet-management-prod-015.grafana.net',
  // Debe coincidir con el esquema de grafana-cloud-values.yaml (v4).
  chartVersion: '4.5.2',
};

const options = { ...DEFAULTS };

for (const arg of process.argv.slice(2)) {
  const match = /^--([a-z-]+)(?:=(.*))?$/.exec(arg);
  if (!match) {
    console.error(`Argumento no reconocido: ${arg}`);
    process.exit(1);
  }
  const [, key, value] = match;
  if (!(key in DEFAULTS) && key !== 'token') {
    console.error(`Argumento no reconocido: ${arg}`);
    process.exit(1);
  }
  options[key] = value;
}

const token = (options.token || process.env.GRAFANA_CLOUD_TOKEN || '').trim();

if (!token) {
  console.error(
    'No se encontro el token de Grafana Cloud. Defina GRAFANA_CLOUD_TOKEN o pase --token=<valor>.'
  );
  process.exit(1);
}

// Token del destino de métricas (Access Policy con metrics:write). Si no se define,
// se reutiliza el de Fleet Management, que debe incluir ese scope.
const metricsToken = (process.env.GRAFANA_CLOUD_METRICS_TOKEN || token).trim();

if (!existsSync(resolve(options.values))) {
  console.error(`Values file no encontrado: ${options.values}`);
  process.exit(1);
}

/**
 * Ejecuta un comando y propaga su codigo de salida.
 *
 * `execFileSync` (y no `execSync`) evita el paso por shell: los argumentos con
 * caracteres especiales no se reinterpretan, lo que cierra la via de inyeccion que
 * tendria un wrapper con `execSync` e interpolacion de cadenas.
 */
function run(command, args) {
  try {
    execFileSync(command, args, { stdio: 'inherit' });
  } catch {
    // El codigo de salida ya se propago por el error de execFileSync.
    process.exit(1);
  }
}
console.log('[Grafana Cloud] Iniciando aprovisionamiento de k8s-monitoring...');

// 1. Nombre seguro del clúster, derivado del contexto activo de kubectl.
//    Kubernetes limita las etiquetas a 63 caracteres y caracteres [a-z0-9-].
let clusterName = 'pokedex-k8s-cluster';
try {
  const context = execFileSync('kubectl', ['config', 'current-context'], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  if (context) {
    const sanitized = context
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    clusterName = sanitized.slice(0, 63).replace(/-+$/g, '');
  }
} catch {
  console.warn(`No se pudo determinar el contexto de kubectl. Usando: ${clusterName}`);
}

console.log(`[Grafana Cloud] Cluster destino: ${clusterName} (namespace: ${options.namespace})`);

// 2. Repositorio Helm oficial de Grafana.
//    `repo add` falla si el repo ya existe: `--force-update` lo hace idempotente.
run('helm', ['repo', 'add', 'grafana', 'https://grafana.github.io/helm-charts', '--force-update']);
run('helm', ['repo', 'update', 'grafana']);

// 3. Token en archivo efímero con permisos restringidos (0600).
//    El directorio se crea con mkdtemp (0700) y se elimina completo en el finally,
//    de modo que no queda rastro del token en disco.
const secretDir = mkdtempSync(join(tmpdir(), 'grafana-cloud-'));
const tokenFile = join(secretDir, 'token');
const metricsTokenFile = join(secretDir, 'metrics-token');

try {
  // 0o600: solo el propietario puede leer. En Windows el modelo de permisos es
  // distinto (NTFS hereda la ACL del perfil de usuario); el directorio temporal
  // sigue siendo privado para el usuario actual.
  writeFileSync(tokenFile, token, { encoding: 'utf-8', mode: 0o600 });
  writeFileSync(metricsTokenFile, metricsToken, { encoding: 'utf-8', mode: 0o600 });

  console.log(
    `[Grafana Cloud] Ejecutando helm upgrade --install ${options.release} ` +
      `(chart: grafana/k8s-monitoring:${options.chartVersion})...`
  );

  run('helm', [
    'upgrade',
    '--install',
    options.release,
    'grafana/k8s-monitoring',
    '--version', options.chartVersion,
    '--namespace', options.namespace,
    '--create-namespace',
    '--values', options.values,
    '--set', `cluster.name=${clusterName}`,
    '--set', 'collectorCommon.alloy.remoteConfig.enabled=true',
    '--set-string', `collectorCommon.alloy.remoteConfig.url=${options.remoteConfig}`,
    '--set-string', `collectorCommon.alloy.remoteConfig.auth.username=${options.username}`,
    // El token viaja por archivo, nunca por línea de comandos.
    '--set-file', `collectorCommon.alloy.remoteConfig.auth.password=${tokenFile}`,
    '--set-file', `destinations.grafana-cloud-metrics.auth.password=${metricsTokenFile}`,
    // Loki usa el mismo token (Access Policy con metrics:write y logs:write).
    '--set-file', `destinations.grafana-cloud-logs.auth.password=${metricsTokenFile}`,
  ]);

  console.log('[Grafana Cloud] k8s-monitoring instalado exitosamente.');
  console.log(`[Grafana Cloud] Verifique los pods con: kubectl get pods -n ${options.namespace}`);
} finally {
  // Se ejecuta tanto en éxito como en fallo: el token no debe sobrevivir al script.
  rmSync(secretDir, { recursive: true, force: true });
}
