/**
 * Contratos de Vault, External Secrets Operator y Bastion para el redeploy de secretos.
 *
 * Los manifiestos de ESO, los values de GitOps y los playbooks de Ansible se verifican parseados (documentos YAML,
 * tareas con su módulo y HCL embebido), no como texto: un valor comentado o dentro de otro campo sigue "apareciendo"
 * en el archivo sin que Kubernetes o Ansible lo apliquen. La documentación en Markdown sí se comprueba como texto.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { validateProxmoxSecretArchitecture } from '../../scripts/k8s-rollout-restart.ts';
import { copiedContent, moduleArgs, playbookPlays, playbookTasks, taskNamed } from '../helpers/ansible.js';
import { blocksOf, parseHcl } from '../helpers/hcl.js';
import { ROOT_DIR } from '../helpers/repo.js';
import { readYaml, readYamlDocs } from '../helpers/yaml.js';

const ESO_DIR = 'infra/k8s/eso';
const PREPROD_VALUES = 'gitops/environments/proxmox-preprod/values.yaml';
const CLOUD_VALUES = 'gitops/environments/cloud/values.yaml';

type SecretStore = {
  kind: string;
  metadata: { name: string };
  spec: { provider: Record<string, any> };
};

const read = (relativePath: string) => fs.readFileSync(path.join(ROOT_DIR, relativePath), 'utf-8');
const exists = (relativePath: string) => fs.existsSync(path.join(ROOT_DIR, relativePath));

/** ClusterSecretStores canónicos declarados en `infra/k8s/eso/cluster-secret-store.yaml`. */
const clusterStores = () =>
  readYamlDocs<SecretStore>(`${ESO_DIR}/cluster-secret-store.yaml`).filter((doc) => doc.kind === 'ClusterSecretStore');

/** Parámetros `clave=valor` de un comando `vault write`. */
function vaultWriteParams(command: string): Record<string, string> {
  return Object.fromEntries(
    command
      .split(/\s+/)
      .filter((token) => token.includes('='))
      .map((token) => token.split('=', 2) as [string, string]),
  );
}

test('🔒 Proxmox Secret Architecture: Validación contractual de Vault CE, ESO y ausencia de Reloader', () => {
  const result = validateProxmoxSecretArchitecture(ROOT_DIR);
  assert.ok(
    result.valid,
    `La arquitectura de secretos en Proxmox debe ser 100% coherente: ${result.reasons.join('; ')}`,
  );
});

test('🔒 ESO Security: manifiestos activos prohíben SecretStore fake y credenciales placeholder', () => {
  const manifests = fs
    .readdirSync(path.join(ROOT_DIR, ESO_DIR))
    .filter((file) => /\.ya?ml$/i.test(file))
    .map((file) => ({ file, docs: readYamlDocs<SecretStore>(`${ESO_DIR}/${file}`) }));
  const forbiddenPlaceholders = [
    /local-(?:insecure|mock)-[a-z0-9-]+/i,
    /(?:change-me|mock-ai-api-key|mock-gemini-api-key)/i,
  ];

  assert.ok(manifests.length > 0, 'Debe existir al menos un manifiesto ESO activo');
  assert.ok(!exists(`${ESO_DIR}/fake-local-store.yaml`), 'fake-local-store no debe reintroducirse');
  for (const { file, docs } of manifests) {
    for (const doc of docs) {
      assert.equal(doc.spec?.provider?.fake, undefined, `${file} no debe usar el proveedor fake de ESO`);
      // Los comentarios no forman parte del documento parseado: solo cuentan los valores efectivos.
      for (const placeholder of forbiddenPlaceholders) {
        assert.doesNotMatch(JSON.stringify(doc), placeholder, `${file} no debe contener credenciales placeholder`);
      }
    }
  }
});

test('🔒 ADR-030: prod Proxmox retirado; pokedex/prod queda reservada para el blueprint cloud', () => {
  assert.ok(!exists('gitops/environments/proxmox'), 'gitops/environments/proxmox se retiró con ADR-030');

  const cloud = readYaml(CLOUD_VALUES);
  assert.equal(
    cloud.externalSecrets.remoteRef.key,
    'pokedex/prod',
    'pokedex/prod solo debe usarla el blueprint prod cloud',
  );

  const preprod = readYaml(PREPROD_VALUES);
  assert.notEqual(preprod.externalSecrets.remoteRef.key, 'pokedex/prod', 'pre-prod no puede leer la ruta de prod');
  assert.notEqual(
    preprod.tlsExternalSecret?.remoteRef?.key,
    'pokedex/prod',
    'el TLS de pre-prod no usa la ruta de prod',
  );
});

