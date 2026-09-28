import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

import { LEGACY_YML_ALLOWLIST } from '../../scripts/check-yaml-extension.ts';

const ROOT_DIR = path.resolve();

test('📐 Extension Governance: check-yaml-extension.ts existe y está registrado en package.json', () => {
  const scriptPath = path.join(ROOT_DIR, 'scripts/check-yaml-extension.ts');
  assert.ok(fs.existsSync(scriptPath), 'El script scripts/check-yaml-extension.ts debe existir');

  const pkgJson = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf-8'));
  assert.ok(pkgJson.scripts['lint:yaml'], 'package.json debe registrar el script lint:yaml');
  assert.ok(pkgJson.scripts['lint:yaml:strict'], 'package.json debe registrar el script lint:yaml:strict');
  assert.match(pkgJson.scripts['validate'], /lint:yaml/, 'El script validate debe incluir lint:yaml');
});

test('📐 Extension Governance: el gate pasa en modo normal y estricto sin violaciones', () => {
  const scriptPath = path.join(ROOT_DIR, 'scripts/check-yaml-extension.ts');

  for (const mode of ['', '--strict']) {
    const stdout = execSync(`npx tsx "${scriptPath}" --json ${mode}`.trim(), {
      cwd: ROOT_DIR,
      encoding: 'utf-8'
    });
    const report = JSON.parse(stdout);

    assert.equal(report.valid, true, `El reporte (${mode || 'normal'}) debe ser válido`);
    assert.equal(
      report.undeclared.length,
      0,
      `No debe haber archivos .yml fuera del allowlist (${mode || 'normal'})`
    );
    assert.equal(
      report.staleEntries.length,
      0,
      `El allowlist no debe contener entradas obsoletas (${mode || 'normal'})`
    );
  }
});

test('📐 Extension Governance: toda la deuda .yml del repositorio está declarada y esSubset del disco', () => {
  const stdout = execSync(`npx tsx "${path.join(ROOT_DIR, 'scripts/check-yaml-extension.ts')}" --json`, {
    cwd: ROOT_DIR,
    encoding: 'utf-8'
  });
  const report = JSON.parse(stdout);

  // Cada archivo .yml detectado en disco debe estar cubierto por el allowlist.
  for (const file of report.found) {
    assert.ok(
      LEGACY_YML_ALLOWLIST.includes(file),
      `El archivo .yml ${file} debe estar declarado en LEGACY_YML_ALLOWLIST`
    );
  }

  // El allowlist no debe apuntar a archivos inexistentes (baseline sincronizada).
  for (const entry of LEGACY_YML_ALLOWLIST) {
    assert.ok(
      report.found.includes(entry),
      `La entrada ${entry} del allowlist debe existir en disco (drenar allowlist obsoleta)`
    );
  }

  // La extensión canónica .yaml debe estar ampliamente adoptada.
  const yamlCount = execSync('git ls-files "*.yaml"', { cwd: ROOT_DIR, encoding: 'utf-8' })
    .split(/\r?\n/)
    .filter(Boolean).length;

  assert.ok(
    yamlCount > report.found.length,
    `La adopción de .yaml (${yamlCount}) debe superar a la deuda .yml (${report.found.length})`
  );
});

test('📐 Extension Governance: el gate es fail-closed ante un .yml trackeado no declarado', () => {
  const probePath = path.join(ROOT_DIR, 'tmp-yaml-governance-probe.yml');
  const relativeProbe = 'tmp-yaml-governance-probe.yml';

  try {
    fs.writeFileSync(probePath, 'probe: true\n', 'utf-8');
    execSync(`git add "${relativeProbe}"`, { cwd: ROOT_DIR, stdio: 'ignore' });

    const scriptPath = path.join(ROOT_DIR, 'scripts/check-yaml-extension.ts');
    let failed = false;
    let report: { undeclared: string[] } | null = null;

    try {
      report = JSON.parse(
        execSync(`npx tsx "${scriptPath}" --json`, { cwd: ROOT_DIR, encoding: 'utf-8' })
      );
    } catch (error) {
      // El gate debe terminar con código de error (fail-closed) y aún reportar el archivo.
      failed = true;
      const stdout = (error as { stdout?: Buffer }).stdout?.toString('utf-8');
      if (stdout) report = JSON.parse(stdout);
    }

    assert.equal(failed, true, 'El gate debe fallar (exit != 0) ante un .yml no declarado');
    assert.ok(report !== null, 'El gate debe emitir el reporte JSON incluso al fallar');
    assert.ok(
      report!.undeclared.includes(relativeProbe),
      `El reporte debe señalar ${relativeProbe} como .yml no declarado`
    );
  } finally {
    try {
      execSync(`git rm --cached -f "${relativeProbe}"`, { cwd: ROOT_DIR, stdio: 'ignore' });
    } catch {
      // El índice puede no contener el archivo si el flujo falló antes del add.
    }
    if (fs.existsSync(probePath)) fs.rmSync(probePath, { force: true });
  }
});

test('📐 Extension Governance: CI y el contrato de impacto integran el gate de extensión', () => {
  const ciContent = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/ci.yaml'), 'utf-8');
  assert.match(ciContent, /YAML Extension Gate/, 'ci.yml debe declarar un paso para el YAML Extension Gate');
  assert.match(ciContent, /npm run lint:yaml:strict/, 'ci.yml debe invocar npm run lint:yaml:strict');

  const ciImpact = fs.readFileSync(path.join(ROOT_DIR, '.github/ci-impact.yaml'), 'utf-8');
  assert.match(
    ciImpact,
    /scripts\/check-yaml-extension\.ts/,
    'ci-impact.yaml debe incluir el script del gate en las rutas de linting'
  );
});
