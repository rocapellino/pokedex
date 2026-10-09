/**
 * ==============================================================================
 * Test de Seguridad y Arquitectura: Ansible Baseline, Host Hardening & Redes
 * ==============================================================================
 *
 * Los playbooks, roles, inventarios y `requirements.yaml` se verifican parseados (tareas, módulos, variables y
 * hosts efectivos), no como texto: una tarea comentada o un valor dentro de un comentario siguen "apareciendo" en
 * el archivo sin que Ansible los ejecute.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getCompleteTaskfileContent } from '../helpers/taskfile.js';
import { ROOT_DIR } from '../helpers/repo.js';
import { playbookTasks, roleTasks, type Task } from '../helpers/ansible.js';
import { readYaml, workflowScripts } from '../helpers/yaml.js';

const ANSIBLE = 'infra/ansible';
const read = (rel: string) => fs.readFileSync(path.join(ROOT_DIR, rel), 'utf-8');

/** Playbooks y roles que forman el baseline del host (host_baseline.yaml + security_hardening.yaml y sus roles). */
function baselineTasks(): Array<{ file: string; tasks: Task[] }> {
  const roles = ['base_os', 'container_runtime', 'hardening', 'firewall'];
  return [
    ...['host_baseline.yaml', 'security_hardening.yaml'].map((f) => ({
      file: `playbooks/${f}`,
      tasks: playbookTasks(f),
    })),
    ...roles.map((role) => ({ file: `roles/${role}`, tasks: roleTasks(role) })),
  ];
}

interface Host {
  name: string;
  groups: string[];
  vars: Record<string, any>;
}

/** Hosts efectivos de un inventario YAML: variables propias, `all.vars` y grupos (con herencia por `children`). */
function inventoryHosts(env: string): { hosts: Host[]; allVars: Record<string, any> } {
  const inventory = readYaml<any>(`${ANSIBLE}/inventories/${env}/hosts.yaml`);
  const groups: Record<string, any> = inventory.all.children ?? {};
  const hosts = new Map<string, Host>();

  const memberGroups = (group: string): string[] => {
    const parents = Object.entries(groups)
      .filter(([, def]) => def?.children && group in def.children)
      .map(([name]) => name);
    return [group, ...parents.flatMap(memberGroups)];
  };
  for (const [group, def] of Object.entries(groups)) {
    for (const [name, vars] of Object.entries<any>(def?.hosts ?? {})) {
      hosts.set(name, { name, groups: memberGroups(group), vars: { ...(vars ?? {}) } });
    }
  }
  return { hosts: [...hosts.values()], allVars: inventory.all.vars ?? {} };
}

/** Lee un INI de Ansible ignorando comentarios (`#`, `;`). */
function parseIni(text: string): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};
  let section = '';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;
    const header = line.match(/^\[(.+)]$/);
    if (header) {
      section = header[1];
      result[section] = {};
      continue;
    }
    const eq = line.indexOf('=');
    if (eq > 0 && section) result[section][line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return result;
}

const ipToInt = (ip: string) => ip.split('.').reduce((acc, octet) => acc * 256 + Number(octet), 0);

/** `inner` está contenida en `outer` (ambas en notación CIDR IPv4). */
function cidrContains(outer: string, inner: string): boolean {
  const [outerIp, outerBits] = outer.split('/');
  const [innerIp, innerBits] = inner.split('/');
  if (Number(innerBits) < Number(outerBits)) return false;
  const size = 2 ** (32 - Number(outerBits));
  return Math.floor(ipToInt(innerIp) / size) === Math.floor(ipToInt(outerIp) / size);
}

