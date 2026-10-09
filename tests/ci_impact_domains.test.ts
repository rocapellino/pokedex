import test from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { analyzeChangeImpact } from '../scripts/detect-change-impact.js';
import { ROOT_DIR } from './helpers/repo.js';

const CONFIG_PATH = path.join(ROOT_DIR, '.github', 'ci-impact.yaml');

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

test('🤖 Change Impact: SKILL.md local activa gobierno de agentes sin fuga a aplicación o infraestructura', () => {
  const skill = analyzeChangeImpact({ files: ['.agents/skills/repo-docs/SKILL.md'], configPath: CONFIG_PATH });
  const reference = analyzeChangeImpact({
    files: ['.agents/skills/repo-docs/references/readme-policy.md'],
    configPath: CONFIG_PATH,
  });

  assert.equal(skill.triggers.agent_governance, true, 'borrar o renombrar una skill local debe activar el job AAS');
  assert.equal(skill.triggers.documentation, true);
  assert.equal(skill.triggers.backend, false);
  assert.equal(skill.triggers.kubernetes, false);
  assert.equal(reference.triggers.agent_governance, false, 'las referencias de una skill no activan el job AAS');
  assert.equal(reference.triggers.documentation, true);
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
 * CI-001 — `renovate.json` no estaba clasificado: el motor lo trataba como ruta desconocida
 * y despachaba Full CI (fail-closed) en cada cambio de su configuración, aunque ninguno de
 * esos gates lo valida. Este test fija el EFECTO: debe activar solo los gates que sí lo
 * cubren y no arrastrar dominios de aplicación o infraestructura.
 */
test('🎯 CI-001: renovate.json está clasificado, activa SAST y documentación y no dispara fail-closed', () => {
  const result = analyzeChangeImpact({ files: ['renovate.json'], configPath: CONFIG_PATH });

  assert.equal(result.hasChanges, true);
  assert.equal(
    result.isUnknown,
    false,
    'CI-001: renovate.json debe estar clasificado; si no, el motor aplica fail-closed y despacha Full CI',
  );
  assert.equal(result.isGlobal, false, 'CI-001: renovate.json no debe clasificarse como global');

  // Semgrep es el gate que valida la configuración de Renovate; la guía de CI la documenta.
  assert.equal(result.triggers.security_sast, true, 'CI-001: renovate.json debe activar SAST (Semgrep)');
  assert.equal(result.triggers.documentation, true, 'CI-001: renovate.json debe activar la coherencia documental');
  // Config Linters ejecuta renovate-config-validator (RENOVATE-002): sin linting una opción inválida llegaba a main.
  assert.equal(
    result.triggers.linting,
    true,
    'CI-001: renovate.json debe activar Config Linters (validador de Renovate)',
  );
  assert.equal(result.triggers.security_secrets, true, 'security_secrets siempre debe estar activo');

  const mustStayOff: Array<[keyof typeof result.triggers, string]> = [
    ['backend', 'backend'],
    ['frontend', 'frontend'],
    ['docker', 'docker'],
    ['kubernetes', 'kubernetes'],
    ['helm', 'helm'],
    ['opentofu', 'opentofu'],
    ['ansible', 'ansible'],
    ['security_container', 'security_container'],
    ['security_iac', 'security_iac'],
    ['security_supply_chain', 'security_supply_chain'],
  ];
  for (const [trigger, label] of mustStayOff) {
    assert.equal(
      result.triggers[trigger],
      false,
      `CI-001: renovate.json no debe activar '${label}'; no modifica codigo de aplicacion ni infraestructura`,
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
