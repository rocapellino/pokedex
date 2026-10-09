import test from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { analyzeChangeImpact } from '../scripts/detect-change-impact.js';
import { ROOT_DIR } from './helpers/repo.js';

const CONFIG_PATH = path.join(ROOT_DIR, '.github', 'ci-impact.yaml');

test('🎯 Change Impact: Tests unitarios (tests/unit/**) activan tests y backend sin Docker ni Kubernetes', () => {
  const result = analyzeChangeImpact({
    files: ['tests/unit/pokemon.test.ts', 'tests/integration/storage.test.ts'],
    configPath: CONFIG_PATH,
  });

  assert.equal(result.hasChanges, true);
  assert.equal(result.isUnknown, false, 'No debe caer en unknown');
  assert.equal(result.triggers.tests, true, 'tests debe estar activo');
  assert.equal(result.triggers.backend, true, 'backend debe estar activo');
  assert.equal(result.triggers.frontend, false, 'frontend no debe activarse');
  assert.equal(result.triggers.docker, false, 'docker no debe activarse');
  assert.equal(result.triggers.kubernetes, false, 'kubernetes no debe activarse');
  assert.equal(result.triggers.helm, false, 'helm no debe activarse');
});

test('🎯 Change Impact: Tests de frontend/e2e (tests/e2e/**) activan tests y frontend sin backend', () => {
  const result = analyzeChangeImpact({
    files: ['tests/e2e/home.spec.ts', 'tests/frontend/components.test.ts'],
    configPath: CONFIG_PATH,
  });

  assert.equal(result.hasChanges, true);
  assert.equal(result.isUnknown, false, 'No debe caer en unknown');
  assert.equal(result.triggers.tests, true, 'tests debe estar activo');
  assert.equal(result.triggers.frontend, true, 'frontend debe estar activo');
  assert.equal(result.triggers.backend, false, 'backend no debe activarse');
  assert.equal(result.triggers.docker, false, 'docker no debe activarse');
  assert.equal(result.triggers.kubernetes, false, 'kubernetes no debe activarse');
});

test('🎯 Change Impact: Tests de seguridad (tests/security/**) activan tests y security_iac', () => {
  const result = analyzeChangeImpact({
    files: ['tests/security/iac_baseline_security.test.ts'],
    configPath: CONFIG_PATH,
  });

  assert.equal(result.hasChanges, true);
  assert.equal(result.isUnknown, false, 'No debe caer en unknown');
  assert.equal(result.triggers.tests, true, 'tests debe estar activo');
  assert.equal(result.triggers.security_iac, true, 'security_iac debe estar activo');
  assert.equal(result.triggers.security_secrets, true, 'security_secrets debe estar activo');
  assert.equal(result.triggers.backend, false, 'backend no debe activarse');
  assert.equal(result.triggers.docker, false, 'docker no debe activarse');
  assert.equal(result.triggers.kubernetes, false, 'kubernetes no debe activarse');
});

test('🎯 Change Impact: Tests de GitOps (tests/gitops/**) activan tests, kubernetes y supply_chain', () => {
  const result = analyzeChangeImpact({
    files: ['tests/gitops/verify-sync.test.ts'],
    configPath: CONFIG_PATH,
  });

  assert.equal(result.hasChanges, true);
  assert.equal(result.isUnknown, false, 'No debe caer en unknown');
  assert.equal(result.triggers.tests, true, 'tests debe estar activo');
  assert.equal(result.triggers.kubernetes, true, 'kubernetes debe estar activo');
  assert.equal(result.triggers.security_supply_chain, true, 'security_supply_chain debe estar activo');
  assert.equal(result.triggers.backend, false, 'backend no debe activarse');
  assert.equal(result.triggers.docker, false, 'docker no debe activarse');
});

test('🎯 Change Impact: Test genérico nuevo en tests/** activa tests base sin activar Fail-Closed (unknown)', () => {
  const result = analyzeChangeImpact({
    files: ['tests/custom-suite/helper.test.ts'],
    configPath: CONFIG_PATH,
  });

  assert.equal(result.hasChanges, true);
  assert.equal(result.isUnknown, false, 'tests/** general NO debe caer en unknown');
  assert.ok(result.matchedRules.includes('tests'), 'Debe coincidir con regla base tests');
  assert.equal(result.triggers.tests, true, 'tests debe estar activo');
  assert.equal(result.triggers.backend, false, 'backend no debe activarse');
  assert.equal(result.triggers.docker, false, 'docker no debe activarse');
  assert.equal(result.triggers.kubernetes, false, 'kubernetes no debe activarse');
});

test('🎯 Change Impact: Archivo desconocido activa política Fail-Closed (Unknown -> Full CI)', () => {
  const result = analyzeChangeImpact({
    files: ['arbitrary_new_directory/unknown_tool.xyz'],
    configPath: CONFIG_PATH,
  });

  assert.equal(result.hasChanges, true);
  assert.equal(result.isUnknown, true, 'Debe activar bandera isUnknown');
  assert.ok(result.matchedRules.includes('unknown'), 'matchedRules debe incluir unknown');
  assert.equal(result.triggers.backend, true);
  assert.equal(result.triggers.frontend, true);
  assert.equal(result.triggers.tests, true);
  assert.equal(result.triggers.docker, true);
  assert.equal(result.triggers.kubernetes, true);
  assert.equal(result.triggers.helm, true);
  assert.equal(result.triggers.opentofu, true);
  assert.equal(result.triggers.ansible, true);
  assert.ok(result.markdownSummary.includes('Fail-Closed activado'), 'El resumen debe advertir de fail-closed');
});
