import test from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { loadImpactConfig, analyzeChangeImpact, applyAlwaysTriggers } from '../scripts/detect-change-impact.js';
import { ROOT_DIR } from './helpers/repo.js';

const CONFIG_PATH = path.join(ROOT_DIR, '.github', 'ci-impact.yaml');

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
