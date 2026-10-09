import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const yamlSafeLoad = (yaml as unknown as { load: typeof yaml.load }).load ?? yaml.load;
const __filename = fileURLToPath(import.meta.url);

const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

test('🛡️ SEC-001: el binario de Gitsign se verifica antes de instalarse y ejecutarse', () => {
  const releaseWf = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/release-tag.yaml'), 'utf-8');

  // 1. Cosign debe estar disponible como verificador de confianza (pin por SHA).
  assert.match(
    releaseWf,
    /sigstore\/cosign-installer@[0-9a-f]{40}/,
    'El workflow debe instalar Cosign con pin por SHA para verificar el binario de Gitsign',
  );

  // 2. Se descarga el bundle de firma junto al binario.
  assert.match(releaseWf, /\$\{BIN_NAME\}\.bundle/, 'Debe descargarse el bundle de firma de Sigstore');
  assert.match(releaseWf, /checksums\.txt/, 'Debe descargarse el manifiesto checksums.txt de Sigstore');

  // 3. Verificación de autenticidad (firma keyless Fulcio + Rekor) con identidad estricta.
  assert.match(releaseWf, /cosign verify-blob/, 'Debe verificar la firma del binario con cosign verify-blob');
  assert.match(
    releaseWf,
    /--certificate-identity "https:\/\/github\.com\/sigstore\/gitsign\/\.github\/workflows\/release\.yml@refs\/tags\/v\$\{GITSIGN_VERSION\}"/,
    'La identidad del certificado debe ser exactamente la del workflow de release de sigstore/gitsign',
  );
  assert.match(
    releaseWf,
    /--certificate-oidc-issuer "https:\/\/token\.actions\.githubusercontent\.com"/,
    'El emisor OIDC esperado debe ser el de GitHub Actions',
  );

  // 4. Verificación de integridad con digests fijados en el repositorio.
  assert.match(
    releaseWf,
    /GITSIGN_SHA256:\s*"[0-9a-f]{64}"/,
    'El digest del binario debe estar fijado en el repositorio',
  );
  assert.match(
    releaseWf,
    /GITSIGN_BUNDLE_SHA256:\s*"[0-9a-f]{64}"/,
    'El digest del bundle debe estar fijado en el repositorio',
  );
  assert.match(releaseWf, /sha256sum/, 'Debe calcular y comparar el SHA-256 del binario descargado');

  // 5. ORDEN CRÍTICA: verificar antes de instalar. Sin esto la verificación es
  // decorativa, porque el binario ya se habría instalado y ejecutado.
  const verifyIdx = releaseWf.indexOf('cosign verify-blob');
  const installIdx = releaseWf.indexOf('sudo install');
  assert.ok(verifyIdx !== -1, 'Debe existir la verificación de firma');
  assert.ok(installIdx !== -1, 'Debe existir la instalación del binario');
  assert.ok(verifyIdx < installIdx, 'La verificación de firma debe ejecutarse ANTES de instalar el binario en el PATH');

  // 6. La verificación no puede ser best-effort.
  assert.doesNotMatch(
    releaseWf,
    /cosign verify-blob[^\n]*\n?[^\n]*\|\|\s*true/,
    'La verificación de Gitsign no debe ser best-effort (|| true)',
  );

  // 7. Se conserva el pin de versión (no se degrada a "latest").
  assert.match(releaseWf, /GITSIGN_VERSION:\s*"\d+\.\d+\.\d+"/, 'Gitsign debe seguir pinneado a una versión exacta');
  assert.doesNotMatch(
    releaseWf,
    /gitsign\/releases\/latest/,
    'No debe permitirse la descarga de Gitsign desde "latest"',
  );

  // 8. Coherencia versión <-> digests verificada en runtime, sin scripts externos.
  assert.match(
    releaseWf,
    /api\.github\.com\/repos\/sigstore\/gitsign\/releases\/tags\/v\$\{TARGET_VERSION\}/,
    'Debe consultar la API de GitHub para validar los digests de la versión declarada',
  );
  assert.match(releaseWf, /\.assets\[\]\?/, 'Debe extraer los digests de los assets del release');
  assert.match(
    releaseWf,
    /GITSIGN_REFRESH:.*inputs\.gitsign_refresh/,
    'El refresco de digests debe ser explícito y opt-in vía workflow_dispatch',
  );
  // El self-check debe ejecutarse antes de descargar o instalar nada.
  const selfCheckIdx = releaseWf.indexOf('GITSIGN_REFRESH');
  const downloadIdx = releaseWf.indexOf('curl --proto');
  assert.ok(
    selfCheckIdx !== -1 && selfCheckIdx < downloadIdx,
    'El self-check de digests debe ejecutarse antes de descargar el binario',
  );

  // 9. No debe reintroducirse un script externo para esta verificación.
  assert.doesNotMatch(
    releaseWf,
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
  const stepBlocks = releaseWf.split(/\n\s{6}- name:/).slice(1);
  const gitsignStep = stepBlocks.find((b) => b.includes('GITSIGN_SHA256:'));
  assert.ok(gitsignStep, 'Debe existir el paso de verificación de Gitsign');
  assert.match(
    gitsignStep!,
    /if:[^\n]*inputs\.gitsign_refresh/,
    'El paso de Gitsign debe ejecutarse también en modo refresco, no solo en la fase tag',
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
      `El paso de ${stepName} debe estar protegido con !inputs.gitsign_refresh`,
    );
  }

  // 12. La consulta a la API debe ir autenticada: sin token quedaría sujeta al
  //     rate limit de las IPs compartidas de los runners y bloquearía el release.
  assert.match(
    gitsignStep!,
    /GITHUB_TOKEN:\s*\$\{\{\s*secrets\.GITHUB_TOKEN\s*\}\}/,
    'El paso debe pasar GITHUB_TOKEN para autenticar la consulta a la API de GitHub',
  );
  assert.match(
    gitsignStep!,
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
    // El tag legible se conserva en comentario para trazabilidad.
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
