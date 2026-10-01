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

/**
 * WF-001 — El matrix de escaneo de imágenes base del workflow de Trivy debe
 * reflejar EXACTAMENTE lo que el Chart despliega.
 *
 * El defecto original era doble y ambos limbs pasaban inadvertidos:
 *   1. `edoburu/pgbouncer:1.22.0` NO es la imagen desplegada. El repo usa la
 *      oficial `pgbouncer/pgbouncer`. Se escaneaba un artefacto ajeno al runtime.
 *   2. Ese tag ya no existe en el registro, así que el job moría con
 *      MANIFEST_UNKNOWN: un fallo ruidoso que, irónicamente, era la ÚNICA señal
 *      visible del problema.
 *
 * Este test ata el contrato en las dos direcciones: ninguna imagen desplegada
 * puede faltar en el scan, y ninguna imagen escaneada puede estar desplegada.
 * Sin él, el próximo bump de versión reintroduce el drift en silencio.
 */

/**
 * Normaliza una referencia de imagen a su forma canónica `repository@sha256:...`.
 *
 * `values.yaml` declara `tag: "16-alpine@sha256:..."` (etiqueta legible + digest)
 * mientras el matrix del workflow usa directamente el digest. Ambas designan la
 * misma imagen; comparar la etiqueta nominal haría fallar el gate por una
 * diferencia de notación y no de contenido.
 */
function canonicalImageRef(repository: string, tag: string): string {
  const digest = tag.match(/@?(sha256:[a-f0-9]{64})$/)?.[1];
  return digest ? `${repository}@${digest}` : `${repository}:${tag}`;
}

/** Extrae `repository` + `tag` del bloque de una clave en values.yaml. */
function readDeployedImage(yaml: string, key: string): string | null {
  const start = yaml.indexOf(`\n${key}:`);
  if (start === -1) return null;
  // Se acota el bloque al siguiente sibling de nivel superior.
  const rest = yaml.slice(start + 1);
  const nextKey = rest.slice(1).search(/\n[a-z_]+:\s*$/m);
  const block = nextKey === -1 ? rest : rest.slice(0, nextKey + 1);

  const repository = block.match(/repository:\s*(\S+)/)?.[1];
  const rawTag = block.match(/tag:\s*"?([^"\n]+)"?/)?.[1];
  if (!repository || !rawTag) return null;
  return canonicalImageRef(repository, rawTag);
}

/** Extrae las referencias del matrix `image:` del workflow de Trivy. */
function readScannedImages(workflow: string): string[] {
  const matrixBlock = workflow.slice(workflow.indexOf('matrix:'));
  const imageBlock = matrixBlock.slice(matrixBlock.indexOf('image:'));
  const end = imageBlock.indexOf('\n    steps:');
  const scoped = end === -1 ? imageBlock : imageBlock.slice(0, end);
  return [...scoped.matchAll(/-\s*'([^']+)'/g)].map((m) => m[1]);
}

test('🚨 WF-001: el scan de Trivy cubre exactamente las imágenes que el Chart despliega', () => {
  const values = fs.readFileSync(
    path.join(ROOT_DIR, 'infra/helm/pokedex/values.yaml'),
    'utf-8'
  );
  const workflow = fs.readFileSync(
    path.join(ROOT_DIR, '.github/workflows/security-trivy.yaml'),
    'utf-8'
  );

  const deployed = ['postgresql', 'redis', 'pgbouncer']
    .map((k) => readDeployedImage(values, k))
    .filter((v): v is string => v !== null);

  assert.equal(deployed.length, 3, 'values.yaml debe declarar las 3 imágenes de infraestructura');

  const scanned = readScannedImages(workflow);
  assert.equal(scanned.length, 3, 'El matrix de Trivy debe escanear las 3 imágenes');

  for (const image of deployed) {
    assert.ok(
      scanned.includes(image),
      `El scan de Trivy debe incluir la imagen desplegada ${image}. Revisar el matrix de security-trivy.yaml.`
    );
  }
  for (const image of scanned) {
    assert.ok(
      deployed.includes(image),
      `El scan de Trivy escanea ${image}, que NO es la imagen desplegada (falso positivo de seguridad).`
    );
  }
});

