/**
 * El gate de cobertura de `routes/` solo protege si el CI lo ejecuta, y debe hacerlo después de generar el LCOV
 * (si no, fallaría por informe inexistente) y antes del análisis de Sonar. Este contrato fija ese orden.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { ROOT_DIR } from '../helpers/repo.js';
import { workflowJobs } from '../helpers/yaml.js';

test('📏 CI-COV-001: sonarcloud ejecuta el gate de cobertura tras generar el LCOV y antes del análisis de Sonar', () => {
  const steps = workflowJobs('.github/workflows/ci.yaml').sonarcloud.steps ?? [];
  const index = (predicate: (run: string, uses: string) => boolean) =>
    steps.findIndex((step) => predicate(step.run ?? '', step.uses ?? ''));

  const coverage = index((run) => run.trim() === 'npm run test:coverage');
  const gate = index((run) => run.trim() === 'npm run coverage:gate');
  const sonar = index((_run, uses) => uses.startsWith('SonarSource/sonarqube-scan-action'));

  assert.ok(coverage >= 0, 'sonarcloud debe generar la cobertura con npm run test:coverage');
  assert.ok(gate >= 0, 'sonarcloud debe ejecutar npm run coverage:gate');
  assert.ok(sonar >= 0, 'sonarcloud debe ejecutar el análisis de Sonar');
  assert.ok(coverage < gate && gate < sonar, 'El orden debe ser: cobertura, gate, análisis de Sonar');
});

test('📏 CI-COV-001: el script npm coverage:gate ejecuta el verificador del repositorio', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  };

  assert.equal(pkg.scripts['coverage:gate'], 'tsx scripts/check-coverage-threshold.ts');
  assert.ok(fs.existsSync(path.join(ROOT_DIR, 'scripts', 'check-coverage-threshold.ts')));
});
