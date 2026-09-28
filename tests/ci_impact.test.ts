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
    'appliedAlwaysControls debe reflejar los controles declarados en always:'
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
      `El camino "${label}" debe aplicar los controles always`
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
    'Un id de always sin mapeo debe lanzar error (fail-closed)'
  );
});

test('🎯 CI topology: workflows condicionales delegan la decisión a change-impact.yml', () => {
  const orchestrator = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/change-impact.yaml'), 'utf8');
  for (const workflow of ['web.yaml', 'mega-linter.yaml', 'security-code-scanning.yaml']) {
    const content = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows', workflow), 'utf8');
    assert.match(content, /workflow_call:/, `${workflow} debe ser reutilizable`);
    assert.doesNotMatch(content, /pull_request:/, `${workflow} no debe decidir por paths en PR`);
    assert.match(orchestrator, new RegExp(`uses: \\.\\/.github/workflows/${workflow.replace('.', '\\.')}\\b`));
  }
});

test('⚙️ CI topology (REGRESIÓN): los reusable workflows no deben declarar concurrency', () => {
  // En un reusable workflow, `github.workflow` conserva el nombre del workflow
  // INVOCADOR. Todos los reusables calculaban por tanto el mismo grupo de
  // concurrencia y, con `cancel-in-progress: true`, cada uno cancelaba al
  // siguiente. Los jobs `infra`, `frontend-web` y `security-code-scanning`
  // nunca se ejecutaban pese a que sus triggers fueran `true`, dejando la
  // validación de IaC, Ansible, OpenTofu, Kyverno y K8s completamente muda.
  // La serialización por PR ya la aplica `change-impact.yml` a nivel superior.
  const reusables = [
    'ci.yaml',
    'infra.yaml',
    'web.yaml',
    'mega-linter.yaml',
    'security-code-scanning.yaml',
  ];

  for (const workflow of reusables) {
    const content = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows', workflow), 'utf8');
    assert.doesNotMatch(
      content,
      /^concurrency:/m,
      `${workflow} no debe declarar concurrency: colisiona con los demás reusables y cancela jobs`
    );
  }
});

test('⚙️ CI topology: el orquestador conserva la serialización por PR', () => {
  const orchestrator = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/change-impact.yaml'), 'utf8');
  assert.match(orchestrator, /^concurrency:/m, 'change-impact.yml debe mantener su concurrency');
  assert.match(orchestrator, /cancel-in-progress:\s*true/, 'debe cancelar corridas previas del mismo PR');
});

test('🤖 CI topology: agent_governance se propaga hasta un job AAS dedicado', () => {
  const orchestrator = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/change-impact.yaml'), 'utf8');
  const ci = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/ci.yaml'), 'utf8');

  assert.match(orchestrator, /agent_governance:\s*\$\{\{ steps\.impact\.outputs\.agent_governance \}\}/);
  assert.match(orchestrator, /agent_governance:\s*\$\{\{ needs\.detect-impact\.outputs\.agent_governance == 'true' \}\}/);
  assert.match(ci, /agent_governance:[\s\S]*?type:\s*boolean/);
  assert.match(ci, /aas-governance:[\s\S]*?npm run aas:verify[\s\S]*?tests\/aas_governance\.test\.ts/);
});