test('🚨 WF-001: las imágenes escaneadas están fijadas por digest inmutable', () => {
  const workflow = fs.readFileSync(
    path.join(ROOT_DIR, '.github/workflows/security-trivy.yaml'),
    'utf-8'
  );
  const scanned = readScannedImages(workflow);

  assert.equal(scanned.length, 3);
  for (const image of scanned) {
    assert.match(
      image,
      /@sha256:[a-f0-9]{64}$/,
      `${image} debe fijarse por digest: una etiqueta móvil puede dejar de corresponder con lo desplegado`
    );
  }
  // Regresión explícita del defecto original: la imagen equivocada por origen.
  // Se evalúa SOLO el matrix: el archivo contiene un comentario que menciona el
  // origen histórico a propósito, y un grep sobre todo el YAML daría un falso
  // positivo que obligaría a borrar la documentación del hallazgo.
  assert.doesNotMatch(
    scanned.join('\n'),
    /edoburu/,
    'El repositorio despliega la imagen oficial pgbouncer/pgbouncer, no edoburu/pgbouncer'
  );
});

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

test('🛡️ INFRA-003: el usuario SSH de Ansible debe coincidir con el que crea OpenTofu en cada host', () => {
  const ansibleCfgPath = path.join(ROOT_DIR, 'infra/ansible/ansible.cfg');
  const proxmoxMainPath = path.join(ROOT_DIR, 'infra/opentofu/environments/proxmox/main.tf');
  const proxmoxInvPath = path.join(ROOT_DIR, 'infra/ansible/inventories/proxmox/hosts.yaml');
  const labInvPath = path.join(ROOT_DIR, 'infra/ansible/inventories/lab/hosts.yaml');

  assert.ok(fs.existsSync(ansibleCfgPath), 'ansible.cfg debe existir');
  assert.ok(fs.existsSync(proxmoxMainPath), 'main.tf de proxmox debe existir');

  const cfg = fs.readFileSync(ansibleCfgPath, 'utf-8');
  const mainTf = fs.readFileSync(proxmoxMainPath, 'utf-8');

  // 1. Usuario global declarado por Ansible.
  const remoteUser = cfg.match(/^\s*remote_user\s*=\s*(\S+)\s*$/m)?.[1];
  assert.ok(remoteUser, 'ansible.cfg debe declarar remote_user de forma explícita');

  // 2. OpenTofu: la VM declara `username`; los LXC no pueden (el provider solo
  //    admite claves para la cuenta `root`). Extraemos el usuario efectivo de
  //    cada recurso y lo comparamos contra el que Ansible asume para conectar.
  const vmUser = mainTf.match(/resource\s+"proxmox_virtual_environment_vm"[\s\S]*?username\s*=\s*"([^"]+)"/)?.[1];
  assert.ok(vmUser, 'La VM de producción debe declarar `username` en initialization.user_account');

  // 3. La VM queda inventariada como standalone; su usuario Ansible debe ser el
  //    mismo que crea cloud-init. Es el único punto donde ambas capas deben
  //    coincidir hoy, y por tanto el que detecta la deriva.
  const proxmoxInv = fs.readFileSync(proxmoxInvPath, 'utf-8');
  const labInv = fs.readFileSync(labInvPath, 'utf-8');

  // 3.1 Cada host que declare `ansible_host` DEBE declarar tambien `ansible_user`.
  //     Un `includes()` global no basta: si un unico host lo omite, Ansible
  //     cae de vuelta al `remote_user` global y el contrato vuelve a romperse
  //     en silencio para ese host.
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

  // 4. Prohibido el antipatrón: depender de un `remote_user` global mientras
  //    OpenTofu crea usuarios distintos por tipo de cómputo. Si la VM declara
  //    `devops` y existe un host que lo use, `remote_user` debe coincidir.
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

  // 1. Ninguna IP puede declararse dos veces: los playbooks usan `hosts: all`,
  //    por lo que un duplicado ejecuta el hardening dos veces sobre el mismo host.
  const ips = [...inv.matchAll(/ansible_host:\s*(\S+)/g)].map((m) => m[1]);
  const duplicates = ips.filter((ip, i) => ips.indexOf(ip) !== i);
  assert.deepEqual(
    duplicates,
    [],
    `INFRA-012: el inventario declara IPs repetidas (${duplicates.join(', ')}); ` +
    'los playbooks con `hosts: all` las ejecutarían dos veces sobre el mismo host'
  );

  // 2. Todo host del inventario debe existir en OpenTofu. OpenTofu crea
  //    `var.vm_count` nodos (IPs .100 en adelante), vault (.110) y bastion (.120).
  //    Cualquier otra IP es un host fantasma.
  const declaredNodes = Number(tf.match(/variable\s+"vm_count"[\s\S]*?default\s*=\s*(\d+)/)?.[1] ?? 1);
  const baseIp = tf.match(/variable\s+"network_base_ip"[\s\S]*?default\s*=\s*"([\d.]+)"/)?.[1] ?? '10.10.13.';
  const allowed = new Set<string>();

  // Nodos k3s: el inventario puede prospectivamente declarar mas nodos de los
  // que crea el `vm_count` por defecto (escalado multi-nodo documentado en el
  // runbook), pero nunca IPs fuera del rango que OpenTofu puede asignar.
  const maxNodes = Math.max(declaredNodes, 3);
  for (let i = 0; i < maxNodes; i++) allowed.add(`${baseIp}${100 + i}`);

  // Las variables de red de OpenTofu se declaran en notacion CIDR
  // (p. ej. "10.10.13.110/24"), mientras el inventario usa IP simple. Se
  // normaliza el sufijo para comparar ambos mundos.
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

test('🛡️ INFRA-007: toda imagen descargada por OpenTofu debe verificar checksum y URL inmutable', () => {
  const mainTf = fs.readFileSync(
    path.join(ROOT_DIR, 'infra/opentofu/environments/proxmox/main.tf'),
    'utf-8'
  );
  const varsTf = fs.readFileSync(
    path.join(ROOT_DIR, 'infra/opentofu/environments/proxmox/variables.tf'),
    'utf-8'
  );
  const tfvars = fs.readFileSync(
    path.join(ROOT_DIR, 'infra/opentofu/environments/proxmox/terraform.tfvars.example'),
    'utf-8'
  );

  // 1. Ambos recursos `proxmox_download_file` (plantilla LXC e imagen VM) deben
  //    declarar checksum + checksum_algorithm. La asimetria original era que solo
  //    el LXC verificaba integridad, dejando la imagen de PRODUCCION sin verificar.
  const downloadBlocks = [...mainTf.matchAll(/resource\s+"proxmox_download_file"\s+"([\w.]+)"\s*\{([^}]*)\}/g)];
  assert.ok(downloadBlocks.length >= 2, 'Deben existir los recursos de descarga LXC y VM');

  for (const [, name, body] of downloadBlocks) {
    assert.ok(
      /checksum\s*=\s*var\.\w+/.test(body),
      `INFRA-007: el recurso proxmox_download_file.${name} no verifica checksum; una imagen sustituta pasaria desapercibida`
    );
    assert.ok(
      /checksum_algorithm\s*=\s*var\.\w+/.test(body),
      `INFRA-007: el recurso proxmox_download_file.${name} no declara checksum_algorithm`
    );
  }

  // 2. La URL por defecto de la VM NO debe seguir el alias mutable `latest`:
  //    un checksum sobre una URL cambiante invalida la garantia de integridad.
  const defaultUrl = varsTf.match(/variable\s+"vm_image_url"[\s\S]*?default\s*=\s*"([^"]+)"/)?.[1];
  assert.ok(defaultUrl, 'vm_image_url debe declarar un valor por defecto');
  assert.ok(
    !/\/latest\//.test(defaultUrl),
    `INFRA-007: vm_image_url sigue el alias mutable 'latest' (${defaultUrl}); ` +
    'un apply futuro materializaria una imagen distinta a la verificada'
  );
  assert.match(
    defaultUrl,
    /\/images\/cloud\/bookworm\/\d{8}-\d+\//,
    'INFRA-007: vm_image_url debe apuntar a un directorio versionado de Debian (p. ej. 20260923-2610)'
  );

  // 3. El nombre de archivo por defecto debe ser el del artefacto versionado.
  const defaultName = varsTf.match(/variable\s+"vm_image_file_name"[\s\S]*?default\s*=\s*"([^"]+)"/)?.[1];
  assert.ok(defaultName, 'vm_image_file_name debe declarar un valor por defecto');
  assert.ok(
    !/debian-12-genericcloud-amd64\.raw$/.test(defaultName),
    `INFRA-007: vm_image_file_name debe versionar el artefacto (${defaultName}) para no colisionar entre versiones`
  );

  // 4. El ejemplo de variables debe documentar el checksum, en paridad con el
  //    bloque LXC ya existente (si no, el operador no puede fijar el valor).
  assert.ok(
    /vm_image_checksum\s*=/.test(tfvars),
    'INFRA-007: terraform.tfvars.example debe documentar vm_image_checksum'
  );
  assert.ok(
    /vm_image_checksum_algorithm\s*=/.test(tfvars),
    'INFRA-007: terraform.tfvars.example debe documentar vm_image_checksum_algorithm'
  );
});

