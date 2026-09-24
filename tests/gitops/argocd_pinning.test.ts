import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateSemVerTag,
  extractTargetRevision,
  replaceTargetRevision,
  checkGitOpsPinParity,
  applyGitOpsPin,
  DEFAULT_GITOPS_APP_FILES,
} from '../../scripts/update-gitops-pin.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../');

test('🔒 ArgoCD Pinning: validateSemVerTag valida estrictamente tags semánticos inmutables', () => {
  assert.equal(validateSemVerTag('v1.75.10'), true, 'v1.75.10 debe ser válido');
  assert.equal(validateSemVerTag('v1.0.0'), true, 'v1.0.0 debe ser válido');
  assert.equal(validateSemVerTag('v2.0.0-rc.1'), true, 'v2.0.0-rc.1 debe ser válido');

  // Inválidos
  assert.equal(validateSemVerTag('main'), false, 'main no debe ser aceptado como tag inmutable');
  assert.equal(validateSemVerTag('HEAD'), false, 'HEAD no debe ser aceptado como tag inmutable');
  assert.equal(validateSemVerTag('latest'), false, 'latest no debe ser aceptado');
  assert.equal(validateSemVerTag('1.0.0'), false, '1.0.0 sin prefijo v debe rechazarse');
  assert.equal(validateSemVerTag(''), false, 'cadena vacía debe rechazarse');
});

test('🔒 ArgoCD Pinning: extractTargetRevision y replaceTargetRevision manipulan YAML limpiamente', () => {
  const sampleYaml = `
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: test-app
spec:
  source:
    repoURL: https://github.com/rocapellino/pokedex.git
    targetRevision: v1.57.1
    path: infra/helm/pokedex
`;

  const extracted = extractTargetRevision(sampleYaml);
  assert.equal(extracted, 'v1.57.1', 'Debe extraer v1.57.1');

  const replaced = replaceTargetRevision(sampleYaml, 'v1.75.10');
  assert.ok(replaced.includes('targetRevision: v1.75.10'), 'Debe incluir el nuevo tag v1.75.10');
  assert.ok(!replaced.includes('targetRevision: v1.57.1'), 'No debe contener el tag anterior');

  assert.throws(() => {
    replaceTargetRevision(sampleYaml, 'main');
  }, /Tag inválido/);
});

test('🔒 ArgoCD Pinning: Manifiestos de GitOps mantienen paridad estricta 1:1 en targetRevision', () => {
  const parity = checkGitOpsPinParity(DEFAULT_GITOPS_APP_FILES, ROOT_DIR);

  assert.equal(parity.inSync, true, `Debe estar en sincronía. Errores: ${parity.errors.join(', ')}`);
  assert.ok(parity.canonicalVersion, 'Debe existir una versión canónica única');
  assert.match(parity.canonicalVersion, /^v\d+\.\d+\.\d+$/, 'La versión canónica debe ser SemVer');

  // Verificar explícitamente los 4 archivos
  for (const relPath of DEFAULT_GITOPS_APP_FILES) {
    const fullPath = path.join(ROOT_DIR, relPath);
    assert.ok(fs.existsSync(fullPath), `${relPath} debe existir`);
    const content = fs.readFileSync(fullPath, 'utf-8');
    const version = extractTargetRevision(content);
    assert.equal(
      version,
      parity.canonicalVersion,
      `${relPath} debe tener targetRevision igual a ${parity.canonicalVersion}`
    );
  }
});

test('🔒 ArgoCD Pinning: applyGitOpsPin ejecuta de forma determinista en dryRun', () => {
  const result = applyGitOpsPin({
    tag: 'v1.99.0',
    dryRun: true,
    targetFiles: DEFAULT_GITOPS_APP_FILES,
    baseDir: ROOT_DIR,
  });

  assert.equal(result.success, true);
  assert.equal(result.newTag, 'v1.99.0');
  assert.equal(result.updatedFiles.length, 4);

  // Asegurar que en dryRun los archivos en disco NO cambiaron
  const parity = checkGitOpsPinParity(DEFAULT_GITOPS_APP_FILES, ROOT_DIR);
  assert.notEqual(parity.canonicalVersion, 'v1.99.0', 'Los archivos en disco no deben haber cambiado');
});

test('🚀 ArgoCD Pinning Automation: Workflow release-tag.yml, package.json y Taskfile.yml configuran el pipeline de promoción', () => {
  // 1. Workflow release-tag.yml
  const releaseWfPath = path.join(ROOT_DIR, '.github/workflows/release-tag.yml');
  assert.ok(fs.existsSync(releaseWfPath), 'release-tag.yml debe existir');
  const releaseWf = fs.readFileSync(releaseWfPath, 'utf-8');

  assert.ok(releaseWf.includes('pull-requests: write'), 'release-tag.yml debe declarar pull-requests: write');
  assert.ok(
    releaseWf.includes('update-gitops-pin.ts'),
    'release-tag.yml debe ejecutar scripts/update-gitops-pin.ts'
  );
  assert.ok(
    releaseWf.includes('gh pr create'),
    'release-tag.yml debe invocar gh pr create para abrir PR de promoción'
  );
  assert.ok(
    releaseWf.includes('[skip-release]'),
    'El commit de actualización debe incluir [skip-release] para evitar recursión'
  );

  // 2. package.json expone gitops:pin y gitops:pin:check
  const pkgJson = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf-8'));
  assert.ok(pkgJson.scripts['gitops:pin'], 'package.json debe exponer script gitops:pin');
  assert.ok(pkgJson.scripts['gitops:pin:check'], 'package.json debe exponer script gitops:pin:check');

  // 3. Taskfile.yml expone gitops:pin y gitops:pin:check
  const taskfile = fs.readFileSync(path.join(ROOT_DIR, 'Taskfile.yml'), 'utf-8');
  assert.ok(taskfile.includes('gitops:pin:'), 'Taskfile.yml debe exponer tarea gitops:pin');
  assert.ok(taskfile.includes('gitops:pin:check:'), 'Taskfile.yml debe exponer tarea gitops:pin:check');
});
