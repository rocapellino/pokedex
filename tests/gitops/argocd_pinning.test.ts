import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  validateSemVerTag,
  extractTargetRevision,
  replaceTargetRevision,
  checkGitOpsPinParity,
  applyGitOpsPin,
  DEFAULT_GITOPS_APP_FILES,
  checkRootTracksMain,
  ROOT_APP_FILE,
} from '../../scripts/update-gitops-pin.ts';
import { ROOT_DIR } from '../helpers/repo.js';
import { readYaml, workflowJobs, type WorkflowStep } from '../helpers/yaml.js';

const RELEASE_WORKFLOW = '.github/workflows/release-tag.yaml';

/**
 * El workflow de release se verifica parseado: los pasos con su `if`, `env`, `with` y `run` (sin las líneas de shell
 * comentadas). Un texto dentro de un comentario o del nombre de otro paso no cuenta como si el pipeline lo ejecutara.
 */
const releaseWorkflow = () =>
  readYaml<{ permissions?: Record<string, string>; concurrency?: Record<string, unknown> }>(RELEASE_WORKFLOW);
const releaseJob = () => workflowJobs(RELEASE_WORKFLOW)['auto-tag-and-release'];
const releaseSteps = () => releaseJob().steps;

/** El único paso cuyo nombre cumple el patrón; falla si hay cero o varios, para no verificar el equivocado. */
function stepNamed(name: RegExp): WorkflowStep {
  const matches = releaseSteps().filter((step) => name.test(step.name ?? ''));
  assert.equal(matches.length, 1, `se esperaba un único paso ${name}, hay ${matches.length}`);
  return matches[0];
}

/** Todos los scripts `run:` del job, unidos, para comprobar lo que ningún paso concreto debe contener. */
const allScripts = () =>
  releaseSteps()
    .map((step) => step.run ?? '')
    .join('\n');

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

  // Verificar explícitamente los archivos fijados, leyendo el campo del YAML parseado.
  for (const relPath of DEFAULT_GITOPS_APP_FILES) {
    assert.ok(fs.existsSync(path.join(ROOT_DIR, relPath)), `${relPath} debe existir`);
    const application = readYaml<{ spec: { source: { targetRevision: string } } }>(relPath);
    assert.equal(
      application.spec.source.targetRevision,
      parity.canonicalVersion,
      `${relPath} debe tener targetRevision igual a ${parity.canonicalVersion}`,
    );
  }
});

test('🔒 ArgoCD Pinning: applyGitOpsPin ejecuta de forma determinista en dryRun', () => {
  // Tag inalcanzable por un release real: con uno fijo y verosímil el test caía cuando la promoción subía
  // justo a esa versión, porque comprueba que el disco NO quedó en el tag aplicado.
  const unreachableTag = 'v999.999.999';

  const result = applyGitOpsPin({
    tag: unreachableTag,
    dryRun: true,
    targetFiles: DEFAULT_GITOPS_APP_FILES,
    baseDir: ROOT_DIR,
  });

  assert.equal(result.success, true);
  assert.equal(result.newTag, unreachableTag);
  assert.equal(result.updatedFiles.length, 2, 'pre-prod y el blueprint cloud; la raíz sigue main (ADR-003)');

  // Asegurar que en dryRun los archivos en disco NO cambiaron
  const parity = checkGitOpsPinParity(DEFAULT_GITOPS_APP_FILES, ROOT_DIR);
  assert.notEqual(parity.canonicalVersion, unreachableTag, 'Los archivos en disco no deben haber cambiado');
});

