/**
 * ==============================================================================
 * Test de Seguridad y Arquitectura: Ansible Baseline, Host Hardening & Redes
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

test('🛡️ Deploy Security: infra/ansible/deploy_excludes.txt existe y excluye .env y .env.*', () => {
  const filePath = path.join(ROOT_DIR, 'infra/ansible/deploy_excludes.txt');
  assert.ok(fs.existsSync(filePath), 'El archivo infra/ansible/deploy_excludes.txt debe existir');
  const content = fs.readFileSync(filePath, 'utf-8');
  assert.ok(content.includes('.env'), 'deploy_excludes.txt debe excluir .env');
  assert.ok(content.includes('.env.*'), 'deploy_excludes.txt debe excluir .env.*');
});

test('🛡️ Deploy Security: Ansible host_baseline.yaml existe y configura hardening de host sin errores ignorados', () => {
  const baselinePath = path.join(ROOT_DIR, 'infra/ansible/playbooks/host_baseline.yaml');
  assert.ok(fs.existsSync(baselinePath), 'host_baseline.yaml debe existir');
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

test('🛡️ Runbook Policy: PROXMOX_DEPLOYMENT_GUIDE.md alineado con Kubernetes, GitOps y Ansible baseline', () => {
  const guidePath = path.join(ROOT_DIR, 'docs/runbooks/PROXMOX_DEPLOYMENT_GUIDE.md');
  assert.ok(fs.existsSync(guidePath), 'PROXMOX_DEPLOYMENT_GUIDE.md debe existir');
  const content = fs.readFileSync(guidePath, 'utf-8');
  assert.ok(content.includes('host_baseline.yaml'), 'Debe referenciar host_baseline.yaml');
  assert.ok(content.includes('app-proxmox-preprod.yaml'), 'Debe referenciar app-proxmox-preprod.yaml para GitOps');
  assert.ok(content.includes('ArgoCD'), 'Debe referenciar ArgoCD');
  assert.ok(!content.includes('docker-compose.prod.yml'), 'No debe referenciar docker-compose.prod.yml');
  assert.ok(!content.includes('deploy_proxmox.yml'), 'No debe referenciar deploy_proxmox.yml');
});

test('🛡️ Ansible Security: security_hardening.yaml restringe SSH (22) y puertos K8s/etcd con subredes (src)', () => {
  const playbookPath = path.join(ROOT_DIR, 'infra/ansible/playbooks/security_hardening.yaml');
  assert.ok(fs.existsSync(playbookPath), 'security_hardening.yaml debe existir');
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
  assert.ok(hostsContent.includes('k8s_nodes_cidr:'), 'hosts.yaml debe definir k8s_nodes_cidr');
});

test('🛡️ INFRA-009: la red del cluster debe ser una variable explicita y distinta de la de gestion', () => {
  const firewallVars = fs.readFileSync(
    path.join(ROOT_DIR, 'infra/ansible/roles/firewall/vars/main.yaml'),
    'utf-8'
  );

  assert.match(
    firewallVars,
    /k8s_nodes_cidr/,
    'INFRA-009: el rol firewall debe usar la variable canonica `k8s_nodes_cidr`'
  );

  assert.match(
    firewallVars,
    /k8s_nodes_cidr\s*\|\s*default\(k8s_cluster_cidr/,
    'INFRA-009: debe leerse `k8s_nodes_cidr` con fallback a `k8s_cluster_cidr`'
  );

  for (const [label, relPath] of [
    ['proxmox', 'infra/ansible/inventories/proxmox/hosts.yaml'],
    ['lab', 'infra/ansible/inventories/lab/hosts.yaml'],
  ] as const) {
    const inv = fs.readFileSync(path.join(ROOT_DIR, relPath), 'utf-8');

    assert.ok(
      inv.includes('k8s_nodes_cidr:'),
      `INFRA-009: el inventario ${label} debe declarar k8s_nodes_cidr`
    );

    assert.ok(
      !/k8s_nodes_cidr:\s*"10\.244\./.test(inv),
      `INFRA-009: el inventario ${label} no debe usar el CIDR de pods de k3s (10.244.0.0/16) ` +
      'como red de nodos; el API de Kubernetes se consume desde IPs de nodo.'
    );

    const mgmt = inv.match(/mgmt_cidr:\s*"([\d.]+\/\d+)"/)?.[1];
    const nodes = inv.match(/k8s_nodes_cidr:\s*"([\d.]+\/\d+)"/)?.[1];
    assert.ok(mgmt, `INFRA-009: el inventario ${label} debe declarar mgmt_cidr`);
    assert.ok(nodes, `INFRA-009: el inventario ${label} debe declarar k8s_nodes_cidr`);

    const toPrefix = (cidr: string) => cidr.split('/')[0].split('.').map(Number);
    const mgmtPrefix = toPrefix(mgmt);
    const nodesPrefix = toPrefix(nodes);

    const contained = nodesPrefix.every((octet, i) => octet === mgmtPrefix[i]);
    assert.ok(
      contained,
      `INFRA-009: k8s_nodes_cidr (${nodes}) debe estar contenida en mgmt_cidr (${mgmt}) ` +
      `en el inventario ${label}; de lo contrario la regla SSH sobre el puerto 22 ` +
      'bloquearia el acceso a los propios nodos.'
    );
  }
});

test('🛡️ INFRA-002: la politica SSH debe ser unica y explicita, sin directivas contradictorias', () => {
  const cfgPath = path.join(ROOT_DIR, 'infra/ansible/ansible.cfg');
  assert.ok(fs.existsSync(cfgPath), 'ansible.cfg debe existir');

  const cfg = fs.readFileSync(cfgPath, 'utf-8');

  assert.match(
    cfg,
    /StrictHostKeyChecking=accept-new/,
    'INFRA-002: ssh_args debe declarar StrictHostKeyChecking=accept-new (politica adoptada)'
  );

  assert.ok(
    !/^\s*host_key_checking\s*=/m.test(cfg),
    'INFRA-002: no debe declararse `host_key_checking`; su semantica queda anulada por ' +
    'StrictHostKeyChecking=accept-new en ssh_args. Una sola fuente de verdad.'
  );

  assert.ok(
    /#.*(efimer|recrea|efímer|decisi|politica|política)/i.test(cfg),
    'INFRA-002: la politica accept-new debe justificarse en un comentario ' +
    '(clúster efímero con recreación frecuente de nodos)'
  );

  assert.match(cfg, /ControlPersist=\d+s/, 'ssh_args debe conservar ControlPersist para el multiplexing');
});

test('🛡️ INFRA-003: el usuario SSH de Ansible debe coincidir con el que crea OpenTofu en cada host', () => {
  const ansibleCfgPath = path.join(ROOT_DIR, 'infra/ansible/ansible.cfg');
  const proxmoxMainPath = path.join(ROOT_DIR, 'infra/opentofu/environments/proxmox/main.tf');
  const proxmoxInvPath = path.join(ROOT_DIR, 'infra/ansible/inventories/proxmox/hosts.yaml');
  const labInvPath = path.join(ROOT_DIR, 'infra/ansible/inventories/lab/hosts.yaml');

  assert.ok(fs.existsSync(ansibleCfgPath), 'ansible.cfg debe existir');
  assert.ok(fs.existsSync(proxmoxMainPath), 'main.tf de proxmox debe existir');

  const cfg = fs.readFileSync(ansibleCfgPath, 'utf-8');
  const mainTf = fs.readFileSync(proxmoxMainPath, 'utf-8');

  const remoteUser = cfg.match(/^\s*remote_user\s*=\s*(\S+)\s*$/m)?.[1];
  assert.ok(remoteUser, 'ansible.cfg debe declarar remote_user de forma explícita');

  // ADR-030: el entorno proxmox solo crea LXC (cuenta root por SSH key); la única VM
  // con usuario de cloud-init es la del entorno lab.
  assert.ok(!/proxmox_virtual_environment_vm/.test(mainTf), 'El entorno proxmox no debe aprovisionar VMs (ADR-030)');
  const labMainTf = fs.readFileSync(path.join(ROOT_DIR, 'infra/opentofu/environments/lab/main.tf'), 'utf-8');
  const vmUser = labMainTf.match(/resource\s+"proxmox_virtual_environment_vm"[\s\S]*?username\s*=\s*"([^"]+)"/)?.[1];
  assert.ok(vmUser, 'La VM de lab debe declarar `username` en initialization.user_account');

  const proxmoxInv = fs.readFileSync(proxmoxInvPath, 'utf-8');
  const labInv = fs.readFileSync(labInvPath, 'utf-8');

  for (const [label, inv] of [
    ['proxmox', proxmoxInv],
    ['lab', labInv],
  ] as const) {
    const blocks = inv.split(/\n(?=\s{6,8}\S)/);
    const hostsWithoutUser = blocks
      .filter((b) => /ansible_host:\s*\S+/.test(b) && !/ansible_user:\s*\S+/.test(b))
      .map((b) => b.match(/^\s*([A-Za-z0-9_-]+):\s*$/m)?.[1]?.trim() ?? '?');
    assert.deepEqual(
      hostsWithoutUser,
      [],
      `INFRA-003: el inventario ${label} declara host(es) sin 'ansible_user': ${hostsWithoutUser.join(', ')}. ` +
      'Ansible usaria el remote_user global, que puede no existir en el host.'
    );
  }

  assert.ok(
    !/name:\s*pokedex-prod-01[\s\S]*?ansible_user:\s*devops/.test(proxmoxInv)
      || remoteUser === 'devops',
    `INFRA-003: el host de la VM declara 'devops' pero ansible.cfg fija remote_user='${remoteUser}'; ` +
    'Ansible no podrá conectar. Declarar ansible_user por host o alinear remote_user.'
  );
});

test('🛡️ INFRA-012: el inventario de proxmox no debe declarar hosts fantasma ni IPs colisionadas', () => {
  const proxmoxInvPath = path.join(ROOT_DIR, 'infra/ansible/inventories/proxmox/hosts.yaml');
  const mainTf = path.join(ROOT_DIR, 'infra/opentofu/environments/proxmox/main.tf');

  const inv = fs.readFileSync(proxmoxInvPath, 'utf-8');
  const varsTf = fs.readFileSync(
    path.join(ROOT_DIR, 'infra/opentofu/environments/proxmox/variables.tf'),
    'utf-8'
  );
  const tf = `${fs.readFileSync(mainTf, 'utf-8')}\n${varsTf}`;

  const ips = [...inv.matchAll(/ansible_host:\s*(\S+)/g)].map((m) => m[1]);
  const duplicates = ips.filter((ip, i) => ips.indexOf(ip) !== i);
  assert.deepEqual(
    duplicates,
    [],
    `INFRA-012: el inventario declara IPs repetidas (${duplicates.join(', ')}); ` +
    'los playbooks con `hosts: all` las ejecutarían dos veces sobre el mismo host'
  );

  const declaredNodes = Number(tf.match(/variable\s+"vm_count"[\s\S]*?default\s*=\s*(\d+)/)?.[1] ?? 1);
  const baseIp = tf.match(/variable\s+"network_base_ip"[\s\S]*?default\s*=\s*"([\d.]+)"/)?.[1] ?? '10.10.13.';
  const allowed = new Set<string>();

  const maxNodes = Math.max(declaredNodes, 3);
  for (let i = 0; i < maxNodes; i++) allowed.add(`${baseIp}${100 + i}`);

  const stripCidr = (value?: string) => value?.split('/')[0];

  const vaultIp = stripCidr(
    tf.match(/variable\s+"vault_network_ip"[\s\S]*?default\s*=\s*"([^"]+)"/)?.[1]
  );
  const bastionIp = stripCidr(
    tf.match(/variable\s+"bastion_network_ip"[\s\S]*?default\s*=\s*"([^"]+)"/)?.[1]
  );
  if (vaultIp) allowed.add(vaultIp);
  if (bastionIp) allowed.add(bastionIp);

  const ghosts = ips
    .map((ip) => ip.split('/')[0])
    .filter((ip) => !allowed.has(ip));
  assert.deepEqual(
    ghosts,
    [],
    `INFRA-012: el inventario declara hosts que OpenTofu no crea (${ghosts.join(', ')}); ` +
    'los playbooks fallarían con "Could not match supplied host pattern"'
  );
});

test('🛡️ INFRA-001: las collections de Ansible deben estar fijadas a una version exacta', () => {
  const reqPath = path.join(ROOT_DIR, 'infra/ansible/requirements.yaml');
  assert.ok(fs.existsSync(reqPath), 'requirements.yaml debe existir');

  const content = fs.readFileSync(reqPath, 'utf-8');

  const openRanges = [...content.matchAll(/version:\s*["']?\s*(>=|>|~=|\*)["']?/g)];
  assert.deepEqual(
    openRanges.map((m) => m[0].trim()),
    [],
    'INFRA-001: requirements.yaml no debe declarar rangos abiertos; use `==` para fijar la version exacta'
  );

  const collectionBlocks = content.split(/\n\s*-\s*name:/).slice(1);
  assert.ok(collectionBlocks.length >= 2, 'Deben declararse al menos las 2 colecciones requeridas');

  for (const block of collectionBlocks) {
    const name = block.match(/^\s*([\w.]+)/)?.[1];
    const version = block.match(/version:\s*["']?([\w.>=~*]+)["']?/)?.[1];
    assert.ok(name, 'Cada bloque de coleccion debe declarar su nombre');
    assert.ok(version, `INFRA-001: la coleccion ${name} debe declarar version`);
    assert.ok(
      /^\d+\.\d+\.\d+$/.test(version),
      `INFRA-001: la version de ${name} debe ser una version exacta (x.y.z), no '${version}'`
    );
  }

  assert.ok(content.includes('ansible.posix'), 'Debe declararse la coleccion ansible.posix');
  assert.ok(content.includes('community.general'), 'Debe declararse la coleccion community.general');

  const ciWorkflow = fs.readFileSync(
    path.join(ROOT_DIR, '.github/workflows/infra.yaml'),
    'utf-8'
  );
  const coreVersion = ciWorkflow.match(/ansible-core==([\d.]+)/)?.[1];
  assert.ok(coreVersion, 'El CI debe fijar ansible-core explicitamente');

  const coreMajorMinor = `${coreVersion.split('.')[0]}.${coreVersion.split('.')[1]}`;
  const generalBlock = collectionBlocks.find((b) => b.includes('community.general'));
  const generalMajor = generalBlock?.match(/version:\s*["']?(\d+)\./)?.[1];

  if (coreMajorMinor === '2.17' && generalMajor && Number(generalMajor) >= 13) {
    assert.fail(
      `INFRA-001: community.general ${generalMajor}.x requiere ansible-core >=2.18.0, ` +
      `pero el CI fija ansible-core==${coreVersion}. La fijacion no es instalable.`
    );
  }
});

test('🛡️ Ansible Idempotencia: container_runtime valida el estado activo del servicio sin falsos positivos', () => {
  const runtimeTaskPath = path.join(ROOT_DIR, 'infra/ansible/roles/container_runtime/tasks/main.yaml');
  assert.ok(fs.existsSync(runtimeTaskPath), 'container_runtime/tasks/main.yaml debe existir');
  const content = fs.readFileSync(runtimeTaskPath, 'utf-8');

  assert.ok(content.includes('service_facts:'), 'Debe recolectar hechos de servicios del sistema');
  assert.ok(content.includes('ansible.builtin.assert:'), 'Debe realizar aserción formal del servicio');
  assert.ok(content.includes("ansible_facts.services['docker.service'].state == 'running'"), 'Debe validar que docker.service está running');
});

test('🔍 Coherencia Operacional E2E: Auditoría de 8 eslabones, alineación de red 10.10.13.0/24 y setup_k3s.yaml', () => {
  const proxmoxGuidePath = path.join(ROOT_DIR, 'docs/runbooks/PROXMOX_DEPLOYMENT_GUIDE.md');
  assert.ok(fs.existsSync(proxmoxGuidePath), 'PROXMOX_DEPLOYMENT_GUIDE.md debe existir en docs/runbooks/');
  const docGuideContent = fs.readFileSync(proxmoxGuidePath, 'utf-8');
  assert.ok(docGuideContent.includes('10.10.13.0/24'), 'PROXMOX_DEPLOYMENT_GUIDE.md debe documentar la subred de administración 10.10.13.0/24');

  const adr25Path = path.join(ROOT_DIR, 'docs/decisions/ADR-025-management-plane-runtime-plane-and-cloud-ready-separation.md');
  assert.ok(fs.existsSync(adr25Path), 'ADR-025 debe existir en docs/decisions/');
  const adr25Content = fs.readFileSync(adr25Path, 'utf-8');
  assert.ok(adr25Content.includes('10.10.13.0/24'), 'ADR-025 debe formalizar la subred de administración 10.10.13.0/24');

  assert.ok(!fs.existsSync(path.join(ROOT_DIR, 'infra/ansible/inventory')), 'No debe existir carpeta duplicada infra/ansible/inventory');
  const hostsYml = fs.readFileSync(path.join(ROOT_DIR, 'infra/ansible/inventories/proxmox/hosts.yaml'), 'utf-8');
  assert.ok(hostsYml.includes('10.10.13.100'), 'hosts.yaml debe asignar k8s-master-01 en 10.10.13.100');
  assert.ok(hostsYml.includes('10.10.13.0/24'), 'hosts.yaml debe definir CIDR en 10.10.13.0/24');
  assert.ok(!hostsYml.includes('docker_compose_version'), 'hosts.yaml no debe contener vestigios de docker-compose');

  const setupK3sPath = path.join(ROOT_DIR, 'infra/ansible/playbooks/setup_k3s.yaml');
  assert.ok(fs.existsSync(setupK3sPath), 'setup_k3s.yaml debe existir para automatizar la provisión de K3s');
  const setupK3sContent = fs.readFileSync(setupK3sPath, 'utf-8');
  assert.ok(setupK3sContent.includes('--flannel-backend=none'), 'setup_k3s.yaml debe desacoplar Flannel con --flannel-backend=none');
  assert.ok(setupK3sContent.includes('cilium'), 'setup_k3s.yml debe desplegar Cilium CNI');

  const proxmoxValues = fs.readFileSync(path.join(ROOT_DIR, 'gitops/environments/proxmox-preprod/values.yaml'), 'utf-8');
  assert.ok(!proxmoxValues.includes('nginx.ingress.kubernetes.io/configuration-snippet: null'), 'proxmox/values.yaml no debe contener anotaciones huérfanas de Nginx');
  assert.ok(proxmoxValues.includes('className: "traefik"'), 'proxmox/values.yaml debe especificar className traefik');

  const taskfileContent = getCompleteTaskfileContent(ROOT_DIR);
  assert.ok(taskfileContent.includes('k3s:setup:proxmox:'), 'Taskfile.yaml debe exponer k3s:setup:proxmox');
  assert.ok(
    taskfileContent.includes('infra/ansible/playbooks/setup_k3s.yaml'),
    'k3s:setup:proxmox debe invocar setup_k3s.yaml'
  );

  const taskRefContent = fs.readFileSync(path.join(ROOT_DIR, 'docs/operations/TASKFILE_CLI_REFERENCE.md'), 'utf-8');
  assert.ok(taskRefContent.includes('`task k3s:setup:proxmox`'), 'TASKFILE_CLI_REFERENCE.md debe documentar task k3s:setup:proxmox');

  const proxmoxGuideContent = fs.readFileSync(path.join(ROOT_DIR, 'docs/runbooks/PROXMOX_DEPLOYMENT_GUIDE.md'), 'utf-8');
  assert.ok(proxmoxGuideContent.includes('task k3s:setup:proxmox'), 'PROXMOX_DEPLOYMENT_GUIDE.md debe documentar task k3s:setup:proxmox');
  assert.ok(proxmoxGuideContent.includes('setup_k3s.yaml'), 'PROXMOX_DEPLOYMENT_GUIDE.md debe referenciar setup_k3s.yaml');
  assert.ok(proxmoxGuideContent.includes('k8s-preprod.internal.lan'), 'PROXMOX_DEPLOYMENT_GUIDE.md debe documentar resolución para k8s-preprod.internal.lan');
});
