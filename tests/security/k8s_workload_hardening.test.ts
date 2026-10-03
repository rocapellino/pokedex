/**
 * ==============================================================================
 * Test de Seguridad y Arquitectura: Hardening de Cargas Kubernetes, Kyverno, PSS Restricted y Orquestación Helm/GitOps
 * ==============================================================================
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCompleteTaskfileContent } from '../helpers/taskfile.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../');

test('🛡️ Helm Security: PostgreSQL y PgBouncer configuran readOnlyRootFilesystem y montajes emptyDir', () => {
  const pgPath = path.join(ROOT_DIR, 'infra/helm/pokedex/templates/postgres-statefulset.yaml');
  const pgbouncerPath = path.join(ROOT_DIR, 'infra/helm/pokedex/templates/pgbouncer-deployment.yaml');

  assert.ok(fs.existsSync(pgPath), 'postgres-statefulset.yaml debe existir');
  assert.ok(fs.existsSync(pgbouncerPath), 'pgbouncer-deployment.yaml debe existir');

  const pgContent = fs.readFileSync(pgPath, 'utf-8');
  assert.ok(pgContent.includes('readOnlyRootFilesystem: true'), 'PostgreSQL debe tener readOnlyRootFilesystem: true');
  assert.ok(pgContent.includes('mountPath: /tmp'), 'PostgreSQL debe montar /tmp');
  assert.ok(pgContent.includes('mountPath: /var/run/postgresql'), 'PostgreSQL debe montar /var/run/postgresql');

  const pgbContent = fs.readFileSync(pgbouncerPath, 'utf-8');
  assert.ok(pgbContent.includes('readOnlyRootFilesystem: true'), 'PgBouncer debe tener readOnlyRootFilesystem: true');
  assert.ok(pgbContent.includes('mountPath: /tmp'), 'PgBouncer debe montar /tmp');
});

test('🛡️ Helm Security: Workloads K8s deshabilitan automountServiceAccountToken (Least Privilege)', () => {
  const workloads = [
    'infra/helm/pokedex/templates/seed-job.yaml',
    'infra/helm/pokedex/templates/backup-cronjob.yaml',
    'infra/helm/pokedex/templates/api-deployment.yaml',
    'infra/helm/pokedex/templates/web-deployment.yaml',
    'infra/helm/pokedex/templates/postgres-statefulset.yaml',
    'infra/helm/pokedex/templates/redis-deployment.yaml',
    'infra/helm/pokedex/templates/pgbouncer-deployment.yaml',
  ];

  for (const relPath of workloads) {
    const fullPath = path.join(ROOT_DIR, relPath);
    assert.ok(fs.existsSync(fullPath), `${relPath} debe existir`);
    const content = fs.readFileSync(fullPath, 'utf-8');
    assert.ok(
      content.includes('automountServiceAccountToken: false'),
      `${relPath} debe declarar explícitamente automountServiceAccountToken: false`
    );
  }
});

test('🛡️ Helm Security: seed-job.yaml declara requests y limits de ephemeral-storage', () => {
  const seedPath = path.join(ROOT_DIR, 'infra/helm/pokedex/templates/seed-job.yaml');
  assert.ok(fs.existsSync(seedPath), 'seed-job.yaml debe existir');
  const content = fs.readFileSync(seedPath, 'utf-8');
  assert.ok(content.includes('ephemeral-storage: 50Mi'), 'seed-job debe declarar request de ephemeral-storage');
  assert.ok(content.includes('ephemeral-storage: 256Mi'), 'seed-job debe declarar limit de ephemeral-storage');
});

test('🛡️ K8s Quality & High Availability: api y web deployments implementan topologySpreadConstraints', () => {
  const deployments = [
    'infra/helm/pokedex/templates/api-deployment.yaml',
    'infra/helm/pokedex/templates/web-deployment.yaml',
  ];

  for (const relPath of deployments) {
    const fullPath = path.join(ROOT_DIR, relPath);
    assert.ok(fs.existsSync(fullPath), `${relPath} debe existir`);
    const content = fs.readFileSync(fullPath, 'utf-8');
    assert.ok(
      content.includes('topologySpreadConstraints:'),
      `${relPath} debe soportar topologySpreadConstraints para alta disponibilidad`
    );
  }

  const prodValuesPath = path.join(ROOT_DIR, 'infra/helm/pokedex/values.prod.yaml');
  const prodContent = fs.readFileSync(prodValuesPath, 'utf-8');
  assert.ok(
    prodContent.includes('topologySpreadConstraints:'),
    'values.prod.yaml debe configurar topologySpreadConstraints'
  );
  assert.ok(
    !prodContent.includes('tag: "latest"'),
    'values.prod.yaml no debe utilizar el tag :latest en producción'
  );
});

test('🛡️ K8s Quality Gates: infra.yaml integra kubeconform, kube-linter y kyverno test', () => {
  const workflowPath = path.join(ROOT_DIR, '.github/workflows/infra.yaml');
  assert.ok(fs.existsSync(workflowPath), 'infra.yaml debe existir');
  const content = fs.readFileSync(workflowPath, 'utf-8');

  assert.ok(content.includes('kubeconform'), 'infra.yaml debe ejecutar kubeconform para esquemas K8s');
  assert.ok(content.includes('kube-linter'), 'infra.yaml debe ejecutar kube-linter para mejores prácticas');
  assert.ok(content.includes('kyverno test'), 'infra.yaml debe ejecutar kyverno test para políticas de admisión');
  assert.ok(content.includes('image:.*:latest'), 'infra.yaml debe validar y prohibir :latest en producción');

  const kubeLinterConfig = path.join(ROOT_DIR, '.kube-linter.yaml');
  assert.ok(fs.existsSync(kubeLinterConfig), '.kube-linter.yaml debe existir');

  const kyvernoPolicy = path.join(ROOT_DIR, 'infra/k8s/policies/disallow-latest-tag.yaml');
  assert.ok(fs.existsSync(kyvernoPolicy), 'disallow-latest-tag.yaml debe existir');

  const kyvernoTest = path.join(ROOT_DIR, 'infra/k8s/kyverno-test/kyverno-test.yaml');
  assert.ok(fs.existsSync(kyvernoTest), 'kyverno-test.yaml debe existir');
});

test('🛡️ Kyverno Security: ClusterPolicy pod-security-standards define perfil Restricted en tiempo de admisión', () => {
  const policyPath = path.join(ROOT_DIR, 'infra/k8s/policies/pod-security-standards.yaml');
  assert.ok(fs.existsSync(policyPath), 'pod-security-standards.yaml debe existir');
  const content = fs.readFileSync(policyPath, 'utf-8');

  assert.ok(content.includes('require-run-as-non-root'), 'Debe exigir runAsNonRoot');
  assert.ok(content.includes('disallow-privileged-containers'), 'Debe prohibir contenedores privilegiados');
  assert.ok(content.includes('require-readonly-rootfs'), 'Debe exigir readOnlyRootFilesystem');
  assert.ok(content.includes('disallow-privilege-escalation'), 'Debe prohibir escalada de privilegios');
  assert.ok(content.includes('require-drop-all-capabilities'), 'Debe exigir drop: [ALL]');

  const testSuitePath = path.join(ROOT_DIR, 'infra/k8s/kyverno-test/pod-security-standards/kyverno-test.yaml');
  assert.ok(fs.existsSync(testSuitePath), 'kyverno-test.yaml de PSS debe existir');
  const testContent = fs.readFileSync(testSuitePath, 'utf-8');
  assert.ok(testContent.includes('pod-security-standards'), 'Debe testear la política pod-security-standards');
});

test('🛡️ Dockerfile SSOT: apps/backend/Dockerfile es la definición canónica del backend y /Dockerfile no existe', () => {
  const rootDockerPath = path.join(ROOT_DIR, 'Dockerfile');
  const backendDockerPath = path.join(ROOT_DIR, 'apps/backend/Dockerfile');

  assert.ok(!fs.existsSync(rootDockerPath), 'El Dockerfile espejo en la raíz no debe existir (la SSOT canónica es apps/backend/Dockerfile)');
  assert.ok(fs.existsSync(backendDockerPath), 'apps/backend/Dockerfile debe existir como SSOT');

  const backendContent = fs.readFileSync(backendDockerPath, 'utf-8');
  assert.match(backendContent, /FROM node:22-alpine/, 'apps/backend/Dockerfile debe usar la imagen base node:22-alpine');
  assert.match(backendContent, /USER (?:1000:1000|node)/, 'apps/backend/Dockerfile debe ejecutar como usuario no privilegiado (UID 1000 o node)');

  const ciWorkflow = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/ci.yaml'), 'utf-8');
  assert.match(ciWorkflow, /file:\s*\.\/apps\/backend\/Dockerfile/, 'ci.yaml debe compilar con ./apps/backend/Dockerfile');

  const infraWorkflow = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/infra.yaml'), 'utf-8');
  assert.match(infraWorkflow, /-f apps\/backend\/Dockerfile \./, 'infra.yaml debe compilar con apps/backend/Dockerfile');
});

test('🛡️ Cloud-Native Secrets: infra/k8s/eso define arquitectura declarativa de External Secrets Operator', () => {
  const esoDir = path.join(ROOT_DIR, 'infra/k8s/eso');
  assert.ok(fs.existsSync(esoDir), 'Directorio de ESO debe existir');

  const storePath = path.join(esoDir, 'cluster-secret-store.yaml');
  const secretPath = path.join(esoDir, 'external-secret-pokedex.yaml');
  const readmePath = path.join(esoDir, 'README.md');

  assert.ok(fs.existsSync(storePath), 'cluster-secret-store.yaml debe existir');
  assert.ok(fs.existsSync(secretPath), 'external-secret-pokedex.yaml debe existir');
  assert.ok(fs.existsSync(readmePath), 'README.md de ESO debe existir');


/**
 * GITOPS-003 — `gitops/` es SSOT y debe estar documentado.
 *
 * `docs/audits/README.md` declara `gitops/` como fuente única de verdad del
 * despliegue, pero era el único directorio de primer nivel sin README: ni
 * `infra/`, ni `infra/ansible/`, ni `infra/k8s/eso/`, ni `infra/opentofu/` lo
 * tenían. Sin punto de entrada, el modelo App-of-Apps y el estado
 * activo/inactivo por entorno sólo se deducen leyendo cuatro manifiestos.
 *
 * El gate valida el CONTENIDO, no la existencia: un README con afirmaciones
 * falsas es peor que ninguno, porque orienta al operador en la dirección
 * equivocada.
 */