test('🌐 Nginx SSOT (DOC-003/CI-004): CI valida contra la imagen del Dockerfile, sin version hardcodeada', () => {
  const dockerfile = fs.readFileSync(path.join(ROOT_DIR, 'apps/frontend/Dockerfile'), 'utf-8');
  const webWf = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/web.yaml'), 'utf-8');

  // La imagen productiva declarada en el Dockerfile.
  const imageMatch = dockerfile.match(/^FROM (nginx:[^\s@]+@sha256:[a-f0-9]{64})/m);
  assert.ok(imageMatch, 'El Dockerfile del frontend debe declarar FROM nginx:<version>@sha256:<digest>');
  const nginxImage = imageMatch[1];

  // La version de produccion (tag, sin el prefijo `nginx:`).
  const version = nginxImage.split('@')[0].replace(/^nginx:/, '');
  const digest = nginxImage.split('@')[1];

  // 1. Ningun workflow debe hardcodear una version de Nginx: debe derivarse del
  //    Dockerfile, que es la unica SSOT.
  assert.doesNotMatch(
    webWf,
    /nginx:\d+\.\d+/,
    'web.yaml no debe hardcodear una version de Nginx: debe extraerse del Dockerfile (SSOT)'
  );

  // 2. El workflow debe resolver la imagen desde el Dockerfile.
  assert.match(
    webWf,
    /DOCKERFILE=apps\/frontend\/Dockerfile/,
    'web.yaml debe apuntar al Dockerfile del frontend como SSOT'
  );
  assert.match(
    webWf,
    /grep -oE '\^FROM nginx:/,
    'web.yaml debe extraer la imagen de Nginx del Dockerfile'
  );

  // 3. La validacion debe usar la plantilla que realmente despliega produccion.
  assert.match(
    webWf,
    /nginx\.conf\.template/,
    'web.yaml debe validar nginx.conf.template, que es lo que renderiza el Dockerfile en produccion'
  );

  // 4. La documentacion de seguridad debe reflejar la imagen real, no una anterior.
  const securityDoc = fs.readFileSync(
    path.join(ROOT_DIR, 'docs/architecture/SECURITY_AND_NETWORK_ISOLATION.md'),
    'utf-8'
  );
  assert.ok(
    securityDoc.includes(version),
    `SECURITY_AND_NETWORK_ISOLATION.md debe documentar la version productiva ${version}`
  );
  assert.ok(
    securityDoc.includes(digest),
    'SECURITY_AND_NETWORK_ISOLATION.md debe documentar el digest productivo real'
  );
});

test('🚦 Quality Gate: el agregador existe y es fail-closed con if: always()', () => {
  const orchestrator = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/change-impact.yaml'), 'utf8');

  // El gate existe para que el ruleset pueda declarar UN solo required check.
  assert.match(orchestrator, /quality-gate:/, 'change-impact.yaml debe definir el job quality-gate');

  // `needs` debe cubrir TODOS los pipelines del orquestador: si falta alguno,
  // un fallo en ese pipeline no bloquearia el merge.
  const needsMatch = orchestrator.match(/quality-gate:[\s\S]*?needs:\s*\[([^\]]*)\]/);
  assert.ok(needsMatch, 'quality-gate debe declarar needs');
  const needs = needsMatch[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const pipeline of [
    'detect-impact',
    'ci-core',
    'infra',
    'frontend-web',
    'megalinter',
    'security-code-scanning',
  ]) {
    assert.ok(needs.includes(pipeline), `quality-gate debe depender de ${pipeline}`);
  }

  // Sin `if: always()` el gate no se ejecuta cuando un job previo falla u se omite,
  // que es justamente el escenario que debe bloquear.
  const gateBlock = orchestrator.slice(orchestrator.indexOf('quality-gate:'));
  assert.match(
    gateBlock.slice(0, 400),
    /if:\s*always\(\)/,
    'quality-gate debe usar if: always() para ejecutarse aunque sus dependencias no corran'
  );

  // La semántica: `skipped` no bloquea (el radio de impacto no lo requería),
  // cualquier otro resultado distinto de success sí bloquea.
  assert.match(
    gateBlock,
    /success\|skipped\)/,
    'El gate debe tratar `skipped` como no bloqueante (evita deadlocks por jobs condicionales)'
  );
  assert.match(gateBlock, /exit 1/, 'El gate debe salir con error cuando un pipeline no cumple');
});

test('🚦 Quality Gate: el check del gate tiene el nombre que espera el ruleset', () => {
  const orchestrator = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/change-impact.yaml'), 'utf8');
  // El ruleset referencia los checks por su nombre mostrado. Este job no es
  // reusable, por lo que el context es exactamente el `name:` del job.
  assert.match(
    orchestrator,
    /name:\s*"🚦 Quality Gate"/,
    'El nombre visible del gate debe ser "🚦 Quality Gate" para referenciarlo en branch protection'
  );
});

test('⚙️ CI topology: change-impact.yml es el único propietario de Trivy para imágenes de aplicación', () => {
  const ci = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/ci.yaml'), 'utf8');
  const scheduledTrivy = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/security-trivy.yaml'), 'utf8');
  assert.match(ci, /^  trivy-scan:/m);
  assert.doesNotMatch(scheduledTrivy, /pull_request:|\n  push:/);
  assert.doesNotMatch(scheduledTrivy, /docker build|pokedex-server:test|pokedex-web:test/);
  assert.match(scheduledTrivy, /schedule:/);
  assert.match(scheduledTrivy, /infra-images-scan:/);
});

