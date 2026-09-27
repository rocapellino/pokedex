import test from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import * as fs from 'node:fs';
import {
  loadImpactConfig,
  analyzeChangeImpact,
  formatImpactMarkdown,
} from '../scripts/detect-change-impact.js';

import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT_DIR, '.github', 'ci-impact.yaml');

test('🎯 Change Impact: Contrato declarativo ci-impact.yaml existe y es válido', () => {
  assert.ok(fs.existsSync(CONFIG_PATH), '.github/ci-impact.yaml debe existir en disco');
  const config = loadImpactConfig(CONFIG_PATH);

  assert.equal(config.version, '1.0.0');
  assert.equal(config.governance.framework, 'repo-lifecycle');
  assert.equal(config.governance.component, 'change-impact-analysis');
  assert.ok(Array.isArray(config.always), 'always debe ser un arreglo de controles obligatorios');
  assert.ok(Array.isArray(config.global.paths), 'global.paths debe ser un arreglo de patrones globales');
  assert.ok(config.rules.documentation, 'Debe existir regla para documentation');
  assert.ok(config.rules.backend, 'Debe existir regla para backend');
  assert.ok(config.rules.frontend, 'Debe existir regla para frontend');
  assert.ok(config.rules.kubernetes, 'Debe existir regla para kubernetes');
  assert.ok(config.rules.helm, 'Debe existir regla para helm');
  assert.ok(config.rules.opentofu, 'Debe existir regla para opentofu');
  assert.ok(config.rules.ansible, 'Debe existir regla para ansible');
  assert.equal(config.unknown.policy, 'fail-closed');
});

test('🎯 Change Impact: Cambio puramente documental activa solo Fast Track de docs', () => {
  const result = analyzeChangeImpact({
    files: ['README.md', 'docs/architecture/SYSTEM_ARCHITECTURE.md', 'SECURITY.md'],
    configPath: CONFIG_PATH,
  });

  assert.equal(result.hasChanges, true);
  assert.equal(result.isUnknown, false);
  assert.equal(result.isGlobal, false);
  assert.equal(result.triggers.documentation, true, 'documentation debe estar activo');
  assert.equal(result.triggers.backend, false, 'backend no debe activarse');
  assert.equal(result.triggers.frontend, false, 'frontend no debe activarse');
  assert.equal(result.triggers.tests, false, 'tests no deben activarse');
  assert.equal(result.triggers.docker, false, 'docker no debe activarse');
  assert.equal(result.triggers.kubernetes, false, 'kubernetes no debe activarse');
  assert.equal(result.triggers.helm, false, 'helm no debe activarse');
  assert.equal(result.triggers.opentofu, false, 'opentofu no debe activarse');
  assert.equal(result.triggers.ansible, false, 'ansible no debe activarse');
});

test('🎯 Change Impact: Cambio en backend activa backend, tests, security granular (sast, sca, container) y docker', () => {
  const result = analyzeChangeImpact({
    files: ['apps/backend/src/routes/pokemon.ts'],
    configPath: CONFIG_PATH,
  });

  assert.equal(result.hasChanges, true);
  assert.equal(result.triggers.backend, true, 'backend debe estar activo');
  assert.equal(result.triggers.tests, true, 'tests deben estar activos');
  assert.equal(result.triggers.security, true, 'security general debe estar activo');
  assert.equal(result.triggers.security_secrets, true, 'security_secrets debe estar activo');
  assert.equal(result.triggers.security_sast, true, 'security_sast debe estar activo');
  assert.equal(result.triggers.security_dependencies, true, 'security_dependencies debe estar activo');
  assert.equal(result.triggers.security_container, true, 'security_container debe estar activo');
  assert.equal(result.triggers.security_iac, false, 'security_iac NO debe activarse');
  assert.equal(result.triggers.docker, true, 'docker debe estar activo');
  assert.equal(result.triggers.kubernetes, false, 'kubernetes no debe activarse');
  assert.equal(result.triggers.helm, false, 'helm no debe activarse');
  assert.equal(result.triggers.opentofu, false, 'opentofu no debe activarse');
  assert.equal(result.triggers.ansible, false, 'ansible no debe activarse');
  assert.equal(result.triggers.documentation, false, 'documentation no debe activarse');
});