test('🗂️ GITOPS-003: el árbol GitOps está documentado y sus afirmaciones son ciertas', () => {
  const readmePath = path.join(ROOT_DIR, 'gitops/README.md');
  assert.ok(fs.existsSync(readmePath), 'GITOPS-003: gitops/ debe tener README.md');

  const readme = fs.readFileSync(readmePath, 'utf-8');

  // 1. Declara el modelo App-of-Apps y el estado de cada entorno.
  assert.match(readme, /App-of-Apps/, 'El README debe explicar el modelo App-of-Apps');
  assert.match(
    readme,
    /pokedex-cloud[\s\S]*INACTIV/,
    'El README debe declarar que el blueprint de AWS es una referencia inactiva'
  );

  // 2. Los endpoints citados deben existir REALES en los manifiestos. Un README
  //    que documenta un cluster inexistente desvia la depuracion.
  const appProxmox = fs.readFileSync(
    path.join(ROOT_DIR, 'gitops/apps/app-proxmox.yaml'),
    'utf-8'
  );
  const appPreprod = fs.readFileSync(
    path.join(ROOT_DIR, 'gitops/apps/app-proxmox-preprod.yaml'),
    'utf-8'
  );
  for (const endpoint of ['k8s-proxmox.internal.lan', 'k8s-preprod.internal.lan']) {
    assert.ok(
      appProxmox.includes(endpoint) || appPreprod.includes(endpoint),
      `GITOPS-003: el README cita ${endpoint} pero no existe en ninguna Application activa`
    );
  }

  // 3. La afirmacion "AWS esta excluido del App-of-Apps" debe ser CIERTA: se lee
  //    del bloque `exclude` del manifiesto raiz, no del README.
  const rootApp = fs.readFileSync(
    path.join(ROOT_DIR, 'gitops/apps/root-application.yaml'),
    'utf-8'
  );
  const excludeBlock = rootApp.match(/exclude:\s*\|([\s\S]*?)\n\s{2}\w/s)?.[1] ?? '';
  assert.match(
    excludeBlock,
    /app-cloud\.yaml/,
    'GITOPS-003: el README afirma que app-cloud.yaml esta excluido, pero el manifiesto raiz no lo excluye'
  );
  assert.match(
    excludeBlock,
    /root-application\.yaml/,
    'GITOPS-003: el root-application.yaml debe excluirse a si mismo'
  );

  // 4. Todo enlace relativo del README debe resolver. Un enlace roto en la
  //    documentacion de SSOT es peor que no enlazar.
  const links = [...readme.matchAll(/\]\(([^)#:]+\.(?:md|yaml|yml))\)/g)].map((m) => m[1]);
  assert.ok(links.length > 0, 'El README debe enlazar documentacion relacionada');
  for (const link of links) {
    const target = path.resolve(path.dirname(readmePath), link);
    assert.ok(
      fs.existsSync(target),
      `GITOPS-003: enlace roto en gitops/README.md -> ${link}`
    );
  }
});

  const storeContent = fs.readFileSync(storePath, 'utf-8');
  assert.ok(storeContent.includes('kind: ClusterSecretStore'), 'Debe definir ClusterSecretStore');

  const secretContent = fs.readFileSync(secretPath, 'utf-8');
  assert.ok(secretContent.includes('kind: ExternalSecret'), 'Debe definir ExternalSecret');
  assert.ok(secretContent.includes('POSTGRES_PASSWORD'), 'Debe mapear POSTGRES_PASSWORD');
  assert.ok(secretContent.includes('GEMINI_API_KEY'), 'Debe mapear GEMINI_API_KEY');
});

test('🛡️ Helm Resiliencia & Gobernanza: el perfil de referencia y los templates configuran PDB, ResourceQuota y LimitRange', () => {
  // INFRA-011: `values.prod.yaml` es un PERFIL DE REFERENCIA. Ninguna Application
  // de ArgoCD lo consume (las tres usan `values.yaml` + su override de
  // `gitops/environments/`), por lo que este test verifica la CONFIGURACION del
  // perfil, no una garantia operativa de un entorno desplegado.
  const valuesProdPath = path.join(ROOT_DIR, 'infra/helm/pokedex/values.prod.yaml');
  const pdbPath = path.join(ROOT_DIR, 'infra/helm/pokedex/templates/pdb.yaml');
  const quotaPath = path.join(ROOT_DIR, 'infra/helm/pokedex/templates/resourcequota.yaml');
  const limitRangePath = path.join(ROOT_DIR, 'infra/helm/pokedex/templates/limitrange.yaml');
  const infraCiPath = path.join(ROOT_DIR, '.github/workflows/infra.yaml');

  assert.ok(fs.existsSync(valuesProdPath), 'values.prod.yaml debe existir');
  assert.ok(fs.existsSync(pdbPath), 'pdb.yaml debe existir');
  assert.ok(fs.existsSync(quotaPath), 'resourcequota.yaml debe existir');
  assert.ok(fs.existsSync(limitRangePath), 'limitrange.yaml debe existir');
  assert.ok(fs.existsSync(infraCiPath), 'infra.yaml debe existir');

  const valuesProdContent = fs.readFileSync(valuesProdPath, 'utf-8');
  assert.ok(valuesProdContent.includes('podDisruptionBudget:'), 'values.prod.yaml debe configurar podDisruptionBudget');
  assert.ok(valuesProdContent.includes('resourceQuota:'), 'values.prod.yaml debe configurar resourceQuota');
  assert.ok(valuesProdContent.includes('limitRange:'), 'values.prod.yaml debe configurar limitRange');

  const infraCiContent = fs.readFileSync(infraCiPath, 'utf-8');
  assert.ok(infraCiContent.includes('kind: PodDisruptionBudget'), 'infra.yaml debe validar PodDisruptionBudget en prod');
  assert.ok(infraCiContent.includes('kind: ResourceQuota'), 'infra.yaml debe validar ResourceQuota en prod');
  assert.ok(infraCiContent.includes('kind: LimitRange'), 'infra.yaml debe validar LimitRange en prod');
});

test('🛡️ Autoescalado & Resiliencia: ADR-014 formaliza HPA v2, PodDisruptionBudget y TopologySpreadConstraints', () => {
  const adrPath = path.join(ROOT_DIR, 'docs/decisions/ADR-014-elastic-autoscaling-hpa-and-pod-disruption-budget.md');
  const readmePath = path.join(ROOT_DIR, 'README.md');
  const docsReadmePath = path.join(ROOT_DIR, 'docs/README.md');

  assert.ok(fs.existsSync(adrPath), 'ADR-014 debe existir en docs/decisions/');
  const adrContent = fs.readFileSync(adrPath, 'utf-8');

  assert.ok(adrContent.replace(/\r\n/g, '\n').includes('## Estado\n\nAceptado'), 'ADR-014 debe estar aceptado');
  assert.ok(adrContent.includes('autoscaling/v2'), 'ADR-014 debe documentar HPA autoscaling/v2');
  assert.ok(adrContent.includes('PodDisruptionBudget'), 'ADR-014 debe documentar PodDisruptionBudget');
  assert.ok(adrContent.includes('topologySpreadConstraints') || adrContent.includes('TopologySpreadConstraints'), 'ADR-014 debe documentar TopologySpreadConstraints');
  assert.ok(adrContent.includes('scaleDown') || adrContent.includes('Scale Down') || adrContent.includes('estabilización'), 'ADR-014 debe documentar políticas de estabilización para mitigar flapping');
  assert.ok(adrContent.includes('minAvailable: 1') || adrContent.includes('minAvailable'), 'ADR-014 debe documentar minAvailable en PDB');

  const readmeContent = fs.readFileSync(readmePath, 'utf-8');
  assert.ok(readmeContent.includes('ADR-014-elastic-autoscaling-hpa-and-pod-disruption-budget.md'), 'README.md debe enlazar ADR-014');

  const docsReadmeContent = fs.readFileSync(docsReadmePath, 'utf-8');
  assert.ok(docsReadmeContent.includes('ADR-014-elastic-autoscaling-hpa-and-pod-disruption-budget.md'), 'docs/README.md debe enlazar ADR-014');
  assert.ok(docsReadmeContent.includes('ADR-001 a ADR-014') || docsReadmeContent.includes('ADR-001 a ADR-015') || docsReadmeContent.includes('ADR-001 a ADR-016') || docsReadmeContent.includes('ADR-001 a ADR-017') || docsReadmeContent.includes('ADR-001 a ADR-018') || docsReadmeContent.includes('ADR-001 a ADR-019') || docsReadmeContent.includes('ADR-001 a ADR-020') || docsReadmeContent.includes('ADR-001 a ADR-021') || docsReadmeContent.includes('ADR-001 a ADR-022'), 'Mermaid en docs/README.md debe indicar ADR-001 a ADR-014 o posterior');

  // Validar que los 14 ADRs existen físicamente en disco
  for (let i = 1; i <= 14; i++) {
    const num = String(i).padStart(3, '0');
    const files = fs.readdirSync(path.join(ROOT_DIR, 'docs/decisions'));
    const match = files.find(f => f.startsWith(`ADR-${num}`));
    assert.ok(match, `Debe existir archivo para ADR-${num} en docs/decisions/`);
  }
});

test('🛡️ Ciclo de Vida & Resiliencia: ADR-015 formaliza Graceful Shutdown, closeStorage y sondas /healthz y /readyz', () => {
  const adrPath = path.join(ROOT_DIR, 'docs/decisions/ADR-015-pod-lifecycle-graceful-shutdown-and-probes.md');
  const readmePath = path.join(ROOT_DIR, 'README.md');
  const docsReadmePath = path.join(ROOT_DIR, 'docs/README.md');
  const helmApiDeploymentPath = path.join(ROOT_DIR, 'infra/helm/pokedex/templates/api-deployment.yaml');
  const helmValuesPath = path.join(ROOT_DIR, 'infra/helm/pokedex/values.yaml');

  assert.ok(fs.existsSync(adrPath), 'ADR-015 debe existir en docs/decisions/');
  const adrContent = fs.readFileSync(adrPath, 'utf-8');

  assert.ok(adrContent.replace(/\r\n/g, '\n').includes('## Estado\n\nAceptado'), 'ADR-015 debe estar aceptado');
  assert.ok(adrContent.includes('SIGTERM') && adrContent.includes('SIGINT'), 'ADR-015 debe documentar señales SIGTERM y SIGINT');
  assert.ok(adrContent.includes('setupGracefulShutdown'), 'ADR-015 debe documentar setupGracefulShutdown');
  assert.ok(adrContent.includes('closeStorage'), 'ADR-015 debe documentar closeStorage');
  assert.ok(adrContent.includes('/healthz'), 'ADR-015 debe documentar sonda /healthz');
  assert.ok(adrContent.includes('/readyz'), 'ADR-015 debe documentar sonda /readyz');
  assert.ok(adrContent.includes('terminationGracePeriodSeconds: 30') || adrContent.includes('terminationGracePeriodSeconds'), 'ADR-015 debe documentar terminationGracePeriodSeconds');

  const readmeContent = fs.readFileSync(readmePath, 'utf-8');
  assert.ok(readmeContent.includes('ADR-015-pod-lifecycle-graceful-shutdown-and-probes.md'), 'README.md debe enlazar ADR-015');

  const docsReadmeContent = fs.readFileSync(docsReadmePath, 'utf-8');
  assert.ok(docsReadmeContent.includes('ADR-015-pod-lifecycle-graceful-shutdown-and-probes.md'), 'docs/README.md debe enlazar ADR-015');
  assert.ok(docsReadmeContent.includes('ADR-001 a ADR-015') || docsReadmeContent.includes('ADR-001 a ADR-016') || docsReadmeContent.includes('ADR-001 a ADR-017') || docsReadmeContent.includes('ADR-001 a ADR-018') || docsReadmeContent.includes('ADR-001 a ADR-019') || docsReadmeContent.includes('ADR-001 a ADR-020') || docsReadmeContent.includes('ADR-001 a ADR-021') || docsReadmeContent.includes('ADR-001 a ADR-022'), 'Mermaid en docs/README.md debe indicar ADR-001 a ADR-015 o posterior');

  const helmApiContent = fs.readFileSync(helmApiDeploymentPath, 'utf-8');
  assert.ok(helmApiContent.includes('terminationGracePeriodSeconds:'), 'api-deployment.yaml debe configurar terminationGracePeriodSeconds');

  const helmValuesContent = fs.readFileSync(helmValuesPath, 'utf-8');
  assert.ok(helmValuesContent.includes('terminationGracePeriodSeconds: 30'), 'values.yaml debe fijar terminationGracePeriodSeconds: 30');

  // Validar que los 15 ADRs existen físicamente en disco
test('🛡️ GITOPS-005: todo entorno GitOps activo debe renderizarse en CI', () => {
  // `proxmox-preprod` es un target ACTIVO: `root-application.yaml` lo gobierna via
  // App-of-Apps y sus values existen completos. Antes de este cambio, `infra.yaml`
  // renderizaba solo `proxmox` y `aws`, de modo que un error de template, de valores
  // o de paridad en preprod solo se detectaba al sincronizar contra el cluster real.
  const infraWorkflow = fs.readFileSync(
    path.join(ROOT_DIR, '.github/workflows/infra.yaml'),
    'utf-8'
  );

  // 1. Determinar los targets ACTIVOS a partir del App-of-Apps, que es la
  //    declaracion de verdad. `app-cloud.yaml` esta excluido (GITOPS-001).
  const rootApp = fs.readFileSync(
    path.join(ROOT_DIR, 'gitops/apps/root-application.yaml'),
    'utf-8'
  );
  const excludeBlock = rootApp.match(/exclude:\s*\|([\s\S]*?)\n\s{2}\w/s)?.[1] ?? '';
  const excluded = excludeBlock
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.endsWith('.yaml'));

  const gitopsAppsDir = path.join(ROOT_DIR, 'gitops/apps');
  const appFiles = fs
    .readdirSync(gitopsAppsDir)
    .filter((f) => f.startsWith('app-') && f.endsWith('.yaml'));

  const activeEnvs = appFiles
    .filter((f) => !excluded.includes(f))
    .map((f) => f.replace(/^app-/, '').replace(/\.yaml$/, ''));

  assert.ok(
    activeEnvs.includes('proxmox-preprod'),
    'INFRA-005: se espera que proxmox-preprod sea un target activo segun el App-of-Apps'
  );

  // 2. Cada entorno activo debe renderizarse en el workflow de infraestructura.
  for (const env of activeEnvs) {
    const valuesFile = `gitops/environments/${env}/values.yaml`;
    assert.ok(
      fs.existsSync(path.join(ROOT_DIR, valuesFile)),
      `INFRA-005: el entorno activo ${env} debe tener ${valuesFile}`
    );
    assert.ok(
      infraWorkflow.includes(valuesFile),
      `GITOPS-005: infra.yaml debe renderizar el entorno activo ${env} (${valuesFile}); ` +
      'un error en el solo se detectaria al sincronizar contra el cluster real.'
    );
  }

  // 3. El render debe pasar las validaciones de esquema y de buenas practicas.
  assert.ok(
    infraWorkflow.includes('/tmp/rendered-proxmox-preprod.yaml'),
    'GITOPS-005: debe verificarse que el render de preprod no esta vacio'
  );
  const kubeconformLine = infraWorkflow.match(/kubeconform[^\n]*rendered-dev\.yaml[^\n]*/)?.[0] ?? '';
  assert.ok(
    kubeconformLine.includes('rendered-proxmox-preprod.yaml'),
    'GITOPS-005: kubeconform debe validar tambien el render de preprod'
  );
  const lintLine = infraWorkflow.match(/kube-linter lint[^\n]*/)?.[0] ?? '';
  assert.ok(
    lintLine.includes('rendered-proxmox-preprod.yaml'),
    'GITOPS-005: kube-linter debe validar tambien el render de preprod'
  );

  // 4. Anti-regresion: ningun entorno activo puede quedar fuera del render por
  //    descuido. El numero de entornos declarados debe coincidir con los renderizados.
  const renderedCount = (infraWorkflow.match(/gitops\/environments\/[a-z-]+\/values\.yaml/g) ?? [])
    .length;
  assert.ok(
    renderedCount >= activeEnvs.length,
    `GITOPS-005: se renderizan ${renderedCount} entornos pero hay ${activeEnvs.length} activos (${activeEnvs.join(', ')})`
  );
});


  for (let i = 1; i <= 15; i++) {
    const num = String(i).padStart(3, '0');
    const files = fs.readdirSync(path.join(ROOT_DIR, 'docs/decisions'));
    const match = files.find(f => f.startsWith(`ADR-${num}`));
    assert.ok(match, `Debe existir archivo para ADR-${num} en docs/decisions/`);
  }
});

