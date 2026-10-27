import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR } from '../../helpers/repo.js';

test('🛡️ CI SAST Security: ci.yaml ejecuta Semgrep sobre scripts privilegiados (sin --exclude scripts)', () => {
  const ciPath = path.join(ROOT_DIR, '.github/workflows/ci.yaml');
  assert.ok(fs.existsSync(ciPath), 'ci.yaml debe existir');
  const content = fs.readFileSync(ciPath, 'utf-8');
  assert.equal(
    content.includes('--exclude scripts'),
    false,
    '.github/workflows/ci.yaml no debe excluir scripts del análisis SAST de Semgrep',
  );
});

test('🛡️ CI SAST Security: Semgrep usa un conjunto de reglas explícito y sin telemetría (sin --config auto)', () => {
  const content = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/ci.yaml'), 'utf-8');
  const command = content.split('\n').find((line) => line.includes('semgrep scan'));
  assert.ok(command, 'ci.yaml debe ejecutar `semgrep scan`');
  assert.ok(
    !command.includes('--config auto'),
    '`--config auto` elige reglas según el repo y obliga a enviar métricas',
  );
  assert.match(command, /--config p\/default/, 'Semgrep debe fijar el conjunto de reglas con --config p/default');
  assert.match(command, /--metrics=off/, 'Semgrep no debe enviar métricas a semgrep.dev');
  assert.match(command, /--error/, 'Semgrep debe fallar el job ante hallazgos');
});

test('🛡️ Tooling Governance: scripts/seal-secret.ts retirado en favor de ESO y Vault (CLN-002)', () => {
  const scriptPath = path.join(ROOT_DIR, 'scripts/seal-secret.ts');
  assert.ok(!fs.existsSync(scriptPath), 'seal-secret.ts debe estar retirado tras adopción de ESO (ADR-005)');
});

test('🛡️ Web Performance & Accesibilidad: lighthouserc.json define presupuestos estrictos para Core Web Vitals', () => {
  const lighthousercPath = path.join(ROOT_DIR, 'apps/frontend/lighthouserc.json');
  assert.ok(fs.existsSync(lighthousercPath), 'lighthouserc.json debe existir en apps/frontend/');
  const content = JSON.parse(fs.readFileSync(lighthousercPath, 'utf-8'));

  assert.ok(content.ci, 'lighthouserc.json debe tener sección ci');
  assert.ok(content.ci.assert?.assertions, 'lighthouserc.json debe definir assertions');
  assert.ok(content.ci.assert.assertions['categories:performance'], 'Debe definir presupuesto mínimo para performance');
  assert.ok(
    content.ci.assert.assertions['categories:accessibility'],
    'Debe definir presupuesto mínimo para accessibility',
  );
});

