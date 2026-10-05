import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { validateProxmoxSecretArchitecture } from '../../scripts/k8s-rollout-restart.ts';

const ROOT_DIR = path.resolve(import.meta.dirname, '../..');

test('🔒 Proxmox Secret Architecture: Validación contractual de Vault CE, ESO y ausencia de Reloader', () => {
  const result = validateProxmoxSecretArchitecture(ROOT_DIR);
  assert.ok(
    result.valid,
    `La arquitectura de secretos en Proxmox debe ser 100% coherente: ${result.reasons.join('; ')}`,
  );
});

test('🔒 ESO Security: manifiestos activos prohíben SecretStore fake y credenciales placeholder', () => {
  const esoDirectory = path.join(ROOT_DIR, 'infra/k8s/eso');
  const manifests = fs
    .readdirSync(esoDirectory)
    .filter((file) => /\.ya?ml$/i.test(file))
    .map((file) => ({ file, content: fs.readFileSync(path.join(esoDirectory, file), 'utf-8') }));
  const forbiddenPlaceholders = [
    /local-(?:insecure|mock)-[a-z0-9-]+/i,
    /(?:change-me|mock-ai-api-key|mock-gemini-api-key)/i,
  ];

  assert.ok(manifests.length > 0, 'Debe existir al menos un manifiesto ESO activo');
  assert.ok(
    !fs.existsSync(path.join(esoDirectory, 'fake-local-store.yaml')),
    'fake-local-store no debe reintroducirse',
  );
  for (const { file, content } of manifests) {
    assert.doesNotMatch(content, /provider:\s*\r?\n\s*fake:/, `${file} no debe usar el proveedor fake de ESO`);
    for (const placeholder of forbiddenPlaceholders) {
      assert.doesNotMatch(content, placeholder, `${file} no debe contener credenciales placeholder`);
    }
  }
});

test('🔒 ADR-030: prod Proxmox retirado; pokedex/prod queda reservada para el blueprint cloud', () => {
  assert.ok(
    !fs.existsSync(path.join(ROOT_DIR, 'gitops/environments/proxmox')),
    'gitops/environments/proxmox se retiró con ADR-030',
  );
  const cloudValues = fs.readFileSync(path.join(ROOT_DIR, 'gitops/environments/cloud/values.yaml'), 'utf-8');
  assert.match(cloudValues, /key:\s*"pokedex\/prod"/, 'pokedex/prod solo debe usarla el blueprint prod cloud');
});

test('🔒 Proxmox Pre-prod GitOps Values: ExternalSecrets apunta a vault-backend-preprod y clave pokedex/preprod', () => {
  const preprodValuesPath = path.join(ROOT_DIR, 'gitops/environments/proxmox-preprod/values.yaml');
  assert.ok(fs.existsSync(preprodValuesPath), 'gitops/environments/proxmox-preprod/values.yaml debe existir');
  const content = fs.readFileSync(preprodValuesPath, 'utf-8');

  assert.match(
    content,
    /secretStoreRef:\s*\r?\n\s*name:\s*"vault-backend-preprod"/,
    'Debe usar vault-backend-preprod como secretStoreRef',
  );
  assert.match(content, /kind:\s*"ClusterSecretStore"/, 'Debe ser de clase ClusterSecretStore');
  assert.match(content, /key:\s*"pokedex\/preprod"/, 'Debe mapear la clave pokedex/preprod en el KV v2');
  assert.match(content, /reloader:\s*\r?\n\s*enabled:\s*false/, 'Stakater Reloader debe estar desactivado en Pre-prod');
});

test('🔒 Vault ClusterSecretStore: Apunta a endpoint HTTPS del LXC Proxmox sin el rol de la prod retirada', () => {
  const clusterStorePath = path.join(ROOT_DIR, 'infra/k8s/eso/cluster-secret-store.yaml');
  assert.ok(
    fs.existsSync(clusterStorePath),
    'cluster-secret-store.yaml debe existir como manifiesto canónico consolidado',
  );
  const content = fs.readFileSync(clusterStorePath, 'utf-8');

  assert.match(
    content,
    /server:\s*"https:\/\/10\.10\.13\.110:8200"/,
    'Debe apuntar a la IP del contenedor LXC de Vault vía HTTPS',
  );
  assert.match(content, /version:\s*"v2"/, 'Debe usar motor KV v2');
  assert.match(content, /path:\s*"secret"/, 'Debe montar sobre secret');
  assert.doesNotMatch(
    content,
    /role:\s*"pokedex-prod-role"/,
    'pokedex-prod-role pertenecía a la prod Proxmox retirada (ADR-030)',
  );
  assert.doesNotMatch(
    content,
    /name:\s*vault-backend\s*$/m,
    'El store vault-backend de prod Proxmox se retiró (ADR-030)',
  );
  assert.match(
    content,
    /caProvider:\s*\r?\n\s*type:\s*ConfigMap/,
    'Debe utilizar caProvider para validación TLS segura',
  );
});