test('🔒 Proxmox Pre-prod GitOps Values: ExternalSecrets apunta a vault-backend-preprod y clave pokedex/preprod', () => {
  assert.ok(exists(PREPROD_VALUES), `${PREPROD_VALUES} debe existir`);
  const values = readYaml(PREPROD_VALUES);

  assert.deepEqual(
    values.externalSecrets.secretStoreRef,
    { name: 'vault-backend-preprod', kind: 'ClusterSecretStore' },
    'Debe usar el ClusterSecretStore vault-backend-preprod',
  );
  assert.equal(
    values.externalSecrets.remoteRef.key,
    'pokedex/preprod',
    'Debe mapear la clave pokedex/preprod en el KV v2',
  );
  assert.equal(values.reloader.enabled, false, 'Stakater Reloader debe estar desactivado en Pre-prod');
});

test('🔒 Vault ClusterSecretStore: Apunta a endpoint HTTPS del LXC Proxmox sin el rol de la prod retirada', () => {
  assert.ok(
    exists(`${ESO_DIR}/cluster-secret-store.yaml`),
    'cluster-secret-store.yaml debe existir como manifiesto canónico consolidado',
  );
  const stores = clusterStores();
  assert.deepEqual(
    stores.map((store) => store.metadata.name),
    ['vault-backend-preprod'],
    'El store vault-backend de prod Proxmox se retiró (ADR-030): solo debe quedar el de pre-prod',
  );

  const vault = stores[0].spec.provider.vault;
  assert.equal(vault.server, 'https://10.10.13.110:8200', 'Debe apuntar a la IP del contenedor LXC de Vault vía HTTPS');
  assert.equal(vault.version, 'v2', 'Debe usar motor KV v2');
  assert.equal(vault.path, 'secret', 'Debe montar sobre secret');
  assert.equal(vault.caProvider?.type, 'ConfigMap', 'Debe utilizar caProvider para validación TLS segura');
  assert.notEqual(
    vault.auth.kubernetes.role,
    'pokedex-prod-role',
    'pokedex-prod-role pertenecía a la prod Proxmox retirada (ADR-030)',
  );
});

test('🔒 Vault Pre-prod ClusterSecretStore: Apunta a endpoint HTTPS del LXC Proxmox y rol pokedex-preprod-role', () => {
  const [store] = clusterStores();
  assert.equal(store.spec.provider.vault.auth.kubernetes.role, 'pokedex-preprod-role');
  assert.equal(store.metadata.name, 'vault-backend-preprod');

  // No-regresión: Prohibición estricta de archivos redundantes fragmentados
  const redundantFiles = [
    `${ESO_DIR}/vault-backend.yaml`,
    `${ESO_DIR}/vault-backend-preprod.yaml`,
    `${ESO_DIR}/aws-secrets-manager.yaml`,
  ];
  for (const relPath of redundantFiles) {
    assert.ok(
      !exists(relPath),
      `El archivo redundante ${relPath} debe permanecer eliminado tras la consolidación canónica`,
    );
  }
});

test('🔒 Redeploy Invariant: Mutaciones en Secretos de ESO requieren rollout restart en ausencia de Reloader', () => {
  // Las variables inyectadas mediante envFrom se copian al proceso en el execve inicial. Si nada reinicia los pods
  // cuando rota el secreto, el rollout restart manual es la única vía segura. Se deriva de los values reales:
  // con Reloader activo (global o por anotación en un workload) esta invariante dejaría de ser cierta.
  const values = readYaml(PREPROD_VALUES);

  assert.equal(values.reloader.enabled, false, 'Reloader desactivado en Proxmox: nada reinicia los pods por sí solo');
  for (const workload of ['api', 'web']) {
    assert.equal(
      values[workload].deploymentAnnotations?.['reloader.stakater.com/auto'],
      null,
      `${workload} no debe pedir reinicios automáticos a Reloader`,
    );
  }
});