test('🚀 ArgoCD Pinning Automation: Workflow release-tag.yaml, package.json y Taskfile.yaml configuran el pipeline de promoción', () => {
  // 1. Workflow release-tag.yaml: permisos y serialización.
  const workflow = releaseWorkflow();
  assert.equal(
    releaseJob().permissions?.['pull-requests'],
    'write',
    'release-tag.yaml debe declarar pull-requests: write en el job que abre el PR de promoción',
  );
  assert.ok(workflow.concurrency?.group, 'El workflow debe declarar concurrency para serializar promote y tag');
  assert.equal(
    workflow.concurrency?.['cancel-in-progress'],
    false,
    'Una corrida de release no debe cancelarse a medias',
  );

  // 2. La promoción: un único PR atómico desde una rama bot, con un commit que impide la recursión.
  const promote = stepNamed(/^8\. Crear Pull Request Atómico/);
  const promoteScript = promote.run ?? '';
  assert.ok(
    promoteScript.includes('update-gitops-pin.ts'),
    'release-tag.yaml debe ejecutar scripts/update-gitops-pin.ts',
  );
  assert.equal(
    allScripts().match(/gh pr create/g)?.length,
    1,
    'release-tag.yaml debe crear exactamente un PR atómico por release',
  );
  assert.ok(promoteScript.includes('gh pr create'), 'La creación del PR pertenece al paso de promoción');
  assert.ok(
    promoteScript.includes('BRANCH="release/promote-${NEW_TAG}"'),
    'La promoción debe usar la rama bot release/promote-vX.Y.Z',
  );
  assert.ok(!allScripts().includes('release/bump-${NEW_TAG}'), 'No debe conservar la rama de bump separada');
  assert.ok(!allScripts().includes('gitops/pin-${NEW_TAG}'), 'No debe conservar la rama GitOps separada');
  assert.ok(
    promoteScript.includes('git add package.json package-lock.json infra/helm/pokedex/Chart.yaml gitops/apps/'),
    'El commit debe preparar conjuntamente metadata (incluido package-lock.json) y manifiestos GitOps',
  );
  assert.ok(
    promoteScript.includes('git commit -m "chore(release): promote ${NEW_TAG} [skip-release]"'),
    'El commit atómico debe impedir recursión ([skip-release])',
  );
  assert.ok(
    promoteScript.includes('--title "chore(release): promote ${NEW_TAG} [skip-release]"'),
    'El título del PR debe impedir recursión con cualquier estrategia de merge',
  );
  assert.ok(
    promoteScript.includes('gh pr list --head "$BRANCH" --state open'),
    'La automatización debe reutilizar un PR de promoción abierto',
  );
  assert.ok(
    promoteScript.includes('git push -u --force-with-lease origin "$BRANCH"'),
    'Solo la rama bot de promoción puede actualizarse mediante force-with-lease',
  );
  assert.doesNotMatch(
    allScripts(),
    /git push[^\n]*--force(?!-with-lease)/,
    'El workflow no debe usar force push sin lease',
  );

  // REL-001: el tag se crea solo en la fase "tag", sobre el commit de promoción.
  const state = stepNamed(/^2\. Determinar Fase del Release/);
  assert.equal(state.id, 'state', 'Debe existir el paso que determina la fase (promote | tag)');
  assert.ok(
    String((readYaml(RELEASE_WORKFLOW) as any).jobs['auto-tag-and-release'].if).includes(
      "contains(github.event.head_commit.message, 'chore(release): promote')",
    ),
    'El job debe ejecutarse también en el merge del PR de promoción',
  );

  const tag = stepNamed(/^6\. Verificar Coherencia 1:1 y Firmar Git Tag/);
  assert.ok(
    tag.if?.includes("steps.state.outputs.phase == 'tag'"),
    'La creación de tag y release debe condicionarse a la fase tag',
  );
  assert.ok(
    promote.if?.includes("steps.state.outputs.phase == 'promote'"),
    'El PR de promoción debe condicionarse a la fase promote',
  );
  assert.equal(
    tag.env?.NEW_TAG,
    '${{ steps.state.outputs.current_tag }}',
    'El tag debe derivarse de package.json (versión ya presente en main), no del dry-run',
  );
  assert.ok(
    !tag.if?.includes('tag_version'),
    'La creación del tag no debe basarse en steps.tag_version.outputs.new_tag',
  );
  assert.ok(
    tag.run?.includes('git tag -s -m "Release ${NEW_TAG}" "${NEW_TAG}" "${GITHUB_SHA}"'),
    'El tag debe anclarse explícitamente al commit de promoción (GITHUB_SHA)',
  );

  const release = stepNamed(/^7\. Crear Release en GitHub/);
  assert.ok(
    !JSON.stringify(release).includes('steps.tag_version.outputs.new_tag'),
    'El GitHub Release no debe anclarse al dry-run sino a la versión vigente en main',
  );

  // 3. package.json expone gitops:pin y gitops:pin:check
  const pkgJson = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf-8'));
  assert.ok(pkgJson.scripts['gitops:pin'], 'package.json debe exponer script gitops:pin');
  assert.ok(pkgJson.scripts['gitops:pin:check'], 'package.json debe exponer script gitops:pin:check');

  // 4. El Taskfile (módulo k8s) expone las tareas y estas invocan el script de promoción.
  const tasks = readYaml<{ tasks: Record<string, { cmds: string[] }> }>('taskfiles/k8s.yaml').tasks;
  for (const name of ['gitops:pin', 'gitops:pin:check']) {
    assert.ok(tasks[name], `Taskfile.yaml debe exponer tarea ${name}`);
    assert.ok(
      tasks[name].cmds.some((cmd) => cmd.includes('scripts/update-gitops-pin.ts')),
      `la tarea ${name} debe ejecutar scripts/update-gitops-pin.ts`,
    );
  }
});

