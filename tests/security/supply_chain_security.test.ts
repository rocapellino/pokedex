import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

test('🛡️ Supply Chain Security: Dockerfile declara etiquetas OCI y argumentos de trazabilidad de build', () => {
  const rootDockerfile = fs.readFileSync(path.join(ROOT_DIR, 'Dockerfile'), 'utf-8');
  const backendDockerfile = fs.readFileSync(path.join(ROOT_DIR, 'apps/backend/Dockerfile'), 'utf-8');

  for (const [name, content] of [['root Dockerfile', rootDockerfile], ['backend Dockerfile', backendDockerfile]]) {
    assert.match(content, /ARG GIT_SHA=/, `${name} debe declarar ARG GIT_SHA`);
    assert.match(content, /ARG APP_VERSION=/, `${name} debe declarar ARG APP_VERSION (VER-002)`);
    // El bloque ENV declara ambos metadatos en líneas separadas (VER-002).
    assert.match(content, /ENV APP_VERSION=\$APP_VERSION/, `${name} debe inyectar APP_VERSION desde su propio ARG (VER-002)`);
    assert.match(content, /^\s+GIT_SHA=\$GIT_SHA$/m, `${name} debe inyectar GIT_SHA en variables de entorno`);
    assert.match(content, /org\.opencontainers\.image\.title=/, `${name} debe contener etiqueta OCI title`);
    assert.match(content, /org\.opencontainers\.image\.source=/, `${name} debe contener etiqueta OCI source`);
    assert.match(content, /org\.opencontainers\.image\.licenses=/, `${name} debe contener etiqueta OCI licenses`);

    // Regresión VER-002: APP_VERSION no debe tomar su valor de GIT_SHA.
    assert.doesNotMatch(
      content,
      /APP_VERSION=\$GIT_SHA/,
      `${name} no debe derivar APP_VERSION de GIT_SHA (conflaría versión y commit en /version)`
    );
  }
});

test('🛡️ Supply Chain Security: CI inyecta APP_VERSION y GIT_SHA como build-args independientes (VER-002)', () => {
  const ciWorkflow = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/ci.yml'), 'utf-8');

  // Ambos build-args deben viajar al docker/build-push-action.
  assert.match(ciWorkflow, /APP_VERSION=\$\{\{\s*steps\.version-metadata\.outputs\.APP_VERSION\s*\}\}/, 'build-args debe inyectar APP_VERSION');
  assert.match(ciWorkflow, /GIT_SHA=\$\{\{\s*steps\.version-metadata\.outputs\.GIT_SHA\s*\}\}/, 'build-args debe inyectar GIT_SHA');

  // APP_VERSION se resuelve desde la SSOT (package.json), nunca desde el SHA.
  assert.match(ciWorkflow, /require\('\.\/package\.json'\)\.version/, 'APP_VERSION debe resolverse desde la SSOT package.json');
  assert.doesNotMatch(
    ciWorkflow,
    /APP_VERSION=\$\{\{\s*github\.sha\s*\}\}/,
    'APP_VERSION no debe derivarse de github.sha (debe ser la versión semántica de la release)'
  );
});