test('🛡️ Backend Lifecycle: closeStorage y setShuttingDownForTest gestionan el estado de apagado grácil', async () => {
  const dbMod: any = fs.existsSync(path.join(ROOT_DIR, 'apps/backend/src/services/db.js'))
    ? await import('../../apps/backend/src/services/db.js')
    : await import('../../apps/backend/src/services/db.ts');
  const { closeStorage } = dbMod;
  assert.equal(typeof closeStorage, 'function', 'closeStorage debe ser una función exportada');

  // closeStorage debe ser idempotente y resolver sin error
  await assert.doesNotReject(async () => {
    await closeStorage();
  }, 'closeStorage debe resolver limpiamente sin arrojar errores');

  const serverMod: any = fs.existsSync(path.join(ROOT_DIR, 'apps/backend/server.js'))
    ? await import('../../apps/backend/server.js')
    : await import('../../apps/backend/server.ts');
  const { getLifecycleStatus, setShuttingDownForTest } = serverMod;
  assert.equal(typeof getLifecycleStatus, 'function', 'getLifecycleStatus debe ser una función');
  assert.equal(typeof setShuttingDownForTest, 'function', 'setShuttingDownForTest debe ser una función');

  // Inicialmente no está apagando
  assert.equal(getLifecycleStatus().isShuttingDown, false);

  // Simular transición a apagado
  setShuttingDownForTest(true);
  assert.equal(getLifecycleStatus().isShuttingDown, true);

  // Restaurar estado
  setShuttingDownForTest(false);
  assert.equal(getLifecycleStatus().isShuttingDown, false);
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
  assert.ok(adrContent.replace(/\r\n/g, '\n').includes('## Estado\n\nAceptado'), 'ADR-017 debe estar en estado Aceptado');

  // 2. ADR-017 documenta las tres capas de control de admisión
  assert.ok(
    adrContent.includes('pod-security-standards') || adrContent.includes('PSS'),
    'ADR-017 debe documentar Pod Security Standards'
  );
  assert.ok(
    adrContent.includes('disallow-latest-tag') || adrContent.includes('latest'),
    'ADR-017 debe documentar política disallow-latest-tag'
  );
  assert.ok(
    adrContent.includes('require-seccomp-profile') || adrContent.includes('seccomp'),
    'ADR-017 debe documentar política require-seccomp-profile'
  );
  assert.ok(
    adrContent.includes('Cosign') || adrContent.includes('cosign'),
    'ADR-017 debe documentar política de verificación Cosign'
  );
  assert.ok(
    adrContent.includes('Enforce'),
    'ADR-017 debe documentar validationFailureAction: Enforce'
  );
  assert.ok(
    adrContent.includes('kyverno test') || adrContent.includes('kyverno-test'),
    'ADR-017 debe documentar validación CI con kyverno test'
  );
  assert.ok(
    adrContent.includes('restricted') || adrContent.includes('Restricted'),
    'ADR-017 debe documentar PSA nivel restricted'
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
  assert.ok(seccompContent.includes('Enforce'), 'require-seccomp-profile.yaml debe usar validationFailureAction: Enforce');

  // 5. Namespace PSA en modo restricted
  const nsContent = fs.readFileSync(namespacePsaPath, 'utf-8');
  assert.ok(nsContent.includes('pod-security.kubernetes.io/enforce: restricted'), 'Namespace debe tener PSA enforce: restricted');

  // 6. Suite de tests de seccomp existe
  const seccompTestPath = path.join(ROOT_DIR, 'infra/k8s/kyverno-test/require-seccomp-profile/kyverno-test.yaml');
  assert.ok(fs.existsSync(seccompTestPath), 'kyverno-test.yaml de seccomp debe existir');
  const seccompTestContent = fs.readFileSync(seccompTestPath, 'utf-8');
  assert.ok(seccompTestContent.includes('require-seccomp-profile'), 'Debe testear la política require-seccomp-profile');

  // 7. README.md y docs/README.md enlazan ADR-017
  const readmeContent = fs.readFileSync(readmePath, 'utf-8');
  assert.ok(readmeContent.includes('ADR-017-kyverno-admission-control-and-pod-security.md'), 'README.md debe enlazar ADR-017');

  const docsReadmeContent = fs.readFileSync(docsReadmePath, 'utf-8');
  assert.ok(docsReadmeContent.includes('ADR-017-kyverno-admission-control-and-pod-security.md'), 'docs/README.md debe enlazar ADR-017');
  assert.ok(
    docsReadmeContent.includes('ADR-001 a ADR-017') || docsReadmeContent.includes('ADR-001 a ADR-018') || docsReadmeContent.includes('ADR-001 a ADR-019') || docsReadmeContent.includes('ADR-001 a ADR-020') || docsReadmeContent.includes('ADR-001 a ADR-021') || docsReadmeContent.includes('ADR-001 a ADR-022'),
    'Mermaid en docs/README.md debe indicar ADR-001 a ADR-017 o posterior'
  );

  // 8. Los 17 ADRs existen físicamente en disco
  for (let i = 1; i <= 17; i++) {
    const num = String(i).padStart(3, '0');
    const files = fs.readdirSync(path.join(ROOT_DIR, 'docs/decisions'));
    const match = files.find(f => f.startsWith(`ADR-${num}`));
    assert.ok(match, `Debe existir archivo para ADR-${num} en docs/decisions/`);
  }
});

test('🔒 GITOPS-001: la referencia inactiva de Cloud queda excluida del App-of-Apps', () => {
  // El defecto original: `app-cloud.yaml` se describia como plantilla de
  // referencia, pero `root-application.yaml` lo descubria (el `exclude` solo
  // filtraba el propio root). Con `syncPolicy.automated`, ArgoCD intentaba
  // desplegar en AWS contra un endpoint EKS que no esta registrado.
  //
  // Este gate blinda la exclusion. Si alguien reintroduce la referencia en el
  // conjunto gobernado por el root, la suite falla antes de que llegue al
  // despliegue.
  const rootApp = fs.readFileSync(
    path.join(ROOT_DIR, 'gitops/apps/root-application.yaml'),
    'utf-8'
  );
  const appCloud = fs.readFileSync(
    path.join(ROOT_DIR, 'gitops/apps/app-cloud.yaml'),
    'utf-8'
  );

  // 1. El root DEBE excluir explicitamente el manifiesto de referencia.
  assert.match(
    rootApp,
    /exclude:[\s\S]*?app-cloud\.yaml/,
    'GITOPS-001: root-application.yaml debe excluir app-cloud.yaml del descubrimiento'
  );

  // 2. El root NO debe descubrir de forma implicita ningun otro manifiesto.
  //    Solo se gobiernan prod y preprod; cualquier cuarto archivo seria un
  //    despliegue no declarado.
  const excludeBlock = /exclude:\s*([\s\S]*?)(?=\n  [a-z]|\n\n|$)/.exec(rootApp)?.[1] ?? '';
  const excluded = excludeBlock
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.endsWith('.yaml'));
  assert.deepEqual(
    excluded.sort(),
    ['app-cloud.yaml', 'root-application.yaml'],
    'GITOPS-001: el conjunto excluido debe ser exactamente {root, cloud}. ' +
      'Proxmox y preprod son los unicos targets activos.'
  );

  // 3. La referencia no debe declarar semantica de produccion: una ventana de
  //    freeze de 62h sobre un manifiesto que no se despliega es contradictoria.
  assert.ok(
    !appCloud.includes('syncWindows:'),
    'GITOPS-001: la referencia inactiva no debe declarar syncWindows de produccion'
  );

  // 4. El estado debe quedar escrito, no solo inferido del comportamiento.
  assert.match(
    appCloud,
    /INACTIVA/,
    'GITOPS-001: app-cloud.yaml debe declarar su estado inactivo de forma explicita'
  );

  // 5. La referencia inactiva debe portar anotación de status y no definir auto-sync activo
  assert.ok(
    appCloud.includes('architecture.pokedex.io/status: "inactive"'),
    'GITOPS-001: app-cloud.yaml debe declarar la anotación architecture.pokedex.io/status: "inactive"'
  );
  assert.ok(
    !/^\s*automated:\s*$/m.test(appCloud),
    'GITOPS-001: la referencia inactiva no debe tener syncPolicy.automated activo'
  );
});

