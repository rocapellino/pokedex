import test from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import * as fs from 'node:fs';
import {
  loadImpactConfig,
  analyzeChangeImpact,
  formatImpactMarkdown,
  applyAlwaysTriggers,
} from '../scripts/detect-change-impact.js';

import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT_DIR, '.github', 'ci-impact.yaml');

/**
 * DOC-003 (extensión de TST-002) — La tabla de impacto se pega literalmente en
 * todos los Pull Requests del repositorio, y su generador seguía citando los
 * workflows con la extensión `.yml` retirada durante la migración a `.yaml`.
 *
 * A diferencia de los mensajes de aserción corregidos en el PR anterior, aquí el
 * origen del error es el **generador**: quien abre un PR hereda la tabla
 * desactualizada aunque todos los tests estén correctos. Por eso el test actúa
 * sobre la salida real de `formatImpactMarkdown` y no sobre el código fuente.
 */
test('🎯 Change Impact: la tabla generada cita workflows con la extensión .yaml vigente', () => {
  const all = {
    documentation: true,
    agent_governance: true,
    backend: true,
    frontend: true,
    tests: true,
    docker: true,
    kubernetes: true,
    helm: true,
    opentofu: true,
    ansible: true,
    linting: true,
    pr_governance: true,
    security: true,
    security_secrets: true,
    security_sast: true,
    security_dependencies: true,
    security_container: true,
    security_iac: true,
    security_supply_chain: true,
  };

  const table = formatImpactMarkdown(all, ['global (configuración transversal modificada)'], []);

  const stale = table.match(
    /\b(ci|infra|web|change-impact|mega-linter|release-tag|performance-k6|dr-simulation|security-trivy|security-gitleaks|security-code-scanning|security-dast-zap|renovate-linear-sync|sonar-linear-sync|ghcr-retention)\.yml\b/,
  );

  assert.equal(
    stale,
    null,
    `La tabla de impacto cita "${stale?.[0]}", una ruta que no existe. ` +
      'Es el texto que se pega en cada Pull Request, así que el error se propaga a todos.',
  );

  // Y confirma que la tabla sigue produciendo contenido real (evita un test
  // vacuously verde si el formateador dejara de emitir filas).
  assert.match(table, /ci\.yaml \(code-quality\)/);
  assert.match(table, /infra\.yaml & Kind/);
});

test('🎯 Change Impact: el template del PR no reintroduce la nomenclatura .yml', () => {
  const template = fs.readFileSync(path.join(ROOT_DIR, '.github', 'pull_request_template.md'), 'utf-8');

  const stale = template.match(
    /\b(ci|infra|web|mega-linter|release-tag|performance-k6|dr-simulation|security-trivy)\.yml\b/,
  );
  assert.equal(
    stale,
    null,
    `pull_request_template.md cita "${stale?.[0]}" en su tabla por defecto, que se ve antes de generar la definitiva.`,
  );
});

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

test('🤖 Change Impact: manifest AAS activa gobierno de agentes sin fuga a aplicación o infraestructura', () => {
  const result = analyzeChangeImpact({ files: ['.agents/aas/aas-stack.json'], configPath: CONFIG_PATH });

  assert.equal(result.triggers.agent_governance, true);
  assert.equal(result.triggers.documentation, true);
  assert.equal(result.triggers.linting, true);
  assert.equal(result.triggers.backend, false);
  assert.equal(result.triggers.frontend, false);
  assert.equal(result.triggers.docker, false);
  assert.equal(result.triggers.helm, false);
  assert.equal(result.triggers.kubernetes, false);
});

test('🤖 Change Impact: validador y tests AAS activan el dominio canónico', () => {
  const validator = analyzeChangeImpact({ files: ['scripts/aas-governance.ts'], configPath: CONFIG_PATH });
  const contract = analyzeChangeImpact({ files: ['tests/aas_governance.test.ts'], configPath: CONFIG_PATH });

  assert.equal(validator.triggers.agent_governance, true);
  assert.equal(validator.triggers.linting, true);
  assert.equal(contract.triggers.agent_governance, true);
  assert.equal(contract.triggers.tests, true, 'el test AAS conserva además la regla general de tests');
});