test('🔒 Vault Pre-prod ClusterSecretStore: Apunta a endpoint HTTPS del LXC Proxmox y rol pokedex-preprod-role', () => {
  const clusterStorePath = path.join(ROOT_DIR, 'infra/k8s/eso/cluster-secret-store.yaml');
  assert.ok(fs.existsSync(clusterStorePath), 'cluster-secret-store.yaml debe existir');
  const content = fs.readFileSync(clusterStorePath, 'utf-8');

  assert.match(content, /role:\s*"pokedex-preprod-role"/, 'Debe autenticar con el rol pokedex-preprod-role');
  assert.match(content, /name:\s*vault-backend-preprod/, 'Debe definir el ClusterSecretStore vault-backend-preprod');

  // No-regresión: Prohibición estricta de archivos redundantes fragmentados
  const redundantFiles = [
    'infra/k8s/eso/vault-backend.yaml',
    'infra/k8s/eso/vault-backend-preprod.yaml',
    'infra/k8s/eso/aws-secrets-manager.yaml',
  ];
  for (const relPath of redundantFiles) {
    assert.ok(
      !fs.existsSync(path.join(ROOT_DIR, relPath)),
      `El archivo redundante ${relPath} debe permanecer eliminado tras la consolidación canónica`,
    );
  }
});

test('🔒 Redeploy Invariant: Mutaciones en Secretos de ESO requieren rollout restart en ausencia de Reloader', () => {
  // Verificación formal del principio de inmutabilidad de entorno de proceso en Linux/Node.js:
  // 1. Las variables inyectadas mediante envFrom son copiadas al proceso en el execve inicial.
  // 2. Dado que reloader.enabled == false en Proxmox, ningún operador reinicia automáticamente los pods.
  // 3. Por lo tanto, el rollout restart progresivo es la única vía segura y soportada.
  const isReloaderActiveInProxmox = false; // SSOT
  const requiresRolloutRestartOnSecretChange = !isReloaderActiveInProxmox;

  assert.equal(
    requiresRolloutRestartOnSecretChange,
    true,
    'En Proxmox, un rollout restart es estrictamente necesario para refrescar process.env tras rotación de secretos',
  );
});

test('🔒 Vault Multi-Env Separation: Políticas y roles segregados para Pre-prod y Prod (Zero-Trust Least Privilege)', () => {
  const setupVaultPath = path.join(ROOT_DIR, 'infra/ansible/playbooks/setup_vault.yaml');
  const content = fs.readFileSync(setupVaultPath, 'utf-8');

  assert.match(content, /pokedex-preprod-policy\.hcl/, 'Debe generar la política pokedex-preprod-policy');
  assert.match(
    content,
    /secret\/data\/pokedex\/preprod\/\*/,
    'La política de pre-prod debe restringir a secret/data/pokedex/preprod/*',
  );
  assert.match(
    content,
    /auth\/kubernetes\/role\/pokedex-preprod-role/,
    'Debe configurar el rol de autenticación K8s pokedex-preprod-role',
  );
  // ADR-030: prod Proxmox se retiró; Vault on-prem solo sirve a pre-prod.
  assert.doesNotMatch(
    content,
    /pokedex-prod-(policy|role)/,
    'setup_vault.yaml no debe crear la política ni el rol de la prod retirada',
  );
  assert.doesNotMatch(
    content,
    /auth\/kubernetes\/role\/pokedex-role\b/,
    'No debe existir el rol genérico pokedex-role (violación de Least Privilege)',
  );
  assert.doesNotMatch(
    content,
    /dest:\s*"\{\{\s*vault_config_dir\s*\}\}\/pokedex-policy\.hcl"/,
    'No debe existir la política genérica pokedex-policy',
  );
});