test('🛡️ SEC-001: el binario de Gitsign se verifica antes de instalarse y ejecutarse', () => {
  const releaseWf = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/release-tag.yml'), 'utf-8');

  // 1. Cosign debe estar disponible como verificador de confianza (pin por SHA).
  assert.match(
    releaseWf,
    /sigstore\/cosign-installer@[0-9a-f]{40}/,
    'El workflow debe instalar Cosign con pin por SHA para verificar el binario de Gitsign'
  );

  // 2. Se descarga el bundle de firma junto al binario.
  assert.match(releaseWf, /\$\{BIN_NAME\}\.bundle/, 'Debe descargarse el bundle de firma de Sigstore');
  assert.match(releaseWf, /checksums\.txt/, 'Debe descargarse el manifiesto checksums.txt de Sigstore');

  // 3. Verificación de autenticidad (firma keyless Fulcio + Rekor) con identidad estricta.
  assert.match(releaseWf, /cosign verify-blob/, 'Debe verificar la firma del binario con cosign verify-blob');
  assert.match(
    releaseWf,
    /--certificate-identity "https:\/\/github\.com\/sigstore\/gitsign\/\.github\/workflows\/release\.yml@refs\/tags\/v\$\{GITSIGN_VERSION\}"/,
    'La identidad del certificado debe ser exactamente la del workflow de release de sigstore/gitsign'
  );
  assert.match(
    releaseWf,
    /--certificate-oidc-issuer "https:\/\/token\.actions\.githubusercontent\.com"/,
    'El emisor OIDC esperado debe ser el de GitHub Actions'
  );

  // 4. Verificación de integridad con digests fijados en el repositorio.
  assert.match(
    releaseWf,
    /GITSIGN_SHA256:\s*"[0-9a-f]{64}"/,
    'El digest del binario debe estar fijado en el repositorio'
  );
  assert.match(
    releaseWf,
    /GITSIGN_BUNDLE_SHA256:\s*"[0-9a-f]{64}"/,
    'El digest del bundle debe estar fijado en el repositorio'
  );
  assert.match(releaseWf, /sha256sum/, 'Debe calcular y comparar el SHA-256 del binario descargado');

  // 5. ORDEN CRÍTICA: verificar antes de instalar. Sin esto la verificación es
  // decorativa, porque el binario ya se habría instalado y ejecutado.
  const verifyIdx = releaseWf.indexOf('cosign verify-blob');
  const installIdx = releaseWf.indexOf('sudo install');
  assert.ok(verifyIdx !== -1, 'Debe existir la verificación de firma');
  assert.ok(installIdx !== -1, 'Debe existir la instalación del binario');
  assert.ok(
    verifyIdx < installIdx,
    'La verificación de firma debe ejecutarse ANTES de instalar el binario en el PATH'
  );

  // 6. La verificación no puede ser best-effort.
  assert.doesNotMatch(
    releaseWf,
    /cosign verify-blob[^\n]*\n?[^\n]*\|\|\s*true/,
    'La verificación de Gitsign no debe ser best-effort (|| true)'
  );

  // 7. Se conserva el pin de versión (no se degrada a "latest").
  assert.match(releaseWf, /GITSIGN_VERSION:\s*"\d+\.\d+\.\d+"/, 'Gitsign debe seguir pinneado a una versión exacta');
  assert.doesNotMatch(releaseWf, /gitsign\/releases\/latest/, 'No debe permitirse la descarga de Gitsign desde "latest"');

  // 8. Coherencia versión <-> digests verificada en runtime, sin scripts externos.
  assert.match(
    releaseWf,
    /api\.github\.com\/repos\/sigstore\/gitsign\/releases\/tags\/v\$\{TARGET_VERSION\}/,
    'Debe consultar la API de GitHub para validar los digests de la versión declarada'
  );
  assert.match(releaseWf, /\.assets\[\]\?/, 'Debe extraer los digests de los assets del release');
  assert.match(
    releaseWf,
    /GITSIGN_REFRESH:.*inputs\.gitsign_refresh/,
    'El refresco de digests debe ser explícito y opt-in vía workflow_dispatch'
  );
  // El self-check debe ejecutarse antes de descargar o instalar nada.
  const selfCheckIdx = releaseWf.indexOf('GITSIGN_REFRESH');
  const downloadIdx = releaseWf.indexOf('curl --proto');
  assert.ok(
    selfCheckIdx !== -1 && selfCheckIdx < downloadIdx,
    'El self-check de digests debe ejecutarse antes de descargar el binario'
  );

  // 9. No debe reintroducirse un script externo para esta verificación.
  assert.doesNotMatch(
    releaseWf,
    /scripts\/refresh-gitsign-digests\.ts/,
    'La verificación de digests debe ser inline en el workflow, sin depender de un script externo'
  );
  assert.ok(
    !fs.existsSync(path.join(ROOT_DIR, 'scripts/refresh-gitsign-digests.ts')),
    'No debe existir el script externo de refresco de digests (SEC-001 se resuelve inline)'
  );

  // 10. El modo refresco debe ser alcanzable con independencia de la fase.
  //     Si dependiera solo de `phase == 'tag'`, sería inalcanzable cuando el tag
  //     de la versión actual ya existe (la fase pasa a ser 'promote').
  const stepBlocks = releaseWf.split(/\n\s{6}- name:/).slice(1);
  const gitsignStep = stepBlocks.find((b) => b.includes('GITSIGN_SHA256:'));
  assert.ok(gitsignStep, 'Debe existir el paso de verificación de Gitsign');
  assert.match(
    gitsignStep!,
    /if:[^\n]*inputs\.gitsign_refresh/,
    'El paso de Gitsign debe ejecutarse también en modo refresco, no solo en la fase tag'
  );

  // 11. Ningún paso con efectos secundarios puede correr en modo refresco.
  //      Sin estos guards, pedir "solo refrescar digests" firmaría un tag real
  //      y abriría un PR de promoción.
  const sideEffectSteps = [
    { name: 'firma del tag', marker: 'git tag -s' },
    { name: 'publicación del release', marker: 'action-gh-release' },
    { name: 'apertura del PR de promoción', marker: 'gh pr create' },
  ];
  // Extrae la condición `if:` de un paso, contemplando escalares plegados
  // (`if: >-`), donde la expresión continúa en las líneas siguientes.
  const extractIfCondition = (block: string): string => {
    const lines = block.split('\n');
    const start = lines.findIndex((l) => /^\s+if:/.test(l));
    if (start === -1) return '';
    const first = lines[start];
    if (!/if:\s*[>|]/.test(first)) return first;
    const indent = first.match(/^\s*/)?.[0].length ?? 0;
    const parts = [first];
    for (let i = start + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === '') continue;
      const lineIndent = line.match(/^\s*/)?.[0].length ?? 0;
      if (lineIndent <= indent) break;
      parts.push(line);
    }
    return parts.join(' ');
  };

  for (const { name: stepName, marker } of sideEffectSteps) {
    const block = stepBlocks.find((b) => b.includes(marker));
    assert.ok(block, `Debe existir el paso de ${stepName}`);
    assert.match(
      extractIfCondition(block!),
      /!inputs\.gitsign_refresh/,
      `El paso de ${stepName} debe estar protegido con !inputs.gitsign_refresh`
    );
  }

  // 12. La consulta a la API debe ir autenticada: sin token quedaría sujeta al
  //     rate limit de las IPs compartidas de los runners y bloquearía el release.
  assert.match(
    gitsignStep!,
    /GITHUB_TOKEN:\s*\$\{\{\s*secrets\.GITHUB_TOKEN\s*\}\}/,
    'El paso debe pasar GITHUB_TOKEN para autenticar la consulta a la API de GitHub'
  );
  assert.match(
    gitsignStep!,
    /Authorization: Bearer/,
    'La cabecera de autorización debe construirse con el token del workflow'
  );
});