/**
 * CI-001 — `Taskfile.yaml` debe estar CLASIFICADO en el motor de impacto.
 *
 * `Taskfile.yaml` es el CLI canónico del repositorio (ADR-020) y orquesta las
 * tareas de Kind, ArgoCD, Helm, Ansible, OpenTofu y validación. Antes de este
 * cambio no figuraba ni en `global.paths` ni en ninguna regla, por lo que el
 * motor aplicaba su política **fail-closed**: cualquier PR que lo modificara
 * activaba los 16 dominios. Se observó empíricamente en el PR #413, donde un
 * cambio de tres líneas en la tarea `gitops:health-checks` activó la validación
 * integral completa.
 *
 * Este test verifica el **efecto** (los triggers que realmente se disparan), no
 * la presencia textual de la ruta: una clasificación en la regla equivocada
 * seguiría "clasificando" el archivo pero omitiría gates reales.
 */
test('🎯 CI-001: Taskfile.yaml está clasificado y no dispara fail-closed', () => {
  const result = analyzeChangeImpact({ files: ['Taskfile.yaml'], configPath: CONFIG_PATH });

  assert.equal(result.hasChanges, true);
  assert.equal(
    result.isUnknown,
    false,
    'CI-001: Taskfile.yaml debe estar clasificado; si no, el motor aplica fail-closed y despacha Full CI',
  );
  assert.equal(
    result.isGlobal,
    false,
    'CI-001: Taskfile.yaml no debe clasificarse como global; es mas especifico que eso',
  );

  // El Taskfile orquesta la operativa de plataforma: estos dominios deben activarse.
  const required: Array<[keyof typeof result.triggers, string]> = [
    ['documentation', 'documentacion (superficie de comandos)'],
    ['kubernetes', 'Kubernetes/GitOps (tareas de Kind y ArgoCD)'],
    ['helm', 'Helm (lint, render y despliegue del Chart)'],
    ['opentofu', 'OpenTofu (validate y fmt de entornos)'],
    ['ansible', 'Ansible (playbooks de baseline, hardening, k3s, vault)'],
  ];
  for (const [trigger, reason] of required) {
    assert.equal(
      result.triggers[trigger],
      true,
      `CI-001: Taskfile.yaml debe activar '${String(trigger)}' porque gobierna ${reason}. ` +
        'Clasificarlo en una regla mas laxa omitiria un gate real.',
    );
  }

  // Y NO debe arrastrar dominios que el Taskfile no gobierna: la clasificacion
  // debe reducir el alcance, no desplazarlo.
  const mustStayOff: Array<[keyof typeof result.triggers, string]> = [
    ['backend', 'backend'],
    ['frontend', 'frontend'],
    ['docker', 'docker'],
  ];
  for (const [trigger, label] of mustStayOff) {
    assert.equal(
      result.triggers[trigger],
      false,
      `CI-001: Taskfile.yaml no debe activar '${label}'; no modifica codigo de aplicacion`,
    );
  }
});

/**
 * CI-001 (documentacion) — la matriz de impacto debe identificar el perfil prod
 * cloud por su cadena real: `values.prod.yaml` como base endurecida y
 * `gitops/environments/cloud/values.yaml` como override del proveedor (ADR-030).
 */
test('🎯 CI-001: la configuración del motor es global, igual que el motor', () => {
  // `scripts/detect-change-impact.ts` ya es global. Su CONFIGURACION no lo era:
  // un PR que cambiara que rutas activan que gates pasaba con un alcance menor
  // del que realmente provoca, porque el motor no encontraba su propio contrato.
  const result = analyzeChangeImpact({
    files: ['.github/ci-impact.yaml'],
    configPath: CONFIG_PATH,
  });

  assert.equal(
    result.isGlobal,
    true,
    'CI-001: .github/ci-impact.yaml debe ser una ruta global; cambiar la matriz de ' +
      'impacto altera el comportamiento de todos los Pull Requests',
  );
});

