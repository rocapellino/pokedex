/**
 * WF-002 (alcance transversal) — Paridad de triggers `workflow_run`.
 *
 * Un trigger `workflow_run` referencie workflows por su `name:` exacto, NO por ruta de
 * archivo. Si ese `name:` cambia y la lista de triggers no se actualiza, GitHub NO
 * reporta error ni aviso: el trigger simplemente nunca dispara.
 *
 * El alcance original de WF-002 solo inspeccionaba
 * `github-security-linear-sync.yaml`. Cuando el `name:` de `ci.yaml` cambio, los
 * triggers de `ghcr-retention.yaml` y `sonar-linear-sync.yaml` quedaron muertos y la
 * suite completo en verde.
 *
 * Este test recorre TODOS los workflows del repositorio y cierra ese hueco.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const WORKFLOWS_DIR = path.join(process.cwd(), '.github/workflows');

/** Workflows gestionados por GitHub que no residen en el repositorio. */
const EXTERNAL_WORKFLOW_NAMES: readonly string[] = Object.freeze(['CodeQL']);

function workflowFiles(): string[] {
  return fs
    .readdirSync(WORKFLOWS_DIR)
    .filter((f) => /\.ya?ml$/.test(f))
    .sort();
}

/** `name:` de nivel superior de cada workflow del repositorio. */
function repoWorkflowNames(): Set<string> {
  const names = new Set<string>();
  for (const file of workflowFiles()) {
    const content = fs.readFileSync(path.join(WORKFLOWS_DIR, file), 'utf-8');
    const match = content.match(/^name:\s*(.+)$/m);
    if (match) names.add(match[1].trim());
  }
  return names;
}

/**
 * Nombres declarados en la lista `workflow_run.workflows` de un workflow.
 *
 * Se acota al bloque `workflow_run:` y, dentro de el, al tramo que va de `workflows:`
 * a `types:`, para no capturar otras listas del archivo (p. ej. `branches:`).
 * Admite tanto la forma flow-sequence (`workflows: ["A", "B"]`) como la multilinea
 * con guiones, que es la que usa `github-security-linear-sync.yaml`.
 */
