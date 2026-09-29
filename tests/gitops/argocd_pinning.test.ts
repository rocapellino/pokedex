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

test('🚀 ArgoCD Pinning Automation: Workflow release-tag.yaml, package.json y Taskfile.yaml configuran el pipeline de promoción', () => {
  // 1. Workflow release-tag.yaml
  const releaseWfPath = path.join(ROOT_DIR, '.github/workflows/release-tag.yaml');
  assert.ok(fs.existsSync(releaseWfPath), 'release-tag.yaml debe existir');
  const releaseWf = fs.readFileSync(releaseWfPath, 'utf-8');

  assert.ok(releaseWf.includes('pull-requests: write'), 'release-tag.yaml debe declarar pull-requests: write');
  assert.ok(
    releaseWf.includes('update-gitops-pin.ts'),
    'release-tag.yaml debe ejecutar scripts/update-gitops-pin.ts'
  );
  assert.ok(
    releaseWf.includes('gh pr create'),
    'release-tag.yaml debe invocar gh pr create para abrir PR de promoción'
  );
  assert.ok(
    releaseWf.includes('[skip-release]'),
    'El commit de actualización debe incluir [skip-release] para evitar recursión'
  );
  assert.equal(
    releaseWf.match(/gh pr create/g)?.length,
    1,
    'release-tag.yaml debe crear exactamente un PR atómico por release'
  );
  assert.ok(
    releaseWf.includes('BRANCH="release/promote-${NEW_TAG}"'),
    'La promoción debe usar la rama bot release/promote-vX.Y.Z'
  );
  assert.ok(!releaseWf.includes('release/bump-${NEW_TAG}'), 'No debe conservar la rama de bump separada');
  assert.ok(!releaseWf.includes('gitops/pin-${NEW_TAG}'), 'No debe conservar la rama GitOps separada');
  assert.ok(
    releaseWf.includes('git add package.json package-lock.json infra/helm/pokedex/Chart.yaml gitops/apps/'),
    'El commit debe preparar conjuntamente metadata (incluido package-lock.json) y manifiestos GitOps'
  );
  assert.ok(
    releaseWf.includes('git commit -m "chore(release): promote ${NEW_TAG} [skip-release]"'),
    'El commit atómico debe impedir recursión'
  );
  assert.ok(
    releaseWf.includes('--title "chore(release): promote ${NEW_TAG} [skip-release]"'),
    'El título del PR debe impedir recursión con cualquier estrategia de merge'
  );
  assert.ok(
    releaseWf.includes('gh pr list --head "$BRANCH" --state open'),
    'La automatización debe reutilizar un PR de promoción abierto'
  );
  assert.ok(
    releaseWf.includes('git push -u --force-with-lease origin "$BRANCH"'),
    'Solo la rama bot de promoción puede actualizarse mediante force-with-lease'
  );
  assert.doesNotMatch(
    releaseWf,
    /git push[^\n]*--force(?!-with-lease)/,
    'El workflow no debe usar force push sin lease'
  );

  // REL-001: el tag se crea solo en la fase "tag", sobre el commit de promoción.
  assert.ok(releaseWf.includes('id: state'), 'Debe existir el paso que determina la fase (promote | tag)');
  assert.ok(
    releaseWf.includes("contains(github.event.head_commit.message, 'chore(release): promote')"),
    'El job debe ejecutarse también en el merge del PR de promoción'
  );
  assert.ok(
    releaseWf.includes("steps.state.outputs.phase == 'tag'"),
    'La creación de tag y release debe condicionarse a la fase tag'
  );
  assert.ok(
    releaseWf.includes("steps.state.outputs.phase == 'promote'"),
    'El PR de promoción debe condicionarse a la fase promote'
  );
  assert.ok(
    releaseWf.includes('NEW_TAG: ${{ steps.state.outputs.current_tag }}'),
    'El tag debe derivarse de package.json (versión ya presente en main), no del dry-run'
  );
  assert.ok(
    !releaseWf.includes('tag_name: ${{ steps.tag_version.outputs.new_tag }}'),
    'El GitHub Release no debe anclarse al dry-run sino a la versión vigente en main'
  );
  assert.ok(
    releaseWf.includes('git tag -s -m "Release ${NEW_TAG}" "${NEW_TAG}" "${GITHUB_SHA}"'),
    'El tag debe anclarse explícitamente al commit de promoción (GITHUB_SHA)'
  );
  assert.ok(
    releaseWf.includes('concurrency:'),
    'El workflow debe declarar concurrency para serializar promote y tag'
  );
  assert.ok(
    !releaseWf.includes('if: steps.tag_version.outputs.new_tag\n        env:\n          NEW_TAG: ${{ steps.tag_version.outputs.new_tag }}\n        run: |\n          git config --local user.name'),
    'La creación del tag no debe basarse en steps.tag_version.outputs.new_tag'
  );

  // 2. package.json expone gitops:pin y gitops:pin:check
  const pkgJson = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf-8'));
  assert.ok(pkgJson.scripts['gitops:pin'], 'package.json debe exponer script gitops:pin');
  assert.ok(pkgJson.scripts['gitops:pin:check'], 'package.json debe exponer script gitops:pin:check');

  // 3. Taskfile.yaml expone gitops:pin y gitops:pin:check
  const taskfile = fs.readFileSync(path.join(ROOT_DIR, 'Taskfile.yaml'), 'utf-8');
  assert.ok(taskfile.includes('gitops:pin:'), 'Taskfile.yaml debe exponer tarea gitops:pin');
  assert.ok(taskfile.includes('gitops:pin:check:'), 'Taskfile.yaml debe exponer tarea gitops:pin:check');
});

