import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { ROOT_DIR } from '../helpers/repo.js';
import { workflowJobs, type WorkflowStep } from '../helpers/yaml.js';

const yamlSafeLoad = (yaml as unknown as { load: typeof yaml.load }).load ?? yaml.load;

const RELEASE_WORKFLOW = '.github/workflows/release-tag.yaml';

/** Pasos del job de release, ya parseados y con los `run:` sin las líneas de shell comentadas. */
const releaseSteps = (): WorkflowStep[] => workflowJobs(RELEASE_WORKFLOW)['auto-tag-and-release'].steps;

/** El único paso que cumple el predicado; falla si hay cero o varios, para no verificar el equivocado. */
function singleStep(description: string, predicate: (step: WorkflowStep) => boolean): WorkflowStep {
  const matches = releaseSteps().filter(predicate);
  assert.equal(matches.length, 1, `Se esperaba un único paso de ${description}, hay ${matches.length}`);
  return matches[0];
}

test('🛡️ SEC-001: el binario de Gitsign se verifica antes de instalarse y ejecutarse', () => {
  const steps = releaseSteps();
  const allScripts = steps.map((step) => step.run ?? '').join('\n');

  // 1. Cosign debe estar disponible como verificador de confianza (pin por SHA).
  assert.ok(
    steps.some((step) => /^sigstore\/cosign-installer@[0-9a-f]{40}$/.test(step.uses ?? '')),
    'El workflow debe instalar Cosign con pin por SHA para verificar el binario de Gitsign',
  );

  const gitsign = singleStep('verificación de Gitsign', (step) => Boolean(step.env?.GITSIGN_SHA256));
  const script = gitsign.run ?? '';

  // 2. Se descarga el bundle de firma junto al binario.
  assert.match(script, /\$\{BIN_NAME\}\.bundle/, 'Debe descargarse el bundle de firma de Sigstore');
  assert.match(script, /checksums\.txt/, 'Debe descargarse el manifiesto checksums.txt de Sigstore');

  // 3. Verificación de autenticidad (firma keyless Fulcio + Rekor) con identidad estricta.
  assert.match(script, /cosign verify-blob/, 'Debe verificar la firma del binario con cosign verify-blob');
  assert.match(
    script,
    /--certificate-identity "https:\/\/github\.com\/sigstore\/gitsign\/\.github\/workflows\/release\.yml@refs\/tags\/v\$\{GITSIGN_VERSION\}"/,
    'La identidad del certificado debe ser exactamente la del workflow de release de sigstore/gitsign',
  );
  assert.match(
    script,
    /--certificate-oidc-issuer "https:\/\/token\.actions\.githubusercontent\.com"/,
    'El emisor OIDC esperado debe ser el de GitHub Actions',
  );

  // 4. Verificación de integridad con digests fijados en el repositorio (variables de entorno del paso).
  for (const variable of ['GITSIGN_SHA256', 'GITSIGN_BUNDLE_SHA256', 'GITSIGN_CHECKSUMS_SHA256']) {
    assert.match(
      String(gitsign.env?.[variable]),
      /^[0-9a-f]{64}$/,
      `${variable} debe estar fijado en el repositorio como un SHA-256`,
    );
  }
  assert.match(script, /sha256sum/, 'Debe calcular y comparar el SHA-256 del binario descargado');

  // 5. ORDEN CRÍTICA: verificar antes de instalar. Sin esto la verificación es
  // decorativa, porque el binario ya se habría instalado y ejecutado.
  const verifyIdx = script.indexOf('cosign verify-blob');
  const installIdx = script.indexOf('sudo install');
  assert.ok(verifyIdx !== -1, 'Debe existir la verificación de firma');
  assert.ok(installIdx !== -1, 'Debe existir la instalación del binario');
  assert.ok(verifyIdx < installIdx, 'La verificación de firma debe ejecutarse ANTES de instalar el binario en el PATH');

  // 6. La verificación no puede ser best-effort: ni `|| true` ni `set +e` en el paso.
  // El comando ocupa varias líneas unidas con `\`: se une antes de buscar un `||` que lo vuelva best-effort.
  const verifyCommand = script.replace(/\\\r?\n\s*/g, ' ').match(/cosign verify-blob[^\n]*/)?.[0] ?? '';
  assert.ok(verifyCommand, 'Debe existir el comando de verificación de firma');
  assert.doesNotMatch(
    verifyCommand,
    /\|\||;\s*true|\s&\s*$/,
    'La verificación de Gitsign no debe ser best-effort (|| true)',
  );
  assert.match(script, /^set -euo pipefail$/m, 'El paso debe abortar ante el primer error (set -euo pipefail)');

  // 7. Se conserva el pin de versión (no se degrada a "latest").
  assert.match(
    String(gitsign.env?.GITSIGN_VERSION),
    /^\d+\.\d+\.\d+$/,
    'Gitsign debe seguir pinneado a una versión exacta',
  );
  assert.doesNotMatch(
    allScripts,
    /gitsign\/releases\/latest/,
    'No debe permitirse la descarga de Gitsign desde "latest"',
  );

  // 8. Coherencia versión <-> digests verificada en runtime, sin scripts externos.
  assert.match(
    script,
    /api\.github\.com\/repos\/sigstore\/gitsign\/releases\/tags\/v\$\{TARGET_VERSION\}/,
    'Debe consultar la API de GitHub para validar los digests de la versión declarada',
  );
  assert.match(script, /\.assets\[\]\?/, 'Debe extraer los digests de los assets del release');
  assert.match(
    String(gitsign.env?.GITSIGN_REFRESH),
    /inputs\.gitsign_refresh/,
    'El refresco de digests debe ser explícito y opt-in vía workflow_dispatch',
  );
  // El modo refresco (self-check) debe resolverse antes de descargar el binario.
  const refreshBranchIdx = script.indexOf('if [ "${GITSIGN_REFRESH:-false}" = "true" ]');
  const downloadIdx = script.indexOf('-o "${STAGE}/gitsign"');
  assert.ok(
    refreshBranchIdx !== -1 && downloadIdx !== -1 && refreshBranchIdx < downloadIdx,
    'El self-check de digests debe ejecutarse antes de descargar el binario',
  );

  // 9. No debe reintroducirse un script externo para esta verificación.
  assert.doesNotMatch(
    allScripts,
    /scripts\/refresh-gitsign-digests\.ts/,
    'La verificación de digests debe ser inline en el workflow, sin depender de un script externo',
  );
  assert.ok(
    !fs.existsSync(path.join(ROOT_DIR, 'scripts/refresh-gitsign-digests.ts')),
    'No debe existir el script externo de refresco de digests (SEC-001 se resuelve inline)',
  );

  // 10. El modo refresco debe ser alcanzable con independencia de la fase.
  //     Si dependiera solo de `phase == 'tag'`, sería inalcanzable cuando el tag
  //     de la versión actual ya existe (la fase pasa a ser 'promote').
  assert.match(
    gitsign.if ?? '',
    /inputs\.gitsign_refresh/,
    'El paso de Gitsign debe ejecutarse también en modo refresco, no solo en la fase tag',
  );

  // 11. Ningún paso con efectos secundarios puede correr en modo refresco.
  //      Sin estos guards, pedir "solo refrescar digests" firmaría un tag real
  //      y abriría un PR de promoción.
  const sideEffectSteps = [
    { name: 'firma del tag', step: singleStep('firma del tag', (s) => (s.run ?? '').includes('git tag -s')) },
    {
      name: 'publicación del release',
      step: singleStep('publicación del release', (s) => (s.uses ?? '').startsWith('softprops/action-gh-release@')),
    },
    {
      name: 'apertura del PR de promoción',
      step: singleStep('apertura del PR de promoción', (s) => (s.run ?? '').includes('gh pr create')),
    },
  ];
  for (const { name: stepName, step } of sideEffectSteps) {
    assert.match(
      step.if ?? '',
      /!inputs\.gitsign_refresh/,
      `El paso de ${stepName} debe estar protegido con !inputs.gitsign_refresh`,
    );
  }

  // 12. La consulta a la API debe ir autenticada: sin token quedaría sujeta al
  //     rate limit de las IPs compartidas de los runners y bloquearía el release.
  assert.match(
    String(gitsign.env?.GITHUB_TOKEN),
    /^\$\{\{\s*secrets\.GITHUB_TOKEN\s*\}\}$/,
    'El paso debe pasar GITHUB_TOKEN para autenticar la consulta a la API de GitHub',
  );
  assert.match(
    script,
    /Authorization: Bearer/,
    'La cabecera de autorización debe construirse con el token del workflow',
  );
});

