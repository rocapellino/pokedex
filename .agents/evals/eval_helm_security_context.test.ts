/**
 * ==============================================================================
 * .agents/evals/eval_helm_security_context.test.ts
 * ==============================================================================
 * Evaluación conductual: Blindaje Pod Hardening & SecurityContext en Helm.
 *
 * Reglas evaluadas:
 *   1. runAsNonRoot activado en PodSecurityContext / ContainerSecurityContext.
 *   2. readOnlyRootFilesystem activado en contenedor.
 *   3. allowPrivilegeEscalation desactivado (false).
 *   4. drop: [ALL] en capabilities de Linux.
 * ==============================================================================
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const HELM_TEMPLATES_DIR = path.join(ROOT_DIR, 'infra', 'helm', 'pokedex', 'templates');

const VALUES_PATH = path.join(ROOT_DIR, 'infra', 'helm', 'pokedex', 'values.yaml');

test('🤖 Eval Helm Security: values.yaml define PodSecurityContext y ContainerSecurityContext estrictos', () => {
  assert.ok(fs.existsSync(VALUES_PATH), 'values.yaml debe existir');
  const valuesContent = fs.readFileSync(VALUES_PATH, 'utf-8');

  // Validar api.securityContext
  assert.match(valuesContent, /runAsNonRoot:\s*true/, 'values.yaml debe exigir runAsNonRoot: true');
  assert.match(
    valuesContent,
    /allowPrivilegeEscalation:\s*false/,
    'values.yaml debe exigir allowPrivilegeEscalation: false',
  );
  assert.match(valuesContent, /readOnlyRootFilesystem:\s*true/, 'values.yaml debe exigir readOnlyRootFilesystem: true');
  assert.match(valuesContent, /- ALL/, 'values.yaml debe hacer drop de capabilities ALL');
});

test('🤖 Eval Helm Security: api-deployment.yaml y web-deployment.yaml aplican securityContext sin privilegios', () => {
  const apiPath = path.join(HELM_TEMPLATES_DIR, 'api-deployment.yaml');
  const webPath = path.join(HELM_TEMPLATES_DIR, 'web-deployment.yaml');
  assert.ok(fs.existsSync(apiPath), 'api-deployment.yaml debe existir');
  assert.ok(fs.existsSync(webPath), 'web-deployment.yaml debe existir');

  const apiContent = fs.readFileSync(apiPath, 'utf-8');
  const webContent = fs.readFileSync(webPath, 'utf-8');

  // api-deployment.yaml
  assert.match(apiContent, /runAsNonRoot:/, 'api-deployment debe referenciar runAsNonRoot');
  assert.match(apiContent, /allowPrivilegeEscalation:/, 'api-deployment debe referenciar allowPrivilegeEscalation');
  assert.match(apiContent, /readOnlyRootFilesystem:/, 'api-deployment debe referenciar readOnlyRootFilesystem');
  assert.match(apiContent, /capabilities:/, 'api-deployment debe referenciar capabilities');

  // web-deployment.yaml
  assert.match(webContent, /runAsNonRoot:\s*true/, 'web-deployment debe declarar runAsNonRoot: true');
  assert.match(
    webContent,
    /allowPrivilegeEscalation:\s*false/,
    'web-deployment debe declarar allowPrivilegeEscalation: false',
  );
  assert.match(webContent, /readOnlyRootFilesystem:/, 'web-deployment debe referenciar readOnlyRootFilesystem');
  assert.match(webContent, /- ALL/, 'web-deployment debe hacer drop de capabilities ALL');
});
