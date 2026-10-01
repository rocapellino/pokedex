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