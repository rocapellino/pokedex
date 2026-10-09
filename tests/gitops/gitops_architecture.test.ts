import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseDirectoryExclude } from '../helpers/argocd.js';
import { ROOT_DIR } from '../helpers/repo.js';

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
    'El README debe declarar que el blueprint de AWS es una referencia inactiva',
  );

  // 2. El README no debe documentar clusteres inexistentes: un README que cita un
  //    cluster retirado desvia la depuracion. ADR-030: el unico cluster Proxmox es
  //    el LXC 800 y ArgoCD lo gestiona in-cluster.
  const appPreprod = fs.readFileSync(path.join(ROOT_DIR, 'gitops/apps/app-proxmox-preprod.yaml'), 'utf-8');
  assert.match(
    appPreprod,
    /server:\s*https:\/\/kubernetes\.default\.svc/,
    'GITOPS-003: pre-prod debe sincronizarse in-cluster',
  );
  assert.ok(
    !fs.existsSync(path.join(ROOT_DIR, 'gitops/apps/app-proxmox.yaml')),
    'GITOPS-003: app-proxmox.yaml se retiro con ADR-030',
  );
  for (const retired of ['k8s-proxmox.internal.lan', 'app-proxmox.yaml']) {
    assert.ok(!readme.includes(retired), `GITOPS-003: el README no debe citar ${retired}, retirado con ADR-030`);
  }

  // 3. La afirmacion "AWS esta excluido del App-of-Apps" debe ser CIERTA: se lee
  //    del bloque `exclude` del manifiesto raiz, no del README.
  const rootApp = fs.readFileSync(path.join(ROOT_DIR, 'gitops/apps/root-application.yaml'), 'utf-8');
  const excludeBlock = parseDirectoryExclude(rootApp).join(',');
  assert.match(
    excludeBlock,
    /app-cloud\.yaml/,
    'GITOPS-003: el README afirma que app-cloud.yaml esta excluido, pero el manifiesto raiz no lo excluye',
  );
  assert.match(
    excludeBlock,
    /root-application\.yaml/,
    'GITOPS-003: el root-application.yaml debe excluirse a si mismo',
  );

  // 4. Todo enlace relativo del README debe resolver. Un enlace roto en la
  //    documentacion de SSOT es peor que no enlazar.
  const links = [...readme.matchAll(/\]\(([^)#:]+\.(?:md|yaml|yml))\)/g)].map((m) => m[1]);
  assert.ok(links.length > 0, 'El README debe enlazar documentacion relacionada');
  for (const link of links) {
    const target = path.resolve(path.dirname(readmePath), link);
    assert.ok(fs.existsSync(target), `GITOPS-003: enlace roto en gitops/README.md -> ${link}`);
  }
});

test('🛡️ GITOPS-005: todo entorno GitOps activo debe renderizarse en CI', () => {
  // `proxmox-preprod` es un target ACTIVO: `root-application.yaml` lo gobierna via
  // App-of-Apps y sus values existen completos. Antes de este cambio, `infra.yaml`
  // renderizaba solo `proxmox` y `aws`, de modo que un error de template, de valores
  // o de paridad en preprod solo se detectaba al sincronizar contra el cluster real.
  const infraWorkflow = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/infra.yaml'), 'utf-8');

  // 1. Determinar los targets ACTIVOS a partir del App-of-Apps, que es la
  //    declaracion de verdad. `app-cloud.yaml` esta excluido (GITOPS-001).
  const rootApp = fs.readFileSync(path.join(ROOT_DIR, 'gitops/apps/root-application.yaml'), 'utf-8');
  const excluded = parseDirectoryExclude(rootApp);

  const gitopsAppsDir = path.join(ROOT_DIR, 'gitops/apps');
  const appFiles = fs.readdirSync(gitopsAppsDir).filter((f) => f.startsWith('app-') && f.endsWith('.yaml'));

  const activeEnvs = appFiles
    .filter((f) => !excluded.includes(f))
    .map((f) => f.replace(/^app-/, '').replace(/\.yaml$/, ''));

  assert.ok(
    activeEnvs.includes('proxmox-preprod'),
    'INFRA-005: se espera que proxmox-preprod sea un target activo segun el App-of-Apps',
  );

  // 2. Cada entorno activo debe renderizarse en el workflow de infraestructura.
  for (const env of activeEnvs) {
    const valuesFile = `gitops/environments/${env}/values.yaml`;
    assert.ok(
      fs.existsSync(path.join(ROOT_DIR, valuesFile)),
      `INFRA-005: el entorno activo ${env} debe tener ${valuesFile}`,
    );
    assert.ok(
      infraWorkflow.includes(valuesFile),
      `GITOPS-005: infra.yaml debe renderizar el entorno activo ${env} (${valuesFile}); ` +
        'un error en el solo se detectaria al sincronizar contra el cluster real.',
    );
  }

  // 3. El render debe pasar las validaciones de esquema y de buenas practicas.
  assert.ok(
    infraWorkflow.includes('/tmp/rendered-proxmox-preprod.yaml'),
    'GITOPS-005: debe verificarse que el render de preprod no esta vacio',
  );
  const kubeconformLine = infraWorkflow.match(/kubeconform[^\n]*rendered-dev\.yaml[^\n]*/)?.[0] ?? '';
  assert.ok(
    kubeconformLine.includes('rendered-proxmox-preprod.yaml'),
    'GITOPS-005: kubeconform debe validar tambien el render de preprod',
  );
  const lintLine = infraWorkflow.match(/kube-linter lint[^\n]*/)?.[0] ?? '';
  assert.ok(
    lintLine.includes('rendered-proxmox-preprod.yaml'),
    'GITOPS-005: kube-linter debe validar tambien el render de preprod',
  );

  // 4. Anti-regresion: ningun entorno activo puede quedar fuera del render por
  //    descuido. El numero de entornos declarados debe coincidir con los renderizados.
  const renderedCount = (infraWorkflow.match(/gitops\/environments\/[a-z-]+\/values\.yaml/g) ?? []).length;
  assert.ok(
    renderedCount >= activeEnvs.length,
    `GITOPS-005: se renderizan ${renderedCount} entornos pero hay ${activeEnvs.length} activos (${activeEnvs.join(', ')})`,
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
  const rootApp = fs.readFileSync(path.join(ROOT_DIR, 'gitops/apps/root-application.yaml'), 'utf-8');
  const appCloud = fs.readFileSync(path.join(ROOT_DIR, 'gitops/apps/app-cloud.yaml'), 'utf-8');

  // 1. El root DEBE excluir explicitamente el manifiesto de referencia.
  assert.match(
    rootApp,
    /exclude:[\s\S]*?app-cloud\.yaml/,
    'GITOPS-001: root-application.yaml debe excluir app-cloud.yaml del descubrimiento',
  );

  // 2. El root NO debe descubrir de forma implicita ningun otro manifiesto.
  //    Solo se gobiernan prod y preprod; cualquier cuarto archivo seria un
  //    despliegue no declarado.
  // ArgoCD interpreta `exclude` como un único glob: una lista multilínea no se
  // aplicaba y pokedex-cloud apareció en el clúster (2026-10-04).
  assert.doesNotMatch(
    rootApp,
    /exclude:\s*[|>]/,
    'GITOPS-001: exclude debe ser un glob de una línea, no un bloque multilínea',
  );
  const excluded = parseDirectoryExclude(rootApp);
  assert.deepEqual(
    excluded.sort(),
    ['app-cloud.yaml', 'root-application.yaml'],
    'GITOPS-001: el conjunto excluido debe ser exactamente {root, cloud}. ' +
      'Proxmox y preprod son los unicos targets activos.',
  );

  // 3. La referencia no debe declarar semantica de produccion: una ventana de
  //    freeze de 62h sobre un manifiesto que no se despliega es contradictoria.
  assert.ok(
    !appCloud.includes('syncWindows:'),
    'GITOPS-001: la referencia inactiva no debe declarar syncWindows de produccion',
  );

  // 4. El estado debe quedar escrito, no solo inferido del comportamiento.
  assert.match(appCloud, /INACTIVA/, 'GITOPS-001: app-cloud.yaml debe declarar su estado inactivo de forma explicita');

  // 5. La referencia inactiva debe portar anotación de status y no definir auto-sync activo
  assert.ok(
    appCloud.includes('architecture.pokedex.io/status: "inactive"'),
    'GITOPS-001: app-cloud.yaml debe declarar la anotación architecture.pokedex.io/status: "inactive"',
  );
  assert.ok(
    !/^\s*automated:\s*$/m.test(appCloud),
    'GITOPS-001: la referencia inactiva no debe tener syncPolicy.automated activo',
  );
});

test('🔒 ADR-030: el blueprint prod cloud hereda values.prod.yaml y no fija un proveedor', () => {
  const appCloud = fs.readFileSync(path.join(ROOT_DIR, 'gitops/apps/app-cloud.yaml'), 'utf-8');
  const cloudValuesPath = path.join(ROOT_DIR, 'gitops/environments/cloud/values.yaml');
  assert.ok(fs.existsSync(cloudValuesPath), 'gitops/environments/cloud/values.yaml debe existir');
  assert.ok(
    !fs.existsSync(path.join(ROOT_DIR, 'gitops/environments/aws')),
    'gitops/environments/aws se retiró con ADR-030',
  );

  // 1. Cadena de values: base -> perfil HA endurecido -> override del proveedor.
  const valueFiles = /valueFiles:\s*\n((?:\s+- .+\n)+)/.exec(appCloud.replace(/\r\n/g, '\n'))?.[1] ?? '';
  assert.deepEqual(
    valueFiles
      .split('\n')
      .map((l) => l.replace(/^\s*-\s*/, '').trim())
      .filter(Boolean),
    ['values.yaml', 'values.prod.yaml', '../../../gitops/environments/cloud/values.yaml'],
    'app-cloud.yaml debe encadenar values.yaml, values.prod.yaml y el override cloud en ese orden',
  );

  // 2. Sin destino real hasta la activación: el TLD .invalid no resuelve.
  assert.match(
    appCloud,
    /server:\s*https:\/\/[^\s]+\.invalid\b/,
    'El destino del blueprint debe ser un marcador .invalid',
  );

  // 3. Ni el manifiesto ni el override fijan recursos de un proveedor concreto.
  const cloudValues = fs.readFileSync(cloudValuesPath, 'utf-8');
  for (const marker of ['alb.ingress.kubernetes.io', 'eks.amazonaws.com', 'aws-secrets-manager', 'gce', 'azure']) {
    assert.ok(!cloudValues.includes(marker), `cloud/values.yaml no debe fijar el proveedor (${marker})`);
    assert.ok(!appCloud.includes(marker), `app-cloud.yaml no debe fijar el proveedor (${marker})`);
  }

  // 4. Secretos: ruta lógica reservada pokedex/prod y ClusterSecretStore como parámetro.
  assert.match(
    cloudValues,
    /secretStoreRef:\s*\r?\n\s+name: "[a-z0-9-]+"/,
    'El override cloud debe declarar el ClusterSecretStore como parámetro',
  );
  assert.ok(cloudValues.includes('key: "pokedex/prod"'), 'El override cloud debe usar la ruta reservada pokedex/prod');

  // 5. El manifiesto canónico de ESO no declara stores de un proveedor: el del
  //    blueprint se crea al activarlo, con el backend elegido.
  const clusterStores = fs.readFileSync(path.join(ROOT_DIR, 'infra/k8s/eso/cluster-secret-store.yaml'), 'utf-8');
  assert.ok(!/^\s+aws:\s*$/m.test(clusterStores), 'cluster-secret-store.yaml no debe declarar un provider aws');
  assert.ok(
    !clusterStores.includes('name: aws-secrets-manager'),
    'cluster-secret-store.yaml no debe declarar aws-secrets-manager',
  );
});