test('🛡️ Supply Chain Security: CI Workflow configura trazabilidad OCI y build-args en build-docker', () => {
  const ciWorkflow = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/ci.yml'), 'utf-8');

  // docker/metadata-action
  assert.match(ciWorkflow, /org\.opencontainers\.image\.title=pokedex-api/, 'Metadata action debe definir org.opencontainers.image.title');
  assert.match(ciWorkflow, /org\.opencontainers\.image\.revision=\${{\s*github\.sha\s*}}/, 'Metadata action debe vincular el commit SHA exacto');
  assert.match(ciWorkflow, /org\.opencontainers\.image\.source=https:\/\/github\.com\/rocapellino\/pokedex/, 'Metadata action debe vincular la URL del repositorio');

  // docker/build-push-action
  assert.match(ciWorkflow, /labels:\s*\${{\s*steps\.meta\.outputs\.labels\s*}}/, 'Build action debe inyectar etiquetas generadas');
  // VER-002: GIT_SHA se resuelve desde github.sha en el paso de metadatos y
  // viaja como build-arg; el build action ya no lo interpola directamente.
  assert.match(ciWorkflow, /GIT_SHA="\$\{\{\s*github\.sha\s*\}\}"/, 'CI debe resolver GIT_SHA desde github.sha');
  assert.match(ciWorkflow, /GIT_SHA=\$\{\{\s*steps\.version-metadata\.outputs\.GIT_SHA\s*\}\}/, 'Build action debe pasar GIT_SHA como build-arg');
});

test('🛡️ Supply Chain Security: SBOM CycloneDX es obligatorio y validado en CI', () => {
  const ciWorkflow = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/ci.yml'), 'utf-8');

  // Generación y artefacto
  assert.match(ciWorkflow, /format:\s*'cyclonedx'/, 'Trivy debe generar SBOM en formato CycloneDX');
  assert.match(ciWorkflow, /output:\s*'pokedex-sbom\.json'/, 'Trivy debe generar archivo pokedex-sbom.json');
  assert.match(ciWorkflow, /name:\s*sbom-cyclonedx/, 'Debe subir artefacto sbom-cyclonedx');

  // Paso de validación de integridad
  assert.match(ciWorkflow, /test -s pokedex-sbom\.json/, 'Debe validar que el SBOM no esté vacío');
  assert.match(ciWorkflow, /"bomFormat":\s*\*"CycloneDX"/, 'Debe verificar el contrato CycloneDX del SBOM');
});

