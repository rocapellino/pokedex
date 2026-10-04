/**
 * ==============================================================================
 * Contrato del Bootstrap de Plataforma GitOps en Pre-Prod (ADR-030)
 * ==============================================================================
 * El relevamiento del 2026-10-04 mostró que el LXC 800 nunca tuvo ArgoCD ni ESO.
 * Este contrato fija lo que el bootstrap necesita para funcionar a la primera:
 * versiones pinneadas, la API de ESO que realmente sirven las versiones vigentes,
 * y la cadena de autenticación ESO -> Vault -> TokenReview de K3s.
 * ==============================================================================
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT_DIR, rel), 'utf-8');

const ESO_MANIFESTS = [
  'infra/helm/pokedex/templates/externalsecret.yaml',
  'infra/helm/pokedex/templates/ingress-tls-externalsecret.yaml',
  'infra/helm/pokedex/templates/secretstore.yaml',
  'infra/k8s/eso/cluster-secret-store.yaml',
  'infra/k8s/eso/external-secret-pokedex.yaml',
  'infra/k8s/eso/backup-offsite-externalsecret.yaml.template',
];

type Task = { vars?: Record<string, string>; cmds?: Array<string | { task: string }> };
const tasks = (yaml.load(read('taskfiles/k8s.yaml')) as { tasks: Record<string, Task> }).tasks;
const cmdsOf = (name: string) => (tasks[name]?.cmds ?? []).map((c) => (typeof c === 'string' ? c : `task:${c.task}`));

test('🔐 Bootstrap: los manifiestos de ESO usan external-secrets.io/v1 (v1beta1 ya no se sirve)', () => {
  for (const rel of ESO_MANIFESTS) {
    const content = read(rel);
    assert.match(content, /apiVersion:\s*external-secrets\.io\/v1\s*$/m, `${rel} debe declarar external-secrets.io/v1`);
    assert.doesNotMatch(content, /external-secrets\.io\/v1beta1/, `${rel} no debe usar v1beta1: ESO >= 1.0 no lo sirve`);
  }
});

test('🔐 Bootstrap: ESO y ArgoCD se instalan con versiones fijadas', () => {
  const esoVersion = tasks['platform:eso:install']?.vars?.ESO_CHART_VERSION;
  assert.match(esoVersion ?? '', /^\d+\.\d+\.\d+$/, 'ESO_CHART_VERSION debe ser una versión semántica exacta');
  assert.ok(cmdsOf('platform:eso:install').some((c) => c.includes('--version {{.ESO_CHART_VERSION}}')), 'helm install de ESO debe usar la versión fijada');

  const argoVersion = tasks['platform:argocd:install']?.vars?.ARGOCD_VERSION;
  assert.match(argoVersion ?? '', /^v\d+\.\d+\.\d+$/, 'ARGOCD_VERSION debe ser un tag exacto');
  const install = cmdsOf('platform:argocd:install').find((c) => c.includes('install.yaml')) ?? '';
  assert.ok(install.includes('/{{.ARGOCD_VERSION}}/manifests/install.yaml'), 'El manifiesto de ArgoCD debe resolverse por tag fijado');
  assert.doesNotMatch(install, /\/(stable|latest|master)\//, 'El manifiesto de ArgoCD no debe seguir una rama móvil');
});

test('🔐 Bootstrap: la ServiceAccount de ESO coincide con la del ClusterSecretStore y puede hacer TokenReview', () => {
  assert.ok(cmdsOf('platform:eso:install').some((c) => c.includes('serviceAccount.name=external-secrets-sa')), 'ESO debe crear la SA external-secrets-sa');

  const store = yaml.loadAll(read('infra/k8s/eso/cluster-secret-store.yaml')) as Array<{ spec: any }>;
  for (const doc of store.filter(Boolean)) {
    const sa = doc.spec.provider.vault.auth.kubernetes.serviceAccountRef;
    assert.deepEqual(sa, { name: 'external-secrets-sa', namespace: 'external-secrets' });
  }

  const binding = yaml.load(read('infra/k8s/bootstrap/eso-auth-delegator.yaml')) as any;
  assert.equal(binding.roleRef.name, 'system:auth-delegator');
  assert.deepEqual(binding.subjects, [{ kind: 'ServiceAccount', name: 'external-secrets-sa', namespace: 'external-secrets' }]);
});

test('🔐 Bootstrap: Vault configura el auth kubernetes contra el API server de pre-prod', () => {
  const playbook = read('infra/ansible/playbooks/setup_vault.yaml');
  assert.match(playbook, /vault write auth\/kubernetes\/config/, 'setup_vault.yaml debe configurar auth/kubernetes/config');
  assert.match(playbook, /kubernetes_host=https:\/\/\{\{ vault_k8s_node_ip \}\}:6443/, 'El host debe ser el API server del LXC 800');
  assert.match(playbook, /disable_local_ca_jwt=true/, 'Vault externo debe validar con el JWT del cliente (TokenReview)');
  assert.match(playbook, /server-ca\.crt/, 'Vault debe confiar en la CA del API server de K3s');
  assert.match(playbook, /vault_k8s_node_ip:\s*"10\.10\.13\.100"/, 'vault_k8s_node_ip debe ser el LXC 800 real');
});

test('🔐 Bootstrap: la tarea completa encadena ESO, ClusterSecretStore, ArgoCD, health checks y App-of-Apps', () => {
  assert.deepEqual(cmdsOf('platform:bootstrap:preprod'), [
    'task:platform:eso:install',
    'task:platform:eso:vault-store',
    'task:platform:argocd:install',
    'task:gitops:health-checks',
    'task:gitops:apps:root',
  ]);
});

// ------------------------------------------------------------------------------
// Contratos aprendidos en el pasaje a GitOps de pre-prod (2026-10-04)
// ------------------------------------------------------------------------------

test('🔐 Pasaje GitOps: los CronJobs de backup apuntan a un Service que el chart realmente crea', async () => {
  // Regresión: PGHOST era `<release>-postgres`, un Service inexistente; todos los
  // backups fallaban con "could not translate host name".
  const { execSync } = await import('node:child_process');
  const rendered = execSync(
    `helm template pokedex-preprod "${path.join(ROOT_DIR, 'infra/helm/pokedex')}" -f "${path.join(ROOT_DIR, 'gitops/environments/proxmox-preprod/values.yaml')}"`,
    { encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024 }
  );
  const docs = (yaml.loadAll(rendered) as any[]).filter(Boolean);
  const services = new Set(docs.filter((d) => d.kind === 'Service').map((d) => d.metadata.name));
  const cronJobs = docs.filter((d) => d.kind === 'CronJob');
  let checked = 0;
  for (const cj of cronJobs) {
    for (const c of cj.spec.jobTemplate.spec.template.spec.containers) {
      const host = (c.env ?? []).find((e: { name: string }) => e.name === 'PGHOST')?.value;
      if (!host) continue;
      checked++;
      assert.ok(services.has(host), `${cj.metadata.name}: PGHOST=${host} no es un Service renderizado (${[...services].join(', ')})`);
    }
  }
  assert.ok(checked >= 2, 'Deben validarse al menos el backup y el restore-verify');
});

test('🔐 Pasaje GitOps: ArgoCD considera sano un PVC Pending (StorageClass WaitForFirstConsumer)', () => {
  const cm = yaml.load(read('gitops/health-checks/argocd-cm-healthchecks.yaml')) as { data: Record<string, string> };
  const lua = cm.data['resource.customizations.health.PersistentVolumeClaim'];
  assert.ok(lua, 'argocd-cm debe declarar el health check de PersistentVolumeClaim');
  assert.match(lua, /phase == "Pending"[\s\S]*?hs\.status = "Healthy"/, 'Pending debe ser Healthy: el PVC de backup solo se enlaza cuando corre el CronJob');
  assert.match(lua, /phase == "Lost"[\s\S]*?hs\.status = "Degraded"/, 'Lost debe ser Degraded');
});

test('🔐 Pasaje GitOps: las Applications ignoran los defaults de volumeClaimTemplates', () => {
  for (const app of ['gitops/apps/app-proxmox-preprod.yaml', 'gitops/apps/app-cloud.yaml']) {
    const doc = yaml.load(read(app)) as any;
    const rule = (doc.spec.ignoreDifferences ?? []).find((r: any) => r.kind === 'StatefulSet');
    assert.ok(rule, `${app} debe ignorar diferencias de StatefulSet`);
    for (const field of ['apiVersion', 'kind', 'status', 'spec.volumeMode']) {
      assert.ok(rule.jqPathExpressions.includes(`.spec.volumeClaimTemplates[]?.${field}`), `${app} debe ignorar volumeClaimTemplates.${field}`);
    }
    assert.ok(doc.spec.syncPolicy.syncOptions.includes('RespectIgnoreDifferences=true'), `${app} debe respetar ignoreDifferences al sincronizar`);
  }
});

test('🔐 Pasaje GitOps: la redirección HTTP→HTTPS usa la clave del chart de Traefik vigente', () => {
  const playbook = read('infra/ansible/playbooks/setup_k3s.yaml');
  assert.match(playbook, /http:\s*\n\s*redirections:\s*\n\s*entryPoint:\s*\n\s*to: websecure/, 'Debe usar ports.web.http.redirections.entryPoint');
  assert.doesNotMatch(playbook, /^\s*redirectTo:/m, 'redirectTo se ignora en silencio en el chart de Traefik >= 34');
});

test('🔐 Pasaje GitOps: la NetworkPolicy de PostgreSQL admite los pods de backup y de verificación', async () => {
  // Regresión: con default-deny, allow-postgres-ingress solo admitía api y
  // db-seeder; pg_dump recibía "Connection refused" y no se generaba ningún backup.
  const { execSync } = await import('node:child_process');
  const rendered = execSync(
    `helm template pokedex-preprod "${path.join(ROOT_DIR, 'infra/helm/pokedex')}" -f "${path.join(ROOT_DIR, 'gitops/environments/proxmox-preprod/values.yaml')}"`,
    { encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024 }
  );
  const docs = (yaml.loadAll(rendered) as any[]).filter(Boolean);
  const policy = docs.find((d) => d.kind === 'NetworkPolicy' && d.metadata.name.endsWith('-allow-postgres-ingress'));
  assert.ok(policy, 'Debe existir la NetworkPolicy de ingreso a PostgreSQL');
  const allowed = policy.spec.ingress.flatMap((r: any) => r.from.map((f: any) => f.podSelector?.matchLabels?.['app.kubernetes.io/component']));

  const clientComponents = docs
    .filter((d) => d.kind === 'CronJob')
    .filter((cj) => cj.spec.jobTemplate.spec.template.spec.containers.some((c: any) => (c.env ?? []).some((e: any) => e.name === 'PGHOST')))
    .map((cj) => cj.spec.jobTemplate.spec.template.metadata.labels['app.kubernetes.io/component']);
  assert.ok(clientComponents.length >= 2, 'Deben existir los CronJobs que se conectan a PostgreSQL');
  for (const component of clientComponents) {
    assert.ok(allowed.includes(component), `allow-postgres-ingress no admite a "${component}" (${allowed.join(', ')})`);
  }
});

test('🔐 Pasaje GitOps: los CronJobs de backup usan una imagen con openssl y un shell con pipefail', async () => {
  // Regresión: backup y DR Verify reutilizaban `postgresql.image` (postgres:16-alpine),
  // que no trae el CLI openssl; el backup fallaba con "openssl: not found" antes de
  // cifrar el volcado. La imagen dedicada es Debian, donde /bin/sh es dash y no
  // admite `set -o pipefail`, así que los scripts deben correr con bash.
  const { execSync } = await import('node:child_process');
  const values = yaml.load(read('infra/helm/pokedex/values.yaml')) as any;
  const backupImage = values.backup.image;
  assert.notEqual(backupImage.tag, values.postgresql.image.tag, 'backup.image no debe ser la variante alpine del servidor');
  assert.match(backupImage.tag, /^16-/, 'pg_dump debe tener la misma major que el servidor PostgreSQL 16');
  assert.match(backupImage.digest, /^sha256:[a-f0-9]{64}$/, 'backup.image debe fijarse por digest (INFRA-005)');
  assert.ok(
    read('.github/workflows/security-trivy.yaml').includes(`${backupImage.repository}@${backupImage.digest}`),
    'El escaneo programado de Trivy (WF-001) debe cubrir backup.image'
  );

  const rendered = execSync(
    `helm template pokedex-preprod "${path.join(ROOT_DIR, 'infra/helm/pokedex')}" -f "${path.join(ROOT_DIR, 'gitops/environments/proxmox-preprod/values.yaml')}"`,
    { encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024 }
  );
  const cronJobs = (yaml.loadAll(rendered) as any[]).filter((d) => d?.kind === 'CronJob');
  const expected = `${backupImage.repository}:${backupImage.tag}@${backupImage.digest}`;
  for (const component of ['backup', 'dr-verification']) {
    const cj = cronJobs.find((c) => c.spec.jobTemplate.spec.template.metadata.labels['app.kubernetes.io/component'] === component);
    assert.ok(cj, `Debe existir el CronJob "${component}"`);
    const container = cj.spec.jobTemplate.spec.template.spec.containers[0];
    assert.equal(container.image, expected, `${component} debe usar backup.image`);
    assert.equal(container.command[0], '/bin/bash', `${component} usa pipefail: debe correr con bash`);
    assert.match(container.command[2], /\bopenssl enc\b/, `${component} depende de openssl`);
  }
});