function declaredWorkflowRunTriggers(file: string): string[] {
  const content = fs.readFileSync(path.join(WORKFLOWS_DIR, file), 'utf-8');
  const runIndex = content.indexOf('\n  workflow_run:');
  if (runIndex === -1) return [];

  const runBlock = content.slice(runIndex);
  const listStart = runBlock.indexOf('workflows:');
  if (listStart === -1) return [];
  const listEnd = runBlock.indexOf('types:', listStart);
  const listBlock = runBlock.slice(listStart, listEnd === -1 ? undefined : listEnd);

  const declared = new Set<string>();
  for (const m of listBlock.matchAll(/"([^"\n]+)"/g)) declared.add(m[1].trim());
  for (const m of listBlock.matchAll(/^\s*-\s*([^\s"'\n].*)$/gm)) {
    const value = m[1].trim().replace(/,$/, '').replace(/^["']|["']$/g, '');
    if (value) declared.add(value);
  }
  return [...declared];
}

/** Workflows que declaran al menos un trigger `workflow_run`. */
function workflowsUsingWorkflowRun(): string[] {
  return workflowFiles().filter((f) => fs.readFileSync(path.join(WORKFLOWS_DIR, f), 'utf-8').includes('\n  workflow_run:'));
}

/**
 * WF-004: determina si un workflow genera ejecuciones propias AUTOMATICAS.
 *
 * Un reusable workflow (`workflow_call`) no genera jam una ejecucion propia: su
 * run se atribuye al workflow invocador. Por tanto un `workflow_run` que lo
 * referencia como producer queda permanentemente inerte, sin que GitHub emita
 * error alguno.
 *
 * `workflow_dispatch` NO cuenta como automatico: solo produce un run cuando una
 * persona lo lanza a mano. Si se admitiera, el test seria vacuo, porque los
 * reusables del repositorio (`ci.yaml`) declaran `workflow_dispatch` ademas de
 * `workflow_call` y el falso positivo taparia justo el defecto a detectar.
 *
 * Solo un trigger espontaneo (`push`, `pull_request`, `schedule`) garantiza que
 * el `workflow_run` consumidor se dispare sin intervencion humana.
 */
function producesOwnRuns(file: string): boolean {
  const content = fs.readFileSync(path.join(WORKFLOWS_DIR, file), 'utf-8');
  const onIndex = content.search(/^on:\s*$/m);
  if (onIndex === -1) return false;
  const block = content.slice(onIndex);
  return /^\s{2}(push|pull_request|pull_request_target|schedule):/m.test(block);
}

test('🚨 WF-004: ningun producer de workflow_run es un reusable sin ejecucion propia', () => {
  // Un reusable (`workflow_call`) referenciado en `workflow_run.workflows` hace
  // que el trigger NUNCA dispare. GitHub no valida la referencia, asi que el
  // fallo es silencioso y solo se detecta mirando el historial de runs.
  const fileByName = new Map<string, string>();
  for (const file of workflowFiles()) {
    const content = fs.readFileSync(path.join(WORKFLOWS_DIR, file), 'utf-8');
    const match = content.match(/^name:\s*(.+)$/m);
    if (match) fileByName.set(match[1].trim(), file);
  }

  const offenders: string[] = [];
  for (const file of workflowsUsingWorkflowRun()) {
    for (const name of declaredWorkflowRunTriggers(file)) {
      const producer = fileByName.get(name);
      // Los workflows gestionados por GitHub no residen en el repositorio.
      if (!producer) continue;
      if (!producesOwnRuns(producer)) {
        offenders.push(`${file} -> "${name}" (${producer})`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Triggers workflow_run que apuntan a workflows sin ejecucion propia (p. ej. reusables): ` +
      `${offenders.join(' | ')}. Un reusable nunca genera un run propio, asi que el trigger ` +
      'no dispara NUNCA y GitHub no reporta error. Usar el workflow invocador de nivel superior.'
  );
});

test('🚨 WF-002: ningun trigger workflow_run referencia un workflow inexistente', () => {
  const valid = new Set([...repoWorkflowNames(), ...EXTERNAL_WORKFLOW_NAMES]);
  const offenders: string[] = [];

  for (const file of workflowsUsingWorkflowRun()) {
    for (const name of declaredWorkflowRunTriggers(file)) {
      if (!valid.has(name)) offenders.push(`${file} -> "${name}"`);
    }
  }

  assert.ok(
    workflowsUsingWorkflowRun().length >= 1,
    'Se espera al menos un workflow con trigger workflow_run'
  );
  assert.deepEqual(
    offenders,
    [],
    `Triggers workflow_run que no corresponden a ningun workflow existente: ${offenders.join(' | ')}. ` +
      'Un nombre invalido no produce error de sintaxis: el trigger simplemente nunca dispara.'
  );
});

test('🚨 WF-002: la paridad cubre mas de un workflow (evita regresion de alcance)', () => {
  // Si el alcance se reduce a un unico workflow, un renombrado volveria a pasar
  // inadvertido en los demas. Este test fija esa invariante.
  const consumers = workflowsUsingWorkflowRun();
  assert.ok(
    consumers.length >= 3,
    `Se esperan 3 workflows con trigger workflow_run (ghcr-retention, github-security-linear-sync, ` +
      `sonar-linear-sync); encontrados: ${consumers.join(', ')}`
  );
});

test('🚨 WF-002: cada consumidor de workflow_run mantiene un red de seguridad', () => {
  // Un workflow disparado solo por workflow_run queda sin ejecucion si el nombre
  // del productor cambia. `schedule` es la red que evita la dependencia unica.
  const consumers = workflowsUsingWorkflowRun();
  const sinSchedule: string[] = [];

  for (const file of consumers) {
    const content = fs.readFileSync(path.join(WORKFLOWS_DIR, file), 'utf-8');
    const hasSchedule = /^\s{2}schedule:\s*$/m.test(content);
    const hasDispatch = /^\s{2}workflow_dispatch:\s*$/m.test(content);
    if (!hasSchedule && !hasDispatch) sinSchedule.push(file);
  }

  assert.deepEqual(
    sinSchedule,
    [],
    `Workflows con trigger workflow_run sin red de seguridad (ni schedule ni workflow_dispatch): ` +
      `${sinSchedule.join(' | ')}. Si el nombre del productor cambia, nunca se ejecutan.`
  );
});
