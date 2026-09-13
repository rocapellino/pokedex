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
    assert.match(content, /ENV GIT_SHA=\$GIT_SHA/, `${name} debe inyectar GIT_SHA en variables de entorno`);
    assert.match(content, /org\.opencontainers\.image\.title=/, `${name} debe contener etiqueta OCI title`);
    assert.match(content, /org\.opencontainers\.image\.source=/, `${name} debe contener etiqueta OCI source`);
    assert.match(content, /org\.opencontainers\.image\.licenses=/, `${name} debe contener etiqueta OCI licenses`);
  }
});

test('🛡️ Supply Chain Security: CI Workflow configura trazabilidad OCI y build-args en build-docker', () => {
  const ciWorkflow = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/ci.yml'), 'utf-8');

  // docker/metadata-action
  assert.match(ciWorkflow, /org\.opencontainers\.image\.title=pokedex-api/, 'Metadata action debe definir org.opencontainers.image.title');
  assert.match(ciWorkflow, /org\.opencontainers\.image\.revision=\${{\s*github\.sha\s*}}/, 'Metadata action debe vincular el commit SHA exacto');
  assert.match(ciWorkflow, /org\.opencontainers\.image\.source=https:\/\/github\.com\/rocapellino\/pokedex/, 'Metadata action debe vincular la URL del repositorio');

  // docker/build-push-action
  assert.match(ciWorkflow, /labels:\s*\${{\s*steps\.meta\.outputs\.labels\s*}}/, 'Build action debe inyectar etiquetas generadas');
  assert.match(ciWorkflow, /GIT_SHA=\${{\s*github\.sha\s*}}/, 'Build action debe pasar GIT_SHA como build-arg');
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
