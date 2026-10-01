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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../');

const PS1_PATH = path.join(ROOT_DIR, 'infra/monitoring/deploy-grafana-cloud.ps1');
const MJS_PATH = path.join(ROOT_DIR, 'scripts/deploy-grafana-cloud.mjs');
const TASKFILE_PATH = path.join(ROOT_DIR, 'Taskfile.yaml');
const VSCODE_TASKS_PATH = path.join(ROOT_DIR, '.vscode/tasks.json');

/** Ejecuta un comando devolviendo stdout, o cadena vacia si falla. */
function execFileSyncSafe(command, args) {
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
function extractHelmFlags(source) {
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
    'configuración vive en grafana-cloud-values.yaml (consumido por scripts/deploy-grafana-cloud.mjs)'
  );

  // 2. El sustituto vigente debe existir y tener consumidores REALES. Si en el
  //    futuro se renombrara o moviera, este gate obliga a actualizar la referencia
  //    en lugar de dejar otro archivo sin conectar.
  const canonicalPath = path.join(monitoringDir, 'grafana-cloud-values.yaml');
  assert.ok(
    fs.existsSync(canonicalPath),
    'INFRA-006: grafana-cloud-values.yaml debe existir como configuracion canonica de telemetria'
  );

  const deployScript = fs.readFileSync(MJS_PATH, 'utf-8');
  assert.match(
    deployScript,
    /grafana-cloud-values\.yaml/,
    'INFRA-006: scripts/deploy-grafana-cloud.mjs debe referenciar grafana-cloud-values.yaml'
  );

  // 3. La cadena operativa completa debe seguir cableada: Taskfile y VS Code.
  const taskfile = fs.readFileSync(TASKFILE_PATH, 'utf-8');
  const vscodeTasks = fs.readFileSync(VSCODE_TASKS_PATH, 'utf-8').replace(/^\s*\/\/.*$/gm, '');
  for (const [label, source] of [
    ['Taskfile.yaml', taskfile],
    ['.vscode/tasks.json', vscodeTasks],
  ] as const) {
    assert.match(
      source,
      /scripts\/deploy-grafana-cloud\.mjs/,
      `INFRA-006: ${label} debe seguir invocando el desplegador de Grafana Cloud`
    );
  }

  // 4. Ningun otro values de Grafana Alloy puede quedar sin consumidor. Se
  //    listan los *.yaml de nivel superior y se exige que cada uno este en la
  //    lista blanca de consumidores conocidos.
  const topLevelYaml = fs
    .readdirSync(monitoringDir)
    .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));

  const knownConsumers = new Set(['alerts.yaml', 'grafana-cloud-values.yaml']);
  const unconsumed = topLevelYaml.filter((f) => !knownConsumers.has(f));

  assert.deepEqual(
    unconsumed,
    [],
    `INFRA-006: hay values YAML en infra/monitoring sin consumidor declarado: ${unconsumed.join(', ')}. ` +
    'Todo values de esa ruta debe ser consumible por el script de despliegue o estar en la lista blanca.'
  );

  // 5. El README de la ruta debe estar clasificado en el motor de impacto. Si no,
  //    el fail-closed lo enmascara y este archivo puede publicarse sin validar.
  const config = fs.readFileSync(
    path.join(ROOT_DIR, '.github', 'ci-impact.yaml'),
    'utf-8'
  );
  assert.match(
    config,
    /infra\/\*\*\/README\.md/,
    'INFRA-006: los README de ruta bajo infra/ deben estar clasificados en ci-impact.yaml'
  );
});

test('🔀 PORT-001: el despliegue de Grafana Cloud es multiplataforma (sin PowerShell)', () => {
  assert.ok(fs.existsSync(MJS_PATH), 'scripts/deploy-grafana-cloud.mjs debe existir');

  // 1. Ningun consumidor operativo debe invocar el .ps1 ni a powershell/pwsh.
  const taskfile = fs.readFileSync(TASKFILE_PATH, 'utf-8');
  assert.ok(
    !/deploy-grafana-cloud\.ps1/.test(taskfile),
    'Taskfile.yaml no debe invocar el script PowerShell de Grafana Cloud'
  );
  assert.match(
    taskfile,
    /node scripts\/deploy-grafana-cloud\.mjs/,
    'Taskfile.yaml debe delegar en el script Node multiplataforma'
  );

  const vscodeTasks = fs.readFileSync(VSCODE_TASKS_PATH, 'utf-8').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(
    !/deploy-grafana-cloud\.ps1/.test(vscodeTasks),
    '.vscode/tasks.json no debe invocar el script PowerShell de Grafana Cloud'
  );
  assert.ok(
    !/\bpowershell\b/i.test(vscodeTasks),
    '.vscode/tasks.json no debe depender de powershell: ataria las tareas a Windows'
  );

  // 2. No debe quedar ningun .ps1 versionado en el repositorio.
  const ps1Files = execFileSyncSafe('git', ['ls-files', '*.ps1']);
  assert.equal(
    ps1Files,
    '',
    `Persisten scripts PowerShell, que atan la operacion a Windows: ${ps1Files}`
  );
});

test('🔀 PORT-001: el script Node preserva la mitigacion de exposicion del token', () => {
  const source = fs.readFileSync(MJS_PATH, 'utf-8');

  // El token debe viajar por --set-file, nunca por --set/--set-string: en la linea
  // de comandos queda visible en `ps aux` / `auditd` durante toda la ejecucion.
  assert.match(
    source,
    /--set-file/,
    'El token debe pasarse con --set-file (no aparece en la tabla de procesos)'
  );
  assert.doesNotMatch(
    source,
    /--set-string[^']*password=\$\{token/i,
    'El token NO debe interpolarse en un --set-string: lo expone en la linea de comandos'
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
      'cluster real, no en la suite.'
  );
});

test('🔀 PORT-001: Taskfile y VS Code invocan el mismo script de Grafana Cloud', () => {
  const taskfile = fs.readFileSync(TASKFILE_PATH, 'utf-8');
  const vscodeTasks = fs.readFileSync(VSCODE_TASKS_PATH, 'utf-8').replace(/^\s*\/\/.*$/gm, '');

  assert.match(taskfile, /node scripts\/deploy-grafana-cloud\.mjs/);
  assert.match(
    vscodeTasks,
    /node scripts\/deploy-grafana-cloud\.mjs/,
    '.vscode/tasks.json debe invocar el mismo script Node que el Taskfile'
  );
});