test('🛡️ CI Tooling Parity: infra.yaml y ci.yaml mantienen paridad estricta de versión de Helm en todos sus jobs', () => {
  const infraWorkflowPath = path.join(ROOT_DIR, '.github/workflows/infra.yaml');
  const ciWorkflowPath = path.join(ROOT_DIR, '.github/workflows/ci.yaml');
  const toolVersionsPath = path.join(ROOT_DIR, '.tool-versions');

  assert.ok(fs.existsSync(infraWorkflowPath), 'infra.yaml debe existir');
  assert.ok(fs.existsSync(ciWorkflowPath), 'ci.yaml debe existir');
  assert.ok(fs.existsSync(toolVersionsPath), '.tool-versions debe existir');

  const infraContent = fs.readFileSync(infraWorkflowPath, 'utf-8');
  const ciContent = fs.readFileSync(ciWorkflowPath, 'utf-8');
  const toolVersionsContent = fs.readFileSync(toolVersionsPath, 'utf-8');

  // Extraer versión de Helm esperada de .tool-versions (ej. 3.17.0)
  // Se ancla al inicio de línea: los comentarios `# renovate:` también mencionan `helm`.
  const helmVersionMatch = toolVersionsContent.match(/^helm\s+(\S+)/m);
  assert.ok(helmVersionMatch, 'Debe encontrarse versión de Helm en .tool-versions');
  const expectedHelmVersion = `v${helmVersionMatch[1]}`;

  // Extraer todas las versiones configuradas para setup-helm en infra.yaml y ci.yaml
  const infraVersions = Array.from(
    infraContent.matchAll(
      /uses:\s*azure\/setup-helm[^\n]*\n\s+with:\s*\n(?:\s*#[^\n]*\n)*\s+version:\s*['"]?(v\d+\.\d+\.\d+)['"]?/g,
    ),
  ).map((m) => m[1]);
  assert.ok(
    infraVersions.length >= 2,
    'infra.yaml debe configurar Helm en al menos 2 jobs (validate-iac y kind-integration)',
  );

  const ciVersions = Array.from(
    ciContent.matchAll(
      /uses:\s*azure\/setup-helm[^\n]*\n\s+with:\s*\n(?:\s*#[^\n]*\n)*\s+version:\s*['"]?(v\d+\.\d+\.\d+)['"]?/g,
    ),
  ).map((m) => m[1]);
  assert.ok(ciVersions.length >= 1, 'ci.yaml debe configurar Helm en el job publish');

  const allVersions = [...infraVersions, ...ciVersions];
  for (const ver of allVersions) {
    assert.equal(
      ver,
      expectedHelmVersion,
      `Cada workflow de CI (infra.yaml, ci.yaml) debe utilizar Helm ${expectedHelmVersion} para garantizar paridad inmutable`,
    );
  }

  // Paridad con Taskfile.yaml (HELM_IMAGE), tool-catalog.yaml y HELM_DEPLOYMENT_GUIDE.md (AUD-TOOL-HELM-001)
  const expectedHelmSemver = helmVersionMatch[1];
  const taskfileContent = fs.readFileSync(path.join(ROOT_DIR, 'Taskfile.yaml'), 'utf-8');
  const taskfileHelmMatch = taskfileContent.match(
    /HELM_IMAGE:\s*['"]alpine\/helm:(\d+\.\d+\.\d+)@sha256:([a-f0-9]{64})['"]/,
  );
  assert.ok(taskfileHelmMatch, 'Taskfile.yaml debe declarar HELM_IMAGE con tag y digest sha256');
  assert.equal(
    taskfileHelmMatch[1],
    expectedHelmSemver,
    `Taskfile.yaml HELM_IMAGE (${taskfileHelmMatch[1]}) debe coincidir con .tool-versions (${expectedHelmSemver})`,
  );

  const toolCatalogContent = fs.readFileSync(
    path.join(ROOT_DIR, '.agents/skills/repo-tool-exec/references/tool-catalog.yaml'),
    'utf-8',
  );
  assert.ok(
    toolCatalogContent.includes(`alpine/helm:${expectedHelmSemver}@sha256:${taskfileHelmMatch[2]}`),
    `tool-catalog.yaml debe fijar alpine/helm:${expectedHelmSemver}@sha256:${taskfileHelmMatch[2]} en paridad con Taskfile.yaml y .tool-versions`,
  );

  const helmRunbookContent = fs.readFileSync(path.join(ROOT_DIR, 'docs/runbooks/HELM_DEPLOYMENT_GUIDE.md'), 'utf-8');
  assert.ok(
    helmRunbookContent.includes(`alpine/helm:${expectedHelmSemver}@sha256:${taskfileHelmMatch[2]}`),
    `HELM_DEPLOYMENT_GUIDE.md debe documentar la imagen vigente alpine/helm:${expectedHelmSemver}@sha256:${taskfileHelmMatch[2]}`,
  );
});

test('🛡️ CI Tooling Parity: la versión de OpenTofu de infra.yaml y tool-catalog.yaml coincide con .tool-versions, y renovate coincide con config-linters.yaml', () => {
  const infra = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/infra.yaml'), 'utf-8');
  const configLinters = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/config-linters.yaml'), 'utf-8');
  const toolVersions = fs.readFileSync(path.join(ROOT_DIR, '.tool-versions'), 'utf-8');
  const toolCatalog = fs.readFileSync(
    path.join(ROOT_DIR, '.agents/skills/repo-tool-exec/references/tool-catalog.yaml'),
    'utf-8',
  );
  const expected = toolVersions.match(/^opentofu\s+(\S+)/m)?.[1];
  assert.ok(expected, 'Debe encontrarse la versión de OpenTofu en .tool-versions');

  const versions = [...infra.matchAll(/tofu_version:\s*['"]?(\d+\.\d+\.\d+)['"]?/g)].map((m) => m[1]);
  assert.ok(versions.length >= 1, 'infra.yaml debe fijar tofu_version');
  for (const version of versions) {
    assert.equal(version, expected, 'infra.yaml y .tool-versions deben usar la misma versión de OpenTofu');
  }
  assert.ok(
    toolCatalog.includes(`ghcr.io/opentofu/opentofu:${expected}`),
    `tool-catalog.yaml debe usar ghcr.io/opentofu/opentofu:${expected}`,
  );

  const renovateMatch = configLinters.match(/renovate\/renovate:\d[\w.-]*@sha256:[a-f0-9]{64}/);
  assert.ok(renovateMatch, 'config-linters.yaml debe fijar renovate/renovate por digest');
  assert.ok(
    toolCatalog.includes(renovateMatch[0]),
    `tool-catalog.yaml debe mantener paridad con config-linters.yaml (${renovateMatch[0]})`,
  );

  const actionlintMatch = configLinters.match(/rhysd\/actionlint:\d[\w.-]*@sha256:[a-f0-9]{64}/);
  assert.ok(actionlintMatch, 'config-linters.yaml debe fijar rhysd/actionlint por digest');
  assert.ok(
    toolCatalog.includes(actionlintMatch[0]),
    `tool-catalog.yaml debe mantener paridad con config-linters.yaml (${actionlintMatch[0]})`,
  );

  const zizmorMatch = configLinters.match(/ghcr\.io\/zizmorcore\/zizmor:\d[\w.-]*@sha256:[a-f0-9]{64}/);
  assert.ok(zizmorMatch, 'config-linters.yaml debe fijar ghcr.io/zizmorcore/zizmor por digest');
  assert.ok(
    toolCatalog.includes(zizmorMatch[0]),
    `tool-catalog.yaml debe mantener paridad con config-linters.yaml (${zizmorMatch[0]})`,
  );
});

test('🛡️ CI Tooling Parity (AUD-TOOL-CAT-001): kubeconform, kube-linter, kyverno y gitleaks en tool-catalog.yaml coinciden con los workflows de CI', () => {
  const infra = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/infra.yaml'), 'utf-8');
  const gitleaksWf = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/security-gitleaks.yaml'), 'utf-8');
  const toolCatalog = fs.readFileSync(
    path.join(ROOT_DIR, '.agents/skills/repo-tool-exec/references/tool-catalog.yaml'),
    'utf-8',
  );

  const kubeconformVer = infra.match(/KUBECONFORM_VERSION="(v\d+\.\d+\.\d+)"/)?.[1];
  assert.ok(kubeconformVer, 'infra.yaml debe definir KUBECONFORM_VERSION');
  assert.ok(
    toolCatalog.includes(`ghcr.io/yannh/kubeconform:${kubeconformVer}`),
    `AUD-TOOL-CAT-001: tool-catalog.yaml debe fijar ghcr.io/yannh/kubeconform:${kubeconformVer} en paridad con infra.yaml`,
  );

  const kubeLinterVer = infra.match(/KUBELINTER_VERSION="(v\d+\.\d+\.\d+)"/)?.[1];
  assert.ok(kubeLinterVer, 'infra.yaml debe definir KUBELINTER_VERSION');
  assert.ok(
    toolCatalog.includes(`stackrox/kube-linter:${kubeLinterVer}`),
    `AUD-TOOL-CAT-001: tool-catalog.yaml debe fijar stackrox/kube-linter:${kubeLinterVer} en paridad con infra.yaml`,
  );

  const kyvernoVer = infra.match(/KYVERNO_VERSION="(v\d+\.\d+\.\d+)"/)?.[1];
  assert.ok(kyvernoVer, 'infra.yaml debe definir KYVERNO_VERSION');
  assert.ok(
    toolCatalog.includes(`ghcr.io/kyverno/kyverno-cli:${kyvernoVer}`),
    `AUD-TOOL-CAT-001: tool-catalog.yaml debe fijar ghcr.io/kyverno/kyverno-cli:${kyvernoVer} en paridad con infra.yaml`,
  );

  const gitleaksVer = gitleaksWf.match(/GITLEAKS_VERSION:\s*"(\d+\.\d+\.\d+)"/)?.[1];
  assert.ok(gitleaksVer, 'security-gitleaks.yaml debe definir GITLEAKS_VERSION');
  assert.ok(
    toolCatalog.includes(`zricethezav/gitleaks:v${gitleaksVer}`),
    `AUD-TOOL-CAT-001: tool-catalog.yaml debe fijar zricethezav/gitleaks:v${gitleaksVer} en paridad con security-gitleaks.yaml`,
  );
});