test('🔒 SEC-001: los hooks de pre-commit se fijan por SHA, no por tag mutable', () => {
  const raw = fs.readFileSync(path.join(ROOT_DIR, '.pre-commit-config.yaml'), 'utf-8');
  // Los hooks `local` ejecutan herramientas ya fijadas por package-lock.json y no tienen `rev`.
  const config = (yamlSafeLoad(raw) as { repos: { repo: string; rev: string }[] }).repos.filter(
    (entry) => entry.repo !== 'local',
  );

  assert.ok(config.length >= 3, 'Debe declararse al menos un repo de hooks');

  for (const entry of config) {
    assert.match(
      entry.rev,
      /^[a-f0-9]{40}$/,
      `${entry.repo} debe fijarse por SHA de commit de 40 caracteres (SEC-001), no por tag`,
    );
    // El tag legible se conserva en comentario para trazabilidad (un comentario no sobrevive al parseo).
    assert.match(
      raw,
      new RegExp(`rev:\\s*${entry.rev}\\s*#\\s*v\\S+`),
      `${entry.repo} debe conservar el tag en comentario junto al SHA`,
    );
  }
});

test('🧹 CLEAN-001: las allowlist de Terraform historico quedan justificadas', () => {
  const raw = fs.readFileSync(path.join(ROOT_DIR, '.gitleaks.toml'), 'utf-8');

  // Las reglas de infra/terraform/ se conservan a proposito (protegen el
  // historial) y deben estar comentadas para que no parezca residuo.
  assert.match(
    raw,
    /infra\/terraform\/\.\*\/\(variables\|outputs\)/,
    'Debe conservarse la allowlist historica de Terraform',
  );
  assert.match(raw, /CLEAN-001/, 'La allowlist historica debe referenciar CLEAN-001 y su justificacion');
  assert.match(raw, /infra\/opentofu/, 'Debe mantenerse la allowlist vigente de OpenTofu');
});

test('🔒 SEC-002: la exclusion de Semgrep sobre infra/ esta justificada', () => {
  const raw = fs.readFileSync(path.join(ROOT_DIR, '.semgrepignore'), 'utf-8');

  assert.match(raw, /^infra\/$/m, 'La exclusion de infra/ debe mantenerse');
  assert.match(raw, /SEC-002/, 'La exclusion debe documentar el analisis SEC-002 y el motivo de mantenerla');
  // La justificacion debe apoyarse en la ausencia de codigo de aplicacion.
  assert.match(
    raw,
    /No hay\s*\n?#?\s*ningun archivo \.ts/,
    'La exclusion debe explicar que infra/ no contiene codigo de aplicacion',
  );
});