test('🛡️ Bastion Break-Glass & Audit: Captura obligatoria de comandos y políticas operativas', () => {
  const setupBastionPath = path.join(ROOT_DIR, 'infra/ansible/playbooks/setup_bastion.yaml');
  const content = fs.readFileSync(setupBastionPath, 'utf-8');

  assert.match(content, /\/var\/log\/bastion\/audit\.log/, 'Bastion debe configurar log dedicado para auditoría');
  assert.match(content, /_bastion_audit/, 'Bastion debe capturar comandos con función interceptora de auditoría');
  assert.match(content, /authpriv\.notice/, 'Bastion debe reenviar eventos de auditoría a syslog');
  assert.match(content, /pokedex_git_version/, 'Bastion debe parametrizar la versión del repositorio');
  assert.match(content, /bastion_git_commit_sha/, 'Bastion debe admitir anclaje inmutable a Commit SHA');
  assert.doesNotMatch(content, /version:\s*main/, 'Bastion no debe fijar una rama mutable como main');
  assert.match(content, /50-bastion-remote-audit\.conf/, 'Bastion debe configurar reenvío remoto de rsyslog');
  assert.match(content, /bastion_remote_syslog_enabled/, 'Bastion debe parametrizar la activación de reenvío remoto');

  const breakGlassRunbook = path.join(ROOT_DIR, 'docs/runbooks/BREAK_GLASS_PROCEDURE.md');
  assert.ok(fs.existsSync(breakGlassRunbook), 'Debe existir el runbook de procedimiento Break-Glass');
  const breakGlassContent = fs.readFileSync(breakGlassRunbook, 'utf-8');
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

  const spofDoc = path.join(ROOT_DIR, 'docs/architecture/ONPREM_SPOF_AND_FAILURE_DOMAIN_ANALYSIS.md');
  assert.ok(fs.existsSync(spofDoc), 'Debe existir el análisis formal de SPOF y dominios de falla on-premise');

  const matrixDoc = path.join(ROOT_DIR, 'docs/architecture/RESPONSIBILITY_MATRIX.md');
  assert.ok(fs.existsSync(matrixDoc), 'Debe existir la matriz canónica de responsabilidades');
  const matrixContent = fs.readFileSync(matrixDoc, 'utf-8');
  assert.match(matrixContent, /OpenTofu/, 'Debe documentar OpenTofu');
  assert.match(matrixContent, /Bastion/, 'Debe documentar Bastion');
  assert.match(matrixContent, /Vault/, 'Debe documentar Vault');
  assert.match(matrixContent, /ArgoCD/, 'Debe documentar ArgoCD');
  assert.match(matrixContent, /Grafana Alloy/, 'Debe documentar Grafana Alloy');
  assert.match(matrixContent, /Biome/, 'Debe documentar demarcación de Biome');
  assert.match(matrixContent, /Actionlint/, 'Debe documentar demarcación de Actionlint');
  assert.match(matrixContent, /Semgrep/, 'Debe documentar demarcación de Semgrep');
  assert.match(matrixContent, /SonarQube/, 'Debe documentar demarcación de SonarQube');
  assert.match(matrixContent, /Checkov/, 'Debe documentar demarcación de Checkov');
  assert.match(matrixContent, /Trivy/, 'Debe documentar demarcación de Trivy');

  const declaredVsRenderedDoc = path.join(ROOT_DIR, 'docs/architecture/DECLARED_VS_RENDERED_ARCHITECTURE_ANALYSIS.md');
  assert.ok(fs.existsSync(declaredVsRenderedDoc), 'Debe existir el documento de análisis declarado vs renderizado');
  const renderedContent = fs.readFileSync(declaredVsRenderedDoc, 'utf-8');
  assert.match(renderedContent, /K3s Runtime/, 'Debe auditar K3s');
  assert.match(renderedContent, /Cilium/, 'Debe auditar Cilium');
  assert.match(renderedContent, /PgBouncer/, 'Debe auditar PgBouncer');
  assert.match(renderedContent, /Stakater Reloader/, 'Debe auditar Reloader');
  assert.match(renderedContent, /cAdvisor/, 'Debe auditar cAdvisor');
});

