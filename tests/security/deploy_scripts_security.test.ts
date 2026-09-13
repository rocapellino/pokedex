/**
 * ==============================================================================
 * Test de Seguridad Estática para Scripts de Despliegue y Configuración de Infra
 * ==============================================================================
 * Valida de forma automatizada que:
 * 1. Los scripts de empaquetado (tar/rsync/ansible) excluyan obligatoriamente .env y .env.*
 * 2. La lista canónica scripts/deploy_excludes.txt contenga reglas contra fuga de secretos.
 * 3. OpenTofu no contenga claves públicas SSH con defaults hardcodeados.
 * 4. Nginx no exponga endpoints administrativos o métricas a rangos masivos RFC 1918.
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
  const baselinePath = path.join(ROOT_DIR, 'infra/ansible/playbooks/host_baseline.yml');
  assert.ok(fs.existsSync(baselinePath), 'host_baseline.yml debe existir');
  const baseContent = fs.readFileSync(baselinePath, 'utf-8');
  const roleBaseOs = path.join(ROOT_DIR, 'infra/ansible/roles/base_os/tasks/main.yml');
  const roleRuntime = path.join(ROOT_DIR, 'infra/ansible/roles/container_runtime/tasks/main.yml');
  const combinedContent = baseContent + 
    (fs.existsSync(roleBaseOs) ? fs.readFileSync(roleBaseOs, 'utf-8') : '') +
    (fs.existsSync(roleRuntime) ? fs.readFileSync(roleRuntime, 'utf-8') : '');

  assert.ok(combinedContent.includes('ufw'), 'host_baseline y sus roles deben configurar firewall ufw');
  assert.ok(!combinedContent.includes('ignore_errors: true'), 'host_baseline y sus roles no deben ocultar fallos con ignore_errors: true');
  assert.ok(combinedContent.includes('docker info'), 'host_baseline y sus roles deben verificar el funcionamiento de Docker');
  assert.ok(combinedContent.includes('install_docker'), 'host_baseline y sus roles deben permitir condicionar el runtime de contenedores');

  const setupNodesPath = path.join(ROOT_DIR, 'infra/ansible/playbooks/setup_nodes.yml');
  if (fs.existsSync(setupNodesPath)) {
    const setupContent = fs.readFileSync(setupNodesPath, 'utf-8');
    assert.ok(!setupContent.includes('ignore_errors: true'), 'setup_nodes.yml no debe ocultar fallos con ignore_errors: true');
    assert.ok(setupContent.includes('docker info') || combinedContent.includes('docker info'), 'setup_nodes.yml y roles deben verificar Docker');
  }
});

test('🛡️ Deploy Security: Playbooks legacy de Compose y docker-compose.prod.yml retirados de producción', () => {
  const legacyFiles = [
    'docker-compose.prod.yml',
    'infra/ansible/playbooks/deploy_proxmox.yml',
    'infra/ansible/playbooks/deploy_app.yml'
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
  assert.ok(content.includes('host_baseline.yml'), 'Debe referenciar host_baseline.yml');
  assert.ok(content.includes('app-proxmox.yaml'), 'Debe referenciar app-proxmox.yaml para GitOps');
  assert.ok(content.includes('ArgoCD'), 'Debe referenciar ArgoCD');
  assert.ok(!content.includes('docker-compose.prod.yml'), 'No debe referenciar docker-compose.prod.yml');
  assert.ok(!content.includes('deploy_proxmox.yml'), 'No debe referenciar deploy_proxmox.yml');
});

test('🛡️ Disaster Recovery Tooling: Taskfile.yml define tarea dr:verify para simulación no destructiva', () => {
  const taskfilePath = path.join(ROOT_DIR, 'Taskfile.yml');
  const content = fs.readFileSync(taskfilePath, 'utf-8');
  assert.ok(content.includes('dr:verify:'), 'Taskfile.yml debe definir tarea dr:verify');
  assert.ok(content.includes('dr_verify_restore.sh --dry-run'), 'dr:verify debe invocar dr_verify_restore.sh --dry-run');
});

test('🛡️ Nginx Security: apps/frontend/nginx.conf no contiene allowlists masivas RFC 1918 en /metrics ni /admin', () => {
  const filePath = path.join(ROOT_DIR, 'apps/frontend/nginx.conf');
  assert.ok(fs.existsSync(filePath), 'nginx.conf debe existir');
  const content = fs.readFileSync(filePath, 'utf-8');
  
  // No debe contener rangos /8 ni /12 globales en allow
  assert.ok(!content.includes('allow 10.0.0.0/8;'), 'nginx.conf no debe permitir 10.0.0.0/8 indiscriminado');
  assert.ok(!content.includes('allow 172.16.0.0/12;'), 'nginx.conf no debe permitir 172.16.0.0/12 indiscriminado');
  assert.ok(!content.includes('allow 192.168.0.0/16;'), 'nginx.conf no debe permitir 192.168.0.0/16 indiscriminado');
});

test('🛡️ Nginx Security: CSP en nginx.conf y nginx.conf.template no permite unsafe-inline en style-src', () => {
  const confFiles = ['apps/frontend/nginx.conf', 'apps/frontend/nginx.conf.template'];
  for (const relPath of confFiles) {
    const filePath = path.join(ROOT_DIR, relPath);
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf-8');
    assert.ok(!content.includes("style-src 'self' 'unsafe-inline'"), `${relPath} no debe contener unsafe-inline en style-src`);
    assert.ok(content.includes("style-src 'self' https://fonts.googleapis.com;"), `${relPath} debe definir style-src estricto`);
    assert.ok(content.includes("base-uri 'self';"), `${relPath} debe contener base-uri 'self'`);
    assert.ok(content.includes("form-action 'self';"), `${relPath} debe contener form-action 'self'`);
    assert.ok(content.includes("Permissions-Policy"), `${relPath} debe incluir Permissions-Policy`);
  }
});

test('🛡️ Helm Security: NetworkPolicies de PostgreSQL y Redis implementan Zero-Trust Egress (default-deny)', () => {
  const npPath = path.join(ROOT_DIR, 'infra/helm/pokedex/templates/network-policies.yaml');
  assert.ok(fs.existsSync(npPath), 'network-policies.yaml debe existir');
  const content = fs.readFileSync(npPath, 'utf-8');

  // Asegurar que PostgreSQL y Redis declaran Egress en policyTypes y tienen default-deny egress: []
  assert.ok(content.includes('allow-postgres-ingress'), 'Debe definir allow-postgres-ingress');
  assert.ok(content.includes('allow-redis-ingress'), 'Debe definir allow-redis-ingress');
  
  // Ambas deben incluir Egress en policyTypes
  const postgresSection = content.split('allow-postgres-ingress')[1]?.split('---')[0] || '';
  assert.ok(postgresSection.includes('- Egress'), 'PostgreSQL NetworkPolicy debe incluir Egress en policyTypes');
  assert.ok(postgresSection.includes('egress: []'), 'PostgreSQL NetworkPolicy debe definir egress: [] (aislamiento total de salida)');

  const redisSection = content.split('allow-redis-ingress')[1] || '';
  assert.ok(redisSection.includes('- Egress'), 'Redis NetworkPolicy debe incluir Egress en policyTypes');
  assert.ok(redisSection.includes('egress: []'), 'Redis NetworkPolicy debe definir egress: [] (aislamiento total de salida)');
});

test('🛡️ Ansible Security: security_hardening.yml restringe SSH (22) y puertos K8s/etcd con subredes (src)', () => {
  const playbookPath = path.join(ROOT_DIR, 'infra/ansible/playbooks/security_hardening.yml');
  assert.ok(fs.existsSync(playbookPath), 'security_hardening.yml debe existir');
  const roleFirewall = path.join(ROOT_DIR, 'infra/ansible/roles/firewall/tasks/main.yml');
  const content = fs.readFileSync(playbookPath, 'utf-8') + 
    (fs.existsSync(roleFirewall) ? fs.readFileSync(roleFirewall, 'utf-8') : '');

  // SSH no debe estar abierto a any sin src
  assert.ok(content.includes('src: "{{ mgmt_network }}"'), 'Regla SSH (22) debe restringir el origen a la red de administración');

  // Puertos Kubernetes deben estar restringidos al CIDR del clúster
  assert.ok(content.includes('src: "{{ k8s_network }}"'), 'Puertos K8s y etcd deben restringir origen a la red del clúster');
  assert.ok(content.includes('6443'), 'Debe incluir puerto 6443 (API Server)');
  assert.ok(content.includes('10250'), 'Debe incluir puerto 10250 (Kubelet)');
  assert.ok(content.includes('2379:2380'), 'Debe incluir puerto 2379:2380 (etcd)');

  // hosts.ini debe proveer los defaults de red
  const hostsPath = path.join(ROOT_DIR, 'infra/ansible/inventory/hosts.ini');
  assert.ok(fs.existsSync(hostsPath), 'hosts.ini debe existir');
  const hostsContent = fs.readFileSync(hostsPath, 'utf-8');
  assert.ok(hostsContent.includes('mgmt_cidr='), 'hosts.ini debe definir mgmt_cidr');
  assert.ok(hostsContent.includes('k8s_cluster_cidr='), 'hosts.ini debe definir k8s_cluster_cidr');
});

test('🛡️ Helm Security: CiliumNetworkPolicy implementa aislamiento L7 FQDN con allowlist estricta', () => {
  const ciliumNpPath = path.join(ROOT_DIR, 'infra/helm/pokedex/templates/cilium-network-policies.yaml');
  assert.ok(fs.existsSync(ciliumNpPath), 'cilium-network-policies.yaml debe existir');
  const content = fs.readFileSync(ciliumNpPath, 'utf-8');

  assert.ok(content.includes('cilium.io/v2'), 'Debe utilizar la API cilium.io/v2');
  assert.ok(content.includes('kind: CiliumNetworkPolicy'), 'Debe definir un recurso CiliumNetworkPolicy');
  assert.ok(content.includes('toFQDNs:'), 'Debe definir reglas de salida L7 toFQDNs');

  const templateLines = content.split(/\r?\n/).map(line => line.trim());
  assert.ok(
    templateLines.some(line => line.includes('matchName') && line.includes('generativelanguage')),
    'Debe incluir en la allowlist a Google Gemini API'
  );
  assert.ok(
    templateLines.some(line => line.includes('matchPattern') && line.includes('githubusercontent')),
    'Debe incluir en la allowlist el dominio de assets de GitHub'
  );
  assert.ok(
    templateLines.some(line => line.includes('matchPattern') && line.includes('pokeapi')),
    'Debe incluir en la allowlist el dominio de PokeAPI'
  );
  assert.ok(content.includes('k8s-app: kube-dns'), 'Debe permitir resolución DNS interna hacia CoreDNS');
});

test('🛡️ Helm Security: Egress Gateway (Envoy) implementa forward proxy seguro y NetworkPolicy perimetral', () => {
  const egPath = path.join(ROOT_DIR, 'infra/helm/pokedex/templates/egress-gateway.yaml');
  assert.ok(fs.existsSync(egPath), 'egress-gateway.yaml debe existir');
  const content = fs.readFileSync(egPath, 'utf-8');

  // Verificar despliegue endurecido de Envoy
  assert.ok(content.includes('app.kubernetes.io/component: egress-gateway'), 'Debe etiquetar los componentes como egress-gateway');
  assert.ok(content.includes('runAsNonRoot: true'), 'El contenedor de Egress Gateway debe correr como no root');
  assert.ok(content.includes('readOnlyRootFilesystem: true'), 'El contenedor debe tener sistema de archivos de solo lectura');
  assert.ok(content.includes('- ALL'), 'Debe descartar todas las capacidades del kernel');

  // Verificar NetworkPolicy perimetral del Gateway con Anti-SSRF
  assert.ok(content.includes('169.254.169.254/32'), 'NetworkPolicy del Gateway debe bloquear IMDS Cloud Metadata');
  assert.ok(content.includes('10.0.0.0/8'), 'NetworkPolicy del Gateway debe bloquear RFC1918 Clase A');
  assert.ok(content.includes('172.16.0.0/12'), 'NetworkPolicy del Gateway debe bloquear RFC1918 Clase B');
  assert.ok(content.includes('192.168.0.0/16'), 'NetworkPolicy del Gateway debe bloquear RFC1918 Clase C');
});

test('🛡️ Helm Security: network-policies.yaml soporta enrutamiento exclusivo por Egress Gateway', () => {
  const npPath = path.join(ROOT_DIR, 'infra/helm/pokedex/templates/network-policies.yaml');
  const content = fs.readFileSync(npPath, 'utf-8');

  assert.ok(content.includes('useEgressGateway'), 'Debe incluir condicional para useEgressGateway');
  assert.ok(content.includes('app.kubernetes.io/component: egress-gateway'), 'Debe dirigir el tráfico hacia egress-gateway cuando useEgressGateway está activo');
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

test('🛡️ Dev DX: Taskfile.yml define perfil rápido (dev:compose) y perfil Kubernetes (dev:k8s:*)', () => {
  const taskfilePath = path.join(ROOT_DIR, 'Taskfile.yml');
  assert.ok(fs.existsSync(taskfilePath), 'Taskfile.yml debe existir');
  const content = fs.readFileSync(taskfilePath, 'utf-8');

  assert.ok(content.includes('dev:compose:'), 'Taskfile debe definir tarea dev:compose');
  assert.ok(content.includes('dev:k8s:up:'), 'Taskfile debe definir tarea dev:k8s:up');
  assert.ok(content.includes('dev:k8s:down:'), 'Taskfile debe definir tarea dev:k8s:down');
  assert.ok(content.includes('dev:k8s:status:'), 'Taskfile debe definir tarea dev:k8s:status');
});

test('🛡️ Helm Security: PostgreSQL y PgBouncer configuran readOnlyRootFilesystem y montajes emptyDir', () => {
  const pgPath = path.join(ROOT_DIR, 'infra/helm/pokedex/templates/postgres-statefulset.yaml');
  const pgbouncerPath = path.join(ROOT_DIR, 'infra/helm/pokedex/templates/pgbouncer-deployment.yaml');

  assert.ok(fs.existsSync(pgPath), 'postgres-statefulset.yaml debe existir');
  assert.ok(fs.existsSync(pgbouncerPath), 'pgbouncer-deployment.yaml debe existir');

  const pgContent = fs.readFileSync(pgPath, 'utf-8');
  assert.ok(pgContent.includes('readOnlyRootFilesystem: true'), 'PostgreSQL debe tener readOnlyRootFilesystem: true');
  assert.ok(pgContent.includes('mountPath: /tmp'), 'PostgreSQL debe montar /tmp');
  assert.ok(pgContent.includes('mountPath: /var/run/postgresql'), 'PostgreSQL debe montar /var/run/postgresql');

  const pgbContent = fs.readFileSync(pgbouncerPath, 'utf-8');
  assert.ok(pgbContent.includes('readOnlyRootFilesystem: true'), 'PgBouncer debe tener readOnlyRootFilesystem: true');
  assert.ok(pgbContent.includes('mountPath: /tmp'), 'PgBouncer debe montar /tmp');
});

test('🛡️ Helm Security: Workloads K8s deshabilitan automountServiceAccountToken (Least Privilege)', () => {
  const workloads = [
    'infra/helm/pokedex/templates/seed-job.yaml',
    'infra/helm/pokedex/templates/backup-cronjob.yaml',
    'infra/helm/pokedex/templates/egress-gateway.yaml',
    'infra/helm/pokedex/templates/api-deployment.yaml',
    'infra/helm/pokedex/templates/web-deployment.yaml',
    'infra/helm/pokedex/templates/postgres-statefulset.yaml',
    'infra/helm/pokedex/templates/redis-deployment.yaml',
    'infra/helm/pokedex/templates/pgbouncer-deployment.yaml',
  ];

  for (const relPath of workloads) {
    const fullPath = path.join(ROOT_DIR, relPath);
    assert.ok(fs.existsSync(fullPath), `${relPath} debe existir`);
    const content = fs.readFileSync(fullPath, 'utf-8');
    assert.ok(
      content.includes('automountServiceAccountToken: false'),
      `${relPath} debe declarar explícitamente automountServiceAccountToken: false`
    );
  }
});

test('🛡️ Helm Security: seed-job.yaml declara requests y limits de ephemeral-storage', () => {
  const seedPath = path.join(ROOT_DIR, 'infra/helm/pokedex/templates/seed-job.yaml');
  assert.ok(fs.existsSync(seedPath), 'seed-job.yaml debe existir');
  const content = fs.readFileSync(seedPath, 'utf-8');
  assert.ok(content.includes('ephemeral-storage: 50Mi'), 'seed-job debe declarar request de ephemeral-storage');
  assert.ok(content.includes('ephemeral-storage: 256Mi'), 'seed-job debe declarar limit de ephemeral-storage');
});

test('🛡️ CI SAST Security: ci.yml ejecuta Semgrep sobre scripts privilegiados (sin --exclude scripts)', () => {
  const ciPath = path.join(ROOT_DIR, '.github/workflows/ci.yml');
  assert.ok(fs.existsSync(ciPath), 'ci.yml debe existir');
  const content = fs.readFileSync(ciPath, 'utf-8');
  assert.equal(
    content.includes('--exclude scripts'),
    false,
    '.github/workflows/ci.yml no debe excluir scripts del análisis SAST de Semgrep'
  );
});

test('🛡️ Nginx Security: nginx.conf y template inyectan Cross-Origin-Opener-Policy y Cross-Origin-Resource-Policy', () => {
  const confFiles = [
    'apps/frontend/nginx.conf',
    'apps/frontend/nginx.conf.template',
  ];

  for (const relPath of confFiles) {
    const fullPath = path.join(ROOT_DIR, relPath);
    assert.ok(fs.existsSync(fullPath), `${relPath} debe existir`);
    const content = fs.readFileSync(fullPath, 'utf-8');
    assert.ok(
      content.includes('Cross-Origin-Opener-Policy "same-origin" always'),
      `${relPath} debe configurar Cross-Origin-Opener-Policy`
    );
    assert.ok(
      content.includes('Cross-Origin-Resource-Policy "same-origin" always'),
      `${relPath} debe configurar Cross-Origin-Resource-Policy`
    );
  }
});

test('🛡️ K8s Quality & High Availability: api y web deployments implementan topologySpreadConstraints', () => {
  const deployments = [
    'infra/helm/pokedex/templates/api-deployment.yaml',
    'infra/helm/pokedex/templates/web-deployment.yaml',
  ];

  for (const relPath of deployments) {
    const fullPath = path.join(ROOT_DIR, relPath);
    assert.ok(fs.existsSync(fullPath), `${relPath} debe existir`);
    const content = fs.readFileSync(fullPath, 'utf-8');
    assert.ok(
      content.includes('topologySpreadConstraints:'),
      `${relPath} debe soportar topologySpreadConstraints para alta disponibilidad`
    );
  }

  const prodValuesPath = path.join(ROOT_DIR, 'infra/helm/pokedex/values.prod.yaml');
  const prodContent = fs.readFileSync(prodValuesPath, 'utf-8');
  assert.ok(
    prodContent.includes('topologySpreadConstraints:'),
    'values.prod.yaml debe configurar topologySpreadConstraints'
  );
  assert.ok(
    !prodContent.includes('tag: "latest"'),
    'values.prod.yaml no debe utilizar el tag :latest en producción'
  );
});

test('🛡️ K8s Quality Gates: infra.yml integra kubeconform, kube-linter y kyverno test', () => {
  const workflowPath = path.join(ROOT_DIR, '.github/workflows/infra.yml');
  assert.ok(fs.existsSync(workflowPath), 'infra.yml debe existir');
  const content = fs.readFileSync(workflowPath, 'utf-8');

  assert.ok(content.includes('kubeconform'), 'infra.yml debe ejecutar kubeconform para esquemas K8s');
  assert.ok(content.includes('kube-linter'), 'infra.yml debe ejecutar kube-linter para mejores prácticas');
  assert.ok(content.includes('kyverno test'), 'infra.yml debe ejecutar kyverno test para políticas de admisión');
  assert.ok(content.includes('image:.*:latest'), 'infra.yml debe validar y prohibir :latest en producción');

  const kubeLinterConfig = path.join(ROOT_DIR, '.kube-linter.yaml');
  assert.ok(fs.existsSync(kubeLinterConfig), '.kube-linter.yaml debe existir');

  const kyvernoPolicy = path.join(ROOT_DIR, 'infra/k8s/policies/disallow-latest-tag.yaml');
  assert.ok(fs.existsSync(kyvernoPolicy), 'disallow-latest-tag.yaml debe existir');

  const kyvernoTest = path.join(ROOT_DIR, 'infra/k8s/kyverno-test/kyverno-test.yaml');
  assert.ok(fs.existsSync(kyvernoTest), 'kyverno-test.yaml debe existir');
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
    const roleTask = path.join(ROOT_DIR, `infra/ansible/roles/${role}/tasks/main.yml`);
    assert.ok(fs.existsSync(roleTask), `Role task ${role}/tasks/main.yml debe existir`);
  }

  // Hardening de permisos en kubernetes_prerequisites
  const k8sPrereqsContent = fs.readFileSync(
    path.join(ROOT_DIR, 'infra/ansible/roles/kubernetes_prerequisites/tasks/main.yml'),
    'utf-8'
  );
  assert.ok(
    k8sPrereqsContent.includes("mode: '0600'"),
    'kubernetes_prerequisites debe configurar permisos restrictivos 0600 en /etc/modules-load.d/k8s.conf'
  );

  // Inventarios y playbooks Ansible
  assert.ok(fs.existsSync(path.join(ROOT_DIR, 'infra/ansible/inventories/proxmox/hosts.yml')), 'Inventario Proxmox YAML debe existir');
  assert.ok(fs.existsSync(path.join(ROOT_DIR, 'infra/ansible/inventories/lab/hosts.yml')), 'Inventario Lab YAML debe existir');
  assert.ok(fs.existsSync(path.join(ROOT_DIR, 'infra/ansible/playbooks/prepare_hosts.yml')), 'prepare_hosts.yml debe existir');
  assert.ok(fs.existsSync(path.join(ROOT_DIR, 'infra/ansible/playbooks/validate_hosts.yml')), 'validate_hosts.yml debe existir');
  assert.ok(fs.existsSync(path.join(ROOT_DIR, 'infra/ansible/requirements.yml')), 'requirements.yml debe existir');
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

  const infraWorkflow = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/infra.yml'), 'utf-8');
  assert.ok(
    infraWorkflow.includes('--only-binary :all:'),
    'infra.yml debe ejecutar pip install con --only-binary :all: para mitigar scripts de setup no confiables'
  );
  assert.match(
    infraWorkflow,
    /ansible-core==\d+\.\d+\.\d+/,
    'infra.yml debe fijar la versión exacta de ansible-core'
  );
});

test('🛡️ Dev DX & Resiliencia: Taskfile.yml parametriza MONITORING_DIR con precondiciones explícitas', () => {
  const taskfilePath = path.join(ROOT_DIR, 'Taskfile.yml');
  assert.ok(fs.existsSync(taskfilePath), 'Taskfile.yml debe existir');
  const content = fs.readFileSync(taskfilePath, 'utf-8');

  assert.ok(content.includes('MONITORING_DIR:'), 'Taskfile.yml debe declarar la variable MONITORING_DIR');
  assert.ok(content.includes('preconditions:'), 'Taskfile.yml debe incluir precondiciones en tareas de monitoreo');
  assert.ok(content.includes('test -d'), 'Debe validar que el directorio de monitoreo existe antes de ejecutar');
});

test('🛡️ Ansible Idempotencia: container_runtime valida el estado activo del servicio sin falsos positivos', () => {
  const runtimeTaskPath = path.join(ROOT_DIR, 'infra/ansible/roles/container_runtime/tasks/main.yml');
  assert.ok(fs.existsSync(runtimeTaskPath), 'container_runtime/tasks/main.yml debe existir');
  const content = fs.readFileSync(runtimeTaskPath, 'utf-8');

  assert.ok(content.includes('service_facts:'), 'Debe recolectar hechos de servicios del sistema');
  assert.ok(content.includes('ansible.builtin.assert:'), 'Debe realizar aserción formal del servicio');
  assert.ok(content.includes("ansible_facts.services['docker.service'].state == 'running'"), 'Debe validar que docker.service está running');
});

test('🛡️ Helm Security: values.prod.yaml exige Zero-Trust L7 (Cilium FQDN o Egress Gateway) sin fallback permisivo', () => {
  const prodValuesPath = path.join(ROOT_DIR, 'infra/helm/pokedex/values.prod.yaml');
  assert.ok(fs.existsSync(prodValuesPath), 'values.prod.yaml debe existir');
  const content = fs.readFileSync(prodValuesPath, 'utf-8');

  assert.ok(content.includes('externalHttps: false'), 'values.prod.yaml debe deshabilitar externalHttps para evitar 0.0.0.0/0 abierto');
  assert.ok(content.includes('ciliumNetworkPolicy:'), 'values.prod.yaml debe configurar ciliumNetworkPolicy');
  assert.ok(content.includes('enabled: true'), 'values.prod.yaml debe habilitar ciliumNetworkPolicy');
});

test('🛡️ Tooling Security: scripts/seal-secret.ts implementa verificación de integridad SHA-256', async () => {
  const scriptPath = path.join(ROOT_DIR, 'scripts/seal-secret.ts');
  assert.ok(fs.existsSync(scriptPath), 'seal-secret.ts debe existir');
  const content = fs.readFileSync(scriptPath, 'utf-8');

  assert.ok(content.includes('verifyBinaryIntegrity'), 'Debe definir verifyBinaryIntegrity');
  assert.ok(content.includes('KUBESEAL_SHA256'), 'Debe soportar KUBESEAL_SHA256');

  const { verifyBinaryIntegrity } = await import('../../scripts/seal-secret.js');
  assert.equal(verifyBinaryIntegrity(scriptPath, undefined), true, 'Sin hash esperado debe retornar true');

  // Con hash inválido debe retornar false
  assert.equal(verifyBinaryIntegrity(scriptPath, '0000000000000000000000000000000000000000000000000000000000000000'), false);
});

test('🛡️ Kyverno Security: ClusterPolicy pod-security-standards define perfil Restricted en tiempo de admisión', () => {
  const policyPath = path.join(ROOT_DIR, 'infra/k8s/policies/pod-security-standards.yaml');
  assert.ok(fs.existsSync(policyPath), 'pod-security-standards.yaml debe existir');
  const content = fs.readFileSync(policyPath, 'utf-8');

  assert.ok(content.includes('require-run-as-non-root'), 'Debe exigir runAsNonRoot');
  assert.ok(content.includes('disallow-privileged-containers'), 'Debe prohibir contenedores privilegiados');
  assert.ok(content.includes('require-readonly-rootfs'), 'Debe exigir readOnlyRootFilesystem');
  assert.ok(content.includes('disallow-privilege-escalation'), 'Debe prohibir escalada de privilegios');
  assert.ok(content.includes('require-drop-all-capabilities'), 'Debe exigir drop: [ALL]');

  const testSuitePath = path.join(ROOT_DIR, 'infra/k8s/kyverno-test/pod-security-standards/kyverno-test.yaml');
  assert.ok(fs.existsSync(testSuitePath), 'kyverno-test.yaml de PSS debe existir');
  const testContent = fs.readFileSync(testSuitePath, 'utf-8');
  assert.ok(testContent.includes('pod-security-standards'), 'Debe testear la política pod-security-standards');
});

test('🛡️ Docker Build Parity: Dockerfile raíz y apps/backend/Dockerfile mantienen paridad estructural', () => {
  const rootDockerPath = path.join(ROOT_DIR, 'Dockerfile');
  const backendDockerPath = path.join(ROOT_DIR, 'apps/backend/Dockerfile');

  assert.ok(fs.existsSync(rootDockerPath), 'Dockerfile raíz debe existir');
  assert.ok(fs.existsSync(backendDockerPath), 'apps/backend/Dockerfile debe existir');

  // Filtrar líneas de comentarios de encabezado (líneas que empiezan con # antes del primer FROM)
  const extractBody = (content: string) => {
    const fromIndex = content.indexOf('FROM ');
    return fromIndex !== -1 ? content.slice(fromIndex).trim() : content.trim();
  };

  const rootBody = extractBody(fs.readFileSync(rootDockerPath, 'utf-8'));
  const backendBody = extractBody(fs.readFileSync(backendDockerPath, 'utf-8'));

  assert.equal(rootBody, backendBody, 'El cuerpo de instrucciones de compilación y runtime entre Dockerfile y apps/backend/Dockerfile debe ser idéntico');
});

test('🛡️ AI Contracts: apps/backend/src/services/ai.ts fuerza salida estructurada JSON en Gemini', () => {
  const aiServicePath = path.join(ROOT_DIR, 'apps/backend/src/services/ai.ts');
  assert.ok(fs.existsSync(aiServicePath), 'ai.ts debe existir');
  const content = fs.readFileSync(aiServicePath, 'utf-8');

  assert.ok(
    content.includes("responseMimeType: 'application/json'"),
    'ai.ts debe exigir responseMimeType application/json para garantizar contratos estructurados'
  );
  assert.ok(
    content.includes('mermaid_code'),
    'generateDiagram debe solicitar clave estructurada mermaid_code'
  );
  assert.ok(
    content.includes('html_code'),
    'generateMockup debe solicitar clave estructurada html_code'
  );
});

test('🛡️ Cloud-Native Secrets: infra/k8s/eso define arquitectura declarativa de External Secrets Operator', () => {
  const esoDir = path.join(ROOT_DIR, 'infra/k8s/eso');
  assert.ok(fs.existsSync(esoDir), 'Directorio de ESO debe existir');

  const storePath = path.join(esoDir, 'cluster-secret-store.yaml');
  const secretPath = path.join(esoDir, 'external-secret-pokedex.yaml');
  const readmePath = path.join(esoDir, 'README.md');

  assert.ok(fs.existsSync(storePath), 'cluster-secret-store.yaml debe existir');
  assert.ok(fs.existsSync(secretPath), 'external-secret-pokedex.yaml debe existir');
  assert.ok(fs.existsSync(readmePath), 'README.md de ESO debe existir');

  const storeContent = fs.readFileSync(storePath, 'utf-8');
  assert.ok(storeContent.includes('kind: ClusterSecretStore'), 'Debe definir ClusterSecretStore');

  const secretContent = fs.readFileSync(secretPath, 'utf-8');
  assert.ok(secretContent.includes('kind: ExternalSecret'), 'Debe definir ExternalSecret');
  assert.ok(secretContent.includes('POSTGRES_PASSWORD'), 'Debe mapear POSTGRES_PASSWORD');
  assert.ok(secretContent.includes('GEMINI_API_KEY'), 'Debe mapear GEMINI_API_KEY');
});

test('🛡️ Web Performance & Accesibilidad: lighthouserc.json define presupuestos estrictos para Core Web Vitals', () => {
  const lighthousercPath = path.join(ROOT_DIR, 'lighthouserc.json');
  assert.ok(fs.existsSync(lighthousercPath), 'lighthouserc.json debe existir en la raíz');
  const content = JSON.parse(fs.readFileSync(lighthousercPath, 'utf-8'));

  assert.ok(content.ci, 'lighthouserc.json debe tener sección ci');
  assert.ok(content.ci.assert?.assertions, 'lighthouserc.json debe definir assertions');
  assert.ok(
    content.ci.assert.assertions['categories:performance'],
    'Debe definir presupuesto mínimo para performance'
  );
  assert.ok(
    content.ci.assert.assertions['categories:accessibility'],
    'Debe definir presupuesto mínimo para accessibility'
  );
});

test('🛡️ Observabilidad & Prometheus: apps/backend expone métricas coherentes con infra/monitoring/alerts.yml', () => {
  const serverPath = path.join(ROOT_DIR, 'apps/backend/server.ts');
  const alertsPath = path.join(ROOT_DIR, 'infra/monitoring/alerts.yml');

  assert.ok(fs.existsSync(serverPath), 'server.ts debe existir');
  assert.ok(fs.existsSync(alertsPath), 'alerts.yml debe existir');

  const serverContent = fs.readFileSync(serverPath, 'utf-8');
  const alertsContent = fs.readFileSync(alertsPath, 'utf-8');

  // Coherencia con alertas de estado de infraestructura
  assert.ok(
    serverContent.includes('pokedex_storage_status'),
    'server.ts debe exponer pokedex_storage_status'
  );
  assert.ok(
    alertsContent.includes('pokedex_storage_status == 0'),
    'alerts.yml debe monitorear desconexión de base de datos'
  );

  assert.ok(
    serverContent.includes('pokedex_redis_status'),
    'server.ts debe exponer pokedex_redis_status'
  );
  assert.ok(
    alertsContent.includes('pokedex_redis_status == 0'),
    'alerts.yml debe monitorear desconexión de Redis'
  );

  // Coherencia con métricas estándar HTTP y latencia
  assert.ok(
    serverContent.includes('http_requests_total'),
    'server.ts debe exponer http_requests_total estándar'
  );
  assert.ok(
    alertsContent.includes('http_requests_total'),
    'alerts.yml debe evaluar tasa de errores sobre http_requests_total'
  );

  assert.ok(
    serverContent.includes('http_request_duration_seconds_bucket'),
    'server.ts debe exponer buckets de histograma para duración de requests'
  );
  assert.ok(
    alertsContent.includes('http_request_duration_seconds_bucket'),
    'alerts.yml debe calcular percentil P99 con http_request_duration_seconds_bucket'
  );

  // Coherencia con disyuntor de IA (Gemini)
  assert.ok(
    serverContent.includes('pokedex_ai_circuit_breaker_open'),
    'server.ts debe exponer pokedex_ai_circuit_breaker_open'
  );
  assert.ok(
    alertsContent.includes('PokedexAICircuitBreakerOpen'),
    'alerts.yml debe definir alerta PokedexAICircuitBreakerOpen'
  );
  assert.ok(
    alertsContent.includes('pokedex_ai_circuit_breaker_open == 1'),
    'alerts.yml debe evaluar condición de circuito de IA abierto'
  );
});

test('🛡️ Helm & Gobernanza: ServiceMonitor existe en Helm y ADR-007 documenta arquitectura de observabilidad', () => {
  const serviceMonitorPath = path.join(ROOT_DIR, 'infra/helm/pokedex/templates/servicemonitor.yaml');
  const adrPath = path.join(ROOT_DIR, 'docs/decisions/ADR-007-observability-and-metrics.md');
  const valuesPath = path.join(ROOT_DIR, 'infra/helm/pokedex/values.yaml');
  const valuesProdPath = path.join(ROOT_DIR, 'infra/helm/pokedex/values.prod.yaml');

  assert.ok(fs.existsSync(serviceMonitorPath), 'servicemonitor.yaml debe existir en Helm');
  assert.ok(fs.existsSync(adrPath), 'ADR-007 debe existir en docs/decisions/');

  const smContent = fs.readFileSync(serviceMonitorPath, 'utf-8');
  assert.ok(smContent.includes('kind: ServiceMonitor'), 'Debe definir tipo ServiceMonitor');
  assert.ok(smContent.includes('apiVersion: monitoring.coreos.com/v1'), 'Debe usar apiVersion monitoring.coreos.com/v1');
  assert.ok(smContent.includes('path: /metrics'), 'Debe apuntar a /metrics');

  const adrContent = fs.readFileSync(adrPath, 'utf-8');
  assert.ok(adrContent.replace(/\r\n/g, '\n').includes('## Estado\nAceptado'), 'ADR-007 debe estar aceptado');

  const valuesContent = fs.readFileSync(valuesPath, 'utf-8');
  assert.ok(valuesContent.includes('serviceMonitor:'), 'values.yaml debe declarar serviceMonitor');

  const valuesProdContent = fs.readFileSync(valuesProdPath, 'utf-8');
  assert.ok(valuesProdContent.includes('enabled: true'), 'values.prod.yaml debe tener serviceMonitor habilitado');
});

test('🛡️ CI Tooling Parity: infra.yml y ci.yml mantienen paridad estricta de versión de Helm en todos sus jobs', () => {
  const infraWorkflowPath = path.join(ROOT_DIR, '.github/workflows/infra.yml');
  const ciWorkflowPath = path.join(ROOT_DIR, '.github/workflows/ci.yml');
  const toolVersionsPath = path.join(ROOT_DIR, '.tool-versions');

  assert.ok(fs.existsSync(infraWorkflowPath), 'infra.yml debe existir');
  assert.ok(fs.existsSync(ciWorkflowPath), 'ci.yml debe existir');
  assert.ok(fs.existsSync(toolVersionsPath), '.tool-versions debe existir');

  const infraContent = fs.readFileSync(infraWorkflowPath, 'utf-8');
  const ciContent = fs.readFileSync(ciWorkflowPath, 'utf-8');
  const toolVersionsContent = fs.readFileSync(toolVersionsPath, 'utf-8');

  // Extraer versión de Helm esperada de .tool-versions (ej. 3.17.0)
  const helmVersionMatch = toolVersionsContent.match(/helm\s+(\S+)/);
  assert.ok(helmVersionMatch, 'Debe encontrarse versión de Helm en .tool-versions');
  const expectedHelmVersion = `v${helmVersionMatch[1]}`;

  // Extraer todas las versiones configuradas para setup-helm en infra.yml y ci.yml
  const infraVersions = Array.from(infraContent.matchAll(/uses:\s*azure\/setup-helm[^\n]*\n\s+with:\s*\n\s+version:\s*['"]?(v\d+\.\d+\.\d+)['"]?/g)).map(m => m[1]);
  assert.ok(infraVersions.length >= 2, 'infra.yml debe configurar Helm en al menos 2 jobs (validate-iac y kind-integration)');

  const ciVersions = Array.from(ciContent.matchAll(/uses:\s*azure\/setup-helm[^\n]*\n\s+with:\s*\n\s+version:\s*['"]?(v\d+\.\d+\.\d+)['"]?/g)).map(m => m[1]);
  assert.ok(ciVersions.length >= 1, 'ci.yml debe configurar Helm en el job publish');

  const allVersions = [...infraVersions, ...ciVersions];
  for (const ver of allVersions) {
    assert.equal(
      ver,
      expectedHelmVersion,
      `Cada workflow de CI (infra.yml, ci.yml) debe utilizar Helm ${expectedHelmVersion} para garantizar paridad inmutable`
    );
  }
});

test('🛡️ Excelencia Operacional: docs/operations/observability-alerts.md cubre todas las alertas de alerts.yml', () => {
  const alertsPath = path.join(ROOT_DIR, 'infra/monitoring/alerts.yml');
  const runbookPath = path.join(ROOT_DIR, 'docs/operations/observability-alerts.md');

  assert.ok(fs.existsSync(alertsPath), 'alerts.yml debe existir');
  assert.ok(fs.existsSync(runbookPath), 'observability-alerts.md debe existir');

  const alertsContent = fs.readFileSync(alertsPath, 'utf-8');
  const runbookContent = fs.readFileSync(runbookPath, 'utf-8');

  // Extraer nombres de alertas de alerts.yml
  const alertMatches = Array.from(alertsContent.matchAll(/alert:\s*([A-Za-z0-9_-]+)/g)).map(m => m[1]);
  assert.ok(alertMatches.length > 0, 'alerts.yml debe contener al menos una alerta');

  for (const alertName of alertMatches) {
    assert.ok(
      runbookContent.includes(alertName),
      `El runbook de observabilidad debe documentar el procedimiento de respuesta para la alerta ${alertName}`
    );
  }
});

test('🛡️ Gobernanza & Documentación: README.md y docs/README.md documentan Matriz de Estado y enlazan Runbooks y ADRs', () => {
  const readmePath = path.join(ROOT_DIR, 'README.md');
  const docsReadmePath = path.join(ROOT_DIR, 'docs/README.md');

  assert.ok(fs.existsSync(readmePath), 'README.md debe existir');
  assert.ok(fs.existsSync(docsReadmePath), 'docs/README.md debe existir');

  const readmeContent = fs.readFileSync(readmePath, 'utf-8');
  const docsReadmeContent = fs.readFileSync(docsReadmePath, 'utf-8');

  // Matriz de estado en README.md
  assert.ok(
    readmeContent.includes('Matriz de Estado y Nivel de Soporte de Componentes'),
    'README.md debe contener la Matriz de Estado y Nivel de Soporte de Componentes'
  );
  assert.ok(readmeContent.includes('Kubernetes (EKS / Bare-Metal)'), 'Matriz debe listar Kubernetes');
  assert.ok(readmeContent.includes('Helm 3 (OCI Artifacts)'), 'Matriz debe listar Helm 3');
  assert.ok(readmeContent.includes('ArgoCD (GitOps)'), 'Matriz debe listar ArgoCD');
  assert.ok(readmeContent.includes('OpenTofu 1.8+'), 'Matriz debe listar OpenTofu');

  // Enlaces a Observabilidad y ADR-007
  assert.ok(readmeContent.includes('docs/operations/observability-alerts.md'), 'README.md debe enlazar observability-alerts.md');
  assert.ok(readmeContent.includes('docs/decisions/ADR-007-observability-and-metrics.md'), 'README.md debe enlazar ADR-007');

  assert.ok(docsReadmeContent.includes('observability-alerts.md'), 'docs/README.md debe enlazar observability-alerts.md');
  assert.ok(docsReadmeContent.includes('ADR-007-observability-and-metrics.md'), 'docs/README.md debe enlazar ADR-007');
});

test('🛡️ Supply Chain Security: ADR-008 formaliza inmutabilidad, Cosign Keyless, SLSA L3 y Kyverno', () => {
  const adrPath = path.join(ROOT_DIR, 'docs/decisions/ADR-008-supply-chain-security.md');
  const readmePath = path.join(ROOT_DIR, 'README.md');
  const docsReadmePath = path.join(ROOT_DIR, 'docs/README.md');

  assert.ok(fs.existsSync(adrPath), 'ADR-008 debe existir en docs/decisions/');
  const adrContent = fs.readFileSync(adrPath, 'utf-8');

  assert.ok(adrContent.replace(/\r\n/g, '\n').includes('## Estado\n\nAceptado'), 'ADR-008 debe estar aceptado');
  assert.ok(adrContent.includes('Digest Pinning'), 'ADR-008 debe definir Digest Pinning');
  assert.ok(adrContent.includes('CycloneDX'), 'ADR-008 debe definir CycloneDX SBOM');
  assert.ok(adrContent.includes('Cosign'), 'ADR-008 debe definir Cosign Keyless');
  assert.ok(adrContent.includes('SLSA'), 'ADR-008 debe definir SLSA Provenance');
  assert.ok(adrContent.includes('Kyverno'), 'ADR-008 debe definir control de admisión Kyverno');

  const readmeContent = fs.readFileSync(readmePath, 'utf-8');
  assert.ok(readmeContent.includes('ADR-008-supply-chain-security.md'), 'README.md debe enlazar ADR-008');

  const docsReadmeContent = fs.readFileSync(docsReadmePath, 'utf-8');
  assert.ok(docsReadmeContent.includes('ADR-008-supply-chain-security.md'), 'docs/README.md debe enlazar ADR-008');
  assert.ok(docsReadmeContent.includes('ADR-001 a ADR-008') || docsReadmeContent.includes('ADR-001 a ADR-009'), 'Mermaid en docs/README.md debe indicar rango de ADRs');
});

test('🛡️ Helm Resiliencia & Gobernanza: values.prod.yaml y templates configuran PDB, ResourceQuota y LimitRange', () => {
  const valuesProdPath = path.join(ROOT_DIR, 'infra/helm/pokedex/values.prod.yaml');
  const pdbPath = path.join(ROOT_DIR, 'infra/helm/pokedex/templates/pdb.yaml');
  const quotaPath = path.join(ROOT_DIR, 'infra/helm/pokedex/templates/resourcequota.yaml');
  const limitRangePath = path.join(ROOT_DIR, 'infra/helm/pokedex/templates/limitrange.yaml');
  const infraCiPath = path.join(ROOT_DIR, '.github/workflows/infra.yml');

  assert.ok(fs.existsSync(valuesProdPath), 'values.prod.yaml debe existir');
  assert.ok(fs.existsSync(pdbPath), 'pdb.yaml debe existir');
  assert.ok(fs.existsSync(quotaPath), 'resourcequota.yaml debe existir');
  assert.ok(fs.existsSync(limitRangePath), 'limitrange.yaml debe existir');
  assert.ok(fs.existsSync(infraCiPath), 'infra.yml debe existir');

  const valuesProdContent = fs.readFileSync(valuesProdPath, 'utf-8');
  assert.ok(valuesProdContent.includes('podDisruptionBudget:'), 'values.prod.yaml debe configurar podDisruptionBudget');
  assert.ok(valuesProdContent.includes('resourceQuota:'), 'values.prod.yaml debe configurar resourceQuota');
  assert.ok(valuesProdContent.includes('limitRange:'), 'values.prod.yaml debe configurar limitRange');

  const infraCiContent = fs.readFileSync(infraCiPath, 'utf-8');
  assert.ok(infraCiContent.includes('kind: PodDisruptionBudget'), 'infra.yml debe validar PodDisruptionBudget en prod');
  assert.ok(infraCiContent.includes('kind: ResourceQuota'), 'infra.yml debe validar ResourceQuota en prod');
  assert.ok(infraCiContent.includes('kind: LimitRange'), 'infra.yml debe validar LimitRange en prod');
});

test('🛡️ AI Resilience & Contratos: ADR-009 formaliza Gemini 2.5 Flash, Circuit Breaker y fallback determinista', () => {
  const adrPath = path.join(ROOT_DIR, 'docs/decisions/ADR-009-ai-resilience-and-contracts.md');
  const readmePath = path.join(ROOT_DIR, 'README.md');
  const docsReadmePath = path.join(ROOT_DIR, 'docs/README.md');

  assert.ok(fs.existsSync(adrPath), 'ADR-009 debe existir en docs/decisions/');
  const adrContent = fs.readFileSync(adrPath, 'utf-8');

  assert.ok(adrContent.replace(/\r\n/g, '\n').includes('## Estado\n\nAceptado'), 'ADR-009 debe estar aceptado');
  assert.ok(adrContent.includes('GoogleGenAI'), 'ADR-009 debe documentar SDK oficial @google/genai');
  assert.ok(adrContent.includes('gemini-2.5-flash'), 'ADR-009 debe documentar modelo gemini-2.5-flash');
  assert.ok(adrContent.includes('responseMimeType: \'application/json\''), 'ADR-009 debe documentar modo estructurado JSON');
  assert.ok(adrContent.includes('AICircuitBreaker'), 'ADR-009 debe documentar patrón Circuit Breaker');
  assert.ok(adrContent.includes('getSemanticCacheKey'), 'ADR-009 debe documentar caché semántica en Redis');
  assert.ok(adrContent.includes('sanitizePrompt'), 'ADR-009 debe documentar sanitización contra prompt injection');
  assert.ok(adrContent.includes('getDeterministicDiagram'), 'ADR-009 debe documentar fallback determinista local');
  assert.ok(adrContent.includes('pokedex_ai_circuit_breaker_open'), 'ADR-009 debe documentar métricas de observabilidad en /metrics');

  const readmeContent = fs.readFileSync(readmePath, 'utf-8');
  assert.ok(readmeContent.includes('ADR-009-ai-resilience-and-contracts.md'), 'README.md debe enlazar ADR-009');

  const docsReadmeContent = fs.readFileSync(docsReadmePath, 'utf-8');
  assert.ok(docsReadmeContent.includes('ADR-009-ai-resilience-and-contracts.md'), 'docs/README.md debe enlazar ADR-009');
  assert.ok(docsReadmeContent.includes('ADR-001 a ADR-009'), 'Mermaid en docs/README.md debe indicar ADR-001 a ADR-009');

  // Validar que los 9 ADRs existen físicamente en disco
  for (let i = 1; i <= 9; i++) {
    const num = String(i).padStart(3, '0');
    const files = fs.readdirSync(path.join(ROOT_DIR, 'docs/decisions'));
    const match = files.find(f => f.startsWith(`ADR-${num}`));
    assert.ok(match, `Debe existir archivo para ADR-${num} en docs/decisions/`);
  }
});


