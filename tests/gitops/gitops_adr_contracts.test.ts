import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { readTaskfiles, taskCommands } from '../helpers/taskfile.js';
import { assertDocsPortalLinksAdrIndex } from '../helpers/docs-portal.js';
import { PROFILES, renderChart, podWorkloads, type K8sDoc } from '../helpers/helm-render.js';
import { ROOT_DIR } from '../helpers/repo.js';
import { readYaml } from '../helpers/yaml.js';

/**
 * Los manifiestos de ArgoCD, los values de Helm, los Taskfile y el chart renderizado se verifican parseados: un valor
 * comentado o dentro de otro campo sigue "apareciendo" en el archivo sin que ArgoCD o Helm lo apliquen. Los ADR, los
 * runbooks y los README (documentación) se comprueban como texto (AUD-TST-DOC-001).
 */

const read = (relativePath: string) => fs.readFileSync(path.join(ROOT_DIR, relativePath), 'utf-8');
const exists = (relativePath: string) => fs.existsSync(path.join(ROOT_DIR, relativePath));

/** Recurso renderizado por tipo y nombre. */
const rendered = (docs: K8sDoc[], kind: string, name: string): K8sDoc => {
  const doc = docs.find((d) => d.kind === kind && d.metadata.name === name);
  assert.ok(doc, `el chart debe renderizar ${kind}/${name}`);
  return doc;
};

interface ArgoApplication {
  metadata: { name: string; finalizers?: string[] };
  spec: { source: { path: string }; syncPolicy?: { syncOptions?: string[] }; syncWindows?: unknown };
}