test('🎯 CI-001: la matriz de impacto identifica correctamente el perfil prod cloud', () => {
  const matrix = fs.readFileSync(
    path.join(ROOT_DIR, '.agents', 'skills', '_shared', 'change-impact-matrix.md'),
    'utf-8',
  );

  assert.ok(
    matrix.includes('gitops/environments/cloud/values.yaml'),
    'CI-001: la matriz debe identificar a gitops/environments/cloud/values.yaml como override prod cloud',
  );
  assert.ok(
    matrix.includes('infra/helm/pokedex/values.prod.yaml'),
    'CI-001: la matriz debe declarar values.prod.yaml como base del perfil prod cloud',
  );
  assert.ok(
    !matrix.includes('gitops/environments/aws/'),
    'CI-001: la matriz no debe citar el entorno aws retirado por ADR-030',
  );
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
    files: ['infra/ansible/playbooks/site.yaml'],
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

test('🎯 CI-004: un cambio en workflows activa los linters de configuración (linting)', () => {
  // Los workflows son rutas globales. Sin `linting: true` en global.triggers, Actionlint y
  // ShellCheck se omitían justamente cuando se modifican los workflows.
  const result = analyzeChangeImpact({
    files: ['.github/workflows/ci.yaml'],
    configPath: CONFIG_PATH,
  });

  assert.equal(result.isGlobal, true);
  assert.equal(result.triggers.linting, true, 'Un cambio global debe activar linting');
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

// ==============================================================================
// NIVEL ALWAYS (CI-002): `always:` del contrato debe ser REALMENTE aplicado.
// El Required Status Check "🛡️ Gitleaks Secret Detection" del ruleset
// `main-protection.json` se corresponde con el control `always: secrets`.
// ==============================================================================

test('🔒 Change Impact Always: PR documental sigue activando security_secrets y pr_governance', () => {
  const result = analyzeChangeImpact({
    files: ['docs/architecture/SYSTEM_ARCHITECTURE.md', 'README.md', '.agents/skills/repo-ci/SKILL.md'],
    configPath: CONFIG_PATH,
  });

  assert.equal(result.isUnknown, false);
  assert.equal(result.isGlobal, false);

  // El control "always" que antes no se procesaba (CI-002):
  assert.equal(result.triggers.security_secrets, true, 'security_secrets debe estar activo en un PR documental');
  assert.equal(result.triggers.pr_governance, true, 'pr_governance debe estar activo en un PR documental');
  assert.equal(result.triggers.security, true, 'el umbrella security debe quedar activo');

  // Y aun así el resto de dominios permanece omitido (Fast Track documental):
  assert.equal(result.triggers.backend, false, 'backend no debe activarse');
  assert.equal(result.triggers.frontend, false, 'frontend no debe activarse');
  assert.equal(result.triggers.docker, false, 'docker no debe activarse');
  assert.equal(result.triggers.kubernetes, false, 'kubernetes no debe activarse');

  assert.deepEqual(
    result.appliedAlwaysControls.sort(),
    ['pr-governance', 'secrets'],
    'appliedAlwaysControls debe reflejar los controles declarados en always:',
  );
});

test('🔒 Change Impact Always: los controles se aplican en los 4 caminos de retorno', () => {
  const docsOnly = analyzeChangeImpact({ files: ['README.md'], configPath: CONFIG_PATH });
  const globalChange = analyzeChangeImpact({ files: ['package.json'], configPath: CONFIG_PATH });
  const ruleChange = analyzeChangeImpact({ files: ['infra/helm/pokedex/values.yaml'], configPath: CONFIG_PATH });
  const unknownChange = analyzeChangeImpact({ files: ['nuevo/archivo.xyz'], configPath: CONFIG_PATH });

  for (const [label, result] of [
    ['docs-only', docsOnly],
    ['global', globalChange],
    ['rules', ruleChange],
    ['unknown', unknownChange],
  ] as const) {
    assert.deepEqual(
      result.appliedAlwaysControls.sort(),
      ['pr-governance', 'secrets'],
      `El camino "${label}" debe aplicar los controles always`,
    );
    assert.equal(result.triggers.security_secrets, true, `security_secrets debe estar activo en "${label}"`);
    assert.equal(result.triggers.pr_governance, true, `pr_governance debe estar activo en "${label}"`);
  }
});

test('🔒 Change Impact Always: applyAlwaysTriggers es funcional y fail-closed ante ids desconocidos', () => {
  const base = {
    documentation: false,
    agent_governance: false,
    backend: false,
    frontend: false,
    tests: false,
    docker: false,
    kubernetes: false,
    helm: false,
    opentofu: false,
    ansible: false,
    linting: false,
    pr_governance: false,
    security: false,
    security_secrets: false,
    security_sast: false,
    security_dependencies: false,
    security_container: false,
    security_iac: false,
    security_supply_chain: false,
  };

  const target = { ...base };
  const applied = applyAlwaysTriggers(target, [
    { id: 'secrets', description: 'Escaneo de secretos' },
    { id: 'pr-governance', description: 'Gobernanza de PR' },
  ]);

  assert.deepEqual(applied, ['secrets', 'pr-governance']);
  assert.equal(target.security_secrets, true);
  assert.equal(target.pr_governance, true);
  assert.equal(target.security, true, 'el umbrella security se activa con cualquier dimensión security_*');
  assert.equal(base.security_secrets, false, 'applyAlwaysTriggers no debe mutar el original');

  // Un control declarado sin mapeo debe fallar, nunca ignorarse en silencio.
  assert.throws(
    () => applyAlwaysTriggers({ ...base }, [{ id: 'control-inventado', description: 'x' }]),
    /sin mapeo de triggers/,
    'Un id de always sin mapeo debe lanzar error (fail-closed)',
  );
});

test('🎯 Change Impact: el contrato declara always con ids mapeados en el motor', () => {
  const config = loadImpactConfig(CONFIG_PATH);
  const ids = config.always.map((control) => control.id);

  assert.ok(ids.includes('secrets'), 'always debe declarar el control secrets');
  assert.ok(ids.includes('pr-governance'), 'always debe declarar el control pr-governance');

  for (const control of config.always) {
    assert.ok(control.description, `El control always '${control.id}' debe documentar su descripción`);
  }
});

// ==============================================================================
// GH-006: Matriz Exhaustiva de Change Impact y Gobernanza Integral de Workflows
// ==============================================================================

test('🎯 Change Impact Matrix: cambio multi-dominio heterogéneo combina triggers acumulativamente sin solapamiento destructivo', () => {
  const result = analyzeChangeImpact({
    files: [
      'apps/backend/src/services/auth.ts',
      'apps/frontend/src/app.ts',
      'docs/README.md',
      'infra/helm/pokedex/Chart.yaml',
    ],
    configPath: CONFIG_PATH,
  });

  assert.equal(result.hasChanges, true);
  assert.equal(result.isUnknown, false, 'Todas las rutas son conocidas; no debe caer en unknown');
  assert.equal(result.isGlobal, false, 'No hay rutas transversales globales');

  // Dominios activados acumulativamente
  assert.equal(result.triggers.backend, true, 'backend debe estar activo');
  assert.equal(result.triggers.frontend, true, 'frontend debe estar activo');
  assert.equal(result.triggers.documentation, true, 'documentation debe estar activo');
  assert.equal(result.triggers.helm, true, 'helm debe estar activo');
  assert.equal(result.triggers.kubernetes, true, 'kubernetes debe estar activo por Helm');
  assert.equal(result.triggers.docker, true, 'docker debe estar activo por backend/frontend');
  assert.equal(result.triggers.tests, true, 'tests debe estar activo por backend/frontend');

  // Dominios no involucrados deben permanecer inactivos
  assert.equal(result.triggers.opentofu, false, 'opentofu no debe activarse');
  assert.equal(result.triggers.ansible, false, 'ansible no debe activarse');

  // Seguridad granular combinada
  assert.equal(result.triggers.security, true);
  assert.equal(result.triggers.security_secrets, true);
  assert.equal(result.triggers.security_sast, true);
  assert.equal(result.triggers.security_dependencies, true);
  assert.equal(result.triggers.security_container, true);
  assert.equal(result.triggers.security_iac, true);
  assert.equal(result.triggers.security_supply_chain, true);
});

test('🎯 Change Impact Matrix: archivo anidado no mapeado en subdirectorio arbitrario activa fail-closed', () => {
  const arbitraryPaths = [
    'arbitrary_dir/nested/deeply/unknown_service.go',
    'tools/custom_bin/script.py',
    'misc/untracked_config.ini',
  ];

  for (const filePath of arbitraryPaths) {
    const result = analyzeChangeImpact({
      files: [filePath],
      configPath: CONFIG_PATH,
    });

    assert.equal(result.hasChanges, true);
    assert.equal(result.isUnknown, true, `La ruta '${filePath}' debe activar isUnknown`);
    assert.ok(result.matchedRules.includes('unknown'), `matchedRules debe incluir 'unknown' para '${filePath}'`);
    assert.equal(result.triggers.backend, true);
    assert.equal(result.triggers.frontend, true);
    assert.equal(result.triggers.kubernetes, true);
    assert.equal(result.triggers.helm, true);
    assert.equal(result.triggers.opentofu, true);
    assert.equal(result.triggers.ansible, true);
    assert.equal(result.triggers.documentation, true);
    assert.equal(result.triggers.docker, true);
  }
});

test('🎯 Change Impact Matrix: combinación de archivos modificados, eliminados y renombrados preserva la suma de dominios', () => {
  // Simulando conjunto de archivos resultantes de un diff que incluye borrado, renombrado y creación
  const diffFiles = [
    'apps/backend/src/legacy_controller.ts', // Simula archivo eliminado o renombrado en backend
    'infra/opentofu/environments/cloud-template/main.tf', // Modificación IaC
  ];

  const result = analyzeChangeImpact({
    files: diffFiles,
    configPath: CONFIG_PATH,
  });

  assert.equal(result.hasChanges, true);
  assert.equal(result.isUnknown, false);
  assert.equal(result.triggers.backend, true, 'backend debe activarse por la ruta previa');
  assert.equal(result.triggers.opentofu, true, 'opentofu debe activarse por la ruta de IaC');
  assert.equal(result.triggers.security_iac, true, 'security_iac debe activarse por opentofu');
  assert.equal(result.triggers.frontend, false, 'frontend no debe activarse');
  assert.equal(result.triggers.ansible, false, 'ansible no debe activarse');
});

test('🎯 CI Impact Governance: ci-impact.yaml no contiene referencias a scripts podados', () => {
  const rawYaml = fs.readFileSync(CONFIG_PATH, 'utf-8');
  const prunedScripts = [
    'scripts/scan-yml-refs.ts',
    'scripts/governance-audit-scripts.ts',
    'scripts/render-nginx-config.mjs',
  ];

  for (const script of prunedScripts) {
    assert.ok(!rawYaml.includes(script), `ci-impact.yaml contiene referencia al script podado: ${script}`);
  }
});

test('🎯 CI Impact: scripts de soporte mapeados activan sus dominios correspondientes sin caer en unknown', () => {
  const cases = [
    {
      file: 'scripts/generate-nginx-conf.mjs',
      expectedTrigger: 'frontend',
      notExpectedTrigger: 'backend',
    },
    {
      file: 'scripts/validate-docs-governance.ts',
      expectedTrigger: 'documentation',
      notExpectedTrigger: 'backend',
    },
    {
      file: 'scripts/deploy-grafana-cloud.mjs',
      expectedTrigger: 'kubernetes',
      notExpectedTrigger: 'frontend',
    },
    {
      file: 'scripts/test-surface.ts',
      expectedTrigger: 'tests',
      notExpectedTrigger: 'kubernetes',
    },
    {
      file: 'scripts/test-surface/parser.ts',
      expectedTrigger: 'tests',
      notExpectedTrigger: 'kubernetes',
    },
    {
      file: 'scripts/check-ruleset-parity.ts',
      expectedTrigger: 'linting',
      notExpectedTrigger: 'backend',
    },
  ];

  for (const c of cases) {
    const res = analyzeChangeImpact({
      files: [c.file],
      configPath: CONFIG_PATH,
    });
    assert.equal(res.isUnknown, false, `${c.file} no debe ser clasificado como unknown`);
    assert.equal(
      res.triggers[c.expectedTrigger as keyof typeof res.triggers],
      true,
      `${c.file} debe activar ${c.expectedTrigger}`,
    );
    assert.equal(
      res.triggers[c.notExpectedTrigger as keyof typeof res.triggers],
      false,
      `${c.file} no debe activar ${c.notExpectedTrigger}`,
    );
  }
});