test('🎯 Change Impact: Cambio en GitOps activa kubernetes, security_iac y supply_chain pero omite sast/sca/container', () => {
  const result = analyzeChangeImpact({
    files: ['gitops/apps/root-application.yaml'],
    configPath: CONFIG_PATH,
  });

  assert.equal(result.hasChanges, true);
  assert.equal(result.triggers.kubernetes, true, 'kubernetes debe estar activo');
  assert.equal(result.triggers.security, true, 'security general debe estar activo');
  assert.equal(result.triggers.security_secrets, true, 'security_secrets debe estar activo');
  assert.equal(result.triggers.security_iac, true, 'security_iac debe estar activo');
  assert.equal(result.triggers.security_supply_chain, true, 'security_supply_chain debe estar activo');
  assert.equal(result.triggers.security_sast, false, 'security_sast NO debe activarse');
  assert.equal(result.triggers.security_dependencies, false, 'security_dependencies NO debe activarse');
  assert.equal(result.triggers.security_container, false, 'security_container NO debe activarse');
  assert.equal(result.triggers.backend, false, 'backend no debe activarse');
  assert.equal(result.triggers.docker, false, 'docker no debe activarse');
});

test('🎯 Change Impact: Cambio en Helm activa helm, kubernetes, security_iac y supply_chain', () => {
  const result = analyzeChangeImpact({
    files: ['infra/helm/pokedex/values.yaml'],
    configPath: CONFIG_PATH,
  });

  assert.equal(result.hasChanges, true);
  assert.equal(result.triggers.helm, true, 'helm debe estar activo');
  assert.equal(result.triggers.kubernetes, true, 'kubernetes debe estar activo');
  assert.equal(result.triggers.security, true, 'security general debe estar activo');
  assert.equal(result.triggers.security_iac, true, 'security_iac debe estar activo');
  assert.equal(result.triggers.security_sast, false, 'security_sast no debe activarse');
  assert.equal(result.triggers.backend, false, 'backend no debe activarse');
  assert.equal(result.triggers.frontend, false, 'frontend no debe activarse');
  assert.equal(result.triggers.opentofu, false, 'opentofu no debe activarse');
  assert.equal(result.triggers.ansible, false, 'ansible no debe activarse');
});

test('🎯 Change Impact: Cambio en OpenTofu activa solo opentofu, security_secrets y security_iac', () => {
  const result = analyzeChangeImpact({
    files: ['infra/opentofu/environments/proxmox/main.tf'],
    configPath: CONFIG_PATH,
  });

  assert.equal(result.hasChanges, true);
  assert.equal(result.triggers.opentofu, true, 'opentofu debe estar activo');
  assert.equal(result.triggers.security, true, 'security general debe estar activo');
  assert.equal(result.triggers.security_iac, true, 'security_iac debe estar activo');
  assert.equal(result.triggers.security_sast, false, 'security_sast no debe activarse');
  assert.equal(result.triggers.security_supply_chain, false, 'security_supply_chain no debe activarse');
  assert.equal(result.triggers.backend, false, 'backend no debe activarse');
  assert.equal(result.triggers.kubernetes, false, 'kubernetes no debe activarse');
  assert.equal(result.triggers.docker, false, 'docker no debe activarse');
});

test('🎯 Change Impact: Cambio en Ansible activa solo ansible, security_secrets y security_iac', () => {
  const result = analyzeChangeImpact({
    files: ['infra/ansible/playbooks/site.yml'],
    configPath: CONFIG_PATH,
  });

  assert.equal(result.hasChanges, true);
  assert.equal(result.triggers.ansible, true, 'ansible debe estar activo');
  assert.equal(result.triggers.security, true, 'security general debe estar activo');
  assert.equal(result.triggers.security_iac, true, 'security_iac debe estar activo');
  assert.equal(result.triggers.security_sast, false, 'security_sast no debe activarse');
  assert.equal(result.triggers.backend, false, 'backend no debe activarse');
  assert.equal(result.triggers.kubernetes, false, 'kubernetes no debe activarse');
});