test('🔒 Vault Multi-Env Separation: Políticas y roles segregados para Pre-prod y Prod (Zero-Trust Least Privilege)', () => {
  const tasks = playbookTasks('setup_vault.yaml');

  // Política: solo lectura y solo bajo la ruta de pre-prod.
  const policyTask = taskNamed(tasks, /Generar política pokedex-preprod-policy/);
  assert.match(
    moduleArgs(policyTask, 'copy').dest,
    /pokedex-preprod-policy\.hcl$/,
    'Debe generar la política pokedex-preprod-policy',
  );
  const paths = blocksOf(parseHcl(moduleArgs(policyTask, 'copy').content), 'path');
  assert.ok(paths.length > 0, 'La política debe declarar rutas');
  for (const rule of paths) {
    const [vaultPath] = rule.labels;
    assert.match(
      vaultPath,
      /^secret\/(data|metadata)\/pokedex\/preprod(\/\*)?$/,
      `la política de pre-prod no puede salir de secret/(data|metadata)/pokedex/preprod: ${vaultPath}`,
    );
    const capabilities: string[] = JSON.parse(rule.attrs.capabilities);
    assert.ok(
      capabilities.every((c) => ['read', 'list'].includes(c)),
      `${vaultPath} solo puede conceder lectura (capacidades: ${capabilities})`,
    );
  }
  assert.ok(
    paths.some((rule) => rule.labels[0] === 'secret/data/pokedex/preprod/*'),
    'La política de pre-prod debe restringir a secret/data/pokedex/preprod/*',
  );

  // Rol de autenticación Kubernetes: ligado a la política de pre-prod y a ninguna otra.
  const roleTask = taskNamed(tasks, /Configurar rol pokedex-preprod-role/);
  const command: string = moduleArgs(roleTask, 'command').cmd.replace(/\s+/g, ' ');
  assert.match(
    command,
    /^vault write auth\/kubernetes\/role\/pokedex-preprod-role /,
    'Debe configurar el rol de autenticación K8s pokedex-preprod-role',
  );
  assert.equal(vaultWriteParams(command).policies, 'pokedex-preprod-policy');

  // ADR-030: prod Proxmox se retiró; Vault on-prem solo sirve a pre-prod.
  const everything = JSON.stringify(tasks);
  assert.doesNotMatch(
    everything,
    /pokedex-prod-(policy|role)/,
    'setup_vault.yaml no debe crear la política ni el rol de la prod retirada',
  );
  assert.doesNotMatch(
    everything,
    /auth\/kubernetes\/role\/pokedex-role\b/,
    'No debe existir el rol genérico pokedex-role (violación de Least Privilege)',
  );
  const copyDestinations = tasks
    .filter((task) => 'ansible.builtin.copy' in task)
    .map((task) => moduleArgs(task, 'copy').dest);
  assert.ok(
    !copyDestinations.includes('{{ vault_config_dir }}/pokedex-policy.hcl'),
    'No debe existir la política genérica pokedex-policy',
  );
});

test('🛡️ Bastion Break-Glass & Audit: Captura obligatoria de comandos y políticas operativas', () => {
  const [play] = playbookPlays('setup_bastion.yaml');
  const tasks = playbookTasks('setup_bastion.yaml');

  const auditProfile = copiedContent(taskNamed(tasks, /captura de auditoría para sesiones interactivas/));
  assert.match(auditProfile, /\/var\/log\/bastion\/audit\.log/, 'Bastion debe configurar log dedicado para auditoría');
  assert.match(auditProfile, /_bastion_audit/, 'Bastion debe capturar comandos con función interceptora de auditoría');
  assert.match(auditProfile, /authpriv\.notice/, 'Bastion debe reenviar eventos de auditoría a syslog');

  assert.match(
    play.vars.pokedex_git_version,
    /bastion_git_commit_sha/,
    'Bastion debe admitir anclaje inmutable a Commit SHA',
  );
  assert.ok('pokedex_git_version' in play.vars, 'Bastion debe parametrizar la versión del repositorio');
  const gitTask = taskNamed(tasks, /Clonar o sincronizar repositorio Pokédex/);
  assert.equal(
    moduleArgs(gitTask, 'git').version,
    '{{ pokedex_git_version }}',
    'El checkout debe usar la versión parametrizada y no una rama mutable como main',
  );
  assert.doesNotMatch(JSON.stringify(play.vars), /"main"/, 'Bastion no debe fijar una rama mutable como main');

  const remoteAudit = taskNamed(tasks, /reenvío remoto de auditoría en rsyslog/);
  assert.equal(
    moduleArgs(remoteAudit, 'copy').dest,
    '/etc/rsyslog.d/50-bastion-remote-audit.conf',
    'Bastion debe configurar reenvío remoto de rsyslog',
  );
  assert.ok('bastion_remote_syslog_enabled' in play.vars, 'Bastion debe parametrizar la activación de reenvío remoto');
});

