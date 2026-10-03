/**
 * ==============================================================================
 * Test de Arquitectura GitOps: App-of-Apps, CI Rendering, Sync Waves, Reloader y SSOT
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

test('🛡️ Orquestación GitOps Avanzada: ADR-003 formaliza Sync Waves, PreSync Hooks, Health Checks y App-of-Apps (consolida ADR-021)', async () => {
  const adrPath = path.join(ROOT_DIR, 'docs/decisions/ADR-003-gitops-with-argocd.md');
  const decisionsReadmePath = path.join(ROOT_DIR, 'docs/decisions/README.md');
  const rootAppPath = path.join(ROOT_DIR, 'gitops/apps/root-application.yaml');
  const appProxmoxPath = path.join(ROOT_DIR, 'gitops/apps/app-proxmox.yaml');
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
  assert.ok(adrContent.replace(/\r\n/g, '\n').includes('## Estado\n\nAceptado'), 'ADR-003 debe estar en estado Aceptado');
  assert.ok(adrContent.includes('Sync Waves'), 'ADR-003 debe documentar Sync Waves');
  assert.ok(adrContent.includes('PreSync'), 'ADR-003 debe documentar PreSync hook');
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
    'root-application.yaml debe incluir finalizer'
  );

  // 3. Health checks existen y cubren CRDs críticos (ExternalSecret y ClusterPolicy; SealedSecret purgado)
  assert.ok(fs.existsSync(healthChecksPath), 'argocd-cm-healthchecks.yaml debe existir en gitops/health-checks/');
  const healthContent = fs.readFileSync(healthChecksPath, 'utf-8');
  assert.ok(healthContent.includes('external-secrets.io_ExternalSecret'), 'Debe definir health check para ExternalSecret');
  assert.ok(!healthContent.includes('bitnami.com_SealedSecret'), 'No debe contener health check residual de SealedSecret');
  assert.ok(healthContent.includes('kyverno.io_ClusterPolicy'), 'Debe definir health check para ClusterPolicy');

  // 3.1 GITOPS-001: el manifiesto debe extender `argocd-cm`, NO un ConfigMap homónimo.
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
  const appProxmoxPreprodPath = path.join(ROOT_DIR, 'gitops/apps/app-proxmox-preprod.yaml');
  const proxmoxContent = fs.readFileSync(appProxmoxPath, 'utf-8');
  const preprodContent = fs.readFileSync(appProxmoxPreprodPath, 'utf-8');
  const cloudContent = fs.readFileSync(appCloudPath, 'utf-8');
  assert.ok(proxmoxContent.includes('ServerSideApply=true'), 'app-proxmox.yaml debe configurar ServerSideApply');
  assert.ok(preprodContent.includes('ServerSideApply=true'), 'app-proxmox-preprod.yaml debe configurar ServerSideApply');

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

  // 7. deployment.md documenta sección 5 y ADR-003
  const deploymentContent = fs.readFileSync(deploymentRunbookPath, 'utf-8');
  assert.ok(deploymentContent.includes('ADR-003'), 'deployment.md debe referenciar ADR-003');
  assert.ok(deploymentContent.includes('task gitops:apps:root'), 'deployment.md debe documentar task gitops:apps:root');

  // 8. README.md y docs/README.md enlazan ADR-003 y docs/decisions/README.md registra ADR-021
  const docsReadmeContent = fs.readFileSync(docsReadmePath, 'utf-8');
  const readmeContent = fs.readFileSync(readmePath, 'utf-8');
  const decisionsReadmeContent = fs.readFileSync(decisionsReadmePath, 'utf-8');
  assert.ok(docsReadmeContent.includes('ADR-003-gitops-with-argocd.md'), 'docs/README.md debe enlazar ADR-003');
  assert.ok(docsReadmeContent.includes('ADR-001 a ADR-022') || docsReadmeContent.includes('ADR-001 a ADR-020'), 'Mermaid en docs/README.md debe indicar rango de ADRs');
  assert.ok(decisionsReadmeContent.includes('ADR-021'), 'docs/decisions/README.md debe registrar el histórico consolidado de ADR-021');

  // 9. Los ADRs activos catalogados existen físicamente en disco
  const decisionFiles = fs.readdirSync(path.join(ROOT_DIR, 'docs/decisions')).filter((f: string) => f.startsWith('ADR-'));
  assert.ok(decisionFiles.length >= 20, 'Debe existir un conjunto sustancial de ADRs activos');
  for (const adrFile of decisionFiles) {
    assert.ok(decisionsReadmeContent.includes(adrFile), `docs/decisions/README.md debe indexar el ADR activo ${adrFile}`);
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
  assert.ok(adrContent.includes('reloader.stakater.com/auto'), 'ADR-005 debe formalizar anotación de Stakater Reloader');
  assert.ok(adrContent.includes('External Secrets Operator'), 'ADR-005 debe formalizar External Secrets Operator');
  assert.ok(adrContent.includes('ADR-022'), 'ADR-005 debe formalizar la consolidación de ADR-022');

  // 2. Helm values configuran anotación de Reloader y refreshInterval acotado
  const valuesContent = fs.readFileSync(valuesPath, 'utf-8');
  const valuesProdContent = fs.readFileSync(valuesProdPath, 'utf-8');
  assert.ok(valuesContent.includes('reloader.stakater.com/auto: "true"'), 'values.yaml debe incluir anotación reloader.stakater.com/auto: "true"');
  assert.ok(valuesProdContent.includes('reloader.stakater.com/auto: "true"'), 'values.prod.yaml debe incluir anotación reloader.stakater.com/auto: "true"');
  assert.ok(valuesProdContent.includes('refreshInterval: "1h"'), 'values.prod.yaml debe acotar refreshInterval a 1h');

  // 3. Template de web deployment soporta deploymentAnnotations
  const webDeployContent = fs.readFileSync(webDeployPath, 'utf-8');
  assert.ok(webDeployContent.includes('.Values.web.deploymentAnnotations'), 'web-deployment.yaml debe soportar web.deploymentAnnotations');

  // 4. Script de auditoría de rotación existe y valida arquitectura dual (ADR-005)
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

  // 6. Runbook secret-rotation.md documenta ADR-005 y comando canónico
  const secretRunbookContent = fs.readFileSync(secretRunbookPath, 'utf-8');
  assert.ok(secretRunbookContent.includes('ADR-005'), 'secret-rotation.md debe documentar ADR-005');
  assert.ok(secretRunbookContent.includes('task secrets:audit-rotation'), 'secret-rotation.md debe documentar task secrets:audit-rotation');

  // 7. README.md y docs/README.md enlazan ADR-005 y catálogo registra ADR-022
  const readmeContent = fs.readFileSync(readmePath, 'utf-8');
  const docsReadmeContent = fs.readFileSync(docsReadmePath, 'utf-8');
  const decisionsReadmeContent = fs.readFileSync(decisionsReadmePath, 'utf-8');
  assert.ok(docsReadmeContent.includes('ADR-005-secret-management.md'), 'docs/README.md debe enlazar ADR-005');
  assert.ok(docsReadmeContent.includes('ADR-001 a ADR-022') || docsReadmeContent.includes('ADR-001 a ADR-020'), 'Mermaid en docs/README.md debe indicar rango de ADRs');
  assert.ok(decisionsReadmeContent.includes('ADR-022'), 'docs/decisions/README.md debe registrar el histórico consolidado de ADR-022');

  // 8. Los ADRs activos catalogados existen físicamente en disco
  const decisionFiles = fs.readdirSync(path.join(ROOT_DIR, 'docs/decisions')).filter((f: string) => f.startsWith('ADR-'));
  assert.ok(decisionFiles.length >= 20, 'Debe existir un conjunto sustancial de ADRs activos');
  for (const adrFile of decisionFiles) {
    assert.ok(decisionsReadmeContent.includes(adrFile), `docs/decisions/README.md debe indexar el ADR activo ${adrFile}`);
  }
});
