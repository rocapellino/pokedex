/**
 * ==============================================================================
 * Test de Seguridad y Arquitectura: Hardening de Cargas Kubernetes, Kyverno, PSS Restricted y Orquestación Helm/GitOps
 * ==============================================================================
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { assertDocsPortalLinksAdrIndex } from '../helpers/docs-portal.js';
import { PROFILES, podSpecOf, podWorkloads, renderChart } from '../helpers/helm-render.js';
import { ROOT_DIR } from '../helpers/repo.js';
import { readYaml, workflowScripts } from '../helpers/yaml.js';

test('🛡️ Helm Security: PostgreSQL y PgBouncer renderizan readOnlyRootFilesystem y montajes emptyDir', () => {
  const docs = renderChart(PROFILES.prod);
  const cases = [
    { kind: 'StatefulSet', name: 'postgres', mounts: ['/tmp', '/var/run/postgresql'] },
    { kind: 'Deployment', name: 'pgbouncer', mounts: ['/tmp'] },
  ];

  for (const { kind, name, mounts } of cases) {
    const doc = docs.find((d) => d.kind === kind && d.metadata.name === name);
    assert.ok(doc, `${kind}/${name} debe renderizarse con el perfil prod`);
    const spec = podSpecOf(doc);

    for (const container of spec.containers) {
      assert.equal(
        container.securityContext?.readOnlyRootFilesystem,
        true,
        `${kind}/${name}: el contenedor ${container.name} debe tener readOnlyRootFilesystem: true`,
      );
    }

    // Con el sistema de archivos raíz de solo lectura, cada ruta escribible debe montarse sobre un emptyDir.
    const volumeMounts = spec.containers.flatMap((c: any) => c.volumeMounts ?? []);
    for (const mountPath of mounts) {
      const mount = volumeMounts.find((m: any) => m.mountPath === mountPath);
      assert.ok(mount, `${kind}/${name} debe montar ${mountPath}`);
      const volume = (spec.volumes ?? []).find((v: any) => v.name === mount.name);
      assert.ok(volume?.emptyDir, `${kind}/${name}: ${mountPath} debe estar respaldado por un emptyDir`);
    }
  }
});

test('🛡️ Helm Security: todo workload renderizado deshabilita automountServiceAccountToken (Least Privilege)', () => {
  const expected = [
    'Deployment/pokemon-api',
    'Deployment/pokedex-web',
    'Deployment/redis',
    'Deployment/pgbouncer',
    'StatefulSet/postgres',
    'CronJob/pokedex-db-backup',
    'CronJob/pokedex-gdrive-sync',
    'CronJob/pokedex-dr-restore-verify',
    'Job/pokedex-db-seed',
  ];

  // Ningún perfil activa todos los workloads (pgbouncer solo en prod, la siembra solo en pre-prod): se unen los tres.
  const seen = new Set<string>();
  for (const [profile, files] of Object.entries(PROFILES)) {
    for (const { name, spec } of podWorkloads(renderChart(files))) {
      seen.add(name);
      assert.equal(
        spec.automountServiceAccountToken,
        false,
        `${name} (perfil ${profile}) debe declarar automountServiceAccountToken: false`,
      );
    }
  }
  for (const workload of expected) {
    assert.ok(
      seen.has(workload),
      `${workload} debe renderizarse en algún perfil (el test no debe pasar sin evaluarlo)`,
    );
  }
});

test('🛡️ Helm Security: el Job de siembra renderizado declara requests y limits de ephemeral-storage', () => {
  const seed = renderChart(PROFILES.preprod).find((d) => d.kind === 'Job' && d.metadata.name === 'pokedex-db-seed');
  assert.ok(seed, 'el Job pokedex-db-seed debe renderizarse con el perfil pre-prod');

  for (const container of podSpecOf(seed).containers) {
    assert.equal(
      container.resources?.requests?.['ephemeral-storage'],
      '50Mi',
      `${container.name}: request de ephemeral-storage`,
    );
    assert.equal(
      container.resources?.limits?.['ephemeral-storage'],
      '256Mi',
      `${container.name}: limit de ephemeral-storage`,
    );
  }
});

test('🛡️ K8s Quality & High Availability: api y web renderizan topologySpreadConstraints y ninguna imagen usa :latest', () => {
  const docs = renderChart(PROFILES.prod);

  for (const name of ['pokemon-api', 'pokedex-web']) {
    const deployment = docs.find((d) => d.kind === 'Deployment' && d.metadata.name === name);
    assert.ok(deployment, `Deployment/${name} debe renderizarse con el perfil prod`);
    const constraints = podSpecOf(deployment).topologySpreadConstraints ?? [];
    assert.ok(
      constraints.length > 0,
      `Deployment/${name} debe renderizar topologySpreadConstraints para alta disponibilidad`,
    );
  }

  for (const { name, spec } of podWorkloads(docs)) {
    for (const container of [...(spec.initContainers ?? []), ...spec.containers]) {
      assert.doesNotMatch(
        container.image,
        /:latest$/,
        `${name}: ${container.name} no debe usar el tag :latest en prod`,
      );
    }
  }
});

test('🛡️ K8s Quality Gates: infra.yaml ejecuta kubeconform, kube-linter y kyverno test', () => {
  const scripts = workflowScripts('.github/workflows/infra.yaml').join('\n');

  assert.match(scripts, /\/tmp\/kubeconform -strict/, 'infra.yaml debe ejecutar kubeconform para esquemas K8s');
  assert.match(
    scripts,
    /\/tmp\/kube-linter lint .*--config \.kube-linter\.yaml/,
    'infra.yaml debe ejecutar kube-linter con su configuración',
  );
  assert.match(
    scripts,
    /\/tmp\/kyverno test infra\/k8s\/kyverno-test\//,
    'infra.yaml debe ejecutar kyverno test sobre las políticas',
  );
  assert.ok(scripts.includes('image:.*:latest'), 'infra.yaml debe validar y prohibir :latest en producción');

  for (const file of [
    '.kube-linter.yaml',
    'infra/k8s/policies/disallow-latest-tag.yaml',
    'infra/k8s/kyverno-test/kyverno-test.yaml',
  ]) {
    assert.ok(fs.existsSync(path.join(ROOT_DIR, file)), `${file} debe existir`);
  }
});

test('🛡️ Kyverno Security: ClusterPolicy pod-security-standards define perfil Restricted en tiempo de admisión', () => {
  const policy = readYaml('infra/k8s/policies/pod-security-standards.yaml');
  assert.equal(policy.kind, 'ClusterPolicy');
  assert.equal(
    policy.spec.validationFailureAction,
    'Enforce',
    'la política debe bloquear en admisión, no solo auditar',
  );

  const rules = policy.spec.rules.map((r: { name: string }) => r.name);
  for (const rule of [
    'require-run-as-non-root',
    'disallow-privileged-containers',
    'require-readonly-rootfs',
    'disallow-privilege-escalation',
    'require-drop-all-capabilities',
  ]) {
    assert.ok(rules.includes(rule), `la política debe declarar la regla ${rule}`);
  }

  const suite = readYaml('infra/k8s/kyverno-test/pod-security-standards/kyverno-test.yaml');
  const policies = JSON.stringify(suite.policies ?? suite);
  assert.ok(
    policies.includes('pod-security-standards'),
    'la suite de Kyverno debe testear la política pod-security-standards',
  );
});

test('🛡️ Dockerfile SSOT: apps/backend/Dockerfile es la definición canónica del backend y /Dockerfile no existe', () => {
  const rootDockerPath = path.join(ROOT_DIR, 'Dockerfile');
  const backendDockerPath = path.join(ROOT_DIR, 'apps/backend/Dockerfile');

  assert.ok(
    !fs.existsSync(rootDockerPath),
    'El Dockerfile espejo en la raíz no debe existir (la SSOT canónica es apps/backend/Dockerfile)',
  );
  assert.ok(fs.existsSync(backendDockerPath), 'apps/backend/Dockerfile debe existir como SSOT');

  const backendContent = fs.readFileSync(backendDockerPath, 'utf-8');
  assert.match(
    backendContent,
    /FROM node:24-alpine/,
    'apps/backend/Dockerfile debe usar la imagen base node:24-alpine',
  );
  assert.match(
    backendContent,
    /USER (?:1000:1000|node)/,
    'apps/backend/Dockerfile debe ejecutar como usuario no privilegiado (UID 1000 o node)',
  );

  const ciWorkflow = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/ci.yaml'), 'utf-8');
  assert.match(
    ciWorkflow,
    /file:\s*\.\/apps\/backend\/Dockerfile/,
    'ci.yaml debe compilar con ./apps/backend/Dockerfile',
  );

  const infraWorkflow = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/infra.yaml'), 'utf-8');
  assert.match(
    infraWorkflow,
    /-f apps\/backend\/Dockerfile \./,
    'infra.yaml debe compilar con apps/backend/Dockerfile',
  );
});

test('🛡️ Cloud-Native Secrets: infra/k8s/eso define arquitectura declarativa de External Secrets Operator', () => {
  assert.ok(fs.existsSync(path.join(ROOT_DIR, 'infra/k8s/eso/README.md')), 'README.md de ESO debe existir');

  const store = readYaml('infra/k8s/eso/cluster-secret-store.yaml');
  assert.equal(store.kind, 'ClusterSecretStore', 'Debe definir ClusterSecretStore');

  const secret = readYaml('infra/k8s/eso/external-secret-pokedex.yaml');
  assert.equal(secret.kind, 'ExternalSecret', 'Debe definir ExternalSecret');
  assert.equal(
    secret.spec.secretStoreRef.kind,
    'ClusterSecretStore',
    'El ExternalSecret debe apuntar a un ClusterSecretStore',
  );

  const keys = secret.spec.data.map((entry: { secretKey: string }) => entry.secretKey);
  assert.ok(keys.includes('POSTGRES_PASSWORD'), 'Debe mapear POSTGRES_PASSWORD');
  assert.ok(keys.includes('GEMINI_API_KEY'), 'Debe mapear GEMINI_API_KEY');
});

test('🛡️ Helm Resiliencia & Gobernanza: el perfil de referencia renderiza PDB, ResourceQuota y LimitRange y CI los exige', () => {
  // INFRA-011: `values.prod.yaml` es la base del blueprint prod cloud, inactivo (ADR-030). Este test verifica la
  // CONFIGURACION del perfil, no una garantia operativa de un entorno desplegado.
  const kinds = new Set(renderChart(PROFILES.prod).map((d) => d.kind));
  for (const kind of ['PodDisruptionBudget', 'ResourceQuota', 'LimitRange']) {
    assert.ok(kinds.has(kind), `el perfil prod debe renderizar ${kind}`);
  }

  const scripts = workflowScripts('.github/workflows/infra.yaml').join('\n');
  for (const kind of ['PodDisruptionBudget', 'ResourceQuota', 'LimitRange']) {
    assert.ok(scripts.includes(`kind: ${kind}`), `infra.yaml debe validar ${kind} en prod`);
  }
});

test('🛡️ Autoescalado & Resiliencia: ADR-014 formaliza HPA v2, PodDisruptionBudget y TopologySpreadConstraints', () => {
  const adrPath = path.join(ROOT_DIR, 'docs/decisions/ADR-014-elastic-autoscaling-hpa-and-pod-disruption-budget.md');
  const readmePath = path.join(ROOT_DIR, 'README.md');
  const docsReadmePath = path.join(ROOT_DIR, 'docs/README.md');

  assert.ok(fs.existsSync(adrPath), 'ADR-014 debe existir en docs/decisions/');
  const adrContent = fs.readFileSync(adrPath, 'utf-8');

  assert.ok(adrContent.includes('autoscaling/v2'), 'ADR-014 debe documentar HPA autoscaling/v2');
  assert.ok(adrContent.includes('PodDisruptionBudget'), 'ADR-014 debe documentar PodDisruptionBudget');
  assert.ok(
    adrContent.includes('topologySpreadConstraints') || adrContent.includes('TopologySpreadConstraints'),
    'ADR-014 debe documentar TopologySpreadConstraints',
  );
  assert.ok(
    adrContent.includes('scaleDown') || adrContent.includes('Scale Down') || adrContent.includes('estabilización'),
    'ADR-014 debe documentar políticas de estabilización para mitigar flapping',
  );
  assert.ok(
    adrContent.includes('minAvailable: 1') || adrContent.includes('minAvailable'),
    'ADR-014 debe documentar minAvailable en PDB',
  );

  const readmeContent = fs.readFileSync(readmePath, 'utf-8');
  assert.ok(
    readmeContent.includes('ADR-014-elastic-autoscaling-hpa-and-pod-disruption-budget.md'),
    'README.md debe enlazar ADR-014',
  );

  const docsReadmeContent = fs.readFileSync(docsReadmePath, 'utf-8');
  assert.ok(
    docsReadmeContent.includes('ADR-014-elastic-autoscaling-hpa-and-pod-disruption-budget.md'),
    'docs/README.md debe enlazar ADR-014',
  );
  assertDocsPortalLinksAdrIndex(docsReadmeContent);
});

test('🛡️ Ciclo de Vida & Resiliencia: ADR-015 formaliza Graceful Shutdown, closeStorage y sondas /healthz y /readyz', () => {
  const adrPath = path.join(ROOT_DIR, 'docs/decisions/ADR-015-pod-lifecycle-graceful-shutdown-and-probes.md');
  const readmePath = path.join(ROOT_DIR, 'README.md');
  const docsReadmePath = path.join(ROOT_DIR, 'docs/README.md');
  const helmApiDeploymentPath = path.join(ROOT_DIR, 'infra/helm/pokedex/templates/api-deployment.yaml');
  const helmValuesPath = path.join(ROOT_DIR, 'infra/helm/pokedex/values.yaml');

  assert.ok(fs.existsSync(adrPath), 'ADR-015 debe existir en docs/decisions/');
  const adrContent = fs.readFileSync(adrPath, 'utf-8');

  assert.ok(
    adrContent.includes('SIGTERM') && adrContent.includes('SIGINT'),
    'ADR-015 debe documentar señales SIGTERM y SIGINT',
  );
  assert.ok(adrContent.includes('setupGracefulShutdown'), 'ADR-015 debe documentar setupGracefulShutdown');
  assert.ok(adrContent.includes('closeStorage'), 'ADR-015 debe documentar closeStorage');
  assert.ok(adrContent.includes('/healthz'), 'ADR-015 debe documentar sonda /healthz');
  assert.ok(adrContent.includes('/readyz'), 'ADR-015 debe documentar sonda /readyz');
  assert.ok(
    adrContent.includes('terminationGracePeriodSeconds: 30') || adrContent.includes('terminationGracePeriodSeconds'),
    'ADR-015 debe documentar terminationGracePeriodSeconds',
  );

  const readmeContent = fs.readFileSync(readmePath, 'utf-8');
  assert.ok(
    readmeContent.includes('ADR-015-pod-lifecycle-graceful-shutdown-and-probes.md'),
    'README.md debe enlazar ADR-015',
  );

  const docsReadmeContent = fs.readFileSync(docsReadmePath, 'utf-8');
  assert.ok(
    docsReadmeContent.includes('ADR-015-pod-lifecycle-graceful-shutdown-and-probes.md'),
    'docs/README.md debe enlazar ADR-015',
  );
  assertDocsPortalLinksAdrIndex(docsReadmeContent);

  const helmApiContent = fs.readFileSync(helmApiDeploymentPath, 'utf-8');
  assert.ok(
    helmApiContent.includes('terminationGracePeriodSeconds:'),
    'api-deployment.yaml debe configurar terminationGracePeriodSeconds',
  );

  const helmValuesContent = fs.readFileSync(helmValuesPath, 'utf-8');
  assert.ok(
    helmValuesContent.includes('terminationGracePeriodSeconds: 30'),
    'values.yaml debe fijar terminationGracePeriodSeconds: 30',
  );
});

test('🛡️ Admission Control: ADR-017 formaliza Kyverno ClusterPolicies, PSS Restricted y seccomp RuntimeDefault', () => {
  const adrPath = path.join(ROOT_DIR, 'docs/decisions/ADR-017-kyverno-admission-control-and-pod-security.md');
  const readmePath = path.join(ROOT_DIR, 'README.md');
  const docsReadmePath = path.join(ROOT_DIR, 'docs/README.md');
  const pssPolicyPath = path.join(ROOT_DIR, 'infra/k8s/policies/pod-security-standards.yaml');
  const disallowLatestPath = path.join(ROOT_DIR, 'infra/k8s/policies/disallow-latest-tag.yaml');
  const seccompPolicyPath = path.join(ROOT_DIR, 'infra/k8s/policies/require-seccomp-profile.yaml');
  const cosignPolicyPath = path.join(ROOT_DIR, 'infra/k8s/kyverno-cosign-policy.yaml');
  const namespacePsaPath = path.join(ROOT_DIR, 'infra/k8s/namespace-pod-security.yaml');

  // 1. ADR-017 existe y está aceptado
  assert.ok(fs.existsSync(adrPath), 'ADR-017 debe existir en docs/decisions/');
  const adrContent = fs.readFileSync(adrPath, 'utf-8');

  // 2. ADR-017 documenta las tres capas de control de admisión
  assert.ok(
    adrContent.includes('pod-security-standards') || adrContent.includes('PSS'),
    'ADR-017 debe documentar Pod Security Standards',
  );
  assert.ok(
    adrContent.includes('disallow-latest-tag') || adrContent.includes('latest'),
    'ADR-017 debe documentar política disallow-latest-tag',
  );
  assert.ok(
    adrContent.includes('require-seccomp-profile') || adrContent.includes('seccomp'),
    'ADR-017 debe documentar política require-seccomp-profile',
  );
  assert.ok(
    adrContent.includes('Cosign') || adrContent.includes('cosign'),
    'ADR-017 debe documentar política de verificación Cosign',
  );
  assert.ok(adrContent.includes('Enforce'), 'ADR-017 debe documentar validationFailureAction: Enforce');
  assert.ok(
    adrContent.includes('kyverno test') || adrContent.includes('kyverno-test'),
    'ADR-017 debe documentar validación CI con kyverno test',
  );
  assert.ok(
    adrContent.includes('restricted') || adrContent.includes('Restricted'),
    'ADR-017 debe documentar PSA nivel restricted',
  );

  // 3. Políticas físicas existen
  assert.ok(fs.existsSync(pssPolicyPath), 'pod-security-standards.yaml debe existir en infra/k8s/policies/');
  assert.ok(fs.existsSync(disallowLatestPath), 'disallow-latest-tag.yaml debe existir en infra/k8s/policies/');
  assert.ok(fs.existsSync(seccompPolicyPath), 'require-seccomp-profile.yaml debe existir en infra/k8s/policies/');
  assert.ok(fs.existsSync(cosignPolicyPath), 'kyverno-cosign-policy.yaml debe existir en infra/k8s/');
  assert.ok(fs.existsSync(namespacePsaPath), 'namespace-pod-security.yaml debe existir en infra/k8s/');

  // 4. Política seccomp documenta RuntimeDefault
  const seccompContent = fs.readFileSync(seccompPolicyPath, 'utf-8');
  assert.ok(seccompContent.includes('RuntimeDefault'), 'require-seccomp-profile.yaml debe exigir RuntimeDefault');
  assert.ok(
    seccompContent.includes('Enforce'),
    'require-seccomp-profile.yaml debe usar validationFailureAction: Enforce',
  );

  // 5. Namespace PSA en modo restricted
  const nsContent = fs.readFileSync(namespacePsaPath, 'utf-8');
  assert.ok(
    nsContent.includes('pod-security.kubernetes.io/enforce: restricted'),
    'Namespace debe tener PSA enforce: restricted',
  );

  // 6. Suite de tests de seccomp existe
  const seccompTestPath = path.join(ROOT_DIR, 'infra/k8s/kyverno-test/require-seccomp-profile/kyverno-test.yaml');
  assert.ok(fs.existsSync(seccompTestPath), 'kyverno-test.yaml de seccomp debe existir');
  const seccompTestContent = fs.readFileSync(seccompTestPath, 'utf-8');
  assert.ok(seccompTestContent.includes('require-seccomp-profile'), 'Debe testear la política require-seccomp-profile');

  // 7. README.md y docs/README.md enlazan ADR-017
  const readmeContent = fs.readFileSync(readmePath, 'utf-8');
  assert.ok(
    readmeContent.includes('ADR-017-kyverno-admission-control-and-pod-security.md'),
    'README.md debe enlazar ADR-017',
  );

  const docsReadmeContent = fs.readFileSync(docsReadmePath, 'utf-8');
  assert.ok(
    docsReadmeContent.includes('ADR-017-kyverno-admission-control-and-pod-security.md'),
    'docs/README.md debe enlazar ADR-017',
  );
  assertDocsPortalLinksAdrIndex(docsReadmeContent);
});

test('🛡️ Helm Chart: values.yaml es Secure by Default y values.dev.yaml proporciona overrides explícitos de desarrollo', () => {
  const helmGuidePath = path.join(ROOT_DIR, 'docs/runbooks/HELM_DEPLOYMENT_GUIDE.md');
  const infraReadmePath = path.join(ROOT_DIR, 'infra/README.md');

  // 1. values.yaml implementa Secure by Default: producción, HTTPS obligatorio, TLS, Cilium L7 y Reloader deshabilitado
  const values = readYaml('infra/helm/pokedex/values.yaml');
  assert.equal(values.api.env.nodeEnv, 'production', 'values.yaml debe configurar nodeEnv: "production" por defecto');
  assert.equal(
    values.ingress.annotations['nginx.ingress.kubernetes.io/ssl-redirect'],
    'true',
    'values.yaml debe forzar ssl-redirect: "true" por defecto',
  );
  assert.equal(
    values.ingress.annotations['cert-manager.io/cluster-issuer'],
    'letsencrypt-prod',
    'values.yaml debe definir cluster-issuer letsencrypt-prod',
  );
  assert.equal(
    values.ingress.tls[0].secretName,
    'pokedex-tls-cert',
    'values.yaml debe tener bloque tls con secretName',
  );
  assert.equal(values.ciliumNetworkPolicy.enabled, true, 'values.yaml debe activar ciliumNetworkPolicy.enabled');
  assert.equal(values.reloader.enabled, false, 'values.yaml debe configurar reloader.enabled: false');

  // 2. values.dev.yaml proporciona overrides permisivos para desarrollo local (Kind/Minikube)
  const dev = readYaml('infra/helm/pokedex/values.dev.yaml');
  assert.equal(dev.api.env.nodeEnv, 'development', 'values.dev.yaml debe configurar nodeEnv: "development"');
  assert.equal(
    dev.ingress.annotations['nginx.ingress.kubernetes.io/ssl-redirect'],
    'false',
    'values.dev.yaml debe permitir ssl-redirect: "false"',
  );
  assert.deepEqual(dev.ingress.tls, [], 'values.dev.yaml debe permitir tls: [] vacío para desarrollo HTTP');
  assert.equal(dev.ciliumNetworkPolicy.enabled, false, 'values.dev.yaml debe desactivar ciliumNetworkPolicy en local');
  assert.equal(dev.reloader.enabled, false, 'values.dev.yaml debe mantener reloader desactivado en desarrollo');

  // 3. Documentación formaliza la separación conceptual
  const helmGuideContent = fs.readFileSync(helmGuidePath, 'utf-8');
  const infraReadmeContent = fs.readFileSync(infraReadmePath, 'utf-8');
  assert.ok(helmGuideContent.includes('values.dev.yaml'), 'HELM_DEPLOYMENT_GUIDE.md debe documentar values.dev.yaml');
  assert.ok(
    helmGuideContent.includes('Secure by Default'),
    'HELM_DEPLOYMENT_GUIDE.md debe documentar el principio Secure by Default',
  );
  assert.ok(infraReadmeContent.includes('values.dev.yaml'), 'infra/README.md debe documentar values.dev.yaml');
});

test('🏷️ Kubernetes Taxonomy: Namespace único canónico pokemon-app y segregación formal de Vault', () => {
  // 1. KUBERNETES_NAMESPACE_TAXONOMY.md existe y formaliza pokemon-app como SSOT
  const taxonomyPath = path.join(ROOT_DIR, 'docs/architecture/KUBERNETES_NAMESPACE_TAXONOMY.md');
  assert.ok(fs.existsSync(taxonomyPath), 'KUBERNETES_NAMESPACE_TAXONOMY.md debe existir');
  const taxonomyContent = fs.readFileSync(taxonomyPath, 'utf-8');
  assert.ok(taxonomyContent.includes('pokemon-app (SSOT Canónico)'), 'Taxonomía debe formalizar pokemon-app como SSOT');
  assert.ok(taxonomyContent.includes('pokedex-preprod-role'), 'Taxonomía debe documentar pokedex-preprod-role');
  assert.ok(
    taxonomyContent.includes('secret/data/pokedex/preprod/*'),
    'Taxonomía debe documentar ruta de secretos preprod',
  );
  assert.ok(
    taxonomyContent.includes('pokedex/prod'),
    'Taxonomía debe documentar la ruta pokedex/prod reservada para el blueprint cloud',
  );
  assert.ok(
    !taxonomyContent.includes('pokedex-prod-role'),
    'ADR-030: la taxonomía no debe documentar el rol de la prod Proxmox retirada',
  );

  // 2. docs/README.md enlaza la taxonomía
  const docsReadmePath = path.join(ROOT_DIR, 'docs/README.md');
  const docsReadme = fs.readFileSync(docsReadmePath, 'utf-8');
  assert.ok(
    docsReadme.includes('KUBERNETES_NAMESPACE_TAXONOMY.md'),
    'docs/README.md debe indexar KUBERNETES_NAMESPACE_TAXONOMY.md',
  );

  // 3. SECURITY_RUNBOOK.md utiliza -n pokemon-app y nombres de deployment/service/statefulset estándar
  const secRunbookPath = path.join(ROOT_DIR, 'docs/security/SECURITY_RUNBOOK.md');
  const secRunbook = fs.readFileSync(secRunbookPath, 'utf-8');
  assert.ok(!secRunbook.includes('-n pokedex'), 'SECURITY_RUNBOOK.md no debe contener -n pokedex');
  assert.ok(!secRunbook.includes('--namespace pokedex'), 'SECURITY_RUNBOOK.md no debe contener --namespace pokedex');
  assert.ok(secRunbook.includes('-n pokemon-app'), 'SECURITY_RUNBOOK.md debe utilizar -n pokemon-app');
  assert.ok(
    secRunbook.includes('deployment/pokemon-api'),
    'SECURITY_RUNBOOK.md debe referenciar deployment/pokemon-api',
  );
  assert.ok(secRunbook.includes('statefulset/postgres'), 'SECURITY_RUNBOOK.md debe referenciar statefulset/postgres');
  assert.ok(secRunbook.includes('pokemon-redis-svc'), 'SECURITY_RUNBOOK.md debe referenciar pokemon-redis-svc');
  assert.ok(
    secRunbook.includes('secret generic pokemon-secrets'),
    'SECURITY_RUNBOOK.md debe referenciar pokemon-secrets',
  );

  // 4. Verificación exhaustiva: Ningún archivo markdown en docs/ utiliza -n pokedex o --namespace pokedex
  const scanDir = (dir: string): string[] => {
    let files: string[] = [];
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        files = files.concat(scanDir(fullPath));
      } else if (item.isFile() && item.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }
    return files;
  };

  const allDocs = scanDir(path.join(ROOT_DIR, 'docs')).filter((f) => f !== taxonomyPath);
  const legacyNsRegex = /(?:-n|--namespace)\s+pokedex\b/;
  for (const docFile of allDocs) {
    const docContent = fs.readFileSync(docFile, 'utf-8');
    assert.ok(
      !legacyNsRegex.test(docContent),
      `El documento ${path.relative(ROOT_DIR, docFile)} no debe contener referencias obsoletas '-n pokedex' o '--namespace pokedex'`,
    );
  }

  // 5. GitOps y Helm: Paridad en destino de namespace
  const helmValuesPath = path.join(ROOT_DIR, 'infra/helm/pokedex/values.yaml');
  const helmValues = fs.readFileSync(helmValuesPath, 'utf-8');
  assert.match(helmValues, /namespace:\s*pokemon-app/, 'Helm values.yaml debe definir namespace: pokemon-app');

  const appProxmox = fs.readFileSync(path.join(ROOT_DIR, 'gitops/apps/app-proxmox-preprod.yaml'), 'utf-8');
  assert.match(appProxmox, /namespace:\s*pokemon-app/, 'app-proxmox-preprod.yaml debe definir namespace: pokemon-app');

  const appProxmoxPreprod = fs.readFileSync(path.join(ROOT_DIR, 'gitops/apps/app-proxmox-preprod.yaml'), 'utf-8');
  assert.match(
    appProxmoxPreprod,
    /namespace:\s*pokemon-app/,
    'app-proxmox-preprod.yaml debe definir namespace: pokemon-app',
  );

  const appCloud = fs.readFileSync(path.join(ROOT_DIR, 'gitops/apps/app-cloud.yaml'), 'utf-8');
  assert.match(appCloud, /namespace:\s*pokemon-app/, 'app-cloud.yaml debe definir namespace: pokemon-app');

  // 6. setup_vault.yml vincula los roles K8s al namespace pokemon-app
  const setupVault = fs.readFileSync(path.join(ROOT_DIR, 'infra/ansible/playbooks/setup_vault.yaml'), 'utf-8');
  assert.match(
    setupVault,
    /pokedex-preprod-role[\s\S]*?bound_service_account_namespaces=[^\n]*pokemon-app/,
    'pokedex-preprod-role en setup_vault.yml debe incluir pokemon-app',
  );
  assert.doesNotMatch(
    setupVault,
    /pokedex-prod-role/,
    'ADR-030: setup_vault.yaml no debe crear el rol de la prod Proxmox retirada',
  );
});