test('🛡️ Supply Chain Security: Publish job implementa firma Cosign, atestación de SBOM y SLSA Provenance', () => {
  const ciWorkflow = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/ci.yml'), 'utf-8');

  // Permisos requeridos
  assert.match(ciWorkflow, /id-token:\s*write/, 'Publish debe tener permiso id-token: write para Sigstore OIDC');
  assert.match(ciWorkflow, /attestations:\s*write/, 'Publish debe tener permiso attestations: write para GitHub Attestations');

  // Inmutabilidad de Artefactos OCI
  assert.ok(!ciWorkflow.includes('type=raw,value=latest'), 'ci.yml no debe publicar la etiqueta mutable latest para main');
  assert.ok(!ciWorkflow.includes('--all-tags'), 'ci.yml no debe usar docker push --all-tags para evitar publicar tags no validados');
  assert.match(ciWorkflow, /docker buildx imagetools inspect/, 'Publish debe extraer el digest remoto directo del registry OCI');

  // Firma y Atestación por Digest Inmutable
  assert.match(ciWorkflow, /cosign sign --yes .*@\${{\s*steps\.image-digest\.outputs\.digest\s*}}/, 'Publish debe firmar la imagen por digest inmutable');
  assert.match(ciWorkflow, /cosign attach sbom --sbom .*@\${{\s*steps\.image-digest\.outputs\.digest\s*}}/, 'Publish debe adjuntar el SBOM por digest inmutable');
  assert.match(ciWorkflow, /cosign attest --yes --predicate .*@\${{\s*steps\.image-digest\.outputs\.digest\s*}}/, 'Publish debe atestar el SBOM por digest inmutable');

  // Verificación Criptográfica Explícita en CI
  assert.match(ciWorkflow, /cosign verify /, 'Publish debe verificar explícitamente la firma de la imagen');
  assert.match(ciWorkflow, /cosign verify-attestation /, 'Publish debe verificar explícitamente la atestación de SBOM');

  // SLSA Provenance
  assert.match(ciWorkflow, /actions\/attest-build-provenance/, 'Publish debe usar actions/attest-build-provenance para SLSA provenance');
  assert.match(ciWorkflow, /subject-digest:\s*\${{\s*steps\.image-digest\.outputs\.digest\s*}}/, 'SLSA Provenance debe vincular el digest SHA-256 de la imagen');
});

test('🛡️ Supply Chain Security: Política Kyverno verify-image-signature existe y define reglas estrictas', () => {
  const policyPath = path.join(ROOT_DIR, 'infra/k8s/policies/verify-image-signature.yaml');
  assert.ok(fs.existsSync(policyPath), 'verify-image-signature.yaml debe existir en infra/k8s/policies/');

  const policyContent = fs.readFileSync(policyPath, 'utf-8');
  assert.match(policyContent, /kind:\s*ClusterPolicy/, 'Debe ser un ClusterPolicy');
  assert.match(policyContent, /verifyImages:/, 'Debe contener bloque verifyImages');
  assert.match(policyContent, /ghcr\.io\/rocapellino\/\*/, 'Debe aplicar a imágenes de ghcr.io/rocapellino/*');
  assert.match(policyContent, /keyless:/, 'Debe requerir verificación keyless');
  assert.match(policyContent, /issuer:\s*"https:\/\/token\.actions\.githubusercontent\.com"/, 'Debe exigir emisor OIDC de GitHub Actions');
  assert.match(policyContent, /subject:\s*"https:\/\/github\.com\/rocapellino\/pokedex\/\.github\/workflows\/ci\.yml@refs\/heads\/main"/, 'Debe validar el subject exacto del workflow en main');
});

test('🛡️ Supply Chain Security: Manifiestos de GitOps y producción aplican OCI digest pinning inmutable (sha256)', () => {
  const envFiles = [
    'gitops/environments/aws/values.yaml',
    'gitops/environments/proxmox/values.yaml',
    'gitops/environments/proxmox-preprod/values.yaml',
    'infra/helm/pokedex/values.prod.yaml'
  ];

  const sha256Pattern = /digest:\s*"sha256:[a-f0-9]{64}"/g;

  for (const relPath of envFiles) {
    const fullPath = path.join(ROOT_DIR, relPath);
    assert.ok(fs.existsSync(fullPath), `${relPath} debe existir`);
    const content = fs.readFileSync(fullPath, 'utf-8');
    const matches = content.match(sha256Pattern);
    assert.ok(
      matches && matches.length >= 2,
      `${relPath} debe definir digests SHA-256 inmutables para api y web`
    );
  }
});