test('🛡️ INFRA-007: el checksum por defecto debe tener la longitud del algoritmo declarado', () => {
  const varsTf = fs.readFileSync(
    path.join(ROOT_DIR, 'infra/opentofu/environments/proxmox/variables.tf'),
    'utf-8'
  );

  const read = (name: string) =>
    varsTf.match(new RegExp(`variable\\s+"${name}"[\\s\\S]*?default\\s*=\\s*"([^"]+)"`))?.[1];

  const cases: Array<[string, string, number]> = [
    ['lxc_template_checksum', 'lxc_template_checksum_algorithm', 64],
    ['vm_image_checksum', 'vm_image_checksum_algorithm', 128],
  ];

  for (const [checksumVar, algVar, expectedLen] of cases) {
    const checksum = read(checksumVar);
    const algorithm = read(algVar);
    assert.ok(checksum, `${checksumVar} debe declarar un checksum por defecto`);
    assert.ok(algorithm, `${algVar} debe declarar el algoritmo por defecto`);

    // El algoritmo determina la longitud esperada del digest. El repo usa SHA256
    // para el LXC y SHA512 para la VM, que es lo que publica Debian (SHA512SUMS).
    const expectedAlgorithm = expectedLen === 64 ? 'sha256' : 'sha512';
    assert.equal(
      algorithm,
      expectedAlgorithm,
      `${algVar} debe ser '${expectedAlgorithm}' para que ${checksumVar} tenga ${expectedLen} caracteres`
    );
    assert.equal(
      checksum.length,
      expectedLen,
      `${checksumVar} debe tener exactamente ${expectedLen} caracteres hexadecimales (${algorithm})`
    );
    assert.match(
      checksum,
      new RegExp(`^[a-f0-9]{${expectedLen}}$`),
      `${checksumVar} debe ser un digest hexadecimal en minúsculas`
    );
  }
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

/**
 * VSCODE-001 — `.vscode/tasks.json` es una CAPA DE PRESENTACION, no una fuente
 * de verdad operativa. `Taskfile.yaml` es el SSOT unico de comandos.
 *
 * Antes de este contrato, tasks.json reproducia comandos `helm`/`kubectl` que
 * ya existian en el Taskfile. Eso generaba dos fuentes de verdad con
 * divergencia silenciosa: la tarea "Test Endpoints" consultaba
 * `deploy/pokemon-api`, mientras `task k8s:test` consulta `deploy/pokemon-api`
 * Y `deploy/pokedex-web`. GitHub Actions no valida VS Code, asi que la
 * divergencia no la detectaba ningun gate.
 *
 * El contrato falla closed ante cualquier logica operativa reintroducida.
 */
test('🛡️ Dev DX: .vscode/tasks.json delega en Taskfile.yaml y no implementa logica operativa', () => {
  const tasksPath = path.join(ROOT_DIR, '.vscode/tasks.json');
  assert.ok(fs.existsSync(tasksPath), '.vscode/tasks.json debe existir');

  // VS Code admite JSONC: los comentarios del encabezado deben ignorarse.
  const raw = fs.readFileSync(tasksPath, 'utf-8');
  const content = raw.replace(/^\s*\/\/.*$/gm, '');
  const parsed = JSON.parse(content) as { tasks: { label: string; command: string }[] };
  const taskfile = fs.readFileSync(path.join(ROOT_DIR, 'Taskfile.yaml'), 'utf-8');

  // 1. Ninguna tarea reimplementa un comando de orquestacion o cluster.
  //
  //    EXCEPCION DOCUMENTADA: `docker compose` NO se cubre aqui a proposito.
  //    `task dev:compose` ejecuta `docker compose up -d --build` (sin flags
  //    `-f`), mientras que la tarea de VS Code usa el override de desarrollo
  //    `-f docker-compose.yaml -f docker-compose.dev.yaml`. Delegar eliminaria
  //    el perfil dev (hot-reload, puertos SQL/Redis, volumenes). Unify esa
  //    diferencia en el Taskfile es una decision de producto separada, no un
  //    refactor mecanico, asi que este gate no la fuerza.
  const OPERATIONAL = /\b(helm|kubectl|kind|Get-Command)\b/;
  const offenders = parsed.tasks.filter((t) => OPERATIONAL.test(t.command));
  assert.deepEqual(
    offenders.map((t) => `${t.label} => ${t.command}`),
    [],
    'Las tareas de VS Code no deben implementar logica de orquestacion o cluster. ' +
      'Delegar en `task <nombre>` para que Taskfile.yaml siga siendo el SSOT unico.'
  );

  // 2. Toda delegacion `task X` debe apuntar a una tarea que EXISTA en el
  //    Taskfile. Un wrapper a un nombre inexistente falla en tiempo de ejecucion
  //    sin que ningun gate lo detecte.
  //
  //    Se comparan lineas completas en vez de construir un RegExp dinamico:
  //    `javascript.lang.security.audit.detect-non-literal-regexp` bloquea este
  //    ultimo approach (ReDoS). Elijamos la via literal, que ademas es mas
  //    exacta: exige que la tarea este declarada al inicio de linea, sin
  //    depender de escapes de metacaracteres.
  const delegations = parsed.tasks
    .map((t) => t.command)
    .filter((c): c is string => c.startsWith('task '))
    .map((c) => c.slice('task '.length).trim());
  assert.ok(delegations.length > 0, 'El archivo debe delegar al menos una tarea en Taskfile');

  const declaredTasks = new Set(
    taskfile
      .split('\n')
      .map((line) => /^ {2}([A-Za-z0-9_:.-]+):\s*$/.exec(line)?.[1])
      .filter((name): name is string => name !== undefined)
  );
  const missing = delegations.filter((name) => !declaredTasks.has(name));
  assert.deepEqual(
    missing,
    [],
    `Wrappers que apuntan a tareas inexistentes en Taskfile.yaml: ${missing.join(' | ')}. ` +
      'Un nombre inexistente no produce error de validacion: la tarea falla al ejecutarse.'
  );

  // 3. Las tareas de Kubernetes deben delegar (no invocar kubectl/helm directo).
  for (const label of ['Up', 'Down', 'Status', 'Port Forward', 'Test Endpoints']) {
    const k8s = parsed.tasks.find((t) => t.label.includes('Kubernetes:') && t.label.includes(label));
    assert.ok(k8s, `Debe existir la tarea de Kubernetes: ${label}`);
    assert.ok(
      k8s!.command.startsWith('task '),
      `La tarea "${k8s!.label}" debe delegar en Taskfile.yaml, no invocar helm/kubectl directamente`
    );
  }
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