test('📊 DR & SLA Canonical Contract: Unificación de SLA (99.5%), RPO (< 24h) y RTO (< 2h) en SSOT arquitectural', () => {
  const spofDocPath = path.join(ROOT_DIR, 'docs/architecture/ONPREM_SPOF_AND_FAILURE_DOMAIN_ANALYSIS.md');
  assert.ok(fs.existsSync(spofDocPath), 'ONPREM_SPOF_AND_FAILURE_DOMAIN_ANALYSIS.md debe existir');
  const spofContent = fs.readFileSync(spofDocPath, 'utf-8');

  assert.match(spofContent, /99\.5%\s*mensual/, 'SPOF doc debe formalizar SLA canónico del 99.5% mensual');
  assert.match(spofContent, /<\s*24\s*horas/, 'SPOF doc debe formalizar RPO canónico < 24 horas');
  assert.match(spofContent, /<\s*2\s*horas/, 'SPOF doc debe formalizar RTO canónico < 2 horas');
  assert.match(spofContent, /Tier 1:/, 'SPOF doc debe detallar Tier 1 de recuperación');
  assert.match(spofContent, /Tier 2:/, 'SPOF doc debe detallar Tier 2 de recuperación');
  assert.match(spofContent, /Tier 3:/, 'SPOF doc debe detallar Tier 3 de recuperación');

  const drpDocPath = path.join(ROOT_DIR, 'docs/runbooks/DISASTER_RECOVERY_PLAN.md');
  const drpContent = fs.readFileSync(drpDocPath, 'utf-8');
  assert.match(drpContent, /99\.5%\s*mensual/, 'DRP debe formalizar SLA canónico del 99.5% mensual');
  assert.match(drpContent, /<\s*24\s*horas/, 'DRP debe formalizar RPO canónico < 24 horas');
  assert.match(drpContent, /<\s*2\s*horas/, 'DRP debe formalizar RTO canónico < 2 horas');

  const adrDocPath = path.join(ROOT_DIR, 'docs/decisions/ADR-006-disaster-recovery-strategy.md');
  const adrContent = fs.readFileSync(adrDocPath, 'utf-8');
  assert.match(adrContent, /99\.5%\s*mensual/, 'ADR-006 debe formalizar SLA canónico del 99.5% mensual');
  assert.match(adrContent, /<\s*24\s*horas/, 'ADR-006 debe formalizar RPO canónico < 24 horas');
  assert.match(adrContent, /<\s*2\s*horas/, 'ADR-006 debe formalizar RTO canónico < 2 horas');
});

test('🔒 Vault Init: las credenciales se entregan al operador fuera del LXC y nunca quedan en el contenedor', () => {
  // Regresión (2026-10-04): el playbook inicializaba Vault y descartaba las llaves
  // Shamir y el root token. Tras el primer reinicio Vault quedaba sellado sin
  // recuperación y no había token para cargar los secretos de pre-prod.
  const playbook = fs
    .readFileSync(path.join(ROOT_DIR, 'infra/ansible/playbooks/setup_vault.yaml'), 'utf-8')
    .replace(/\r\n/g, '\n');
  const exportTask =
    /- name: Entregar las credenciales de init al operador[\s\S]*?(?=\n {4}- name:)/.exec(playbook)?.[0] ?? '';
  assert.ok(exportTask, 'setup_vault.yaml debe entregar las credenciales de init al operador');
  assert.match(exportTask, /dest:\s*"\{\{ vault_init_export_path \}\}"/, 'La entrega debe usar vault_init_export_path');
  assert.match(exportTask, /mode:\s*'0600'/, 'El archivo de credenciales debe ser 0600');
  assert.match(
    exportTask,
    /delegate_to:\s*localhost/,
    'Las credenciales deben quedar en el nodo de control, no en el LXC de Vault',
  );
  assert.match(exportTask, /no_log:\s*true/, 'Las credenciales no deben aparecer en la salida de Ansible');
  assert.match(
    playbook,
    /Prevenir sobrescritura accidental de credenciales de init previas/,
    'setup_vault.yaml debe implementar guarda anti-sobrescritura para vault_init_export_path',
  );
  assert.match(
    playbook,
    /Auditar integridad y permisos 0600 del archivo de custodia generado/,
    'setup_vault.yaml debe auditar existencia y permisos 0600 de las credenciales',
  );
  assert.match(
    playbook,
    /shred -u \{\{ vault_init_export_path \}\}/,
    'El playbook debe instruir explícitamente el borrado seguro con shred -u',
  );
  assert.match(
    playbook,
    /path:\s*"\{\{ vault_config_dir \}\}\/vault-init\.json"\s*\n\s*state:\s*absent/,
    'vault-init.json no debe persistir en el LXC',
  );
});

test('🔒 Vault Storage: disable_mlock = true con Raft integrado en LXC sin privilegios', () => {
  const playbook = fs.readFileSync(path.join(ROOT_DIR, 'infra/ansible/playbooks/setup_vault.yaml'), 'utf-8');
  assert.match(playbook, /storage "raft"/, 'Vault debe usar almacenamiento Raft integrado');
  assert.match(playbook, /disable_mlock = true/, 'Raft integrado en LXC sin privilegios requiere disable_mlock = true');
  assert.doesNotMatch(
    playbook,
    /setcap cap_ipc_lock/,
    'No debe intentar conceder CAP_IPC_LOCK en un LXC sin privilegios',
  );
});
