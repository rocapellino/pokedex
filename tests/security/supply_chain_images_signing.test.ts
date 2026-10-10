/**
 * Cadena de suministro de imágenes: trazabilidad OCI, SBOM, firma Cosign, atestaciones y digest pinning.
 *
 * `ci.yaml` y las políticas de Kyverno se verifican sobre pasos y recursos parseados (con los comentarios de shell
 * eliminados), no sobre el texto: un `cosign sign` comentado, o un `latest` que solo aparece en un comentario, no
 * cuentan como lo que el pipeline realmente ejecuta.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR } from '../helpers/repo.js';
import { type WorkflowStep, readYaml, workflowJobs } from '../helpers/yaml.js';

const CI = '.github/workflows/ci.yaml';
const REPO_URL = 'https://github.com/rocapellino/pokedex';
const GITHUB_OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
const SIGNER_SUBJECT = `${REPO_URL}/.github/workflows/ci.yaml@refs/heads/main`;

const jobs = () => workflowJobs(CI);
const buildSteps = () => jobs()['build-docker'].steps;
const publishSteps = () => jobs().publish.steps;
const usesAction = (step: WorkflowStep, action: string) => String(step.uses ?? '').startsWith(`${action}@`);
const stepIndex = (steps: WorkflowStep[], predicate: (step: WorkflowStep) => boolean) => steps.findIndex(predicate);
/** Líneas `clave=valor` de un campo multilínea de una acción (`labels`, `build-args`). */
const keyValueLines = (value: unknown): Record<string, string> =>
  Object.fromEntries(
    String(value ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
  );

/** Las instrucciones de un Dockerfile, sin comentarios. */
const dockerfileInstructions = (relPath: string) =>
  fs
    .readFileSync(path.join(ROOT_DIR, relPath), 'utf-8')
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n');

test('🛡️ Supply Chain Security: Dockerfile declara etiquetas OCI y argumentos de trazabilidad de build', () => {
  const backendDockerfile = dockerfileInstructions('apps/backend/Dockerfile');

  assert.match(backendDockerfile, /ARG GIT_SHA=/, 'backend Dockerfile debe declarar ARG GIT_SHA');
  assert.match(backendDockerfile, /ARG APP_VERSION=/, 'backend Dockerfile debe declarar ARG APP_VERSION (VER-002)');
  // El bloque ENV declara ambos metadatos en líneas separadas (VER-002).
  assert.match(
    backendDockerfile,
    /ENV APP_VERSION=\$APP_VERSION/,
    'backend Dockerfile debe inyectar APP_VERSION desde su propio ARG (VER-002)',
  );
  assert.match(
    backendDockerfile,
    /^\s+GIT_SHA=\$GIT_SHA$/m,
    'backend Dockerfile debe inyectar GIT_SHA en variables de entorno',
  );
  for (const label of ['title', 'source', 'licenses']) {
    assert.match(
      backendDockerfile,
      new RegExp(`org\\.opencontainers\\.image\\.${label}=`),
      `backend Dockerfile debe contener etiqueta OCI ${label}`,
    );
  }

  // Regresión VER-002: APP_VERSION no debe tomar su valor de GIT_SHA.
  assert.doesNotMatch(
    backendDockerfile,
    /APP_VERSION=\$GIT_SHA/,
    'backend Dockerfile no debe derivar APP_VERSION de GIT_SHA (conflaría versión y commit en /version)',
  );
});

test('🛡️ Supply Chain Security: CI inyecta APP_VERSION y GIT_SHA como build-args independientes (VER-002)', () => {
  const steps = buildSteps();
  const resolve = steps.find((s) => s.id === 'version-metadata');
  assert.ok(resolve?.run, 'build-docker debe resolver los metadatos de versión en el paso version-metadata');
  // APP_VERSION se resuelve desde la SSOT (package.json), nunca desde el SHA.
  assert.match(resolve.run, /APP_VERSION="\$\(node -p "require\('\.\/package\.json'\)\.version"\)"/);
  assert.match(resolve.run, /GIT_SHA="\$\{\{\s*github\.sha\s*\}\}"/, 'GIT_SHA debe resolverse desde github.sha');

  // Ambos build-args viajan al build, cada uno desde su propia salida.
  const build = steps.find((s) => usesAction(s, 'docker/build-push-action'));
  assert.ok(build, 'build-docker debe usar docker/build-push-action');
  const buildArgs = keyValueLines(build.with?.['build-args']);
  assert.equal(buildArgs.APP_VERSION, '${{ steps.version-metadata.outputs.APP_VERSION }}');
  assert.equal(buildArgs.GIT_SHA, '${{ steps.version-metadata.outputs.GIT_SHA }}');

  // Ningún build del workflow puede derivar APP_VERSION de github.sha (debe ser la versión semántica de la release).
  const allBuildArgs = Object.values(jobs())
    .flatMap((job) => job.steps)
    .map((s) => keyValueLines(s.with?.['build-args']).APP_VERSION)
    .filter(Boolean);
  assert.ok(allBuildArgs.length > 0);
  assert.ok(
    allBuildArgs.every((value) => !/github\.sha/.test(value)),
    'APP_VERSION no debe derivarse de github.sha',
  );
});

test('🛡️ Supply Chain Security: CI Workflow configura trazabilidad OCI y build-args en build-docker', () => {
  const steps = buildSteps();
  const meta = steps.find((s) => s.id === 'meta');
  assert.ok(
    meta && usesAction(meta, 'docker/metadata-action'),
    'build-docker debe generar metadatos con docker/metadata-action',
  );

  // El título lo aporta la matriz (pokedex-api / pokedex-web): contracts/delivery/image_publication_contract.test.ts
  // verifica que ambas entradas existan.
  const labels = keyValueLines(meta.with?.labels);
  assert.equal(labels['org.opencontainers.image.title'], '${{ matrix.image }}');
  assert.equal(labels['org.opencontainers.image.revision'], '${{ github.sha }}', 'debe vincular el commit SHA exacto');
  assert.equal(labels['org.opencontainers.image.source'], REPO_URL, 'debe vincular la URL del repositorio');

  // El build usa las etiquetas generadas.
  const build = steps.find((s) => usesAction(s, 'docker/build-push-action'));
  assert.equal(
    build?.with?.labels,
    '${{ steps.meta.outputs.labels }}',
    'el build debe inyectar las etiquetas generadas',
  );
});

test('🛡️ Supply Chain Security: SBOM CycloneDX es obligatorio y validado en CI', () => {
  const steps = jobs()['trivy-scan'].steps;

  // Generación y artefacto
  const generate = stepIndex(
    steps,
    (s) => usesAction(s, 'aquasecurity/trivy-action') && s.with?.format === 'cyclonedx',
  );
  assert.ok(generate >= 0, 'Trivy debe generar SBOM en formato CycloneDX');
  assert.equal(steps[generate].with?.output, 'pokedex-sbom.json', 'Trivy debe generar archivo pokedex-sbom.json');

  const upload = stepIndex(
    steps,
    (s) => usesAction(s, 'actions/upload-artifact') && s.with?.path === 'pokedex-sbom.json',
  );
  assert.ok(upload >= 0, 'Debe subir el SBOM como artefacto');
  assert.match(String(steps[upload].with?.name), /^sbom-cyclonedx-/, 'Debe subir artefacto sbom-cyclonedx');

  // Paso de validación de integridad, posterior a la generación
  const validate = stepIndex(steps, (s) => /test -s pokedex-sbom\.json/.test(s.run ?? ''));
  assert.ok(validate > generate, 'Debe validar que el SBOM no esté vacío, después de generarlo');
  assert.match(
    steps[validate].run ?? '',
    /"bomFormat": \*"CycloneDX"/,
    'Debe verificar el contrato CycloneDX del SBOM',
  );
});

test('🛡️ Supply Chain Security: Publish job implementa firma Cosign, atestación de SBOM y SLSA Provenance', () => {
  const publish = jobs().publish;
  const steps = publish.steps;
  const scripts = steps.flatMap((s) => (s.run ? [s.run] : []));

  // Permisos requeridos
  assert.equal(
    publish.permissions?.['id-token'],
    'write',
    'Publish debe tener permiso id-token: write para Sigstore OIDC',
  );
  assert.equal(
    publish.permissions?.attestations,
    'write',
    'Publish debe tener permiso attestations: write para GitHub Attestations',
  );

  // Inmutabilidad de Artefactos OCI
  const tags = String(buildSteps().find((s) => s.id === 'meta')?.with?.tags ?? '');
  assert.ok(!tags.includes('type=raw,value=latest'), 'ci.yaml no debe publicar la etiqueta mutable latest para main');
  assert.ok(
    !Object.values(jobs()).some((job) => job.steps.some((s) => (s.run ?? '').includes('--all-tags'))),
    'ci.yaml no debe usar docker push --all-tags para evitar publicar tags no validados',
  );

  // El digest se extrae del registry OCI y se valida antes de publicarlo como output.
  const digestStep = steps.find((s) => s.id === 'image-digest');
  assert.ok(digestStep?.run, 'Publish debe extraer el digest remoto del registry OCI');
  assert.match(digestStep.run, /docker buildx imagetools inspect/);
  assert.match(
    digestStep.run,
    /\[\[ "\$DIGEST" =~ \^sha256:\[a-f0-9\]\{64\}\$ \]\]/,
    'El paso image-digest debe validar el formato sha256:<64 hex> antes de publicarlo como output',
  );

  // Firma y atestación: cada paso recibe el digest validado por env y opera siempre por digest, nunca por tag.
  const digestOutput = '${{ steps.image-digest.outputs.digest }}';
  for (const command of ['cosign sign --yes', 'cosign attach sbom', 'cosign attest --yes']) {
    const step = steps.find((s) => (s.run ?? '').includes(command) && (s.run ?? '').includes('${IMAGE_REF}'));
    assert.ok(step, `Publish debe ejecutar \`${command}\` sobre la imagen`);
    assert.equal(
      step.env?.IMAGE_DIGEST,
      digestOutput,
      `\`${command}\` debe recibir el digest validado por env (IMAGE_DIGEST)`,
    );
    assert.match(
      step.run ?? '',
      /"\$\{IMAGE_REF\}@\$\{IMAGE_DIGEST\}"/,
      `\`${command}\` debe operar por digest inmutable`,
    );
  }
  const cosignWrites = scripts
    .flatMap((script) => script.split('\n'))
    .filter((line) => /cosign (sign|attach|attest)\b/.test(line));
  assert.ok(
    cosignWrites.every((line) => /@\$\{(IMAGE|CHART)_DIGEST\}/.test(line)),
    'Ninguna firma, SBOM o atestación de Cosign puede apuntar a un tag mutable',
  );

  // Verificación criptográfica explícita, posterior a la firma y a la atestación.
  const sign = stepIndex(steps, (s) => /cosign sign --yes/.test(s.run ?? '') && (s.run ?? '').includes('${IMAGE_REF}'));
  const attest = stepIndex(steps, (s) => /cosign attest --yes/.test(s.run ?? ''));
  const verify = stepIndex(
    steps,
    (s) => /cosign verify /.test(s.run ?? '') && /cosign verify-attestation /.test(s.run ?? ''),
  );
  assert.ok(verify >= 0, 'Publish debe verificar explícitamente la firma de la imagen y la atestación de SBOM');
  assert.ok(verify > sign && verify > attest, 'La verificación debe ejecutarse después de firmar y atestar');

  // SLSA Provenance sobre el digest de la imagen
  const provenance = steps.find((s) => usesAction(s, 'actions/attest-build-provenance'));
  assert.ok(provenance, 'Publish debe usar actions/attest-build-provenance para SLSA provenance');
  assert.equal(
    provenance.with?.['subject-digest'],
    digestOutput,
    'SLSA Provenance debe vincular el digest de la imagen',
  );
});

test('🛡️ Supply Chain Security: Política Kyverno verify-image-signature existe y define reglas estrictas', () => {
  const policyPath = 'infra/k8s/policies/verify-image-signature.yaml';
  assert.ok(
    fs.existsSync(path.join(ROOT_DIR, policyPath)),
    'verify-image-signature.yaml debe existir en infra/k8s/policies/',
  );

  /** Entradas `keyless` de todas las reglas `verifyImages` de una política. */
  const keylessEntries = (policy: any) =>
    (policy.spec.rules as any[])
      .flatMap((rule) => rule.verifyImages ?? [])
      .flatMap((verify) => (verify.attestors ?? []).flatMap((a: any) => a.entries ?? []))
      .map((entry) => entry.keyless);

  // Política amplia de gobernanza (Audit) y política autoritativa de la aplicación (Enforce): mismo emisor y sujeto.
  for (const [file, action] of [
    [policyPath, 'Audit'],
    ['infra/k8s/kyverno-cosign-policy.yaml', 'Enforce'],
  ] as const) {
    const policy = readYaml(file);
    assert.equal(policy.kind, 'ClusterPolicy', `${file} debe ser un ClusterPolicy`);
    assert.equal(policy.spec.validationFailureAction, action, `${file} debe operar en modo ${action}`);

    const verify = (policy.spec.rules as any[]).flatMap((rule) => rule.verifyImages ?? []);
    assert.ok(verify.length > 0, `${file} debe contener bloque verifyImages`);
    assert.ok(
      verify.every((v) => v.imageReferences.every((ref: string) => ref.startsWith('ghcr.io/rocapellino/'))),
      `${file} solo debe aplicar a imágenes de ghcr.io/rocapellino/`,
    );

    const keyless = keylessEntries(policy);
    assert.ok(keyless.length > 0, `${file} debe requerir verificación keyless`);
    for (const entry of keyless) {
      assert.equal(entry.issuer, GITHUB_OIDC_ISSUER, `${file} debe exigir el emisor OIDC de GitHub Actions`);
      assert.equal(entry.subject, SIGNER_SUBJECT, `${file} debe validar el subject exacto del workflow en main`);
    }
  }
  assert.ok(fs.existsSync(path.join(ROOT_DIR, CI)), 'el workflow firmante del subject (ci.yaml) debe existir');
  assert.deepEqual(
    readYaml(policyPath).spec.rules[0].verifyImages[0].imageReferences,
    ['ghcr.io/rocapellino/*'],
    'Debe aplicar a imágenes de ghcr.io/rocapellino/*',
  );
});

/** Digest y tag de `api.image` / `web.image` en un archivo de values. */
function pinnedImages(relPath: string): Record<'api' | 'web', { digest?: string; tag?: string }> {
  const values = readYaml(relPath);
  return { api: values.api?.image ?? {}, web: values.web?.image ?? {} };
}

const PINNED_ENVS = [
  // ADR-030: proxmox y proxmox-preprod se despliegan; `cloud` + `values.prod.yaml`
  // forman el blueprint inactivo de prod, que la promoción mantiene fijado.
  'gitops/environments/cloud/values.yaml',
  'gitops/environments/proxmox-preprod/values.yaml',
  'infra/helm/pokedex/values.prod.yaml',
];

test('🛡️ Supply Chain Security: los manifiestos de GitOps y el perfil de referencia aplican OCI digest pinning inmutable (sha256)', () => {
  for (const relPath of PINNED_ENVS) {
    const images = pinnedImages(relPath);
    for (const component of ['api', 'web'] as const) {
      assert.match(
        images[component].digest ?? '',
        /^sha256:[a-f0-9]{64}$/,
        `${relPath} debe definir un digest SHA-256 inmutable para ${component}`,
      );
    }
  }
});

test('🛡️ Supply Chain Security: Manifiestos de GitOps mantienen paridad estricta inter-entornos y modelan imágenes como digest inmutable único (SSOT)', () => {
  const [cloud, preprod, prod] = PINNED_ENVS.map(pinnedImages);

  for (const [relPath, images] of PINNED_ENVS.map((p, i) => [p, [cloud, preprod, prod][i]] as const)) {
    for (const component of ['api', 'web'] as const) {
      assert.equal(
        images[component].tag,
        undefined,
        `${relPath} no debe contener atributo 'tag' redundante para ${component} (SSOT es digest)`,
      );
    }
  }

  // 1 y 2. Paridad estricta inter-entornos por digest
  for (const component of ['api', 'web'] as const) {
    assert.strictEqual(
      cloud[component].digest,
      preprod[component].digest,
      `Digest de ${component} debe ser idéntico entre Cloud y Proxmox Pre-prod`,
    );
    assert.strictEqual(
      cloud[component].digest,
      prod[component].digest,
      `Digest de ${component} debe ser idéntico entre Cloud y Prod`,
    );
  }

  // 3. Diferenciación de digests entre servicios (previene copy-paste cruzado)
  assert.notStrictEqual(cloud.api.digest, cloud.web.digest, 'Los digests de api y web deben ser distintos');
});

test('🛡️ Supply Chain Security: CI Workflow valida consistencia de digests (CI Published == GitOps Pinning == Cosign Signed)', () => {
  const steps = publishSteps();

  const parity = stepIndex(steps, (s) => /verify-image-digest-parity\.ts\s+--strict/.test(s.run ?? ''));
  assert.ok(parity >= 0, 'Debe invocar el script canónico de verificación de paridad Helm AST en modo estricto');
  assert.match(String(steps[parity].name), /Validar consistencia .* de Digest/);

  const sign = stepIndex(steps, (s) => /cosign sign --yes .*@\$\{IMAGE_DIGEST\}/.test(s.run ?? ''));
  assert.ok(sign >= 0, 'Cosign debe firmar exactamente el digest validado');
  assert.ok(parity < sign, 'La paridad de digests debe validarse antes de firmar');
});