test('🔒 Release Tagging (REL-003): el changelog corresponde al tag publicado, no al dry-run', () => {
  // El dry-run de github-tag-action calcula la SIGUIENTE versión sobre el rango de commits del
  // ÚLTIMO tag. En la fase `tag` la versión ya está fijada en main (`current_tag`), por lo que usar
  // ese changelog publicaría metadata inconsistente: el tag real y el changelog describirían
  // versiones distintas. GitHub ya genera las release notes correctas a partir de `tag_name`.

  // 1. El dry-run solo debe ejecutarse en la fase promote.
  const dryRun = stepNamed(/^3\. Calcular Próxima Versión y Changelog/);
  assert.equal(dryRun.id, 'tag_version');
  assert.equal(
    dryRun.if,
    "steps.state.outputs.phase == 'promote'",
    'El dry-run de github-tag-action debe condicionarse a la fase promote (REL-003)',
  );
  assert.equal(dryRun.with?.dry_run, true, 'El paso de cálculo no debe crear tags por sí mismo');

  // 2. El release no debe usar el changelog del dry-run y sigue anclado a current_tag con notas automáticas.
  const release = stepNamed(/^7\. Crear Release en GitHub/);
  assert.ok(
    !String(release.with?.body ?? '').includes('steps.tag_version.outputs.changelog'),
    'El GitHub Release no debe usar steps.tag_version.outputs.changelog (REL-003)',
  );
  assert.equal(
    release.with?.tag_name,
    '${{ steps.state.outputs.current_tag }}',
    'El release debe anclarse a la versión vigente en main (current_tag)',
  );
  assert.equal(
    release.with?.generate_release_notes,
    true,
    'El changelog debe generarse con generate_release_notes desde el tag publicado',
  );

  // 3. La fase promote debe conservar el contrato de new_tag para el paso 8.
  assert.equal(
    stepNamed(/^8\. Crear Pull Request Atómico/).env?.NEW_TAG,
    '${{ steps.tag_version.outputs.new_tag }}',
    'El PR de promoción debe seguir usando new_tag del dry-run',
  );
});

test('🔒 ADR-003: la Application raíz sigue main para que los promotes lleguen solos al clúster', () => {
  // Regresión (2026-10-04): con la raíz fijada a un tag, ArgoCD leía gitops/apps
  // desde ese tag y nunca veía los nuevos pines; v1.92.1 no llegó a pre-prod hasta
  // reaplicar la raíz a mano.
  assert.equal(checkRootTracksMain(ROOT_DIR), null);
  assert.ok(!DEFAULT_GITOPS_APP_FILES.includes(ROOT_APP_FILE), 'La raíz no debe fijarse a un tag en cada promote');
});
