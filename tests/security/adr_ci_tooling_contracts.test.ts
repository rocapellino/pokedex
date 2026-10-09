import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR } from '../helpers/repo.js';

test('🛡️ CI SAST Security: ci.yaml ejecuta Semgrep sobre scripts privilegiados (sin --exclude scripts)', () => {
  const ciPath = path.join(ROOT_DIR, '.github/workflows/ci.yaml');
  assert.ok(fs.existsSync(ciPath), 'ci.yaml debe existir');
  const content = fs.readFileSync(ciPath, 'utf-8');
  assert.equal(
    content.includes('--exclude scripts'),
    false,
    '.github/workflows/ci.yaml no debe excluir scripts del análisis SAST de Semgrep',
  );
});

test('🛡️ Tooling Governance: scripts/seal-secret.ts retirado en favor de ESO y Vault (CLN-002)', () => {
  const scriptPath = path.join(ROOT_DIR, 'scripts/seal-secret.ts');
  assert.ok(!fs.existsSync(scriptPath), 'seal-secret.ts debe estar retirado tras adopción de ESO (ADR-005)');
});

test('🛡️ Web Performance & Accesibilidad: lighthouserc.json define presupuestos estrictos para Core Web Vitals', () => {
  const lighthousercPath = path.join(ROOT_DIR, 'lighthouserc.json');
  assert.ok(fs.existsSync(lighthousercPath), 'lighthouserc.json debe existir en la raíz');
  const content = JSON.parse(fs.readFileSync(lighthousercPath, 'utf-8'));

  assert.ok(content.ci, 'lighthouserc.json debe tener sección ci');
  assert.ok(content.ci.assert?.assertions, 'lighthouserc.json debe definir assertions');
  assert.ok(content.ci.assert.assertions['categories:performance'], 'Debe definir presupuesto mínimo para performance');
  assert.ok(
    content.ci.assert.assertions['categories:accessibility'],
    'Debe definir presupuesto mínimo para accessibility',
  );
});

test('🛡️ CI Tooling Parity: infra.yaml y ci.yaml mantienen paridad estricta de versión de Helm en todos sus jobs', () => {
  const infraWorkflowPath = path.join(ROOT_DIR, '.github/workflows/infra.yaml');
  const ciWorkflowPath = path.join(ROOT_DIR, '.github/workflows/ci.yaml');
  const toolVersionsPath = path.join(ROOT_DIR, '.tool-versions');

  assert.ok(fs.existsSync(infraWorkflowPath), 'infra.yaml debe existir');
  assert.ok(fs.existsSync(ciWorkflowPath), 'ci.yaml debe existir');
  assert.ok(fs.existsSync(toolVersionsPath), '.tool-versions debe existir');

  const infraContent = fs.readFileSync(infraWorkflowPath, 'utf-8');
  const ciContent = fs.readFileSync(ciWorkflowPath, 'utf-8');
  const toolVersionsContent = fs.readFileSync(toolVersionsPath, 'utf-8');

  // Extraer versión de Helm esperada de .tool-versions (ej. 3.17.0)
  const helmVersionMatch = toolVersionsContent.match(/helm\s+(\S+)/);
  assert.ok(helmVersionMatch, 'Debe encontrarse versión de Helm en .tool-versions');
  const expectedHelmVersion = `v${helmVersionMatch[1]}`;

  // Extraer todas las versiones configuradas para setup-helm en infra.yaml y ci.yaml
  const infraVersions = Array.from(
    infraContent.matchAll(/uses:\s*azure\/setup-helm[^\n]*\n\s+with:\s*\n\s+version:\s*['"]?(v\d+\.\d+\.\d+)['"]?/g),
  ).map((m) => m[1]);
  assert.ok(
    infraVersions.length >= 2,
    'infra.yaml debe configurar Helm en al menos 2 jobs (validate-iac y kind-integration)',
  );

  const ciVersions = Array.from(
    ciContent.matchAll(/uses:\s*azure\/setup-helm[^\n]*\n\s+with:\s*\n\s+version:\s*['"]?(v\d+\.\d+\.\d+)['"]?/g),
  ).map((m) => m[1]);
  assert.ok(ciVersions.length >= 1, 'ci.yaml debe configurar Helm en el job publish');

  const allVersions = [...infraVersions, ...ciVersions];
  for (const ver of allVersions) {
    assert.equal(
      ver,
      expectedHelmVersion,
      `Cada workflow de CI (infra.yaml, ci.yaml) debe utilizar Helm ${expectedHelmVersion} para garantizar paridad inmutable`,
    );
  }
});