test('🛡️ Orquestación GitOps Avanzada: ADR-003 formaliza Sync Waves, Hooks de Siembra, Health Checks y App-of-Apps (consolida ADR-021)', async () => {
  const adrPath = path.join(ROOT_DIR, 'docs/decisions/ADR-003-gitops-with-argocd.md');
  const decisionsReadmePath = path.join(ROOT_DIR, 'docs/decisions/README.md');
  const deploymentRunbookPath = path.join(ROOT_DIR, 'docs/operations/deployment.md');
  const docsReadmePath = path.join(ROOT_DIR, 'docs/README.md');
  const readmePath = path.join(ROOT_DIR, 'README.md');

  // 1. ADR-003 existe, está aceptado y consolida la orquestación avanzada de ADR-021
  assert.ok(fs.existsSync(adrPath), 'ADR-003 debe existir en docs/decisions/');
  const adrContent = fs.readFileSync(adrPath, 'utf-8');
  assert.ok(adrContent.includes('Sync Waves'), 'ADR-003 debe documentar Sync Waves');
  assert.ok(adrContent.includes('PostSync'), 'ADR-003 debe documentar el hook PostSync del seed job');
  assert.ok(adrContent.includes('App-of-Apps'), 'ADR-003 debe documentar patrón App-of-Apps');
  assert.ok(adrContent.includes('Health Checks'), 'ADR-003 debe documentar Custom Health Checks');
  assert.ok(adrContent.includes('ADR-021'), 'ADR-003 debe registrar formalmente la consolidación de ADR-021');

  // 2. root-application.yaml existe y define App-of-Apps
  assert.ok(exists('gitops/apps/root-application.yaml'), 'root-application.yaml debe existir en gitops/apps/');
  const rootApp = readYaml<ArgoApplication>('gitops/apps/root-application.yaml');
  assert.equal(rootApp.metadata.name, 'pokedex-root', 'root-application.yaml debe nombrar la app pokedex-root');
  assert.equal(rootApp.spec.source.path, 'gitops/apps', 'root-application.yaml debe apuntar a gitops/apps');
  assert.ok(
    rootApp.metadata.finalizers?.includes('resources-finalizer.argocd.argoproj.io'),
    'root-application.yaml debe incluir finalizer',
  );

  // 3. Health checks existen y cubren CRDs críticos (ExternalSecret y ClusterPolicy; SealedSecret purgado)
  assert.ok(
    exists('gitops/health-checks/argocd-cm-healthchecks.yaml'),
    'argocd-cm-healthchecks.yaml debe existir en gitops/health-checks/',
  );
  const healthChecks = readYaml<{
    metadata: { name: string; labels?: Record<string, string> };
    data: Record<string, string>;
  }>('gitops/health-checks/argocd-cm-healthchecks.yaml');
  const healthKeys = Object.keys(healthChecks.data);
  assert.ok(
    healthKeys.includes('resource.customizations.health.external-secrets.io_ExternalSecret'),
    'Debe definir health check para ExternalSecret',
  );
  assert.ok(
    !healthKeys.some((key) => key.includes('bitnami.com_SealedSecret')),
    'No debe contener health check residual de SealedSecret',
  );
  assert.ok(
    healthKeys.includes('resource.customizations.health.kyverno.io_ClusterPolicy'),
    'Debe definir health check para ClusterPolicy',
  );

  // 3.1 GITOPS-001: el manifiesto debe extender `argocd-cm`, NO un ConfigMap homónimo.
  assert.equal(
    healthChecks.metadata.name,
    'argocd-cm',
    'GITOPS-001: el manifiesto debe parchear el ConfigMap `argocd-cm`, el único que ArgoCD lee',
  );
  assert.notEqual(
    healthChecks.metadata.labels?.['app.kubernetes.io/name'],
    'argocd-cm-healthchecks',
    'GITOPS-001: no debe quedar la etiqueta del ConfigMap homónimo purgado',
  );

  // 4. El chart renderizado declara Sync Waves deterministas (0 a 4); el seed corre como hook PostSync.
  const docs = renderChart(PROFILES.preprod);
  const wave = (kind: string, name: string) =>
    rendered(docs, kind, name).metadata.annotations?.['argocd.argoproj.io/sync-wave'];
  assert.equal(wave('StatefulSet', 'postgres'), '0', 'PostgreSQL StatefulSet debe estar en sync-wave 0');
  // ADR-030: el seed corre como PostSync; el contrato renderizado vive en seed_job_contract.test.ts.
  const seedAnnotations = rendered(docs, 'Job', 'pokedex-db-seed').metadata.annotations ?? {};
  assert.equal(seedAnnotations['argocd.argoproj.io/hook'], 'PostSync', 'Seed Job debe definir hook PostSync');
  assert.match(
    seedAnnotations['argocd.argoproj.io/hook-delete-policy'] ?? '',
    /HookSucceeded/,
    'Seed Job debe definir hook-delete-policy',
  );
  assert.equal(wave('Deployment', 'pokemon-api'), '2', 'API Deployment debe estar en sync-wave 2');
  assert.equal(wave('Deployment', 'pokedex-web'), '3', 'Web Deployment debe estar en sync-wave 3');
  assert.equal(wave('Ingress', 'pokedex-ingress'), '4', 'Ingress debe estar en sync-wave 4');

  // 5. Las Applications ACTIVAS configuran opciones avanzadas de sync.
  const preprod = readYaml<ArgoApplication>('gitops/apps/app-proxmox-preprod.yaml');
  const cloud = readYaml<ArgoApplication>('gitops/apps/app-cloud.yaml');
  assert.ok(
    preprod.spec.syncPolicy?.syncOptions?.includes('ServerSideApply=true'),
    'app-proxmox-preprod.yaml debe configurar ServerSideApply',
  );

  // ADR-030: pre-prod es entrega continua (sin ventanas de bloqueo); la ventana de
  // fin de semana pertenecia a la antigua prod Proxmox, retirada.
  assert.equal(
    preprod.spec.syncWindows,
    undefined,
    'app-proxmox-preprod.yaml no debe declarar syncWindows (entrega continua)',
  );
  assert.equal(
    cloud.spec.syncWindows,
    undefined,
    'GITOPS-001: una referencia inactiva no debe declarar ventanas de proteccion de produccion',
  );
  assert.ok(!JSON.stringify(cloud).includes('* * * * *'), 'app-cloud.yaml no debe tener el antipatrón * * * * *');

  // Pre-producción: Continuous Delivery sin bloqueos artificiales
  assert.ok(
    !JSON.stringify(preprod).includes('* * * * *'),
    'app-proxmox-preprod.yaml no debe tener el antipatrón * * * * *',
  );
  assert.ok(
    !/"kind":"deny"/.test(JSON.stringify(preprod)),
    'app-proxmox-preprod.yaml no debe bloquear despliegues en pre-producción',
  );

  // 6. Taskfile.yaml define tareas gitops:apps:root y gitops:health-checks (retirando el legacy gitops:apps)
  const { tasks } = readTaskfiles(ROOT_DIR);
  assert.ok(tasks['gitops:apps:root'], 'Taskfile.yaml debe definir gitops:apps:root');
  assert.ok(!('gitops:apps' in tasks), 'Taskfile.yaml no debe contener la tarea legada gitops:apps');
  assert.ok(tasks['gitops:health-checks'], 'Taskfile.yaml debe definir gitops:health-checks');

  const healthCommands = taskCommands(tasks['gitops:health-checks']);
  assert.ok(
    healthCommands.some((command) => /kubectl patch configmap argocd-cm\b.*--type merge/.test(command)),
    'GITOPS-001: `task gitops:health-checks` debe parchear argocd-cm con `--type merge`',
  );
  assert.ok(
    !Object.values(tasks)
      .flatMap(taskCommands)
      .some((command) => /kubectl apply -f gitops\/health-checks\/argocd-cm-healthchecks\.yaml/.test(command)),
    'GITOPS-001: no debe usarse `kubectl apply` sobre el manifiesto de health checks (sobrescribiría argocd-cm)',
  );

  // 8. startupProbe presente en las apps que ejecutan codigo de aplicacion, y parametrizado desde values:
  //    el valor renderizado es el de values.yaml (un startupProbe fijo en la plantilla no pasaría).
  const values = readYaml('infra/helm/pokedex/values.yaml');
  const defaultDocs = renderChart(PROFILES.default);
  const startupThreshold = (name: string) =>
    podWorkloads(defaultDocs)
      .find((workload) => workload.name === `Deployment/${name}`)
      ?.spec.containers.find((container: { startupProbe?: unknown }) => container.startupProbe)?.startupProbe
      .failureThreshold;
  assert.equal(
    startupThreshold('pokemon-api'),
    values.api.startupProbe.failureThreshold,
    'api-deployment.yaml debe declarar el startupProbe (margen para migraciones de arranque) parametrizado desde values',
  );
  assert.equal(
    startupThreshold('pokedex-web'),
    values.web.startupProbe.failureThreshold,
    'web-deployment.yaml debe declarar el startupProbe parametrizado desde values',
  );

  // 7. deployment.md documenta sección 5 y ADR-003
  const deploymentContent = fs.readFileSync(deploymentRunbookPath, 'utf-8');
  assert.ok(deploymentContent.includes('ADR-003'), 'deployment.md debe referenciar ADR-003');
  assert.ok(deploymentContent.includes('task gitops:apps:root'), 'deployment.md debe documentar task gitops:apps:root');

  // 8. README.md y docs/README.md enlazan ADR-003 y docs/decisions/README.md registra ADR-021
  const docsReadmeContent = fs.readFileSync(docsReadmePath, 'utf-8');
  fs.readFileSync(readmePath, 'utf-8');
  const decisionsReadmeContent = fs.readFileSync(decisionsReadmePath, 'utf-8');
  assert.ok(docsReadmeContent.includes('ADR-003-gitops-with-argocd.md'), 'docs/README.md debe enlazar ADR-003');
  assertDocsPortalLinksAdrIndex(docsReadmeContent);
  assert.ok(
    decisionsReadmeContent.includes('ADR-021'),
    'docs/decisions/README.md debe registrar el histórico consolidado de ADR-021',
  );
});

