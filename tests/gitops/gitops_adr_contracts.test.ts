import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCompleteTaskfileContent } from '../helpers/taskfile.js';
import { assertDocsPortalLinksAdrIndex } from '../helpers/docs-portal.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.resolve(__dirname, '../../');

test('🛡️ Orquestación GitOps Avanzada: ADR-003 formaliza Sync Waves, Hooks de Siembra, Health Checks y App-of-Apps (consolida ADR-021)', async () => {
  const adrPath = path.join(ROOT_DIR, 'docs/decisions/ADR-003-gitops-with-argocd.md');
  const decisionsReadmePath = path.join(ROOT_DIR, 'docs/decisions/README.md');
  const rootAppPath = path.join(ROOT_DIR, 'gitops/apps/root-application.yaml');
  const appCloudPath = path.join(ROOT_DIR, 'gitops/apps/app-cloud.yaml');
  const healthChecksPath = path.join(ROOT_DIR, 'gitops/health-checks/argocd-cm-healthchecks.yaml');
  const seedJobPath = path.join(ROOT_DIR, 'infra/helm/pokedex/templates/seed-job.yaml');
  const postgresStsPath = path.join(ROOT_DIR, 'infra/helm/pokedex/templates/postgres-statefulset.yaml');
  const apiDeploymentPath = path.join(ROOT_DIR, 'infra/helm/pokedex/templates/api-deployment.yaml');
  const webDeploymentPath = path.join(ROOT_DIR, 'infra/helm/pokedex/templates/web-deployment.yaml');
  const ingressPath = path.join(ROOT_DIR, 'infra/helm/pokedex/templates/ingress.yaml');
  const deploymentRunbookPath = path.join(ROOT_DIR, 'docs/operations/deployment.md');
  const docsReadmePath = path.join(ROOT_DIR, 'docs/README.md');
  const readmePath = path.join(ROOT_DIR, 'README.md');

  // 1. ADR-003 existe, está aceptado y consolida la orquestación avanzada de ADR-021
  assert.ok(fs.existsSync(adrPath), 'ADR-003 debe existir en docs/decisions/');
  const adrContent = fs.readFileSync(adrPath, 'utf-8');
  assert.ok(
    adrContent.replace(/\r\n/g, '\n').includes('## Estado\n\nAceptado'),
    'ADR-003 debe estar en estado Aceptado',
  );
  assert.ok(adrContent.includes('Sync Waves'), 'ADR-003 debe documentar Sync Waves');
  assert.ok(adrContent.includes('PostSync'), 'ADR-003 debe documentar el hook PostSync del seed job');
  assert.ok(adrContent.includes('App-of-Apps'), 'ADR-003 debe documentar patrón App-of-Apps');
  assert.ok(adrContent.includes('Health Checks'), 'ADR-003 debe documentar Custom Health Checks');
  assert.ok(adrContent.includes('ADR-021'), 'ADR-003 debe registrar formalmente la consolidación de ADR-021');

  // 2. root-application.yaml existe y define App-of-Apps
  assert.ok(fs.existsSync(rootAppPath), 'root-application.yaml debe existir en gitops/apps/');
  const rootAppContent = fs.readFileSync(rootAppPath, 'utf-8');
  assert.ok(rootAppContent.includes('pokedex-root'), 'root-application.yaml debe nombrar la app pokedex-root');
  assert.ok(rootAppContent.includes('gitops/apps'), 'root-application.yaml debe apuntar a gitops/apps');
  assert.match(
    rootAppContent,
    /-\s+resources-finalizer\.argocd\.argoproj\.io/,
    'root-application.yaml debe incluir finalizer',
  );

  // 3. Health checks existen y cubren CRDs críticos (ExternalSecret y ClusterPolicy; SealedSecret purgado)
  assert.ok(fs.existsSync(healthChecksPath), 'argocd-cm-healthchecks.yaml debe existir en gitops/health-checks/');
  const healthContent = fs.readFileSync(healthChecksPath, 'utf-8');
  assert.ok(
    healthContent.includes('external-secrets.io_ExternalSecret'),
    'Debe definir health check para ExternalSecret',
  );
  assert.ok(
    !healthContent.includes('bitnami.com_SealedSecret'),
    'No debe contener health check residual de SealedSecret',
  );
  assert.ok(healthContent.includes('kyverno.io_ClusterPolicy'), 'Debe definir health check para ClusterPolicy');

  // 3.1 GITOPS-001: el manifiesto debe extender `argocd-cm`, NO un ConfigMap homónimo.
  assert.match(
    healthContent,
    /^\s*name:\s*argocd-cm\s*$/m,
    'GITOPS-001: el manifiesto debe parchear el ConfigMap `argocd-cm`, el único que ArgoCD lee',
  );
  assert.ok(
    !/^\s*name:\s*argocd-cm-healthchecks\s*$/m.test(healthContent),
    'GITOPS-001: no debe declararse un ConfigMap homónimo `argocd-cm-healthchecks` (ArgoCD lo ignoraría)',
  );
  assert.ok(
    !/^\s*app\.kubernetes\.io\/name:\s*argocd-cm-healthchecks\s*$/m.test(healthContent),
    'GITOPS-001: no debe quedar la etiqueta del ConfigMap homónimo purgado',
  );

  // 4. Helm templates declaran Sync Waves deterministas (0 a 4)
  const stsContent = fs.readFileSync(postgresStsPath, 'utf-8');
  assert.ok(
    stsContent.includes('argocd.argoproj.io/sync-wave: "0"'),
    'PostgreSQL StatefulSet debe estar en sync-wave 0',
  );

  const seedContent = fs.readFileSync(seedJobPath, 'utf-8');
  // ADR-030: el seed corre como PostSync; el contrato renderizado vive en seed_job_contract.test.ts.
  assert.ok(seedContent.includes('"argocd.argoproj.io/hook": PostSync'), 'Seed Job debe definir hook PostSync');
  assert.ok(seedContent.includes('HookSucceeded'), 'Seed Job debe definir hook-delete-policy');

  const apiContent = fs.readFileSync(apiDeploymentPath, 'utf-8');
  assert.ok(apiContent.includes('argocd.argoproj.io/sync-wave: "2"'), 'API Deployment debe estar en sync-wave 2');

  const webContent = fs.readFileSync(webDeploymentPath, 'utf-8');
  assert.ok(webContent.includes('argocd.argoproj.io/sync-wave: "3"'), 'Web Deployment debe estar en sync-wave 3');

  const ingressContent = fs.readFileSync(ingressPath, 'utf-8');
  assert.ok(ingressContent.includes('argocd.argoproj.io/sync-wave: "4"'), 'Ingress debe estar en sync-wave 4');

  // 5. Las Applications ACTIVAS configuran opciones avanzadas de sync.
  const appProxmoxPreprodPath = path.join(ROOT_DIR, 'gitops/apps/app-proxmox-preprod.yaml');
  const preprodContent = fs.readFileSync(appProxmoxPreprodPath, 'utf-8');
  const cloudContent = fs.readFileSync(appCloudPath, 'utf-8');
  assert.ok(
    preprodContent.includes('ServerSideApply=true'),
    'app-proxmox-preprod.yaml debe configurar ServerSideApply',
  );

  // ADR-030: pre-prod es entrega continua (sin ventanas de bloqueo); la ventana de
  // fin de semana pertenecia a la antigua prod Proxmox, retirada.
  assert.ok(
    !/^\s*syncWindows:/m.test(preprodContent),
    'app-proxmox-preprod.yaml no debe declarar syncWindows (entrega continua)',
  );

  assert.ok(
    !cloudContent.includes('syncWindows:'),
    'GITOPS-001: una referencia inactiva no debe declarar ventanas de proteccion de produccion',
  );
  assert.ok(!cloudContent.includes('* * * * *'), 'app-cloud.yaml no debe tener el antipatrón * * * * *');

  // Pre-producción: Continuous Delivery sin bloqueos artificiales
  assert.ok(!preprodContent.includes('* * * * *'), 'app-proxmox-preprod.yaml no debe tener el antipatrón * * * * *');
  assert.ok(
    !preprodContent.includes('kind: deny'),
    'app-proxmox-preprod.yaml no debe bloquear despliegues en pre-producción',
  );

  // 6. Taskfile.yaml define tareas gitops:apps:root y gitops:health-checks (retirando el legacy gitops:apps)
  const taskfileContent = getCompleteTaskfileContent(ROOT_DIR);
  assert.ok(taskfileContent.includes('gitops:apps:root:'), 'Taskfile.yaml debe definir gitops:apps:root');
  assert.ok(
    !/^\s*gitops:apps:\s*$/m.test(taskfileContent),
    'Taskfile.yaml no debe contener la tarea legada gitops:apps',
  );
  assert.ok(taskfileContent.includes('gitops:health-checks:'), 'Taskfile.yaml debe definir gitops:health-checks');

  assert.match(
    taskfileContent,
    /kubectl patch configmap argocd-cm[^\n]*--type merge/,
    'GITOPS-001: `task gitops:health-checks` debe parchear argocd-cm con `--type merge`',
  );
  assert.ok(
    !/kubectl apply -f gitops\/health-checks\/argocd-cm-healthchecks\.yaml/.test(taskfileContent),
    'GITOPS-001: no debe usarse `kubectl apply` sobre el manifiesto de health checks (sobrescribiría argocd-cm)',
  );

  // 8. startupProbe presente en las apps que ejecutan codigo de aplicacion.
  const helmValues2 = fs.readFileSync(path.join(ROOT_DIR, 'infra/helm/pokedex/values.yaml'), 'utf-8');

  const apiContent2 = fs.readFileSync(apiDeploymentPath, 'utf-8');
  assert.match(
    apiContent2,
    /startupProbe:/,
    'api-deployment.yaml debe declarar startupProbe (margen para migraciones de arranque)',
  );
  assert.ok(
    /api\.startupProbe/.test(apiContent2),
    'api-deployment.yaml debe parametrizar el startupProbe desde values',
  );
  const webContent2 = fs.readFileSync(webDeploymentPath, 'utf-8');
  assert.match(webContent2, /startupProbe:/, 'web-deployment.yaml debe declarar startupProbe');
  assert.match(
    helmValues2,
    /startupProbe:\s*\n\s*failureThreshold:/,
    'values.yaml debe definir los parametros del startupProbe por defecto',
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

  // 9. Los ADRs activos catalogados existen físicamente en disco
  const decisionFiles = fs
    .readdirSync(path.join(ROOT_DIR, 'docs/decisions'))
    .filter((f: string) => f.startsWith('ADR-'));
  assert.ok(decisionFiles.length >= 20, 'Debe existir un conjunto sustancial de ADRs activos');
  for (const adrFile of decisionFiles) {
    assert.ok(
      decisionsReadmeContent.includes(adrFile),
      `docs/decisions/README.md debe indexar el ADR activo ${adrFile}`,
    );
  }
});

test('🛡️ Rotación de Secretos: ADR-005 formaliza Stakater Reloader, refreshInterval acotado y auditoría (consolida ADR-022)', async () => {
  const adrPath = path.join(ROOT_DIR, 'docs/decisions/ADR-005-secret-management.md');
  const decisionsReadmePath = path.join(ROOT_DIR, 'docs/decisions/README.md');
  const valuesPath = path.join(ROOT_DIR, 'infra/helm/pokedex/values.yaml');
  const valuesProdPath = path.join(ROOT_DIR, 'infra/helm/pokedex/values.prod.yaml');
  const webDeployPath = path.join(ROOT_DIR, 'infra/helm/pokedex/templates/web-deployment.yaml');
  const auditScriptPath = path.join(ROOT_DIR, 'scripts/verify-secret-rotation.ts');
  const pkgPath = path.join(ROOT_DIR, 'package.json');
  const secretRunbookPath = path.join(ROOT_DIR, 'docs/operations/secret-rotation.md');
  const readmePath = path.join(ROOT_DIR, 'README.md');
  const docsReadmePath = path.join(ROOT_DIR, 'docs/README.md');

  // 1. ADR-005 existe con Estado: Aceptado y consolida ADR-022
  assert.ok(fs.existsSync(adrPath), 'ADR-005 debe existir en docs/decisions/');
  const adrContent = fs.readFileSync(adrPath, 'utf-8').replace(/\r\n/g, '\n');
  assert.ok(adrContent.includes('## Estado\n\nAceptado'), 'ADR-005 debe estar en estado Aceptado');
  assert.ok(
    adrContent.includes('reloader.stakater.com/auto'),
    'ADR-005 debe formalizar anotación de Stakater Reloader',
  );
  assert.ok(adrContent.includes('External Secrets Operator'), 'ADR-005 debe formalizar External Secrets Operator');
  assert.ok(adrContent.includes('ADR-022'), 'ADR-005 debe formalizar la consolidación de ADR-022');

  // 2. Helm values configuran anotación de Reloader y refreshInterval acotado
  const valuesContent = fs.readFileSync(valuesPath, 'utf-8');
  const valuesProdContent = fs.readFileSync(valuesProdPath, 'utf-8');
  assert.ok(
    valuesContent.includes('reloader.stakater.com/auto: "true"'),
    'values.yaml debe incluir anotación reloader.stakater.com/auto: "true"',
  );
  assert.ok(
    valuesProdContent.includes('reloader.stakater.com/auto: "true"'),
    'values.prod.yaml debe incluir anotación reloader.stakater.com/auto: "true"',
  );
  assert.ok(valuesProdContent.includes('refreshInterval: "1h"'), 'values.prod.yaml debe acotar refreshInterval a 1h');

  // 3. Template de web deployment soporta deploymentAnnotations
  const webDeployContent = fs.readFileSync(webDeployPath, 'utf-8');
  assert.ok(
    webDeployContent.includes('.Values.web.deploymentAnnotations'),
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
  const taskfileContent = getCompleteTaskfileContent(ROOT_DIR);
  const pkgContent = fs.readFileSync(pkgPath, 'utf-8');
  assert.ok(
    taskfileContent.includes('secrets:audit-rotation:'),
    'Taskfile.yaml debe definir tarea secrets:audit-rotation',
  );
  assert.ok(pkgContent.includes('"secrets:audit-rotation"'), 'package.json debe definir script secrets:audit-rotation');

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

  // 8. Los ADRs activos catalogados existen físicamente en disco
  const decisionFiles = fs
    .readdirSync(path.join(ROOT_DIR, 'docs/decisions'))
    .filter((f: string) => f.startsWith('ADR-'));
  assert.ok(decisionFiles.length >= 20, 'Debe existir un conjunto sustancial de ADRs activos');
  for (const adrFile of decisionFiles) {
    assert.ok(
      decisionsReadmeContent.includes(adrFile),
      `docs/decisions/README.md debe indexar el ADR activo ${adrFile}`,
    );
  }
});