test('🛡️ Supply Chain Security: Manifiestos de GitOps mantienen paridad estricta inter-entornos y modelan imágenes como digest inmutable único (SSOT)', () => {
  const parseImageDigest = (filePath: string, component: 'api' | 'web'): string => {
    const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/);
    let inComponent = false;
    let inImage = false;
    for (const line of lines) {
      if (line.startsWith(`${component}:`)) {
        inComponent = true;
        inImage = false;
        continue;
      }
      if (inComponent && !line.startsWith(' ') && !line.startsWith('\t') && line.includes(':')) {
        inComponent = false;
        inImage = false;
      }
      if (inComponent && line.trim().startsWith('image:')) {
        inImage = true;
        continue;
      }
      if (inComponent && inImage && line.trim().startsWith('digest:')) {
        const parts = line.split('"');
        if (parts.length >= 2) {
          return parts[1];
        }
      }
    }
    throw new Error(`Debe encontrar sección ${component}.image con digest inmutable en ${filePath}`);
  };

  const assertNoConfusingTag = (filePath: string, component: 'api' | 'web') => {
    const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/);
    let inComponent = false;
    let inImage = false;
    for (const line of lines) {
      if (line.startsWith(`${component}:`)) {
        inComponent = true;
        inImage = false;
        continue;
      }
      if (inComponent && !line.startsWith(' ') && !line.startsWith('\t') && line.includes(':')) {
        inComponent = false;
        inImage = false;
      }
      if (inComponent && line.trim().startsWith('image:')) {
        inImage = true;
        continue;
      }
      if (inComponent && inImage && line.trim().startsWith('tag:')) {
        assert.fail(`${filePath} no debe contener atributo 'tag' redundante para ${component} (SSOT es digest)`);
      }
    }
  };

  const awsPath = path.join(ROOT_DIR, 'gitops/environments/aws/values.yaml');
  const proxmoxPath = path.join(ROOT_DIR, 'gitops/environments/proxmox/values.yaml');
  const prodPath = path.join(ROOT_DIR, 'infra/helm/pokedex/values.prod.yaml');

  // Verificar ausencia de campo tag redundante
  assertNoConfusingTag(awsPath, 'api');
  assertNoConfusingTag(awsPath, 'web');
  assertNoConfusingTag(proxmoxPath, 'api');
  assertNoConfusingTag(proxmoxPath, 'web');
  assertNoConfusingTag(prodPath, 'api');
  assertNoConfusingTag(prodPath, 'web');

  const awsApiDigest = parseImageDigest(awsPath, 'api');
  const proxmoxApiDigest = parseImageDigest(proxmoxPath, 'api');
  const prodApiDigest = parseImageDigest(prodPath, 'api');

  const awsWebDigest = parseImageDigest(awsPath, 'web');
  const proxmoxWebDigest = parseImageDigest(proxmoxPath, 'web');
  const prodWebDigest = parseImageDigest(prodPath, 'web');

  // 1. Paridad estricta inter-entornos para API por digest
  assert.strictEqual(awsApiDigest, proxmoxApiDigest, 'Digest de api debe ser idéntico entre AWS y Proxmox');
  assert.strictEqual(awsApiDigest, prodApiDigest, 'Digest de api debe ser idéntico entre AWS y Prod');

  // 2. Paridad estricta inter-entornos para Web por digest
  assert.strictEqual(awsWebDigest, proxmoxWebDigest, 'Digest de web debe ser idéntico entre AWS y Proxmox');
  assert.strictEqual(awsWebDigest, prodWebDigest, 'Digest de web debe ser idéntico entre AWS y Prod');

  // 3. Diferenciación de digests entre servicios (previene copy-paste cruzado)
  assert.notStrictEqual(awsApiDigest, awsWebDigest, 'Los digests de api y web deben ser distintos');

  // 4. Formato estricto sha256
  assert.match(awsApiDigest, /^sha256:[a-f0-9]{64}$/, 'Digest de api debe ser un hash sha256 válido');
  assert.match(awsWebDigest, /^sha256:[a-f0-9]{64}$/, 'Digest de web debe ser un hash sha256 válido');
});

test('🛡️ Supply Chain Security: CI Workflow valida consistencia de digests (CI Published == GitOps Pinning == Cosign Signed)', () => {
  const ciWorkflow = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/ci.yml'), 'utf-8');

  assert.match(ciWorkflow, /Validar consistencia .* de Digest/, 'Publish debe tener un paso explícito de validación de consistencia de digests');
  assert.match(ciWorkflow, /verify-image-digest-parity\.ts/, 'Debe invocar el script canónico de verificación de paridad Helm AST');
  assert.match(ciWorkflow, /cosign sign --yes .*@\${{\s*steps\.image-digest\.outputs\.digest\s*}}/, 'Cosign debe firmar exactamente el digest validado');
});