test('🛡️ Deploy Security: infra/ansible/deploy_excludes.txt existe y excluye .env y .env.*', () => {
  const filePath = path.join(ROOT_DIR, 'infra/ansible/deploy_excludes.txt');
  assert.ok(fs.existsSync(filePath), 'El archivo infra/ansible/deploy_excludes.txt debe existir');
  const patterns = fs
    .readFileSync(filePath, 'utf-8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  assert.ok(patterns.includes('.env'), 'deploy_excludes.txt debe excluir .env');
  assert.ok(patterns.includes('.env.*'), 'deploy_excludes.txt debe excluir .env.*');
});

test('🛡️ Deploy Security: host_baseline.yaml aplica base_os, container_runtime (condicional) y hardening, sin errores ignorados', () => {
  const plays = readYaml<Task[]>(`${ANSIBLE}/playbooks/host_baseline.yaml`);
  const play = plays.find((p) => p.roles);
  assert.ok(play, 'host_baseline.yaml debe declarar un play con roles');
  assert.equal(play.become, true, 'el baseline debe elevar privilegios con become');

  const roles = play.roles.map((r: any) => (typeof r === 'string' ? { role: r } : r));
  const names = roles.map((r: any) => path.basename(r.role));
  assert.deepEqual(names, ['base_os', 'container_runtime', 'hardening'], 'roles y orden del baseline');
  const runtime = roles.find((r: any) => r.role.endsWith('container_runtime'));
  assert.match(
    String(runtime.when),
    /install_docker/,
    'el runtime de contenedores debe poder condicionarse con install_docker',
  );
  assert.ok(
    plays.some((p) => p.import_playbook === 'security_hardening.yaml'),
    'el baseline debe importar security_hardening.yaml',
  );

  // Docker se verifica de forma efectiva: `docker info` como comando que falla si rc != 0.
  const dockerInfo = roleTasks('container_runtime').find((t) => t['ansible.builtin.command'] === 'docker info');
  assert.ok(dockerInfo, 'container_runtime debe verificar el funcionamiento de Docker con `docker info`');
  assert.match(String(dockerInfo.failed_when), /rc\s*!=\s*0/);

  // Ninguna tarea del baseline (playbooks y los cuatro roles que aplica) puede ocultar fallos.
  const hidden = baselineTasks().flatMap(({ file, tasks }) =>
    tasks
      .filter((t) => t.ignore_errors === true || t.ignore_errors === 'true' || t.ignore_errors === 'yes')
      .map((t) => `${file}: ${t.name}`),
  );
  assert.deepEqual(hidden, [], 'ninguna tarea del baseline puede usar ignore_errors: true');
});

test('🛡️ Deploy Security: Playbooks legacy de Compose y docker-compose.prod.yml retirados de producción', () => {
  const legacyFiles = [
    'docker-compose.prod.yml',
    'infra/ansible/playbooks/deploy_proxmox.yaml',
    'infra/ansible/playbooks/deploy_app.yaml',
  ];

  for (const relPath of legacyFiles) {
    const filePath = path.join(ROOT_DIR, relPath);
    assert.equal(
      fs.existsSync(filePath),
      false,
      `${relPath} debe estar eliminado; Kubernetes es el único runtime productivo`,
    );
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

test('🛡️ Ansible Security: el firewall deniega por defecto y restringe SSH (22) y puertos K8s/etcd a su subred (src)', () => {
  const ufw = roleTasks('firewall')
    .filter((t) => t['community.general.ufw'])
    .map((t) => ({ name: t.name, rule: t['community.general.ufw'], when: String(t.when ?? ''), loop: t.loop }));

  const policy = (direction: string) => ufw.find((t) => t.rule.direction === direction)?.rule.policy;
  assert.equal(policy('incoming'), 'deny', 'la política de entrada por defecto debe ser deny');
  assert.equal(policy('outgoing'), 'allow');
  assert.ok(
    ufw.some((t) => t.rule.state === 'enabled'),
    'el firewall debe quedar habilitado',
  );

  // SSH (22) y el proxy administrativo (8080): solo desde la red de administración.
  for (const port of ['22', '8080']) {
    const rule = ufw.find((t) => t.rule.rule === 'allow' && String(t.rule.port) === port);
    assert.ok(rule, `debe existir la regla del puerto ${port}`);
    assert.equal(rule.rule.src, '{{ mgmt_network }}', `el puerto ${port} debe restringirse a la red de administración`);
  }

  // Kubernetes (API, Kubelet, etcd): solo desde la red del clúster y solo en nodos del grupo k8s_cluster.
  const k8s = ufw.find((t) => Array.isArray(t.loop) && t.loop.some((i: any) => i.port === '6443'));
  assert.ok(k8s, 'debe existir la regla de puertos de Kubernetes');
  assert.equal(k8s.rule.src, '{{ k8s_network }}', 'los puertos de Kubernetes deben restringirse a la red del clúster');
  assert.deepEqual(
    k8s.loop.map((i: any) => i.port),
    ['6443', '10250', '2379:2380'],
    'API Server, Kubelet y etcd',
  );
  assert.match(k8s.when, /k8s_cluster/);

  // Invariante: la única exposición pública permitida son 80 y 443; todo otro allow lleva origen.
  const open = ufw.filter((t) => t.rule.rule === 'allow' && !t.rule.src);
  assert.deepEqual(
    open.flatMap((t) => (t.rule.loop ?? t.loop ?? [t.rule.port]).map(String)).sort(),
    ['443', '80'],
    'solo HTTP y HTTPS pueden abrirse sin restringir el origen',
  );

  // security_hardening.yaml aplica el rol, y cada inventario provee las variables de red que el rol consume.
  const hardening = readYaml<Task[]>(`${ANSIBLE}/playbooks/security_hardening.yaml`)[0];
  assert.ok(
    hardening.roles.some((r: any) => path.basename(r.role ?? r) === 'firewall'),
    'security_hardening.yaml debe aplicar el rol firewall',
  );
  assert.equal(hardening.hosts, 'all');
  const { allVars } = inventoryHosts('proxmox');
  assert.ok(allVars.mgmt_cidr, 'hosts.yaml debe definir mgmt_cidr');
  assert.ok(allVars.k8s_nodes_cidr, 'hosts.yaml debe definir k8s_nodes_cidr');
});

test('🛡️ INFRA-009: la red del cluster debe ser una variable explicita y distinta de la de gestion', () => {
  const firewallVars = readYaml<Record<string, string>>(`${ANSIBLE}/roles/firewall/vars/main.yaml`);
  assert.match(
    firewallVars.k8s_network,
    /k8s_nodes_cidr\s*\|\s*default\(k8s_cluster_cidr/,
    'INFRA-009: `k8s_network` debe leer `k8s_nodes_cidr` con fallback a `k8s_cluster_cidr`',
  );
  assert.match(firewallVars.mgmt_network, /mgmt_cidr/);

  for (const label of ['proxmox', 'lab']) {
    const { allVars } = inventoryHosts(label);
    const { mgmt_cidr: mgmt, k8s_nodes_cidr: nodes } = allVars;
    assert.ok(mgmt, `INFRA-009: el inventario ${label} debe declarar mgmt_cidr`);
    assert.ok(nodes, `INFRA-009: el inventario ${label} debe declarar k8s_nodes_cidr`);
    assert.ok(
      !String(nodes).startsWith('10.244.'),
      `INFRA-009: el inventario ${label} no debe usar el CIDR de pods de k3s (10.244.0.0/16) como red de nodos; ` +
        'el API de Kubernetes se consume desde IPs de nodo.',
    );
    assert.ok(
      cidrContains(mgmt, nodes),
      `INFRA-009: k8s_nodes_cidr (${nodes}) debe estar contenida en mgmt_cidr (${mgmt}) en el inventario ${label}; ` +
        'de lo contrario la regla SSH sobre el puerto 22 bloquearia el acceso a los propios nodos.',
    );
  }
});

test('🛡️ INFRA-002: la politica SSH debe ser unica y explicita, sin directivas contradictorias', () => {
  const cfgPath = `${ANSIBLE}/ansible.cfg`;
  assert.ok(fs.existsSync(path.join(ROOT_DIR, cfgPath)), 'ansible.cfg debe existir');
  const raw = read(cfgPath);
  const cfg = parseIni(raw);

  const sshArgs = cfg.ssh_connection?.ssh_args ?? '';
  assert.match(
    sshArgs,
    /StrictHostKeyChecking=accept-new/,
    'INFRA-002: ssh_args debe declarar StrictHostKeyChecking=accept-new (politica adoptada)',
  );
  assert.match(sshArgs, /ControlPersist=\d+s/, 'ssh_args debe conservar ControlPersist para el multiplexing');
  assert.equal(
    cfg.defaults?.host_key_checking,
    undefined,
    'INFRA-002: no debe declararse `host_key_checking`; su semantica queda anulada por ' +
      'StrictHostKeyChecking=accept-new en ssh_args. Una sola fuente de verdad.',
  );

  // La justificación es un comentario: por eso se busca en el texto crudo y no en el INI parseado.
  assert.ok(
    /#.*(efimer|recrea|efímer|decisi|politica|política)/i.test(raw),
    'INFRA-002: la politica accept-new debe justificarse en un comentario ' +
      '(clúster efímero con recreación frecuente de nodos)',
  );
});

test('🛡️ INFRA-003: cada host declara su ansible_user, alineado con lo que OpenTofu aprovisiona', () => {
  const cfg = parseIni(read(`${ANSIBLE}/ansible.cfg`));
  const remoteUser = cfg.defaults?.remote_user;
  assert.ok(remoteUser, 'ansible.cfg debe declarar remote_user de forma explícita');

  // ADR-030: el entorno proxmox solo crea LXC (cuenta root por SSH key); la única VM
  // con usuario de cloud-init es la del entorno lab.
  const proxmoxMainTf = read('infra/opentofu/environments/proxmox/main.tf');
  assert.ok(
    !/proxmox_virtual_environment_vm/.test(proxmoxMainTf),
    'El entorno proxmox no debe aprovisionar VMs (ADR-030)',
  );
  const labMainTf = read('infra/opentofu/environments/lab/main.tf');
  const vmUser = labMainTf.match(/resource\s+"proxmox_virtual_environment_vm"[\s\S]*?username\s*=\s*"([^"]+)"/)?.[1];
  assert.ok(vmUser, 'La VM de lab debe declarar `username` en initialization.user_account');

  for (const label of ['proxmox', 'lab']) {
    const { hosts } = inventoryHosts(label);
    assert.ok(hosts.length > 0, `el inventario ${label} debe declarar hosts`);
    const withoutUser = hosts.filter((h) => !h.vars.ansible_user).map((h) => h.name);
    assert.deepEqual(
      withoutUser,
      [],
      `INFRA-003: el inventario ${label} declara host(es) sin 'ansible_user': ${withoutUser.join(', ')}. ` +
        'Ansible usaria el remote_user global, que puede no existir en el host.',
    );
    // Los hosts de Proxmox son LXC: solo admiten la cuenta root, y ansible.cfg coincide.
    const mismatched = hosts
      .filter((h) => h.vars.ansible_user !== 'root')
      .map((h) => `${h.name}=${h.vars.ansible_user}`);
    assert.deepEqual(mismatched, [], `INFRA-003: los LXC de ${label} solo admiten la cuenta root`);
  }
  assert.equal(remoteUser, 'root', 'remote_user global debe coincidir con la cuenta de los LXC');
});

test('🛡️ INFRA-012: el inventario de proxmox no debe declarar hosts fantasma ni IPs colisionadas', () => {
  const varsTf = read('infra/opentofu/environments/proxmox/variables.tf');
  const tf = `${read('infra/opentofu/environments/proxmox/main.tf')}\n${varsTf}`;

  const ips = inventoryHosts('proxmox').hosts.map((h) => String(h.vars.ansible_host));
  const duplicates = ips.filter((ip, i) => ips.indexOf(ip) !== i);
  assert.deepEqual(
    duplicates,
    [],
    `INFRA-012: el inventario declara IPs repetidas (${duplicates.join(', ')}); ` +
      'los playbooks con `hosts: all` las ejecutarían dos veces sobre el mismo host',
  );

  const declaredNodes = Number(tf.match(/variable\s+"vm_count"[\s\S]*?default\s*=\s*(\d+)/)?.[1] ?? 1);
  const baseIp = tf.match(/variable\s+"network_base_ip"[\s\S]*?default\s*=\s*"([\d.]+)"/)?.[1] ?? '10.10.13.';
  const allowed = new Set<string>();

  const maxNodes = Math.max(declaredNodes, 3);
  for (let i = 0; i < maxNodes; i++) allowed.add(`${baseIp}${100 + i}`);

  const stripCidr = (value?: string) => value?.split('/')[0];

  const vaultIp = stripCidr(tf.match(/variable\s+"vault_network_ip"[\s\S]*?default\s*=\s*"([^"]+)"/)?.[1]);
  const bastionIp = stripCidr(tf.match(/variable\s+"bastion_network_ip"[\s\S]*?default\s*=\s*"([^"]+)"/)?.[1]);
  if (vaultIp) allowed.add(vaultIp);
  if (bastionIp) allowed.add(bastionIp);

  const ghosts = ips.map((ip) => ip.split('/')[0]).filter((ip) => !allowed.has(ip));
  assert.deepEqual(
    ghosts,
    [],
    `INFRA-012: el inventario declara hosts que OpenTofu no crea (${ghosts.join(', ')}); ` +
      'los playbooks fallarían con "Could not match supplied host pattern"',
  );
});

test('🛡️ INFRA-001: las collections de Ansible deben estar fijadas a una version exacta', () => {
  const { collections } = readYaml<{ collections: Array<{ name: string; version?: string }> }>(
    `${ANSIBLE}/requirements.yaml`,
  );
  assert.ok(collections.length >= 2, 'Deben declararse al menos las 2 colecciones requeridas');

  for (const { name, version } of collections) {
    assert.ok(version, `INFRA-001: la coleccion ${name} debe declarar version`);
    assert.ok(
      /^\d+\.\d+\.\d+$/.test(String(version)),
      `INFRA-001: la version de ${name} debe ser una version exacta (x.y.z), no '${version}'`,
    );
  }
  const names = collections.map((c) => c.name);
  assert.ok(names.includes('ansible.posix'), 'Debe declararse la coleccion ansible.posix');
  assert.ok(names.includes('community.general'), 'Debe declararse la coleccion community.general');

  const coreVersion = workflowScripts('.github/workflows/infra.yaml')
    .join('\n')
    .match(/ansible-core==([\d.]+)/)?.[1];
  assert.ok(coreVersion, 'El CI debe fijar ansible-core explicitamente');

  const coreMajorMinor = `${coreVersion.split('.')[0]}.${coreVersion.split('.')[1]}`;
  const generalMajor = String(collections.find((c) => c.name === 'community.general')?.version).split('.')[0];

  if (coreMajorMinor === '2.17' && Number(generalMajor) >= 13) {
    assert.fail(
      `INFRA-001: community.general ${generalMajor}.x requiere ansible-core >=2.18.0, ` +
        `pero el CI fija ansible-core==${coreVersion}. La fijacion no es instalable.`,
    );
  }
});

test('🛡️ Ansible Idempotencia: container_runtime valida el estado activo del servicio sin falsos positivos', () => {
  const tasks = roleTasks('container_runtime');
  const factsIndex = tasks.findIndex((t) => 'ansible.builtin.service_facts' in t);
  const assertIndex = tasks.findIndex((t) => t['ansible.builtin.assert']);
  assert.ok(factsIndex >= 0, 'Debe recolectar hechos de servicios del sistema');
  assert.ok(assertIndex > factsIndex, 'La aserción debe ejecutarse después de recolectar los hechos');
  assert.ok(
    tasks[assertIndex]['ansible.builtin.assert'].that.includes(
      "ansible_facts.services['docker.service'].state == 'running'",
    ),
    'Debe validar que docker.service está running',
  );
});

test('🔍 Coherencia Operacional E2E: Auditoría de 8 eslabones, alineación de red 10.10.13.0/24 y setup_k3s.yaml', () => {
  const proxmoxGuidePath = path.join(ROOT_DIR, 'docs/runbooks/PROXMOX_DEPLOYMENT_GUIDE.md');
  assert.ok(fs.existsSync(proxmoxGuidePath), 'PROXMOX_DEPLOYMENT_GUIDE.md debe existir en docs/runbooks/');
  const docGuideContent = fs.readFileSync(proxmoxGuidePath, 'utf-8');
  assert.ok(
    docGuideContent.includes('10.10.13.0/24'),
    'PROXMOX_DEPLOYMENT_GUIDE.md debe documentar la subred de administración 10.10.13.0/24',
  );

  const adr25Path = path.join(
    ROOT_DIR,
    'docs/decisions/ADR-025-management-plane-runtime-plane-and-cloud-ready-separation.md',
  );
  assert.ok(fs.existsSync(adr25Path), 'ADR-025 debe existir en docs/decisions/');
  const adr25Content = fs.readFileSync(adr25Path, 'utf-8');
  assert.ok(
    adr25Content.includes('10.10.13.0/24'),
    'ADR-025 debe formalizar la subred de administración 10.10.13.0/24',
  );

  assert.ok(
    !fs.existsSync(path.join(ROOT_DIR, 'infra/ansible/inventory')),
    'No debe existir carpeta duplicada infra/ansible/inventory',
  );
  const { hosts, allVars } = inventoryHosts('proxmox');
  const master = hosts.find((h) => h.name === 'k8s-master-01');
  assert.equal(master?.vars.ansible_host, '10.10.13.100', 'hosts.yaml debe asignar k8s-master-01 en 10.10.13.100');
  assert.equal(allVars.mgmt_cidr, '10.10.13.0/24', 'hosts.yaml debe definir CIDR en 10.10.13.0/24');
  assert.deepEqual(
    Object.keys(allVars).filter((key) => key.includes('docker_compose')),
    [],
    'hosts.yaml no debe contener vestigios de docker-compose',
  );

  const setupK3s = JSON.stringify(readYaml(`${ANSIBLE}/playbooks/setup_k3s.yaml`));
  assert.ok(
    setupK3s.includes('--flannel-backend=none'),
    'setup_k3s.yaml debe desacoplar Flannel con --flannel-backend=none',
  );
  assert.ok(setupK3s.includes('cilium'), 'setup_k3s.yaml debe desplegar Cilium CNI');

  const proxmoxValues = readYaml('gitops/environments/proxmox-preprod/values.yaml');
  assert.equal(
    proxmoxValues.ingress.annotations?.['nginx.ingress.kubernetes.io/configuration-snippet'],
    undefined,
    'proxmox/values.yaml no debe contener anotaciones huérfanas de Nginx',
  );
  assert.equal(proxmoxValues.ingress.className, 'traefik', 'proxmox/values.yaml debe especificar className traefik');

  const taskfileContent = getCompleteTaskfileContent(ROOT_DIR);
  assert.ok(taskfileContent.includes('k3s:setup:proxmox:'), 'Taskfile.yaml debe exponer k3s:setup:proxmox');
  assert.ok(
    taskfileContent.includes('infra/ansible/playbooks/setup_k3s.yaml'),
    'k3s:setup:proxmox debe invocar setup_k3s.yaml',
  );

  const taskRefContent = fs.readFileSync(path.join(ROOT_DIR, 'docs/operations/TASKFILE_CLI_REFERENCE.md'), 'utf-8');
  assert.ok(
    taskRefContent.includes('`task k3s:setup:proxmox`'),
    'TASKFILE_CLI_REFERENCE.md debe documentar task k3s:setup:proxmox',
  );

  const proxmoxGuideContent = fs.readFileSync(
    path.join(ROOT_DIR, 'docs/runbooks/PROXMOX_DEPLOYMENT_GUIDE.md'),
    'utf-8',
  );
  assert.ok(
    proxmoxGuideContent.includes('task k3s:setup:proxmox'),
    'PROXMOX_DEPLOYMENT_GUIDE.md debe documentar task k3s:setup:proxmox',
  );
  assert.ok(
    proxmoxGuideContent.includes('setup_k3s.yaml'),
    'PROXMOX_DEPLOYMENT_GUIDE.md debe referenciar setup_k3s.yaml',
  );
  assert.ok(
    proxmoxGuideContent.includes('k8s-preprod.internal.lan'),
    'PROXMOX_DEPLOYMENT_GUIDE.md debe documentar resolución para k8s-preprod.internal.lan',
  );
});