test('📚 Break-Glass: el runbook y la documentación de arquitectura cubren auditoría, SPOF y demarcación de herramientas', () => {
  const breakGlassRunbook = 'docs/runbooks/BREAK_GLASS_PROCEDURE.md';
  assert.ok(exists(breakGlassRunbook), 'Debe existir el runbook de procedimiento Break-Glass');
  const breakGlassContent = read(breakGlassRunbook);
  assert.match(
    breakGlassContent,
    /KNOWN_GOOD_COMMIT_SHA/,
    'El runbook debe exigir el uso de un Commit SHA conocido y verificado',
  );
  assert.match(breakGlassContent, /Reenvío Remoto/, 'El runbook debe explicar el reenvío remoto para no-repudio');
  assert.doesNotMatch(
    breakGlassContent,
    /Auditoría Inmutable\s*\r?\n\s*\(\/var\/log/,
    'No debe llamar inmutable al archivo plano local',
  );

  assert.ok(
    exists('docs/architecture/ONPREM_SPOF_AND_FAILURE_DOMAIN_ANALYSIS.md'),
    'Debe existir el análisis formal de SPOF y dominios de falla on-premise',
  );

  const matrixDoc = 'docs/architecture/RESPONSIBILITY_MATRIX.md';
  assert.ok(exists(matrixDoc), 'Debe existir la matriz canónica de responsabilidades');
  const matrixContent = read(matrixDoc);
  for (const tool of [
    'OpenTofu',
    'Bastion',
    'Vault',
    'ArgoCD',
    'Grafana Alloy',
    'Biome',
    'Actionlint',
    'Semgrep',
    'SonarQube',
    'Checkov',
    'Trivy',
  ]) {
    assert.ok(matrixContent.includes(tool), `La matriz de responsabilidades debe documentar ${tool}`);
  }

  const declaredVsRenderedDoc = 'docs/architecture/DECLARED_VS_RENDERED_ARCHITECTURE_ANALYSIS.md';
  assert.ok(exists(declaredVsRenderedDoc), 'Debe existir el documento de análisis declarado vs renderizado');
  const renderedContent = read(declaredVsRenderedDoc);
  for (const component of ['K3s Runtime', 'Cilium', 'PgBouncer', 'Stakater Reloader', 'cAdvisor']) {
    assert.ok(renderedContent.includes(component), `El análisis declarado vs renderizado debe auditar ${component}`);
  }
});

test('📊 DR & SLA Canonical Contract: Unificación de SLA (99.5%), RPO (< 24h) y RTO (< 2h) en SSOT arquitectural', () => {
  const spofContent = read('docs/architecture/ONPREM_SPOF_AND_FAILURE_DOMAIN_ANALYSIS.md');

  assert.match(spofContent, /99\.5%\s*mensual/, 'SPOF doc debe formalizar SLA canónico del 99.5% mensual');
  assert.match(spofContent, /<\s*24\s*horas/, 'SPOF doc debe formalizar RPO canónico < 24 horas');
  assert.match(spofContent, /<\s*2\s*horas/, 'SPOF doc debe formalizar RTO canónico < 2 horas');
  assert.match(spofContent, /Tier 1:/, 'SPOF doc debe detallar Tier 1 de recuperación');
  assert.match(spofContent, /Tier 2:/, 'SPOF doc debe detallar Tier 2 de recuperación');
  assert.match(spofContent, /Tier 3:/, 'SPOF doc debe detallar Tier 3 de recuperación');

  const drpContent = read('docs/runbooks/DISASTER_RECOVERY_PLAN.md');
  assert.match(drpContent, /99\.5%\s*mensual/, 'DRP debe formalizar SLA canónico del 99.5% mensual');
  assert.match(drpContent, /<\s*24\s*horas/, 'DRP debe formalizar RPO canónico < 24 horas');
  assert.match(drpContent, /<\s*2\s*horas/, 'DRP debe formalizar RTO canónico < 2 horas');

  const adrContent = read('docs/decisions/ADR-006-disaster-recovery-strategy.md');
  assert.match(adrContent, /99\.5%\s*mensual/, 'ADR-006 debe formalizar SLA canónico del 99.5% mensual');
  assert.match(adrContent, /<\s*24\s*horas/, 'ADR-006 debe formalizar RPO canónico < 24 horas');
  assert.match(adrContent, /<\s*2\s*horas/, 'ADR-006 debe formalizar RTO canónico < 2 horas');
});

test('🔒 Vault Init: las credenciales se entregan al operador fuera del LXC y nunca quedan en el contenedor', () => {
  // Regresión (2026-10-04): el playbook inicializaba Vault y descartaba las llaves
  // Shamir y el root token. Tras el primer reinicio Vault quedaba sellado sin
  // recuperación y no había token para cargar los secretos de pre-prod.
  const tasks = playbookTasks('setup_vault.yaml');

  const exportTask = taskNamed(tasks, /Entregar las credenciales de init al operador/);
  const exported = moduleArgs(exportTask, 'copy');
  assert.equal(exported.dest, '{{ vault_init_export_path }}', 'La entrega debe usar vault_init_export_path');
  assert.equal(exported.mode, '0600', 'El archivo de credenciales debe ser 0600');
  assert.equal(
    exportTask.delegate_to,
    'localhost',
    'Las credenciales deben quedar en el nodo de control, no en el LXC de Vault',
  );
  assert.equal(exportTask.no_log, true, 'Las credenciales no deben aparecer en la salida de Ansible');

  // Guarda anti-sobrescritura: falla si el archivo ya existe y no se forzó explícitamente.
  const overwriteGuard = taskNamed(tasks, /Prevenir sobrescritura accidental de credenciales de init previas/);
  assert.ok(
    moduleArgs(overwriteGuard, 'fail').msg,
    'setup_vault.yaml debe implementar guarda anti-sobrescritura para vault_init_export_path',
  );
  assert.equal(overwriteGuard.delegate_to, 'localhost');
  assert.ok(
    overwriteGuard.when.includes('existing_vault_init_file.stat.exists'),
    'La guarda debe actuar cuando el archivo de custodia ya existe',
  );
  assert.ok(
    overwriteGuard.when.some((condition: string) => condition.includes('vault_force_overwrite_init_file')),
    'La guarda solo se omite con un forzado explícito',
  );

  // Auditoría posterior: existencia, permisos 0600 y tamaño no nulo.
  const audit = taskNamed(tasks, /Auditar integridad y permisos 0600 del archivo de custodia generado/);
  assert.equal(audit.delegate_to, 'localhost');
  assert.match(audit.failed_when, /stat\.exists/);
  assert.match(audit.failed_when, /stat\.mode != '0600'/);
  assert.match(audit.failed_when, /stat\.size == 0/);

  // El contrato de custodia le indica al operador el borrado seguro.
  const notice = taskNamed(tasks, /Informar al operador sobre inicialización completada/);
  assert.ok(
    moduleArgs(notice, 'debug').msg.some((line: string) => line.includes('shred -u {{ vault_init_export_path }}')),
    'El playbook debe instruir explícitamente el borrado seguro con shred -u',
  );

  // vault-init.json no persiste en el LXC.
  const purge = taskNamed(tasks, /Garantizar que vault-init\.json NO persista/);
  assert.deepEqual(
    { path: moduleArgs(purge, 'file').path, state: moduleArgs(purge, 'file').state },
    { path: '{{ vault_config_dir }}/vault-init.json', state: 'absent' },
    'vault-init.json no debe persistir en el LXC',
  );
});

test('🔒 Vault Storage: disable_mlock = true con Raft integrado en LXC sin privilegios', () => {
  const tasks = playbookTasks('setup_vault.yaml');
  const config = parseHcl(
    moduleArgs(taskNamed(tasks, /Generar archivo de configuración \/etc\/vault\.d\/vault\.hcl/), 'copy').content,
  );

  assert.equal(blocksOf(config, 'storage', 'raft').length, 1, 'Vault debe usar almacenamiento Raft integrado');
  assert.equal(
    config.attrs.disable_mlock,
    'true',
    'Raft integrado en LXC sin privilegios requiere disable_mlock = true',
  );
  assert.doesNotMatch(
    JSON.stringify(tasks),
    /setcap cap_ipc_lock/,
    'No debe intentar conceder CAP_IPC_LOCK en un LXC sin privilegios',
  );
});