test('🎯 Change Impact: Archivo global transversal (package.json y detect-change-impact.ts) activa Full CI', () => {
  const result = analyzeChangeImpact({
    files: ['package.json'],
    configPath: CONFIG_PATH,
  });

  assert.equal(result.hasChanges, true);
  assert.equal(result.isGlobal, true);
  assert.equal(result.triggers.backend, true);
  assert.equal(result.triggers.frontend, true);
  assert.equal(result.triggers.tests, true);
  assert.equal(result.triggers.security, true);
  assert.equal(result.triggers.docker, true);
  assert.equal(result.triggers.kubernetes, true);
  assert.equal(result.triggers.helm, true);
  assert.equal(result.triggers.opentofu, true);
  assert.equal(result.triggers.ansible, true);

  const resultScript = analyzeChangeImpact({
    files: ['scripts/detect-change-impact.ts'],
    configPath: CONFIG_PATH,
  });
  assert.equal(resultScript.isGlobal, true, 'detect-change-impact.ts debe ser global');
  assert.equal(resultScript.triggers.backend, true);
});

test('🎯 Change Impact: Script documental (scripts/lint-markdown.ts) activa únicamente documentation Fast Track', () => {
  const result = analyzeChangeImpact({
    files: ['scripts/lint-markdown.ts'],
    configPath: CONFIG_PATH,
  });

  assert.equal(result.hasChanges, true);
  assert.equal(result.isGlobal, false, 'No debe ser global');
  assert.equal(result.triggers.documentation, true, 'documentation debe estar activo');
  assert.equal(result.triggers.backend, false, 'backend no debe activarse');
  assert.equal(result.triggers.frontend, false, 'frontend no debe activarse');
  assert.equal(result.triggers.tests, false, 'tests no debe activarse');
  assert.equal(result.triggers.kubernetes, false, 'kubernetes no debe activarse');
  assert.equal(result.triggers.helm, false, 'helm no debe activarse');
  assert.equal(result.triggers.docker, false, 'docker no debe activarse');
});

test('🎯 Change Impact: Script de plataforma (scripts/k8s-rollout-restart.ts) activa kubernetes y security_iac pero omite backend/frontend', () => {
  const result = analyzeChangeImpact({
    files: ['scripts/k8s-rollout-restart.ts'],
    configPath: CONFIG_PATH,
  });

  assert.equal(result.hasChanges, true);
  assert.equal(result.isGlobal, false, 'No debe ser global');
  assert.equal(result.triggers.kubernetes, true, 'kubernetes debe estar activo');
  assert.equal(result.triggers.security_iac, true, 'security_iac debe estar activo');
  assert.equal(result.triggers.backend, false, 'backend no debe activarse');
  assert.equal(result.triggers.frontend, false, 'frontend no debe activarse');
  assert.equal(result.triggers.helm, false, 'helm no debe activarse');
  assert.equal(result.triggers.opentofu, false, 'opentofu no debe activarse');
});

test('🎯 Change Impact: Tests unitarios (tests/unit/**) activan tests y backend sin Docker ni Kubernetes', () => {
  const result = analyzeChangeImpact({
    files: ['tests/unit/pokemon.test.ts', 'tests/storage.test.ts'],
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

test('🎯 Change Impact: Markdown format genera tabla limpia con iconos de estado', () => {
  const result = analyzeChangeImpact({
    files: ['README.md'],
    configPath: CONFIG_PATH,
  });

  const summary = result.markdownSummary;
  assert.ok(summary.includes('### 🎯 Change Impact Analysis'));
  assert.ok(summary.includes('Documentation'));
  assert.ok(summary.includes('✅ Afectado'));
  assert.ok(summary.includes('⏭️ Omitido'));
});
