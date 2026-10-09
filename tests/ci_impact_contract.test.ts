import test from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { loadImpactConfig, analyzeChangeImpact, formatImpactMarkdown } from '../scripts/detect-change-impact.js';
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