test('📊 CI topology: SonarQube Cloud tiene un único propietario de análisis real', () => {
  const ci = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/ci.yaml'), 'utf-8');
  const sonarProperties = fs.readFileSync(
    path.join(ROOT_DIR, 'sonar-project.properties'),
    'utf-8'
  );
  const orchestrator = fs.readFileSync(
    path.join(ROOT_DIR, '.github/workflows/change-impact.yaml'),
    'utf-8'
  );
  const sync = fs.readFileSync(
    path.join(ROOT_DIR, '.github/workflows/sonar-linear-sync.yaml'),
    'utf-8'
  );

  assert.equal(
    ci.match(/SonarSource\/sonarqube-scan-action@/g)?.length,
    1,
    'ci.yml debe contener exactamente un scanner SonarQube Cloud'
  );
  assert.match(
    ci,
    /SonarSource\/sonarqube-scan-action@[a-f0-9]{40} # v\d+\.\d+\.\d+/,
    'La acción Sonar debe estar fijada por SHA completo con versión documentada'
  );
  assert.ok(ci.includes('run: npm run test:coverage'), 'Sonar debe recibir cobertura LCOV actualizada');
  assert.ok(
    ci.includes('test -n "$SONAR_TOKEN"'),
    'El análisis debe fallar cerrado cuando SONAR_TOKEN no está disponible'
  );
  assert.ok(
    orchestrator.includes('SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}'),
    'change-impact.yml debe propagar SONAR_TOKEN al reusable workflow'
  );
  assert.ok(
    ci.includes("readFileSync('package.json', 'utf8')).version"),
    'La versión de Sonar debe derivarse del package.json canónico'
  );
  assert.ok(
    ci.includes('id: project-version') &&
      ci.includes('-Dsonar.projectVersion=${{ steps.project-version.outputs.version }}'),
    'Sonar debe recibir la versión SemVer validada mediante un output del job'
  );
  assert.ok(
    ci.includes("node -e \"if (!/^(0|[1-9]\\\\d*)") &&
      ci.includes('.test(process.argv[1])) process.exit(1)\" \"$VERSION\"') &&
      ci.indexOf('.test(process.argv[1])) process.exit(1)') <
        ci.indexOf('echo \"version=$VERSION\" >> \"$GITHUB_OUTPUT\"'),
    'El workflow debe rechazar versiones que no cumplan SemVer antes de publicar el output'
  );
  assert.ok(
    ci.includes('-Dsonar.qualitygate.wait=true'),
    'El scanner debe esperar y propagar el resultado del Quality Gate'
  );
  assert.equal(
    sync.match(/SonarSource\/sonarqube-scan-action@/g)?.length ?? 0,
    0,
    'sonar-linear-sync.yml solo debe consumir resultados, no ejecutar otro scanner'
  );
  assert.doesNotMatch(
    sonarProperties,
    /^sonar\.region=/m,
    'La instancia europea de SonarQube Cloud debe usar la región predeterminada sin sonar.region'
  );
  assert.match(
    sonarProperties,
    /^sonar\.exclusions=.*apps\/backend\/src\/db\/migrations\/\*\*/m,
    'Las migraciones PostgreSQL generadas no deben activar el analizador PLSQL'
  );
  assert.doesNotMatch(
    sonarProperties,
    /^sonar\.projectVersion=/m,
    'La versión de Sonar no debe fijarse estáticamente en sonar-project.properties'
  );
  assert.doesNotMatch(
    `${ci}\n${sonarProperties}`,
    /data[ ._-]?dictionary|sonar\.plsql/i,
    'El repositorio no debe configurar un Data Dictionary de Oracle para migraciones PostgreSQL'
  );
});

test('🔒 CI topology: Gitleaks conserva el Required Check independiente y sin filtros', () => {
  const gitleaks = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/security-gitleaks.yaml'), 'utf8');
  assert.match(gitleaks, /pull_request:/);
  assert.doesNotMatch(gitleaks, /paths(?:-ignore)?:/);
  assert.doesNotMatch(gitleaks, /workflow_call:/);
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
