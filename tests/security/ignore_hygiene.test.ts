import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT_DIR = path.resolve();

test('🧹 Configuration Hygiene: check-ignore-hygiene.ts existe y está registrado en package.json', () => {
  const scriptPath = path.join(ROOT_DIR, 'scripts/check-ignore-hygiene.ts');
  assert.ok(fs.existsSync(scriptPath), 'El script scripts/check-ignore-hygiene.ts debe existir');

  const pkgJson = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf-8'));
  assert.ok(pkgJson.scripts['lint:ignore'], 'package.json debe registrar el script lint:ignore');
  assert.ok(pkgJson.scripts['lint:ignore:strict'], 'package.json debe registrar el script lint:ignore:strict');
  assert.ok(pkgJson.scripts['lint:ignore:fix'], 'package.json debe registrar el script lint:ignore:fix');
  assert.match(pkgJson.scripts['validate'], /lint:ignore/, 'El script validate debe incluir lint:ignore');
});

test('🧹 Configuration Hygiene: descubrimiento dinámico y auditoría estricta de todos los archivos .ignore', () => {
  const scriptPath = path.join(ROOT_DIR, 'scripts/check-ignore-hygiene.ts');
  const stdout = execSync(`npx tsx "${scriptPath}" --json --strict`, {
    cwd: ROOT_DIR,
    encoding: 'utf-8'
  });

  const report = JSON.parse(stdout);
  assert.equal(report.valid, true, 'El reporte global de configuration hygiene debe ser válido');
  assert.ok(report.files.length >= 8, 'Debe haber descubierto dinámicamente al menos 8 archivos de exclusión');

  for (const fileReport of report.files) {
    assert.equal(fileReport.valid, true, `El archivo ${fileReport.file} debe ser válido`);
    assert.equal(fileReport.duplicates.length, 0, `No debe haber duplicados en ${fileReport.file}`);
    assert.equal(fileReport.securityRulesMissing.length, 0, `No debe faltar ninguna regla de seguridad en ${fileReport.file}`);
    assert.equal(fileReport.unjustifiedRules.length, 0, `No debe haber reglas de excepción sin justificar en ${fileReport.file}`);
    assert.equal(fileReport.obsoleteRules.length, 0, `No debe haber reglas de herramientas retiradas en ${fileReport.file}`);
  }
});

test('🧹 Configuration Hygiene: workflow de CI integra el paso de auditoría de archivos .ignore', () => {
  const ciWorkflowPath = path.join(ROOT_DIR, '.github/workflows/ci.yaml');
  const ciContent = fs.readFileSync(ciWorkflowPath, 'utf-8');

  assert.match(ciContent, /Configuration Hygiene/, 'ci.yml debe declarar un paso para Configuration Hygiene');
  assert.match(ciContent, /npm run lint:ignore:strict/, 'ci.yml debe invocar npm run lint:ignore:strict');
});