test('🛡️ Rotación de Secretos: ADR-005 formaliza Stakater Reloader, refreshInterval acotado y auditoría (consolida ADR-022)', async () => {
  const adrPath = path.join(ROOT_DIR, 'docs/decisions/ADR-005-secret-management.md');
  const decisionsReadmePath = path.join(ROOT_DIR, 'docs/decisions/README.md');
  const auditScriptPath = path.join(ROOT_DIR, 'scripts/verify-secret-rotation.ts');
  const secretRunbookPath = path.join(ROOT_DIR, 'docs/operations/secret-rotation.md');
  const readmePath = path.join(ROOT_DIR, 'README.md');
  const docsReadmePath = path.join(ROOT_DIR, 'docs/README.md');

  // 1. ADR-005 existe con Estado: Aceptado y consolida ADR-022
  assert.ok(fs.existsSync(adrPath), 'ADR-005 debe existir en docs/decisions/');
  const adrContent = fs.readFileSync(adrPath, 'utf-8').replace(/\r\n/g, '\n');
  assert.ok(
    adrContent.includes('reloader.stakater.com/auto'),
    'ADR-005 debe formalizar anotación de Stakater Reloader',
  );
  assert.ok(adrContent.includes('External Secrets Operator'), 'ADR-005 debe formalizar External Secrets Operator');
  assert.ok(adrContent.includes('ADR-022'), 'ADR-005 debe formalizar la consolidación de ADR-022');

  // 2. Helm values configuran anotación de Reloader y refreshInterval acotado (api y web en ambos perfiles)
  const values = readYaml('infra/helm/pokedex/values.yaml');
  const valuesProd = readYaml('infra/helm/pokedex/values.prod.yaml');
  for (const [file, parsed] of [
    ['values.yaml', values],
    ['values.prod.yaml', valuesProd],
  ] as const) {
    for (const workload of ['api', 'web']) {
      assert.equal(
        parsed[workload].deploymentAnnotations?.['reloader.stakater.com/auto'],
        'true',
        `${file} debe incluir anotación reloader.stakater.com/auto: "true" en ${workload}`,
      );
    }
  }
  assert.equal(valuesProd.externalSecrets.refreshInterval, '1h', 'values.prod.yaml debe acotar refreshInterval a 1h');

  // 3. La plantilla de web deployment soporta deploymentAnnotations: el valor llega al Deployment renderizado.
  assert.equal(
    rendered(renderChart(PROFILES.prod), 'Deployment', 'pokedex-web').metadata.annotations?.[
      'reloader.stakater.com/auto'
    ],
    'true',
    'web-deployment.yaml debe soportar web.deploymentAnnotations',
  );

  // 4. Script de auditoría de rotación existe y valida arquitectura dual (ADR-005)
  assert.ok(fs.existsSync(auditScriptPath), 'scripts/verify-secret-rotation.ts debe existir');
  const auditScriptContent = fs.readFileSync(auditScriptPath, 'utf-8');
  assert.ok(
    auditScriptContent.includes('Reloader = REQUIRED'),
    'verify-secret-rotation.ts debe verificar Reloader REQUIRED en AWS',
  );
  assert.ok(
    auditScriptContent.includes('Reloader = FORBIDDEN'),
    'verify-secret-rotation.ts debe verificar Reloader FORBIDDEN en Proxmox',
  );
  assert.ok(
    auditScriptContent.includes('rollout restart = REQUIRED'),
    'verify-secret-rotation.ts debe verificar rollout restart REQUIRED en Proxmox',
  );
  assert.ok(
    auditScriptContent.includes('refreshInterval <= 24h'),
    'verify-secret-rotation.ts debe auditar refreshInterval <= 24h',
  );

  // 5. Taskfile.yaml y package.json exponen secrets:audit-rotation
  const { tasks } = readTaskfiles(ROOT_DIR);
  const pkg = JSON.parse(read('package.json'));
  assert.ok(tasks['secrets:audit-rotation'], 'Taskfile.yaml debe definir tarea secrets:audit-rotation');
  assert.ok(pkg.scripts['secrets:audit-rotation'], 'package.json debe definir script secrets:audit-rotation');

  // 6. Runbook secret-rotation.md documenta ADR-005 y comando canónico
  const secretRunbookContent = fs.readFileSync(secretRunbookPath, 'utf-8');
  assert.ok(secretRunbookContent.includes('ADR-005'), 'secret-rotation.md debe documentar ADR-005');
  assert.ok(
    secretRunbookContent.includes('task secrets:audit-rotation'),
    'secret-rotation.md debe documentar task secrets:audit-rotation',
  );

  // 7. README.md y docs/README.md enlazan ADR-005 y catálogo registra ADR-022
  fs.readFileSync(readmePath, 'utf-8');
  const docsReadmeContent = fs.readFileSync(docsReadmePath, 'utf-8');
  const decisionsReadmeContent = fs.readFileSync(decisionsReadmePath, 'utf-8');
  assert.ok(docsReadmeContent.includes('ADR-005-secret-management.md'), 'docs/README.md debe enlazar ADR-005');
  assertDocsPortalLinksAdrIndex(docsReadmeContent);
  assert.ok(
    decisionsReadmeContent.includes('ADR-022'),
    'docs/decisions/README.md debe registrar el histórico consolidado de ADR-022',
  );
});