test('🛡️ Orquestación GitOps Avanzada: ADR-021 formaliza Sync Waves, PreSync Hooks, Health Checks y App-of-Apps', async () => {
  const adrPath = path.join(ROOT_DIR, 'docs/decisions/ADR-021-advanced-gitops-sync-waves-and-health-checks.md');
  const rootAppPath = path.join(ROOT_DIR, 'gitops/apps/root-application.yaml');
  const appProxmoxPath = path.join(ROOT_DIR, 'gitops/apps/app-proxmox.yaml');
  const appCloudPath = path.join(ROOT_DIR, 'gitops/apps/app-cloud.yaml');
  const healthChecksPath = path.join(ROOT_DIR, 'gitops/health-checks/argocd-cm-healthchecks.yaml');
  const seedJobPath = path.join(ROOT_DIR, 'infra/helm/pokedex/templates/seed-job.yaml');
  const postgresStsPath = path.join(ROOT_DIR, 'infra/helm/pokedex/templates/postgres-statefulset.yaml');
  const apiDeploymentPath = path.join(ROOT_DIR, 'infra/helm/pokedex/templates/api-deployment.yaml');
  const webDeploymentPath = path.join(ROOT_DIR, 'infra/helm/pokedex/templates/web-deployment.yaml');
  const ingressPath = path.join(ROOT_DIR, 'infra/helm/pokedex/templates/ingress.yaml');
  const taskfilePath = path.join(ROOT_DIR, 'Taskfile.yaml');
  const deploymentRunbookPath = path.join(ROOT_DIR, 'docs/operations/deployment.md');
  const docsReadmePath = path.join(ROOT_DIR, 'docs/README.md');
  const readmePath = path.join(ROOT_DIR, 'README.md');

  // 1. ADR-021 existe y está aceptado
  assert.ok(fs.existsSync(adrPath), 'ADR-021 debe existir en docs/decisions/');
  const adrContent = fs.readFileSync(adrPath, 'utf-8');
  assert.ok(adrContent.replace(/\r\n/g, '\n').includes('## Estado\n\nAceptado'), 'ADR-021 debe estar en estado Aceptado');
  assert.ok(adrContent.includes('Sync Waves'), 'ADR-021 debe documentar Sync Waves');
  assert.ok(adrContent.includes('PreSync'), 'ADR-021 debe documentar PreSync hook');
  assert.ok(adrContent.includes('App-of-Apps'), 'ADR-021 debe documentar patrón App-of-Apps');
  assert.ok(adrContent.includes('Health Checks'), 'ADR-021 debe documentar Custom Health Checks');

  // 2. root-application.yaml existe y define App-of-Apps
  assert.ok(fs.existsSync(rootAppPath), 'root-application.yaml debe existir en gitops/apps/');
  const rootAppContent = fs.readFileSync(rootAppPath, 'utf-8');
  assert.ok(rootAppContent.includes('pokedex-root'), 'root-application.yaml debe nombrar la app pokedex-root');
  assert.ok(rootAppContent.includes('gitops/apps'), 'root-application.yaml debe apuntar a gitops/apps');
  assert.match(
    rootAppContent,
    /-\s+resources-finalizer\.argocd\.argoproj\.io/,
    'root-application.yaml debe incluir finalizer'
  );

  // 3. Health checks existen y cubren CRDs críticos (ExternalSecret y ClusterPolicy; SealedSecret purgado)
  assert.ok(fs.existsSync(healthChecksPath), 'argocd-cm-healthchecks.yaml debe existir en gitops/health-checks/');
  const healthContent = fs.readFileSync(healthChecksPath, 'utf-8');
  assert.ok(healthContent.includes('external-secrets.io_ExternalSecret'), 'Debe definir health check para ExternalSecret');
  assert.ok(!healthContent.includes('bitnami.com_SealedSecret'), 'No debe contener health check residual de SealedSecret');
  assert.ok(healthContent.includes('kyverno.io_ClusterPolicy'), 'Debe definir health check para ClusterPolicy');

  // 3.1 GITOPS-001: el manifiesto debe extender `argocd-cm`, NO un ConfigMap homónimo.
  // ArgoCD carga los scripts `resource.customizations.health.*` únicamente desde el
  // ConfigMap `argocd-cm`. Declarar otro nombre (p. ej. `argocd-cm-healthchecks`) hace
  // que el manifiesto se aplique sin error pero sea IGNORADO en silencio, con lo que los
  // CRDs no sincronizados se reportan Healthy por ausencia de condición. Estas
  // aserciones fallan si se revierte el fix.
  assert.match(
    healthContent,
    /^\s*name:\s*argocd-cm\s*$/m,
    'GITOPS-001: el manifiesto debe parchear el ConfigMap `argocd-cm`, el único que ArgoCD lee'
  );
  assert.ok(
    !/^\s*name:\s*argocd-cm-healthchecks\s*$/m.test(healthContent),
    'GITOPS-001: no debe declararse un ConfigMap homónimo `argocd-cm-healthchecks` (ArgoCD lo ignoraría)'
  );
  assert.ok(
    !/^\s*app\.kubernetes\.io\/name:\s*argocd-cm-healthchecks\s*$/m.test(healthContent),
    'GITOPS-001: no debe quedar la etiqueta del ConfigMap homónimo purgado'
  );

  // 3.2 GITOPS-001: la tarea debe inyectar con `kubectl patch --type merge`.
  // Un `kubectl apply` sobrescribiría el ConfigMap completo y borraría el resto de
  // la configuración de ArgoCD (URLs de repositorio, RBAC, etc.). Se verifica más
  // abajo, junto al resto de aserciones del Taskfile (bloque 6).

  // 4. Helm templates declaran Sync Waves deterministas (0 a 4)
  const stsContent = fs.readFileSync(postgresStsPath, 'utf-8');
  assert.ok(stsContent.includes('argocd.argoproj.io/sync-wave: "0"'), 'PostgreSQL StatefulSet debe estar en sync-wave 0');

  const seedContent = fs.readFileSync(seedJobPath, 'utf-8');
  assert.ok(seedContent.includes('sync-wave') && seedContent.includes('"1"'), 'Seed Job debe estar en sync-wave 1');
  assert.ok(seedContent.includes('PreSync'), 'Seed Job debe definir hook PreSync');
  assert.ok(seedContent.includes('HookSucceeded'), 'Seed Job debe definir hook-delete-policy');

  const apiContent = fs.readFileSync(apiDeploymentPath, 'utf-8');
  assert.ok(apiContent.includes('argocd.argoproj.io/sync-wave: "2"'), 'API Deployment debe estar en sync-wave 2');

  const webContent = fs.readFileSync(webDeploymentPath, 'utf-8');
  assert.ok(webContent.includes('argocd.argoproj.io/sync-wave: "3"'), 'Web Deployment debe estar en sync-wave 3');

  const ingressContent = fs.readFileSync(ingressPath, 'utf-8');
  assert.ok(ingressContent.includes('argocd.argoproj.io/sync-wave: "4"'), 'Ingress debe estar en sync-wave 4');

  // 5. Las Applications ACTIVAS configuran opciones avanzadas de sync.
  //    GITOPS-001: `app-cloud.yaml` es una REFERENCIA INACTIVA y queda excluida
  //    del App-of-Apps. Exigirle semantica de produccion (syncWindows de 62h)
  //    validaba una contradiccion: un blueprint no se despliega. Si AWS se
  //    declara activo en el futuro, este bloque debe reactivarse junto con la
  //    eliminacion de su entrada en el `exclude` del root.
  const appProxmoxPreprodPath = path.join(ROOT_DIR, 'gitops/apps/app-proxmox-preprod.yaml');
  const proxmoxContent = fs.readFileSync(appProxmoxPath, 'utf-8');
  const preprodContent = fs.readFileSync(appProxmoxPreprodPath, 'utf-8');
  const cloudContent = fs.readFileSync(appCloudPath, 'utf-8');
  assert.ok(proxmoxContent.includes('ServerSideApply=true'), 'app-proxmox.yaml debe configurar ServerSideApply');
  assert.ok(preprodContent.includes('ServerSideApply=true'), 'app-proxmox-preprod.yaml debe configurar ServerSideApply');
  // GITOPS-001: app-cloud.yaml se exonera de esta aserción. `ServerSideApply` es
  // un mecanismo de sincronización, no semantica de produccion, y conviene
  // mantenerlo para que la referencia este lista si se activa AWS. Lo que si
  // se prohibe es el `syncWindows` de freeze, verificado mas abajo.

  // Validar semántica real de syncWindows en Producción (Protección de fin de semana con kind: deny)
  assert.ok(proxmoxContent.includes('syncWindows:'), 'app-proxmox.yaml debe configurar syncWindows');
  assert.match(proxmoxContent, /kind:\s*deny/, 'app-proxmox.yaml debe configurar una ventana de protección (kind: deny)');
  assert.match(proxmoxContent, /schedule:\s*["']0 18 \* \* 5["']/, 'app-proxmox.yaml debe bloquear despliegues en fin de semana (viernes 18:00 UTC)');
  assert.match(proxmoxContent, /duration:\s*62h/, 'app-proxmox.yaml debe extender la protección por 62 horas');
  assert.match(proxmoxContent, /manualSync:\s*true/, 'app-proxmox.yaml debe permitir sync manual de emergencia');
  assert.ok(!proxmoxContent.includes('* * * * *'), 'app-proxmox.yaml no debe tener el antipatrón * * * * *');

  assert.ok(
    !cloudContent.includes('syncWindows:'),
    'GITOPS-001: una referencia inactiva no debe declarar ventanas de proteccion de produccion'
  );
  assert.ok(!cloudContent.includes('* * * * *'), 'app-cloud.yaml no debe tener el antipatrón * * * * *');

  // Pre-producción: Continuous Delivery sin bloqueos artificiales
  assert.ok(!preprodContent.includes('* * * * *'), 'app-proxmox-preprod.yaml no debe tener el antipatrón * * * * *');
  assert.ok(!preprodContent.includes('kind: deny'), 'app-proxmox-preprod.yaml no debe bloquear despliegues en pre-producción');

  // 6. Taskfile.yaml define tareas gitops:apps:root y gitops:health-checks (retirando el legacy gitops:apps)
  const taskfileContent = getCompleteTaskfileContent(ROOT_DIR);
  assert.ok(taskfileContent.includes('gitops:apps:root:'), 'Taskfile.yaml debe definir gitops:apps:root');
  assert.ok(!/^\s*gitops:apps:\s*$/m.test(taskfileContent), 'Taskfile.yaml no debe contener la tarea legada gitops:apps');
  assert.ok(taskfileContent.includes('gitops:health-checks:'), 'Taskfile.yaml debe definir gitops:health-checks');

  // 6.1 GITOPS-001: la tarea debe INYECTAR las claves de salud en `argocd-cm` mediante
  // `kubectl patch --type merge`. Un `kubectl apply` sobrescribiría el ConfigMap completo
  // y borraría el resto de la configuración de ArgoCD (repositorios, RBAC, etc.), lo que
  // constituiría una regresión más grave que el defecto que corrige.
  assert.match(
    taskfileContent,
    /kubectl patch configmap argocd-cm[^\n]*--type merge/,
    'GITOPS-001: `task gitops:health-checks` debe parchear argocd-cm con `--type merge`'
  );
  assert.ok(
    !/kubectl apply -f gitops\/health-checks\/argocd-cm-healthchecks\.yaml/.test(taskfileContent),
    'GITOPS-001: no debe usarse `kubectl apply` sobre el manifiesto de health checks (sobrescribiría argocd-cm)'
  );

  // 8. startupProbe presente en las apps que ejecutan codigo de aplicacion.
  //    Sin el, la livenessProbe puede matar el pod mientras el backend aun
  //    aplica las migraciones Drizzle del arranque (APPS-002).
  const helmValues2 = fs.readFileSync(
    path.join(ROOT_DIR, 'infra/helm/pokedex/values.yaml'),
    'utf-8'
  );

  const apiContent2 = fs.readFileSync(apiDeploymentPath, 'utf-8');
  assert.match(
    apiContent2,
    /startupProbe:/,
    'api-deployment.yaml debe declarar startupProbe (margen para migraciones de arranque)'
  );
  assert.ok(
    /api\.startupProbe/.test(apiContent2),
    'api-deployment.yaml debe parametrizar el startupProbe desde values'
  );
  const webContent2 = fs.readFileSync(webDeploymentPath, 'utf-8');
  assert.match(
    webContent2,
    /startupProbe:/,
    'web-deployment.yaml debe declarar startupProbe'
  );
  assert.match(
    helmValues2,
    /startupProbe:\s*\n\s*failureThreshold:/,
    'values.yaml debe definir los parametros del startupProbe por defecto'
  );

  // 7. deployment.md documenta sección 5 y ADR-021
  const deploymentContent = fs.readFileSync(deploymentRunbookPath, 'utf-8');
  assert.ok(deploymentContent.includes('ADR-021'), 'deployment.md debe referenciar ADR-021');
  assert.ok(deploymentContent.includes('task gitops:apps:root'), 'deployment.md debe documentar task gitops:apps:root');

  // 8. README.md y docs/README.md enlazan ADR-021
  const docsReadmeContent = fs.readFileSync(docsReadmePath, 'utf-8');
  const readmeContent = fs.readFileSync(readmePath, 'utf-8');
  assert.ok(readmeContent.includes('ADR-021-advanced-gitops-sync-waves-and-health-checks.md'), 'README.md debe enlazar ADR-021');
  assert.ok(docsReadmeContent.includes('ADR-021-advanced-gitops-sync-waves-and-health-checks.md'), 'docs/README.md debe enlazar ADR-021');
  assert.ok(docsReadmeContent.includes('ADR-001 a ADR-021') || docsReadmeContent.includes('ADR-001 a ADR-022'), 'Mermaid en docs/README.md debe indicar ADR-001 a ADR-021 o posterior');

  // 9. Los 21 ADRs existen físicamente en disco
  for (let i = 1; i <= 21; i++) {
    const num = String(i).padStart(3, '0');
    const files = fs.readdirSync(path.join(ROOT_DIR, 'docs/decisions'));
    const match = files.find((f: string) => f.startsWith(`ADR-${num}`));
    assert.ok(match, `Debe existir archivo para ADR-${num} en docs/decisions/`);
  }
});

test('🛡️ Rotación de Secretos: ADR-022 formaliza Stakater Reloader, refreshInterval acotado y auditoría', async () => {
  const adrPath = path.join(ROOT_DIR, 'docs/decisions/ADR-022-automated-credential-rotation-and-reloader.md');
  const valuesPath = path.join(ROOT_DIR, 'infra/helm/pokedex/values.yaml');
  const valuesProdPath = path.join(ROOT_DIR, 'infra/helm/pokedex/values.prod.yaml');
  const webDeployPath = path.join(ROOT_DIR, 'infra/helm/pokedex/templates/web-deployment.yaml');
  const auditScriptPath = path.join(ROOT_DIR, 'scripts/verify-secret-rotation.ts');
  const taskfilePath = path.join(ROOT_DIR, 'Taskfile.yaml');
  const pkgPath = path.join(ROOT_DIR, 'package.json');
  const secretRunbookPath = path.join(ROOT_DIR, 'docs/operations/secret-rotation.md');
  const readmePath = path.join(ROOT_DIR, 'README.md');
  const docsReadmePath = path.join(ROOT_DIR, 'docs/README.md');

  // 1. ADR-022 existe con Estado: Aceptado
  assert.ok(fs.existsSync(adrPath), 'ADR-022 debe existir en docs/decisions/');
  const adrContent = fs.readFileSync(adrPath, 'utf-8').replace(/\r\n/g, '\n');
  assert.ok(adrContent.includes('## Estado\n\nAceptado'), 'ADR-022 debe estar en estado Aceptado');
  assert.ok(adrContent.includes('reloader.stakater.com/auto'), 'ADR-022 debe formalizar anotación de Stakater Reloader');
  assert.ok(adrContent.includes('External Secrets Operator'), 'ADR-022 debe formalizar External Secrets Operator');

  // 2. Helm values configuran anotación de Reloader y refreshInterval acotado
  const valuesContent = fs.readFileSync(valuesPath, 'utf-8');
  const valuesProdContent = fs.readFileSync(valuesProdPath, 'utf-8');
  assert.ok(valuesContent.includes('reloader.stakater.com/auto: "true"'), 'values.yaml debe incluir anotación reloader.stakater.com/auto: "true"');
  assert.ok(valuesProdContent.includes('reloader.stakater.com/auto: "true"'), 'values.prod.yaml debe incluir anotación reloader.stakater.com/auto: "true"');
  assert.ok(valuesProdContent.includes('refreshInterval: "1h"'), 'values.prod.yaml debe acotar refreshInterval a 1h');

  // 3. Template de web deployment soporta deploymentAnnotations
  const webDeployContent = fs.readFileSync(webDeployPath, 'utf-8');
  assert.ok(webDeployContent.includes('.Values.web.deploymentAnnotations'), 'web-deployment.yaml debe soportar web.deploymentAnnotations');

  // 4. Script de auditoría de rotación existe y valida arquitectura dual (ADR-022)
  assert.ok(fs.existsSync(auditScriptPath), 'scripts/verify-secret-rotation.ts debe existir');
  const auditScriptContent = fs.readFileSync(auditScriptPath, 'utf-8');
  assert.ok(auditScriptContent.includes('Reloader = REQUIRED'), 'verify-secret-rotation.ts debe verificar Reloader REQUIRED en AWS');
  assert.ok(auditScriptContent.includes('Reloader = FORBIDDEN'), 'verify-secret-rotation.ts debe verificar Reloader FORBIDDEN en Proxmox');
  assert.ok(auditScriptContent.includes('rollout restart = REQUIRED'), 'verify-secret-rotation.ts debe verificar rollout restart REQUIRED en Proxmox');
  assert.ok(auditScriptContent.includes('refreshInterval <= 24h'), 'verify-secret-rotation.ts debe auditar refreshInterval <= 24h');

  // 5. Taskfile.yaml y package.json exponen secrets:audit-rotation
  const taskfileContent = getCompleteTaskfileContent(ROOT_DIR);
  const pkgContent = fs.readFileSync(pkgPath, 'utf-8');
  assert.ok(taskfileContent.includes('secrets:audit-rotation:'), 'Taskfile.yaml debe definir tarea secrets:audit-rotation');
  assert.ok(pkgContent.includes('"secrets:audit-rotation"'), 'package.json debe definir script secrets:audit-rotation');

  // 6. Runbook secret-rotation.md documenta ADR-022 y comando canónico
  const secretRunbookContent = fs.readFileSync(secretRunbookPath, 'utf-8');
  assert.ok(secretRunbookContent.includes('ADR-022'), 'secret-rotation.md debe documentar ADR-022');
  assert.ok(secretRunbookContent.includes('task secrets:audit-rotation'), 'secret-rotation.md debe documentar task secrets:audit-rotation');

  // 7. README.md y docs/README.md enlazan ADR-022
  const readmeContent = fs.readFileSync(readmePath, 'utf-8');
  const docsReadmeContent = fs.readFileSync(docsReadmePath, 'utf-8');
  assert.ok(readmeContent.includes('ADR-022-automated-credential-rotation-and-reloader.md'), 'README.md debe enlazar ADR-022');
  assert.ok(docsReadmeContent.includes('ADR-022-automated-credential-rotation-and-reloader.md'), 'docs/README.md debe enlazar ADR-022');
  assert.ok(docsReadmeContent.includes('ADR-001 a ADR-022'), 'Mermaid en docs/README.md debe indicar ADR-001 a ADR-022');

  // 8. Los 22 ADRs existen físicamente en disco
  for (let i = 1; i <= 22; i++) {
    const num = String(i).padStart(3, '0');
    const files = fs.readdirSync(path.join(ROOT_DIR, 'docs/decisions'));
    const match = files.find((f: string) => f.startsWith(`ADR-${num}`));
    assert.ok(match, `Debe existir archivo para ADR-${num} en docs/decisions/`);
  }
});

test('🛡️ Helm Chart: values.yaml es Secure by Default y values.dev.yaml proporciona overrides explícitos de desarrollo', () => {
  const valuesPath = path.join(ROOT_DIR, 'infra/helm/pokedex/values.yaml');
  const valuesDevPath = path.join(ROOT_DIR, 'infra/helm/pokedex/values.dev.yaml');
  const helmGuidePath = path.join(ROOT_DIR, 'docs/runbooks/HELM_DEPLOYMENT_GUIDE.md');
  const infraReadmePath = path.join(ROOT_DIR, 'infra/README.md');

  // 1. Ambos archivos de configuración existen físicamente
  assert.ok(fs.existsSync(valuesPath), 'values.yaml debe existir en infra/helm/pokedex/');
  assert.ok(fs.existsSync(valuesDevPath), 'values.dev.yaml debe existir en infra/helm/pokedex/');

  const valuesContent = fs.readFileSync(valuesPath, 'utf-8');
  const valuesDevContent = fs.readFileSync(valuesDevPath, 'utf-8');

  // 2. values.yaml implementa Secure by Default: producción, HTTPS obligatorio, TLS, Cilium L7 y Reloader deshabilitado
  assert.ok(valuesContent.includes('nodeEnv: "production"'), 'values.yaml debe configurar nodeEnv: "production" por defecto');
  assert.ok(valuesContent.includes('nginx.ingress.kubernetes.io/ssl-redirect: "true"'), 'values.yaml debe forzar ssl-redirect: "true" por defecto');
  assert.ok(valuesContent.includes('cert-manager.io/cluster-issuer: "letsencrypt-prod"'), 'values.yaml debe definir cluster-issuer letsencrypt-prod');
  assert.ok(valuesContent.includes('secretName: pokedex-tls-cert'), 'values.yaml debe tener bloque tls configurado con secretName');
  assert.ok(/ciliumNetworkPolicy:\s+enabled:\s*true/.test(valuesContent), 'values.yaml debe activar ciliumNetworkPolicy.enabled: true');
  assert.ok(/reloader:\s+enabled:\s*false/.test(valuesContent), 'values.yaml debe configurar reloader.enabled: false');

  // 3. values.dev.yaml proporciona overrides permisivos para desarrollo local (Kind/Minikube)
  assert.ok(valuesDevContent.includes('nodeEnv: "development"'), 'values.dev.yaml debe configurar nodeEnv: "development"');
  assert.ok(valuesDevContent.includes('nginx.ingress.kubernetes.io/ssl-redirect: "false"'), 'values.dev.yaml debe permitir ssl-redirect: "false"');
  assert.ok(/tls:\s*\[\]/.test(valuesDevContent), 'values.dev.yaml debe permitir tls: [] vacío para desarrollo HTTP');
  assert.ok(/ciliumNetworkPolicy:\s+enabled:\s*false/.test(valuesDevContent), 'values.dev.yaml debe desactivar ciliumNetworkPolicy para entornos locales');
  assert.ok(/reloader:\s+enabled:\s*false/.test(valuesDevContent), 'values.dev.yaml debe mantener reloader desactivado en desarrollo');

  // 4. Documentación formaliza la separación conceptual
  const helmGuideContent = fs.readFileSync(helmGuidePath, 'utf-8');
  const infraReadmeContent = fs.readFileSync(infraReadmePath, 'utf-8');
  assert.ok(helmGuideContent.includes('values.dev.yaml'), 'HELM_DEPLOYMENT_GUIDE.md debe documentar values.dev.yaml');
  assert.ok(helmGuideContent.includes('Secure by Default'), 'HELM_DEPLOYMENT_GUIDE.md debe documentar el principio Secure by Default');
  assert.ok(infraReadmeContent.includes('values.dev.yaml'), 'infra/README.md debe documentar values.dev.yaml');
});

test('🏷️ Kubernetes Taxonomy: Namespace único canónico pokemon-app y segregación formal de Vault', () => {
  // 1. KUBERNETES_NAMESPACE_TAXONOMY.md existe y formaliza pokemon-app como SSOT
  const taxonomyPath = path.join(ROOT_DIR, 'docs/architecture/KUBERNETES_NAMESPACE_TAXONOMY.md');
  assert.ok(fs.existsSync(taxonomyPath), 'KUBERNETES_NAMESPACE_TAXONOMY.md debe existir');
  const taxonomyContent = fs.readFileSync(taxonomyPath, 'utf-8');
  assert.ok(taxonomyContent.includes('pokemon-app (SSOT Canónico)'), 'Taxonomía debe formalizar pokemon-app como SSOT');
  assert.ok(taxonomyContent.includes('pokedex-preprod-role'), 'Taxonomía debe documentar pokedex-preprod-role');
  assert.ok(taxonomyContent.includes('pokedex-prod-role'), 'Taxonomía debe documentar pokedex-prod-role');
  assert.ok(taxonomyContent.includes('secret/data/pokedex/preprod/*'), 'Taxonomía debe documentar ruta de secretos preprod');
  assert.ok(taxonomyContent.includes('secret/data/pokedex/prod/*'), 'Taxonomía debe documentar ruta de secretos prod');

  // 2. docs/README.md enlaza la taxonomía
  const docsReadmePath = path.join(ROOT_DIR, 'docs/README.md');
  const docsReadme = fs.readFileSync(docsReadmePath, 'utf-8');
  assert.ok(docsReadme.includes('KUBERNETES_NAMESPACE_TAXONOMY.md'), 'docs/README.md debe indexar KUBERNETES_NAMESPACE_TAXONOMY.md');

  // 3. SECURITY_RUNBOOK.md utiliza -n pokemon-app y nombres de deployment/service/statefulset estándar
  const secRunbookPath = path.join(ROOT_DIR, 'docs/security/SECURITY_RUNBOOK.md');
  const secRunbook = fs.readFileSync(secRunbookPath, 'utf-8');
  assert.ok(!secRunbook.includes('-n pokedex'), 'SECURITY_RUNBOOK.md no debe contener -n pokedex');
  assert.ok(!secRunbook.includes('--namespace pokedex'), 'SECURITY_RUNBOOK.md no debe contener --namespace pokedex');
  assert.ok(secRunbook.includes('-n pokemon-app'), 'SECURITY_RUNBOOK.md debe utilizar -n pokemon-app');
  assert.ok(secRunbook.includes('deployment/pokemon-api'), 'SECURITY_RUNBOOK.md debe referenciar deployment/pokemon-api');
  assert.ok(secRunbook.includes('statefulset/postgres'), 'SECURITY_RUNBOOK.md debe referenciar statefulset/postgres');
  assert.ok(secRunbook.includes('pokemon-redis-svc'), 'SECURITY_RUNBOOK.md debe referenciar pokemon-redis-svc');
  assert.ok(secRunbook.includes('secret generic pokemon-secrets'), 'SECURITY_RUNBOOK.md debe referenciar pokemon-secrets');

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
      `El documento ${path.relative(ROOT_DIR, docFile)} no debe contener referencias obsoletas '-n pokedex' o '--namespace pokedex'`
    );
  }

  // 5. GitOps y Helm: Paridad en destino de namespace
  const helmValuesPath = path.join(ROOT_DIR, 'infra/helm/pokedex/values.yaml');
  const helmValues = fs.readFileSync(helmValuesPath, 'utf-8');
  assert.match(helmValues, /namespace:\s*pokemon-app/, 'Helm values.yaml debe definir namespace: pokemon-app');

  const appProxmox = fs.readFileSync(path.join(ROOT_DIR, 'gitops/apps/app-proxmox.yaml'), 'utf-8');
  assert.match(appProxmox, /namespace:\s*pokemon-app/, 'app-proxmox.yaml debe definir namespace: pokemon-app');

  const appProxmoxPreprod = fs.readFileSync(path.join(ROOT_DIR, 'gitops/apps/app-proxmox-preprod.yaml'), 'utf-8');
  assert.match(appProxmoxPreprod, /namespace:\s*pokemon-app/, 'app-proxmox-preprod.yaml debe definir namespace: pokemon-app');

  const appCloud = fs.readFileSync(path.join(ROOT_DIR, 'gitops/apps/app-cloud.yaml'), 'utf-8');
  assert.match(appCloud, /namespace:\s*pokemon-app/, 'app-cloud.yaml debe definir namespace: pokemon-app');

  // 6. setup_vault.yml vincula los roles K8s al namespace pokemon-app
  const setupVault = fs.readFileSync(path.join(ROOT_DIR, 'infra/ansible/playbooks/setup_vault.yaml'), 'utf-8');
  assert.match(
    setupVault,
    /pokedex-preprod-role[\s\S]*?bound_service_account_namespaces=[^\n]*pokemon-app/,
    'pokedex-preprod-role en setup_vault.yml debe incluir pokemon-app'
  );
  assert.match(
    setupVault,
    /pokedex-prod-role[\s\S]*?bound_service_account_namespaces=[^\n]*pokemon-app/,
    'pokedex-prod-role en setup_vault.yml debe incluir pokemon-app'
  );
});
