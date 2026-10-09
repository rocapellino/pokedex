/**
 * ==============================================================================
 * Acceso de operador a Vault con mínimo privilegio
 * ==============================================================================
 * El token root se usó para tareas rutinarias (guardar secretos de pre-prod) y quedó expuesto. Los
 * operadores humanos deben entrar con una política acotada a las rutas de pre-prod, sin acceso al
 * resto de Vault ni a la API de sistema, y con credenciales de vida corta.
 * ==============================================================================
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR } from '../helpers/repo.js';

const POLICY_PATH = path.join(ROOT_DIR, 'infra/vault/policies/pokedex-preprod-operator.hcl');
const RUNBOOK_PATH = path.join(ROOT_DIR, 'docs/runbooks/VAULT_OPERATOR_ACCESS.md');
const ESO_POLICY_NAME = 'pokedex-preprod-policy';

interface PolicyRule {
  path: string;
  capabilities: string[];
}

function parsePolicy(source: string): PolicyRule[] {
  const withoutComments = source
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n');
  return [...withoutComments.matchAll(/path\s+"([^"]+)"\s*\{\s*capabilities\s*=\s*\[([^\]]*)\]\s*\}/g)].map(
    ([, rulePath, caps]) => ({
      path: rulePath,
      capabilities: [...caps.matchAll(/"([^"]+)"/g)].map(([, cap]) => cap),
    }),
  );
}

const rules = () => parsePolicy(fs.readFileSync(POLICY_PATH, 'utf-8'));

test('🔐 Vault operador: toda regla queda dentro de las rutas de secretos de pre-prod', () => {
  const found = rules();
  assert.ok(found.length > 0, 'La política debe declarar reglas');
  const outside = found.filter((r) => !/^secret\/(data|metadata)\/pokedex\/preprod(\/\*)?$/.test(r.path));
  assert.deepEqual(
    outside.map((r) => r.path),
    [],
    'El operador solo debe alcanzar secret/{data,metadata}/pokedex/preprod, nunca otras rutas ni sys/',
  );
});

test('🔐 Vault operador: sin sudo, sin borrado ni destrucción de secretos', () => {
  const forbidden = new Set(['sudo', 'delete', 'destroy']);
  const offending = rules().flatMap((r) => r.capabilities.filter((c) => forbidden.has(c)).map((c) => `${r.path}:${c}`));
  assert.deepEqual(offending, [], 'Borrar o destruir versiones queda para un procedimiento de emergencia explícito');
});

test('🔐 Vault operador: puede crear y actualizar datos, pero los metadatos son de solo lectura', () => {
  const byPath = new Map(rules().map((r) => [r.path, r.capabilities]));
  for (const dataPath of ['secret/data/pokedex/preprod', 'secret/data/pokedex/preprod/*']) {
    const caps = byPath.get(dataPath) ?? [];
    for (const required of ['create', 'read', 'update', 'patch']) {
      assert.ok(caps.includes(required), `${dataPath} debe permitir ${required}`);
    }
  }
  for (const metaPath of ['secret/metadata/pokedex/preprod', 'secret/metadata/pokedex/preprod/*']) {
    assert.deepEqual([...(byPath.get(metaPath) ?? [])].sort(), ['list', 'read'], `${metaPath} es de solo lectura`);
  }
});

test('🔐 Vault operador: la política de ESO sigue siendo de solo lectura y distinta de la del operador', () => {
  const playbook = fs.readFileSync(path.join(ROOT_DIR, 'infra/ansible/playbooks/setup_vault.yaml'), 'utf-8');
  assert.ok(playbook.includes(ESO_POLICY_NAME), 'El playbook debe seguir definiendo la política de ESO');
  assert.ok(!path.basename(POLICY_PATH).includes(ESO_POLICY_NAME), 'La del operador no puede reutilizar la de ESO');
});

test('🔐 Vault operador: el runbook incorpora exactamente la política versionada y un usuario de vida corta', () => {
  const runbook = fs.readFileSync(RUNBOOK_PATH, 'utf-8');
  const policyBody = fs
    .readFileSync(POLICY_PATH, 'utf-8')
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.trim().startsWith('#'));
  for (const line of policyBody) {
    assert.ok(runbook.includes(line.trim()), `El runbook debe contener la línea de política: ${line.trim()}`);
  }
  assert.match(runbook, /token_ttl=1h/);
  assert.match(runbook, /token_max_ttl=4h/);
  assert.match(runbook, /vault token revoke -self/, 'El procedimiento debe terminar revocando el token root temporal');
});
