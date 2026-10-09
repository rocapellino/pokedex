import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseDirectoryExclude } from '../helpers/argocd.js';
import { ROOT_DIR } from '../helpers/repo.js';
import { readYaml, readYamlDocs, workflowScripts } from '../helpers/yaml.js';

/**
 * Los manifiestos de ArgoCD, los values y el workflow de infraestructura se verifican parseados: un campo comentado
 * o un comando de shell comentado siguen "apareciendo" en el archivo sin que ArgoCD o el runner los apliquen. El
 * README (documentación) sí se comprueba como texto.
 */

const read = (relativePath: string) => fs.readFileSync(path.join(ROOT_DIR, relativePath), 'utf-8');
const exists = (relativePath: string) => fs.existsSync(path.join(ROOT_DIR, relativePath));

/**
 * Comandos de shell de un workflow, uno por entrada: se unen las continuaciones de línea (`\`) y se descartan los
 * comentarios, de modo que un comando comentado no cuenta como si se ejecutara.
 */
const workflowCommands = (relativePath: string): string[] =>
  workflowScripts(relativePath).flatMap((script) =>
    script
      .replace(/\\\r?\n/g, ' ')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
  );

interface ArgoApplication {
  metadata: { annotations?: Record<string, string> };
  spec: {
    source: { helm?: { valueFiles?: string[] } };
    destination: { server: string };
    syncPolicy?: { automated?: unknown };
    syncWindows?: unknown;
  };
}

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
  assert.ok(exists('gitops/README.md'), 'GITOPS-003: gitops/ debe tener README.md');

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
  const appPreprod = readYaml<ArgoApplication>('gitops/apps/app-proxmox-preprod.yaml');
  assert.equal(
    appPreprod.spec.destination.server,
    'https://kubernetes.default.svc',
    'GITOPS-003: pre-prod debe sincronizarse in-cluster',
  );
  assert.ok(!exists('gitops/apps/app-proxmox.yaml'), 'GITOPS-003: app-proxmox.yaml se retiro con ADR-030');
  for (const retired of ['k8s-proxmox.internal.lan', 'app-proxmox.yaml']) {
    assert.ok(!readme.includes(retired), `GITOPS-003: el README no debe citar ${retired}, retirado con ADR-030`);
  }

  // 3. La afirmacion "AWS esta excluido del App-of-Apps" debe ser CIERTA: se lee
  //    del bloque `exclude` del manifiesto raiz, no del README.
  const excluded = parseDirectoryExclude(read('gitops/apps/root-application.yaml'));
  assert.ok(
    excluded.includes('app-cloud.yaml'),
    'GITOPS-003: el README afirma que app-cloud.yaml esta excluido, pero el manifiesto raiz no lo excluye',
  );
  assert.ok(
    excluded.includes('root-application.yaml'),
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
  const commands = workflowCommands('.github/workflows/infra.yaml');

  // 1. Determinar los targets ACTIVOS a partir del App-of-Apps, que es la
  //    declaracion de verdad. `app-cloud.yaml` esta excluido (GITOPS-001).
  const excluded = parseDirectoryExclude(read('gitops/apps/root-application.yaml'));
  const appFiles = fs.readdirSync(path.join(ROOT_DIR, 'gitops/apps')).filter((f) => /^app-.+\.yaml$/.test(f));

  const activeEnvs = appFiles
    .filter((f) => !excluded.includes(f))
    .map((f) => f.replace(/^app-/, '').replace(/\.yaml$/, ''));

  assert.ok(
    activeEnvs.includes('proxmox-preprod'),
    'INFRA-005: se espera que proxmox-preprod sea un target activo segun el App-of-Apps',
  );

  // 2. Cada entorno activo debe renderizarse con `helm template -f <values>` en el workflow de infraestructura.
  for (const env of activeEnvs) {
    const valuesFile = `gitops/environments/${env}/values.yaml`;
    assert.ok(exists(valuesFile), `INFRA-005: el entorno activo ${env} debe tener ${valuesFile}`);
    assert.ok(
      commands.some((command) => command.startsWith('helm template') && command.includes(`-f ${valuesFile}`)),
      `GITOPS-005: infra.yaml debe renderizar el entorno activo ${env} (${valuesFile}); ` +
        'un error en el solo se detectaria al sincronizar contra el cluster real.',
    );
  }

  // 3. El render debe pasar las validaciones de esquema y de buenas practicas.
  assert.ok(
    commands.some((command) => /^test -s \/tmp\/rendered-proxmox-preprod\.yaml\b/.test(command)),
    'GITOPS-005: debe verificarse que el render de preprod no esta vacio',
  );
  const kubeconform = commands.find((command) => command.includes('kubeconform -strict'));
  assert.ok(
    kubeconform?.includes('/tmp/rendered-proxmox-preprod.yaml'),
    'GITOPS-005: kubeconform debe validar tambien el render de preprod',
  );
  const kubeLinter = commands.find((command) => command.includes('kube-linter lint'));
  assert.ok(
    kubeLinter?.includes('/tmp/rendered-proxmox-preprod.yaml'),
    'GITOPS-005: kube-linter debe validar tambien el render de preprod',
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
  const appCloudText = read('gitops/apps/app-cloud.yaml');
  const appCloud = readYaml<ArgoApplication>('gitops/apps/app-cloud.yaml');

  // 1. El root DEBE excluir explicitamente el manifiesto de referencia, y solo ese y el propio root.
  //    ArgoCD interpreta `exclude` como un único glob: una lista multilínea no se aplicaba y pokedex-cloud
  //    apareció en el clúster (2026-10-04). `parseDirectoryExclude` devuelve [] si no es un glob de una línea.
  const excluded = parseDirectoryExclude(read('gitops/apps/root-application.yaml'));
  assert.deepEqual(
    excluded.sort(),
    ['app-cloud.yaml', 'root-application.yaml'],
    'GITOPS-001: el conjunto excluido debe ser exactamente {root, cloud} y expresarse como glob de una línea. ' +
      'Proxmox y preprod son los unicos targets activos.',
  );

  // 2. La referencia no debe declarar semantica de produccion: una ventana de
  //    freeze de 62h sobre un manifiesto que no se despliega es contradictoria.
  assert.equal(appCloud.spec.syncWindows, undefined, 'GITOPS-001: la referencia inactiva no debe declarar syncWindows');

  // 3. El estado debe quedar escrito, no solo inferido del comportamiento.
  assert.match(
    appCloudText,
    /INACTIVA/,
    'GITOPS-001: app-cloud.yaml debe declarar su estado inactivo de forma explicita',
  );
  assert.equal(
    appCloud.metadata.annotations?.['architecture.pokedex.io/status'],
    'inactive',
    'GITOPS-001: app-cloud.yaml debe declarar la anotación architecture.pokedex.io/status: "inactive"',
  );

  // 4. La referencia inactiva no define auto-sync activo.
  assert.equal(
    appCloud.spec.syncPolicy?.automated,
    undefined,
    'GITOPS-001: la referencia inactiva no debe tener syncPolicy.automated activo',
  );
});

