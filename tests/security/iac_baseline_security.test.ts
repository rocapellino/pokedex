/**
 * ==============================================================================
 * Test de Seguridad y Arquitectura: IaC Baseline, Ansible Hardening, OpenTofu y Gobernanza de Scripts
 * ==============================================================================
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../');

test('🛡️ Deploy Security: infra/ansible/deploy_excludes.txt existe y excluye .env y .env.*', () => {
  const filePath = path.join(ROOT_DIR, 'infra/ansible/deploy_excludes.txt');
  assert.ok(fs.existsSync(filePath), 'El archivo infra/ansible/deploy_excludes.txt debe existir');
  const content = fs.readFileSync(filePath, 'utf-8');
  assert.ok(content.includes('.env'), 'deploy_excludes.txt debe excluir .env');
  assert.ok(content.includes('.env.*'), 'deploy_excludes.txt debe excluir .env.*');
});

test('🛡️ Deploy Security: scripts/proxmox_deploy.sh está retirado en favor de IaC declarativa', () => {
  const legacyScript = path.join(ROOT_DIR, 'scripts/proxmox_deploy.sh');
  assert.equal(fs.existsSync(legacyScript), false, 'scripts/proxmox_deploy.sh debe estar eliminado; el aprovisionamiento se gestiona vía OpenTofu + Ansible + Helm');
});

test('🛡️ Deploy Security: Ansible host_baseline.yml existe y configura hardening de host sin errores ignorados', () => {
  const baselinePath = path.join(ROOT_DIR, 'infra/ansible/playbooks/host_baseline.yaml');
  assert.ok(fs.existsSync(baselinePath), 'host_baseline.yml debe existir');
  const baseContent = fs.readFileSync(baselinePath, 'utf-8');
  const roleBaseOs = path.join(ROOT_DIR, 'infra/ansible/roles/base_os/tasks/main.yaml');
  const roleRuntime = path.join(ROOT_DIR, 'infra/ansible/roles/container_runtime/tasks/main.yaml');
  const combinedContent = baseContent +
    (fs.existsSync(roleBaseOs) ? fs.readFileSync(roleBaseOs, 'utf-8') : '') +
    (fs.existsSync(roleRuntime) ? fs.readFileSync(roleRuntime, 'utf-8') : '');

  assert.ok(combinedContent.includes('ufw'), 'host_baseline y sus roles deben configurar firewall ufw');
  assert.ok(!combinedContent.includes('ignore_errors: true'), 'host_baseline y sus roles no deben ocultar fallos con ignore_errors: true');
  assert.ok(combinedContent.includes('docker info'), 'host_baseline y sus roles deben verificar el funcionamiento de Docker');
  assert.ok(combinedContent.includes('install_docker'), 'host_baseline y sus roles deben permitir condicionar el runtime de contenedores');

  const setupNodesPath = path.join(ROOT_DIR, 'infra/ansible/playbooks/setup_nodes.yaml');
  if (fs.existsSync(setupNodesPath)) {
    const setupContent = fs.readFileSync(setupNodesPath, 'utf-8');
    assert.ok(!setupContent.includes('ignore_errors: true'), 'setup_nodes.yml no debe ocultar fallos con ignore_errors: true');
    assert.ok(setupContent.includes('docker info') || combinedContent.includes('docker info'), 'setup_nodes.yml y roles deben verificar Docker');
  }
});

test('🛡️ Deploy Security: Playbooks legacy de Compose y docker-compose.prod.yml retirados de producción', () => {
  const legacyFiles = [
    'docker-compose.prod.yml',
    'infra/ansible/playbooks/deploy_proxmox.yaml',
    'infra/ansible/playbooks/deploy_app.yaml'
  ];

  for (const relPath of legacyFiles) {
    const filePath = path.join(ROOT_DIR, relPath);
    assert.equal(fs.existsSync(filePath), false, `${relPath} debe estar eliminado; Kubernetes es el único runtime productivo`);
  }
});

test('🛡️ Infra Security: OpenTofu Proxmox variables.tf no tiene default hardcodeado en ssh_public_key', () => {
  const filePath = path.join(ROOT_DIR, 'infra/opentofu/environments/proxmox/variables.tf');
  assert.ok(fs.existsSync(filePath), 'variables.tf de Proxmox debe existir');
  const content = fs.readFileSync(filePath, 'utf-8');

  // Extraer el bloque de la variable ssh_public_key
  const match = content.match(/variable\s+"ssh_public_key"\s*\{([\s\S]*?)\}/);
  assert.ok(match, 'Debe existir la variable ssh_public_key');
  const varBlock = match[1];
  assert.ok(!varBlock.includes('default'), 'variable "ssh_public_key" no debe tener un valor default hardcodeado');
});

test('🛡️ Infra Multi-Cloud: OpenTofu entornos aws y proxmox estructurados correctamente', () => {
  const awsEnvPath = path.join(ROOT_DIR, 'infra/opentofu/environments/aws');
  assert.ok(fs.existsSync(awsEnvPath), 'infra/opentofu/environments/aws debe existir');
  assert.ok(fs.existsSync(path.join(awsEnvPath, 'main.tf')), 'aws/main.tf debe existir');
  assert.ok(fs.existsSync(path.join(awsEnvPath, 'providers.tf')), 'aws/providers.tf debe existir');
  assert.ok(fs.existsSync(path.join(awsEnvPath, 'variables.tf')), 'aws/variables.tf debe existir');

  const proxmoxEnvPath = path.join(ROOT_DIR, 'infra/opentofu/environments/proxmox');
  assert.ok(fs.existsSync(proxmoxEnvPath), 'infra/opentofu/environments/proxmox debe existir');
});

test('🛡️ Architecture Policy: CLOUD_INFRASTRUCTURE_DESIGN.md formaliza runtime universal y multi-backend', () => {
  const docPath = path.join(ROOT_DIR, 'docs/architecture/CLOUD_INFRASTRUCTURE_DESIGN.md');
  assert.ok(fs.existsSync(docPath), 'CLOUD_INFRASTRUCTURE_DESIGN.md debe existir');
  const content = fs.readFileSync(docPath, 'utf-8');
  assert.ok(content.includes('Kubernetes como el runtime universal'), 'Debe formalizar Kubernetes como runtime universal');
  assert.ok(content.includes('environments/aws'), 'Debe referenciar environments/aws');
  assert.ok(content.includes('environments/proxmox'), 'Debe referenciar environments/proxmox');
  assert.ok(content.includes('Single Production Runtime') || content.includes('Producción Universal'), 'Debe formalizar política de producción');
  assert.ok(content.includes('task dev:compose'), 'Debe formalizar task dev:compose');
  assert.ok(content.includes('task dev:k8s:up'), 'Debe formalizar task dev:k8s:up');
});

test('🛡️ Runbook Policy: PROXMOX_DEPLOYMENT_GUIDE.md alineado con Kubernetes, GitOps y Ansible baseline', () => {
  const guidePath = path.join(ROOT_DIR, 'docs/runbooks/PROXMOX_DEPLOYMENT_GUIDE.md');
  assert.ok(fs.existsSync(guidePath), 'PROXMOX_DEPLOYMENT_GUIDE.md debe existir');
  const content = fs.readFileSync(guidePath, 'utf-8');
  assert.ok(content.includes('host_baseline.yaml'), 'Debe referenciar host_baseline.yaml');
  assert.ok(content.includes('app-proxmox.yaml'), 'Debe referenciar app-proxmox.yaml para GitOps');
  assert.ok(content.includes('ArgoCD'), 'Debe referenciar ArgoCD');
  assert.ok(!content.includes('docker-compose.prod.yml'), 'No debe referenciar docker-compose.prod.yml');
  assert.ok(!content.includes('deploy_proxmox.yml'), 'No debe referenciar deploy_proxmox.yml');
});

test('🛡️ Disaster Recovery Tooling: Taskfile.yaml define tareas dr:drill (simulación/mecanismo) y dr:verify (certificación real)', () => {
  const taskfilePath = path.join(ROOT_DIR, 'Taskfile.yaml');
  const content = fs.readFileSync(taskfilePath, 'utf-8');
  assert.ok(content.includes('dr:drill:'), 'Taskfile.yaml debe definir tarea dr:drill');
  assert.ok(content.includes('dr:verify:'), 'Taskfile.yaml debe definir tarea dr:verify');
  assert.ok(content.includes('dr_verify_restore.sh --dry-run'), 'dr:drill debe invocar dr_verify_restore.sh --dry-run');
  assert.ok(content.includes('dr_verify_restore.sh\n') || content.includes('dr_verify_restore.sh\r\n'), 'dr:verify debe invocar dr_verify_restore.sh sin dry-run para certificación real');
});

test('🛡️ Ansible Security: security_hardening.yml restringe SSH (22) y puertos K8s/etcd con subredes (src)', () => {
  const playbookPath = path.join(ROOT_DIR, 'infra/ansible/playbooks/security_hardening.yaml');
  assert.ok(fs.existsSync(playbookPath), 'security_hardening.yml debe existir');
  const roleFirewall = path.join(ROOT_DIR, 'infra/ansible/roles/firewall/tasks/main.yaml');
  const content = fs.readFileSync(playbookPath, 'utf-8') +
    (fs.existsSync(roleFirewall) ? fs.readFileSync(roleFirewall, 'utf-8') : '');

  // SSH no debe estar abierto a any sin src
  assert.ok(content.includes('src: "{{ mgmt_network }}"'), 'Regla SSH (22) debe restringir el origen a la red de administración');

  // Puertos Kubernetes deben estar restringidos al CIDR del clúster
  assert.ok(content.includes('src: "{{ k8s_network }}"'), 'Puertos K8s y etcd deben restringir origen a la red del clúster');
  assert.ok(content.includes('6443'), 'Debe incluir puerto 6443 (API Server)');
  assert.ok(content.includes('10250'), 'Debe incluir puerto 10250 (Kubelet)');
  assert.ok(content.includes('2379:2380'), 'Debe incluir puerto 2379:2380 (etcd)');

  // hosts.yaml debe proveer los defaults de red
  const hostsPath = path.join(ROOT_DIR, 'infra/ansible/inventories/proxmox/hosts.yaml');
  assert.ok(fs.existsSync(hostsPath), 'hosts.yaml de proxmox debe existir en inventories/');
  const hostsContent = fs.readFileSync(hostsPath, 'utf-8');
  assert.ok(hostsContent.includes('mgmt_cidr:'), 'hosts.yaml debe definir mgmt_cidr');
  assert.ok(hostsContent.includes('k8s_cluster_cidr:'), 'hosts.yaml debe definir k8s_cluster_cidr');
});

test('🛡️ Local K8s: infra/k8s/kind-cluster.yaml existe y expone puertos Ingress correctamente', () => {
  const kindPath = path.join(ROOT_DIR, 'infra/k8s/kind-cluster.yaml');
  assert.ok(fs.existsSync(kindPath), 'kind-cluster.yaml debe existir');
  const content = fs.readFileSync(kindPath, 'utf-8');

  assert.ok(content.includes('kind: Cluster'), 'Debe definir kind: Cluster');
  assert.ok(content.includes('name: pokedex-local'), 'Debe definir el clúster pokedex-local');
  assert.ok(content.includes('ingress-ready=true'), 'Debe etiquetar el nodo con ingress-ready=true');
  assert.ok(content.includes('containerPort: 80'), 'Debe mapear el puerto Ingress HTTP 80');
  assert.ok(content.includes('containerPort: 443'), 'Debe mapear el puerto Ingress HTTPS 443');
});

test('🛡️ Dev DX: Taskfile.yaml define perfil rápido (dev:compose) y perfil Kubernetes (dev:k8s:*)', () => {
  const taskfilePath = path.join(ROOT_DIR, 'Taskfile.yaml');
  assert.ok(fs.existsSync(taskfilePath), 'Taskfile.yaml debe existir');
  const content = fs.readFileSync(taskfilePath, 'utf-8');

  assert.ok(content.includes('dev:compose:'), 'Taskfile debe definir tarea dev:compose');
  assert.ok(content.includes('dev:k8s:up:'), 'Taskfile debe definir tarea dev:k8s:up');
  assert.ok(content.includes('dev:k8s:down:'), 'Taskfile debe definir tarea dev:k8s:down');
  assert.ok(content.includes('dev:k8s:status:'), 'Taskfile debe definir tarea dev:k8s:status');
});

test('🛡️ IaC Architecture: OpenTofu módulos, entorno lab y roles de Ansible estructurados correctamente', () => {
  // Módulos OpenTofu (incluyendo interfaz compute agnóstica)
  const modules = ['compute', 'naming', 'tagging', 'security_baseline'];
  for (const mod of modules) {
    const modPath = path.join(ROOT_DIR, `infra/opentofu/modules/${mod}`);
    assert.ok(fs.existsSync(modPath), `Módulo infra/opentofu/modules/${mod} debe existir`);
    assert.ok(fs.existsSync(path.join(modPath, 'main.tf')), `${mod}/main.tf debe existir`);
    assert.ok(fs.existsSync(path.join(modPath, 'variables.tf')), `${mod}/variables.tf debe existir`);
    assert.ok(fs.existsSync(path.join(modPath, 'outputs.tf')), `${mod}/outputs.tf debe existir`);
  }

  // Entorno Lab OpenTofu
  const labEnvPath = path.join(ROOT_DIR, 'infra/opentofu/environments/lab');
  assert.ok(fs.existsSync(labEnvPath), 'infra/opentofu/environments/lab debe existir');
  assert.ok(fs.existsSync(path.join(labEnvPath, 'main.tf')), 'lab/main.tf debe existir');
  assert.ok(fs.existsSync(path.join(labEnvPath, 'providers.tf')), 'lab/providers.tf debe existir');
  assert.ok(fs.existsSync(path.join(labEnvPath, 'variables.tf')), 'lab/variables.tf debe existir');
  assert.ok(fs.existsSync(path.join(labEnvPath, 'outputs.tf')), 'lab/outputs.tf debe existir');

  // Entorno AWS OpenTofu (Parametrizado como Plantilla de Referencia)
  const awsEnvPath = path.join(ROOT_DIR, 'infra/opentofu/environments/aws');
  assert.ok(fs.existsSync(awsEnvPath), 'infra/opentofu/environments/aws debe existir');
  const awsVars = fs.readFileSync(path.join(awsEnvPath, 'variables.tf'), 'utf-8');
  assert.ok(awsVars.includes('variable "vpc_id"'), 'AWS variables.tf debe declarar vpc_id');
  assert.ok(awsVars.includes('variable "subnet_ids"'), 'AWS variables.tf debe declarar subnet_ids');
  assert.ok(awsVars.includes('variable "control_plane_subnet_ids"'), 'AWS variables.tf debe declarar control_plane_subnet_ids');

  const awsMain = fs.readFileSync(path.join(awsEnvPath, 'main.tf'), 'utf-8');
  assert.ok(awsMain.includes('vpc_id                   = var.vpc_id'), 'AWS main.tf debe usar var.vpc_id');
  assert.ok(awsMain.includes('subnet_ids               = var.subnet_ids'), 'AWS main.tf debe usar var.subnet_ids');
  assert.ok(fs.existsSync(path.join(awsEnvPath, 'terraform.tfvars.example')), 'AWS terraform.tfvars.example debe existir');
  assert.ok(fs.existsSync(path.join(awsEnvPath, 'README.md')), 'AWS README.md debe existir como plantilla de referencia');

  // Entorno Cloud-Template Neutral (OpenTofu)
  const cloudTemplatePath = path.join(ROOT_DIR, 'infra/opentofu/environments/cloud-template');
  assert.ok(fs.existsSync(cloudTemplatePath), 'infra/opentofu/environments/cloud-template debe existir');
  assert.ok(fs.existsSync(path.join(cloudTemplatePath, 'main.tf')), 'cloud-template/main.tf debe existir');
  assert.ok(fs.existsSync(path.join(cloudTemplatePath, 'variables.tf')), 'cloud-template/variables.tf debe existir');
  assert.ok(fs.existsSync(path.join(cloudTemplatePath, 'outputs.tf')), 'cloud-template/outputs.tf debe existir');
  assert.ok(fs.existsSync(path.join(cloudTemplatePath, 'terraform.tfvars.example')), 'cloud-template/terraform.tfvars.example debe existir');
  assert.ok(fs.existsSync(path.join(cloudTemplatePath, 'README.md')), 'cloud-template/README.md debe existir');

  // OpenTofu Backend & Cifrado de Estado (OpenTofu 1.7+ Native Client-Side Encryption)
  const backendExamplePath = path.join(ROOT_DIR, 'infra/opentofu/environments/backend.tf.example');
  assert.ok(fs.existsSync(backendExamplePath), 'backend.tf.example debe existir');
  const backendExampleContent = fs.readFileSync(backendExamplePath, 'utf-8');
  assert.ok(
    backendExampleContent.includes('key_provider "pbkdf2"'),
    'backend.tf.example debe documentar cifrado nativo del lado del cliente con pbkdf2'
  );
  assert.ok(
    backendExampleContent.includes('method "aes_gcm"'),
    'backend.tf.example debe documentar método de cifrado aes_gcm en reposo'
  );

  // Roles Ansible
  const ansibleRoles = ['base_os', 'container_runtime', 'firewall', 'hardening', 'kubernetes_prerequisites'];
  for (const role of ansibleRoles) {
    const roleTask = path.join(ROOT_DIR, `infra/ansible/roles/${role}/tasks/main.yaml`);
    assert.ok(fs.existsSync(roleTask), `Role task ${role}/tasks/main.yaml debe existir`);
  }

  // Hardening de permisos en kubernetes_prerequisites
  const k8sPrereqsContent = fs.readFileSync(
    path.join(ROOT_DIR, 'infra/ansible/roles/kubernetes_prerequisites/tasks/main.yaml'),
    'utf-8'
  );
  assert.ok(
    k8sPrereqsContent.includes("mode: '0600'"),
    'kubernetes_prerequisites debe configurar permisos restrictivos 0600 en /etc/modules-load.d/k8s.conf'
  );

  // Inventarios y playbooks Ansible
  assert.ok(fs.existsSync(path.join(ROOT_DIR, 'infra/ansible/inventories/proxmox/hosts.yaml')), 'Inventario Proxmox YAML debe existir');
  assert.ok(fs.existsSync(path.join(ROOT_DIR, 'infra/ansible/inventories/lab/hosts.yaml')), 'Inventario Lab YAML debe existir');
  assert.ok(fs.existsSync(path.join(ROOT_DIR, 'infra/ansible/playbooks/prepare_hosts.yaml')), 'prepare_hosts.yaml debe existir');
  assert.ok(fs.existsSync(path.join(ROOT_DIR, 'infra/ansible/playbooks/validate_hosts.yaml')), 'validate_hosts.yaml debe existir');
  assert.ok(fs.existsSync(path.join(ROOT_DIR, 'infra/ansible/requirements.yaml')), 'requirements.yaml debe existir');
});

test('🛡️ DevSecOps Tooling: .tool-versions define versiones inmutables del stack de desarrollo e IaC', () => {
  const toolVersionsPath = path.join(ROOT_DIR, '.tool-versions');
  assert.ok(fs.existsSync(toolVersionsPath), '.tool-versions debe existir en la raíz');
  const content = fs.readFileSync(toolVersionsPath, 'utf-8');

  assert.ok(content.includes('nodejs'), '.tool-versions debe fijar nodejs');
  assert.ok(content.includes('opentofu'), '.tool-versions debe fijar opentofu');
  assert.ok(content.includes('helm'), '.tool-versions debe fijar helm');
  assert.ok(content.includes('kubectl'), '.tool-versions debe fijar kubectl');
  assert.ok(content.includes('ansible-core'), '.tool-versions debe fijar ansible-core');

  const infraWorkflow = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/infra.yaml'), 'utf-8');
  assert.ok(
    infraWorkflow.includes('--only-binary :all:'),
    'infra.yaml debe ejecutar pip install con --only-binary :all: para mitigar scripts de setup no confiables'
  );
  assert.match(
    infraWorkflow,
    /ansible-core==\d+\.\d+\.\d+/,
    'infra.yaml debe fijar la versión exacta de ansible-core'
  );
});

test('🛡️ Dev DX & Resiliencia: Taskfile.yaml define observabilidad unificada (Grafana Cloud / Dev Alloy) sin deuda legacy', () => {
  const taskfilePath = path.join(ROOT_DIR, 'Taskfile.yaml');
  assert.ok(fs.existsSync(taskfilePath), 'Taskfile.yaml debe existir');
  const content = fs.readFileSync(taskfilePath, 'utf-8');

  assert.ok(!content.includes('MONITORING_DIR:'), 'Taskfile.yaml no debe incluir la variable obsoleta MONITORING_DIR');
  assert.ok(!content.includes('docker_monitoreo'), 'Taskfile.yaml no debe incluir referencias al stack legacy docker_monitoreo');
  assert.ok(content.includes('monitoring:grafana-cloud:install:'), 'Taskfile.yaml debe incluir la tarea de instalación de Grafana Cloud');
  assert.ok(content.includes('monitoring:dev:status:'), 'Taskfile.yaml debe incluir la tarea de diagnóstico dev:status');
  assert.ok(content.includes('monitoring:dev:logs:'), 'Taskfile.yaml debe incluir la tarea de logs de dev');
});

test('🛡️ Ansible Idempotencia: container_runtime valida el estado activo del servicio sin falsos positivos', () => {
  const runtimeTaskPath = path.join(ROOT_DIR, 'infra/ansible/roles/container_runtime/tasks/main.yaml');
  assert.ok(fs.existsSync(runtimeTaskPath), 'container_runtime/tasks/main.yaml debe existir');
  const content = fs.readFileSync(runtimeTaskPath, 'utf-8');

  assert.ok(content.includes('service_facts:'), 'Debe recolectar hechos de servicios del sistema');
  assert.ok(content.includes('ansible.builtin.assert:'), 'Debe realizar aserción formal del servicio');
  assert.ok(content.includes("ansible_facts.services['docker.service'].state == 'running'"), 'Debe validar que docker.service está running');
});

test('🛡️ IaC State Security: ADR-012 formaliza backend remoto, bloqueo de concurrencia y cifrado nativo', () => {
  const adrPath = path.join(ROOT_DIR, 'docs/decisions/ADR-012-iac-state-management-and-encryption.md');
  const readmePath = path.join(ROOT_DIR, 'README.md');
  const docsReadmePath = path.join(ROOT_DIR, 'docs/README.md');
  const auditPath = path.join(ROOT_DIR, 'docs/security/DEVSECOPS_AUDIT.md');

  assert.ok(fs.existsSync(adrPath), 'ADR-012 debe existir en docs/decisions/');
  const adrContent = fs.readFileSync(adrPath, 'utf-8');

  assert.ok(adrContent.replace(/\r\n/g, '\n').includes('## Estado\n\nAceptado'), 'ADR-012 debe estar aceptado');
  assert.ok(adrContent.includes('OpenTofu'), 'ADR-012 debe documentar OpenTofu');
  assert.ok(adrContent.includes('.gitignore'), 'ADR-012 debe documentar exclusión en .gitignore');
  assert.ok(adrContent.includes('backend "s3"') || adrContent.includes('backend'), 'ADR-012 debe documentar backend remoto');
  assert.ok(adrContent.includes('dynamodb_table') || adrContent.includes('bloqueo'), 'ADR-012 debe documentar state locking');
  assert.ok(adrContent.includes('Client-Side Encryption') || adrContent.includes('encryption'), 'ADR-012 debe documentar client-side encryption');
  assert.ok(adrContent.includes('aes_gcm'), 'ADR-012 debe documentar método aes_gcm');

  const readmeContent = fs.readFileSync(readmePath, 'utf-8');
  assert.ok(readmeContent.includes('ADR-012-iac-state-management-and-encryption.md'), 'README.md debe enlazar ADR-012');

  const docsReadmeContent = fs.readFileSync(docsReadmePath, 'utf-8');
  assert.ok(docsReadmeContent.includes('ADR-012-iac-state-management-and-encryption.md'), 'docs/README.md debe enlazar ADR-012');
  assert.ok(docsReadmeContent.includes('ADR-001 a ADR-012') || docsReadmeContent.includes('ADR-001 a ADR-013') || docsReadmeContent.includes('ADR-001 a ADR-014') || docsReadmeContent.includes('ADR-001 a ADR-015') || docsReadmeContent.includes('ADR-001 a ADR-016') || docsReadmeContent.includes('ADR-001 a ADR-017') || docsReadmeContent.includes('ADR-001 a ADR-018') || docsReadmeContent.includes('ADR-001 a ADR-019') || docsReadmeContent.includes('ADR-001 a ADR-020') || docsReadmeContent.includes('ADR-001 a ADR-021') || docsReadmeContent.includes('ADR-001 a ADR-022'), 'Mermaid en docs/README.md debe indicar ADR-001 a ADR-012 o posterior');

  const auditContent = fs.readFileSync(auditPath, 'utf-8');
  assert.ok(auditContent.includes('ADR-012-iac-state-management-and-encryption.md'), 'DEVSECOPS_AUDIT.md debe enlazar ADR-012');
  assert.ok(auditContent.includes('Implementado'), 'DEVSECOPS_AUDIT.md debe marcar como Implementado la gestión de estados IaC');

  // Validar que los 12 ADRs existen físicamente en disco
  for (let i = 1; i <= 12; i++) {
    const num = String(i).padStart(3, '0');
    const files = fs.readdirSync(path.join(ROOT_DIR, 'docs/decisions'));
    const match = files.find(f => f.startsWith(`ADR-${num}`));
    assert.ok(match, `Debe existir archivo para ADR-${num} en docs/decisions/`);
  }
});

test('🛡️ Taskfile CLI: ADR-026 formaliza ciclo de vida en 4 fases para aliases y task --list como interfaz soportada', () => {
  const adrPath = path.join(ROOT_DIR, 'docs/decisions/ADR-026-taskfile-cli-alias-deprecation-and-lifecycle.md');
  const taskfilePath = path.join(ROOT_DIR, 'Taskfile.yaml');
  const cliRefPath = path.join(ROOT_DIR, 'docs/operations/TASKFILE_CLI_REFERENCE.md');
  const deploymentRunbookPath = path.join(ROOT_DIR, 'docs/operations/deployment.md');
  const infraReadmePath = path.join(ROOT_DIR, 'infra/README.md');
  const tofuReadmePath = path.join(ROOT_DIR, 'infra/opentofu/README.md');
  const proxmoxGuidePath = path.join(ROOT_DIR, 'docs/runbooks/PROXMOX_DEPLOYMENT_GUIDE.md');
  const readmePath = path.join(ROOT_DIR, 'README.md');
  const docsReadmePath = path.join(ROOT_DIR, 'docs/README.md');

  // 1. ADR-026 existe físicamente en docs/decisions/ y está en estado Aceptado
  assert.ok(fs.existsSync(adrPath), 'ADR-026 debe existir en docs/decisions/');
  const adrContent = fs.readFileSync(adrPath, 'utf-8');
  assert.ok(adrContent.replace(/\r\n/g, '\n').includes('## Estado\n\nAceptado'), 'ADR-026 debe estar en estado Aceptado');
  assert.ok(adrContent.includes('task --list'), 'ADR-026 debe formalizar task --list como interfaz oficialmente soportada');
  assert.ok(adrContent.includes('Fase 1: Documentar Aliases'), 'ADR-026 debe documentar Fase 1');
  assert.ok(adrContent.includes('Fase 2: Medir Uso'), 'ADR-026 debe documentar Fase 2');
  assert.ok(adrContent.includes('Fase 3: Deprecación Formal'), 'ADR-026 debe documentar Fase 3');
  assert.ok(adrContent.includes('Fase 4: Eliminación Definitiva'), 'ADR-026 debe documentar Fase 4');

  // 2. TASKFILE_CLI_REFERENCE.md existe físicamente y documenta catálogo canónico y fases
  assert.ok(fs.existsSync(cliRefPath), 'TASKFILE_CLI_REFERENCE.md debe existir en docs/operations/');
  const cliRefContent = fs.readFileSync(cliRefPath, 'utf-8');
  assert.ok(cliRefContent.includes('task --list'), 'TASKFILE_CLI_REFERENCE.md debe consagrar task --list');
  assert.ok(cliRefContent.includes('Fase 1: Documentar'), 'TASKFILE_CLI_REFERENCE.md debe detallar Fase 1');
  assert.ok(cliRefContent.includes('Fase 2: Medir Uso'), 'TASKFILE_CLI_REFERENCE.md debe detallar Fase 2');
  assert.ok(cliRefContent.includes('Fase 3: Deprecate'), 'TASKFILE_CLI_REFERENCE.md debe detallar Fase 3');
  assert.ok(cliRefContent.includes('Fase 4: Eliminar'), 'TASKFILE_CLI_REFERENCE.md debe detallar Fase 4');

  // 3. Taskfile.yaml define default con task --list y start como tarea canónica
  const taskfileContent = fs.readFileSync(taskfilePath, 'utf-8');
  assert.ok(taskfileContent.includes('task --list'), 'Taskfile.yaml debe ejecutar task --list en tarea default');
  assert.ok(taskfileContent.includes('start:'), 'Taskfile.yaml debe incluir la tarea start canónica');

  // 4. Fase 4 de ADR-026: Los 18 aliases legados fueron retirados definitivamente de Taskfile.yaml
  const retiredAliases = [
    'tofu:init:proxmox',
    'tofu:plan:proxmox',
    'tofu:apply:proxmox',
    'tofu:init:aws',
    'tofu:plan:aws',
    'tofu:apply:aws',
    'tofu:init:cloud',
    'tofu:plan:cloud',
    'tofu:apply:cloud',
    'tofu:validate',
    'ts:install',
    'ts:dev',
    'ts:build',
    'ts:start',
    'ts:lint',
    'docker:up',
    'docker:down',
    'deploy:proxmox'
  ];

  for (const alias of retiredAliases) {
    const hasAlias = taskfileContent.split('\n').some((line: string) => line.startsWith(`  ${alias}:`));
    assert.strictEqual(hasAlias, false, `Taskfile.yaml no debe contener el alias retirado ${alias}`);
    assert.strictEqual(
      taskfileContent.includes(`task ${alias}`),
      false,
      `Taskfile.yaml no debe referenciar el alias retirado ${alias}`
    );
  }

  // 5. La documentación activa utiliza comandos canónicos y no aliases deprecados
  const infraReadmeContent = fs.readFileSync(infraReadmePath, 'utf-8');
  assert.ok(infraReadmeContent.includes('task infra:plan:proxmox'), 'infra/README.md debe usar comando canónico task infra:plan:proxmox');
  assert.ok(infraReadmeContent.includes('task infra:plan:aws'), 'infra/README.md debe usar comando canónico task infra:plan:aws');
  assert.ok(!infraReadmeContent.includes('task tofu:plan:proxmox'), 'infra/README.md no debe contener task tofu:plan:proxmox');
  assert.ok(!infraReadmeContent.includes('task tofu:plan:cloud'), 'infra/README.md no debe contener task tofu:plan:cloud');

  const tofuReadmeContent = fs.readFileSync(tofuReadmePath, 'utf-8');
  assert.ok(tofuReadmeContent.includes('task infra:plan:proxmox'), 'infra/opentofu/README.md debe usar task infra:plan:proxmox');
  assert.ok(tofuReadmeContent.includes('task infra:plan:aws'), 'infra/opentofu/README.md debe usar task infra:plan:aws');
  assert.ok(!tofuReadmeContent.includes('task tofu:plan:aws'), 'infra/opentofu/README.md no debe contener task tofu:plan:aws');

  const proxmoxGuideContent = fs.readFileSync(proxmoxGuidePath, 'utf-8');
  assert.ok(proxmoxGuideContent.includes('task infra:plan:proxmox'), 'PROXMOX_DEPLOYMENT_GUIDE.md debe usar task infra:plan:proxmox');
  assert.ok(proxmoxGuideContent.includes('task ansible:prepare'), 'PROXMOX_DEPLOYMENT_GUIDE.md debe usar task ansible:prepare');
  assert.ok(!proxmoxGuideContent.includes('task tofu:plan:proxmox'), 'PROXMOX_DEPLOYMENT_GUIDE.md no debe contener task tofu:plan:proxmox');
  assert.ok(!proxmoxGuideContent.includes('task deploy:proxmox'), 'PROXMOX_DEPLOYMENT_GUIDE.md no debe contener task deploy:proxmox');

  // 6. deployment.md referencia TASKFILE_CLI_REFERENCE.md y ADR-026
  const deploymentContent = fs.readFileSync(deploymentRunbookPath, 'utf-8');
  assert.ok(deploymentContent.includes('TASKFILE_CLI_REFERENCE.md'), 'deployment.md debe enlazar TASKFILE_CLI_REFERENCE.md');
  assert.ok(deploymentContent.includes('ADR-026'), 'deployment.md debe enlazar ADR-026');

  // 7. README.md y docs/README.md enlazan ADR-026 y TASKFILE_CLI_REFERENCE.md
  const readmeContent = fs.readFileSync(readmePath, 'utf-8');
  const docsReadmeContent = fs.readFileSync(docsReadmePath, 'utf-8');
  assert.ok(readmeContent.includes('ADR-026-taskfile-cli-alias-deprecation-and-lifecycle.md'), 'README.md debe enlazar ADR-026');
  assert.ok(readmeContent.includes('TASKFILE_CLI_REFERENCE.md'), 'README.md debe enlazar TASKFILE_CLI_REFERENCE.md');
  assert.ok(docsReadmeContent.includes('ADR-026-taskfile-cli-alias-deprecation-and-lifecycle.md'), 'docs/README.md debe enlazar ADR-026');
  assert.ok(docsReadmeContent.includes('TASKFILE_CLI_REFERENCE.md'), 'docs/README.md debe enlazar TASKFILE_CLI_REFERENCE.md');

  // 8. Los 27 ADRs existen físicamente en disco
  for (let i = 1; i <= 27; i++) {
    const num = String(i).padStart(3, '0');
    const files = fs.readdirSync(path.join(ROOT_DIR, 'docs/decisions'));
    const match = files.find((f: string) => f.startsWith(`ADR-${num}`));
    assert.ok(match, `Debe existir archivo para ADR-${num} en docs/decisions/`);
  }
});

test('🔍 Coherencia Operacional E2E: Auditoría de 8 eslabones, alineación de red 10.10.13.0/24 y setup_k3s.yml', () => {
  // 1. Verificación en SSOT documental vigente (PROXMOX_DEPLOYMENT_GUIDE.md y ADR-025)
  const proxmoxGuidePath = path.join(ROOT_DIR, 'docs/runbooks/PROXMOX_DEPLOYMENT_GUIDE.md');
  assert.ok(fs.existsSync(proxmoxGuidePath), 'PROXMOX_DEPLOYMENT_GUIDE.md debe existir en docs/runbooks/');
  const docGuideContent = fs.readFileSync(proxmoxGuidePath, 'utf-8');
  assert.ok(docGuideContent.includes('10.10.13.0/24'), 'PROXMOX_DEPLOYMENT_GUIDE.md debe documentar la subred de administración 10.10.13.0/24');

  const adr25Path = path.join(ROOT_DIR, 'docs/decisions/ADR-025-management-plane-runtime-plane-and-cloud-ready-separation.md');
  assert.ok(fs.existsSync(adr25Path), 'ADR-025 debe existir en docs/decisions/');
  const adr25Content = fs.readFileSync(adr25Path, 'utf-8');
  assert.ok(adr25Content.includes('10.10.13.0/24'), 'ADR-025 debe formalizar la subred de administración 10.10.13.0/24');

  // 3. Normalización y unificación de inventarios en Ansible (inventories/proxmox/hosts.yaml alineado a 10.10.13.0/24)
  assert.ok(!fs.existsSync(path.join(ROOT_DIR, 'infra/ansible/inventory')), 'No debe existir carpeta duplicada infra/ansible/inventory');
  const hostsYml = fs.readFileSync(path.join(ROOT_DIR, 'infra/ansible/inventories/proxmox/hosts.yaml'), 'utf-8');
  assert.ok(hostsYml.includes('10.10.13.100'), 'hosts.yaml debe asignar k8s-master-01 en 10.10.13.100');
  assert.ok(hostsYml.includes('10.10.13.0/24'), 'hosts.yaml debe definir CIDR en 10.10.13.0/24');
  assert.ok(!hostsYml.includes('docker_compose_version'), 'hosts.yaml no debe contener vestigios de docker-compose');

  // 4. Playbook declarativo setup_k3s.yaml existe y configura K3s con Cilium eBPF
  const setupK3sPath = path.join(ROOT_DIR, 'infra/ansible/playbooks/setup_k3s.yaml');
  assert.ok(fs.existsSync(setupK3sPath), 'setup_k3s.yaml debe existir para automatizar la provisión de K3s');
  const setupK3sContent = fs.readFileSync(setupK3sPath, 'utf-8');
  assert.ok(setupK3sContent.includes('--flannel-backend=none'), 'setup_k3s.yaml debe desacoplar Flannel con --flannel-backend=none');
  assert.ok(setupK3sContent.includes('cilium'), 'setup_k3s.yml debe desplegar Cilium CNI');

  // 5. Ingress en Proxmox GitOps no debe contener snippets nulos de Nginx
  const proxmoxValues = fs.readFileSync(path.join(ROOT_DIR, 'gitops/environments/proxmox/values.yaml'), 'utf-8');
  assert.ok(!proxmoxValues.includes('nginx.ingress.kubernetes.io/configuration-snippet: null'), 'proxmox/values.yaml no debe contener anotaciones huérfanas de Nginx');
  assert.ok(proxmoxValues.includes('className: "traefik"'), 'proxmox/values.yaml debe especificar className traefik');

  // 6. Taskfile.yaml expone k3s:setup:proxmox enlazado a setup_k3s.yml
  const taskfileContent = fs.readFileSync(path.join(ROOT_DIR, 'Taskfile.yaml'), 'utf-8');
  assert.ok(taskfileContent.includes('k3s:setup:proxmox:'), 'Taskfile.yaml debe exponer k3s:setup:proxmox');
  assert.ok(
    taskfileContent.includes('infra/ansible/playbooks/setup_k3s.yaml'),
    'k3s:setup:proxmox debe invocar setup_k3s.yaml'
  );

  // 7. TASKFILE_CLI_REFERENCE.md documenta la tarea canónica
  const taskRefContent = fs.readFileSync(path.join(ROOT_DIR, 'docs/operations/TASKFILE_CLI_REFERENCE.md'), 'utf-8');
  assert.ok(taskRefContent.includes('`task k3s:setup:proxmox`'), 'TASKFILE_CLI_REFERENCE.md debe documentar task k3s:setup:proxmox');

  // 8. PROXMOX_DEPLOYMENT_GUIDE.md documenta setup_k3s.yml y resolución DNS k8s-proxmox.internal.lan
  const proxmoxGuideContent = fs.readFileSync(path.join(ROOT_DIR, 'docs/runbooks/PROXMOX_DEPLOYMENT_GUIDE.md'), 'utf-8');
  assert.ok(proxmoxGuideContent.includes('task k3s:setup:proxmox'), 'PROXMOX_DEPLOYMENT_GUIDE.md debe documentar task k3s:setup:proxmox');
  assert.ok(proxmoxGuideContent.includes('setup_k3s.yaml'), 'PROXMOX_DEPLOYMENT_GUIDE.md debe referenciar setup_k3s.yaml');
  assert.ok(proxmoxGuideContent.includes('k8s-proxmox.internal.lan'), 'PROXMOX_DEPLOYMENT_GUIDE.md debe documentar resolución para k8s-proxmox.internal.lan');
});

test('🛡️ Tooling Governance: scripts/governance-audit-scripts.ts valida lista blanca de scripts shell y rechaza imperativos', async () => {
  const scriptPath = path.join(ROOT_DIR, 'scripts/governance-audit-scripts.ts');
  assert.ok(fs.existsSync(scriptPath), 'scripts/governance-audit-scripts.ts debe existir');

  const { auditScriptGovernance, ALLOWED_SH_SCRIPTS, findShellScripts } = await import('../../scripts/governance-audit-scripts.ts');
  assert.deepEqual(ALLOWED_SH_SCRIPTS, ['scripts/dr_verify_restore.sh']);

  const result = auditScriptGovernance();
  assert.equal(result.success, true, `La auditoría de gobernanza de scripts debe pasar: ${result.errors.join('; ')}`);
  assert.equal(result.errors.length, 0);

  const found = findShellScripts(ROOT_DIR);
  assert.ok(found.includes('scripts/dr_verify_restore.sh'), 'findShellScripts debe encontrar scripts/dr_verify_restore.sh');
});