test('🔒 Release Tagging (REL-003): el changelog corresponde al tag publicado, no al dry-run', () => {
  // El dry-run de github-tag-action calcula la SIGUIENTE versión sobre el rango
  // de commits del ÚLTIMO tag. En la fase `tag` la versión ya está fijada en main
  // (`current_tag`), por lo que usar ese changelog publicaría metadata
  // inconsistente: el tag real y el changelog describirían versiones distintas.
  // GitHub ya genera las release notes correctas a partir de `tag_name`.
  const releaseWf = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/release-tag.yaml'), 'utf8');

  // 1. El paso 3 (dry-run) solo debe ejecutarse en la fase promote.
  const dryRunStep = releaseWf.slice(
    releaseWf.indexOf('Calcular Próxima Versión y Changelog'),
    releaseWf.indexOf('4. Instalar Cosign')
  );
  assert.ok(
    dryRunStep.includes("if: steps.state.outputs.phase == 'promote'"),
    'El dry-run de github-tag-action debe condicionarse a la fase promote (REL-003)'
  );

  // 2. El release no debe usar el changelog del dry-run.
  assert.ok(
    !/body:\s*\$\{\{\s*steps\.tag_version\.outputs\.changelog\s*\}\}/.test(releaseWf),
    'El GitHub Release no debe usar steps.tag_version.outputs.changelog (REL-003)'
  );

  // 3. El release sigue anclado a current_tag y con notas automáticas.
  assert.ok(
    releaseWf.includes('tag_name: ${{ steps.state.outputs.current_tag }}'),
    'El release debe anclarse a la versión vigente en main (current_tag)'
  );
  assert.ok(
    releaseWf.includes('generate_release_notes: true'),
    'El changelog debe generarse con generate_release_notes desde el tag publicado'
  );

  // 4. La fase promote debe conservar el contrato de new_tag para el paso 8.
  assert.ok(
    releaseWf.includes('NEW_TAG: ${{ steps.tag_version.outputs.new_tag }}'),
    'El PR de promoción debe seguir usando new_tag del dry-run'
  );
});
