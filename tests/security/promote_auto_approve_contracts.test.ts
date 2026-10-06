import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../');

test('🚀 Release Promote Auto-Approve: Contrato de auto-aprobación de checks para PRs de release', () => {
  const autoApproveWfPath = path.join(ROOT_DIR, '.github/workflows/promote-auto-approve.yaml');
  const releaseWfPath = path.join(ROOT_DIR, '.github/workflows/release-tag.yaml');

  assert.ok(fs.existsSync(autoApproveWfPath), 'promote-auto-approve.yaml debe existir con extensión canónica .yaml');
  assert.ok(fs.existsSync(releaseWfPath), 'release-tag.yaml debe existir');

  const autoApproveWf = fs.readFileSync(autoApproveWfPath, 'utf-8');
  const releaseWf = fs.readFileSync(releaseWfPath, 'utf-8');

  // 1. promote-auto-approve.yaml debe reaccionar a pull_request_target
  assert.ok(
    autoApproveWf.includes('pull_request_target:'),
    'promote-auto-approve.yaml debe escuchar pull_request_target para operar en el contexto seguro del repo base',
  );

  // 2. Debe restringirse exclusivamente a ramas release/promote-
  assert.match(
    autoApproveWf,
    /startsWith\(github\.event\.pull_request\.head\.ref,\s*'release\/promote-'\)/,
    'Debe restringir la auto-aprobación únicamente a ramas release/promote-',
  );

  // 3. Debe declarar permisos actions: write
  assert.match(
    autoApproveWf,
    /actions:\s*write/,
    'promote-auto-approve.yaml debe requerir permiso actions: write para interactuar con la Actions API',
  );

  // 3b. Trust boundary: pull_request_target no debe recibir el token de administración
  assert.ok(
    !autoApproveWf.includes('RULESET_ADMIN_TOKEN'),
    'promote-auto-approve.yaml (pull_request_target) debe usar solo GITHUB_TOKEN, nunca RULESET_ADMIN_TOKEN',
  );

  // 4. Debe llamar al endpoint de aprobación de runs
  assert.ok(
    autoApproveWf.includes('/actions/runs/${RUN_ID}/approve'),
    'promote-auto-approve.yaml debe invocar el endpoint POST /actions/runs/{id}/approve',
  );

  // 5. release-tag.yaml debe incluir actions: write y el paso de auto-aprobación inmediata
  assert.match(
    releaseWf,
    /actions:\s*write/,
    'release-tag.yaml debe declarar permiso actions: write a nivel de workflow',
  );

  assert.ok(
    releaseWf.includes('RULESET_ADMIN_TOKEN || secrets.GITHUB_TOKEN'),
    'release-tag.yaml debe emplear RULESET_ADMIN_TOKEN como credencial primaria para el PR de promoción',
  );

  assert.ok(
    releaseWf.includes('/actions/runs/${RUN_ID}/approve'),
    'release-tag.yaml debe invocar el endpoint de auto-aprobación tras la apertura/actualización del PR',
  );
});