test('🔒 ADR-030: el blueprint prod cloud hereda values.prod.yaml y no fija un proveedor', () => {
  const appCloud = readYaml<ArgoApplication>('gitops/apps/app-cloud.yaml');
  const cloudValues = readYaml('gitops/environments/cloud/values.yaml');
  assert.ok(exists('gitops/environments/cloud/values.yaml'), 'gitops/environments/cloud/values.yaml debe existir');
  assert.ok(!exists('gitops/environments/aws'), 'gitops/environments/aws se retiró con ADR-030');

  // 1. Cadena de values: base -> perfil HA endurecido -> override del proveedor.
  assert.deepEqual(
    appCloud.spec.source.helm?.valueFiles,
    ['values.yaml', 'values.prod.yaml', '../../../gitops/environments/cloud/values.yaml'],
    'app-cloud.yaml debe encadenar values.yaml, values.prod.yaml y el override cloud en ese orden',
  );

  // 2. Sin destino real hasta la activación: el TLD .invalid no resuelve.
  assert.match(
    appCloud.spec.destination.server,
    /^https:\/\/[^\s]+\.invalid\b/,
    'El destino del blueprint debe ser un marcador .invalid',
  );

  // 3. Ni el manifiesto ni el override fijan recursos de un proveedor concreto.
  const cloudValuesText = JSON.stringify(cloudValues);
  const appCloudText = JSON.stringify(appCloud);
  for (const marker of ['alb.ingress.kubernetes.io', 'eks.amazonaws.com', 'aws-secrets-manager', 'gce', 'azure']) {
    assert.ok(!cloudValuesText.includes(marker), `cloud/values.yaml no debe fijar el proveedor (${marker})`);
    assert.ok(!appCloudText.includes(marker), `app-cloud.yaml no debe fijar el proveedor (${marker})`);
  }

  // 4. Secretos: ruta lógica reservada pokedex/prod y ClusterSecretStore como parámetro.
  assert.match(
    cloudValues.externalSecrets.secretStoreRef.name,
    /^[a-z0-9-]+$/,
    'El override cloud debe declarar el ClusterSecretStore como parámetro',
  );
  assert.equal(
    cloudValues.externalSecrets.remoteRef.key,
    'pokedex/prod',
    'El override cloud debe usar la ruta reservada pokedex/prod',
  );

  // 5. El manifiesto canónico de ESO no declara stores de un proveedor: el del
  //    blueprint se crea al activarlo, con el backend elegido.
  const stores = readYamlDocs<{ metadata: { name: string }; spec?: { provider?: Record<string, unknown> } }>(
    'infra/k8s/eso/cluster-secret-store.yaml',
  );
  assert.ok(
    stores.every((store) => store.spec?.provider?.aws === undefined),
    'cluster-secret-store.yaml no debe declarar un provider aws',
  );
  assert.ok(
    stores.every((store) => store.metadata.name !== 'aws-secrets-manager'),
    'cluster-secret-store.yaml no debe declarar aws-secrets-manager',
  );
});
