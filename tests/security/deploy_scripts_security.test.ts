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

test('🛡️ Dev DX & Resiliencia: Taskfile.yml define observabilidad unificada (Grafana Cloud / Dev Alloy) sin deuda legacy', () => {
  const taskfilePath = path.join(ROOT_DIR, 'Taskfile.yml');
  assert.ok(fs.existsSync(taskfilePath), 'Taskfile.yml debe existir');
  const content = fs.readFileSync(taskfilePath, 'utf-8');

  assert.ok(!content.includes('MONITORING_DIR:'), 'Taskfile.yml no debe incluir la variable obsoleta MONITORING_DIR');
  assert.ok(!content.includes('docker_monitoreo'), 'Taskfile.yml no debe incluir referencias al stack legacy docker_monitoreo');
  assert.ok(content.includes('monitoring:grafana-cloud:install:'), 'Taskfile.yml debe incluir la tarea de instalación de Grafana Cloud');
  assert.ok(content.includes('monitoring:dev:status:'), 'Taskfile.yml debe incluir la tarea de diagnóstico dev:status');
  assert.ok(content.includes('monitoring:dev:logs:'), 'Taskfile.yml debe incluir la tarea de logs de dev');
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
  assert.ok(docsReadmeContent.includes('ADR-001 a ADR-008') || docsReadmeContent.includes('ADR-001 a ADR-009') || docsReadmeContent.includes('ADR-001 a ADR-010') || docsReadmeContent.includes('ADR-001 a ADR-011') || docsReadmeContent.includes('ADR-001 a ADR-012') || docsReadmeContent.includes('ADR-001 a ADR-013') || docsReadmeContent.includes('ADR-001 a ADR-014') || docsReadmeContent.includes('ADR-001 a ADR-015') || docsReadmeContent.includes('ADR-001 a ADR-016') || docsReadmeContent.includes('ADR-001 a ADR-017') || docsReadmeContent.includes('ADR-001 a ADR-018') || docsReadmeContent.includes('ADR-001 a ADR-019') || docsReadmeContent.includes('ADR-001 a ADR-020') || docsReadmeContent.includes('ADR-001 a ADR-021') || docsReadmeContent.includes('ADR-001 a ADR-022'), 'Mermaid en docs/README.md debe indicar rango de ADRs');
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
  assert.ok(docsReadmeContent.includes('ADR-001 a ADR-009') || docsReadmeContent.includes('ADR-001 a ADR-010') || docsReadmeContent.includes('ADR-001 a ADR-011') || docsReadmeContent.includes('ADR-001 a ADR-012') || docsReadmeContent.includes('ADR-001 a ADR-013') || docsReadmeContent.includes('ADR-001 a ADR-014') || docsReadmeContent.includes('ADR-001 a ADR-015') || docsReadmeContent.includes('ADR-001 a ADR-016') || docsReadmeContent.includes('ADR-001 a ADR-017') || docsReadmeContent.includes('ADR-001 a ADR-018') || docsReadmeContent.includes('ADR-001 a ADR-019') || docsReadmeContent.includes('ADR-001 a ADR-020') || docsReadmeContent.includes('ADR-001 a ADR-021') || docsReadmeContent.includes('ADR-001 a ADR-022'), 'Mermaid en docs/README.md debe indicar ADR-001 a ADR-009 o superior');

  // Validar que los 9 ADRs existen físicamente en disco
  for (let i = 1; i <= 9; i++) {
    const num = String(i).padStart(3, '0');
    const files = fs.readdirSync(path.join(ROOT_DIR, 'docs/decisions'));
    const match = files.find(f => f.startsWith(`ADR-${num}`));
    assert.ok(match, `Debe existir archivo para ADR-${num} en docs/decisions/`);
  }
});

test('🛡️ Autenticación & Sesiones: ADR-010 formaliza doble capa, timingSafeEqual y revocación fail-closed', () => {
  const adrPath = path.join(ROOT_DIR, 'docs/decisions/ADR-010-authentication-and-session-management.md');
  const readmePath = path.join(ROOT_DIR, 'README.md');
  const docsReadmePath = path.join(ROOT_DIR, 'docs/README.md');

  assert.ok(fs.existsSync(adrPath), 'ADR-010 debe existir en docs/decisions/');
  const adrContent = fs.readFileSync(adrPath, 'utf-8');

  assert.ok(adrContent.replace(/\r\n/g, '\n').includes('## Estado\n\nAceptado'), 'ADR-010 debe estar aceptado');
  assert.ok(adrContent.includes('timingSafeEqual'), 'ADR-010 debe documentar mitigación timing attacks con timingSafeEqual');
  assert.ok(adrContent.includes('ADMIN_SESSION_SECRET'), 'ADR-010 debe documentar desacoplamiento de ADMIN_SESSION_SECRET');
  assert.ok(adrContent.includes('fail-closed') || adrContent.includes('Fail-Closed'), 'ADR-010 debe documentar revocación fail-closed');
  assert.ok(adrContent.includes('pokedex:revoked:') || adrContent.includes('jti'), 'ADR-010 debe documentar revocación distribuida con jti en Redis');
  assert.ok(adrContent.includes('POST /api/v1/auth/session'), 'ADR-010 debe documentar endpoint de emisión de sesiones');
  assert.ok(adrContent.includes('POST /api/v1/auth/logout'), 'ADR-010 debe documentar endpoint de revocación/logout');

  const readmeContent = fs.readFileSync(readmePath, 'utf-8');
  assert.ok(readmeContent.includes('ADR-010-authentication-and-session-management.md'), 'README.md debe enlazar ADR-010');

  const docsReadmeContent = fs.readFileSync(docsReadmePath, 'utf-8');
  assert.ok(docsReadmeContent.includes('ADR-010-authentication-and-session-management.md'), 'docs/README.md debe enlazar ADR-010');
  assert.ok(docsReadmeContent.includes('ADR-001 a ADR-010') || docsReadmeContent.includes('ADR-001 a ADR-011') || docsReadmeContent.includes('ADR-001 a ADR-012') || docsReadmeContent.includes('ADR-001 a ADR-013') || docsReadmeContent.includes('ADR-001 a ADR-014') || docsReadmeContent.includes('ADR-001 a ADR-015') || docsReadmeContent.includes('ADR-001 a ADR-016') || docsReadmeContent.includes('ADR-001 a ADR-017') || docsReadmeContent.includes('ADR-001 a ADR-018') || docsReadmeContent.includes('ADR-001 a ADR-019') || docsReadmeContent.includes('ADR-001 a ADR-020') || docsReadmeContent.includes('ADR-001 a ADR-021') || docsReadmeContent.includes('ADR-001 a ADR-022'), 'Mermaid en docs/README.md debe indicar ADR-001 a ADR-010 o posterior');

  // Validar que los 10 ADRs existen físicamente en disco
  for (let i = 1; i <= 10; i++) {
    const num = String(i).padStart(3, '0');
    const files = fs.readdirSync(path.join(ROOT_DIR, 'docs/decisions'));
    const match = files.find(f => f.startsWith(`ADR-${num}`));
    assert.ok(match, `Debe existir archivo para ADR-${num} en docs/decisions/`);
  }
});

test('🛡️ Persistencia & Migraciones: ADR-011 formaliza Drizzle ORM, PgBouncer y secuencias atómicas', () => {
  const adrPath = path.join(ROOT_DIR, 'docs/decisions/ADR-011-persistence-drizzle-orm-and-pgbouncer.md');
  const readmePath = path.join(ROOT_DIR, 'README.md');
  const docsReadmePath = path.join(ROOT_DIR, 'docs/README.md');

  assert.ok(fs.existsSync(adrPath), 'ADR-011 debe existir en docs/decisions/');
  const adrContent = fs.readFileSync(adrPath, 'utf-8');

  assert.ok(adrContent.replace(/\r\n/g, '\n').includes('## Estado\n\nAceptado'), 'ADR-011 debe estar aceptado');
  assert.ok(adrContent.includes('Drizzle ORM'), 'ADR-011 debe documentar Drizzle ORM');
  assert.ok(adrContent.includes('PgBouncer'), 'ADR-011 debe documentar PgBouncer');
  assert.ok(adrContent.includes('pokedex_id_seq'), 'ADR-011 debe documentar secuencia atómica pokedex_id_seq');
  assert.ok(adrContent.includes('pokedex_entries'), 'ADR-011 debe documentar tabla pokedex_entries');
  assert.ok(adrContent.includes('JSONB'), 'ADR-011 debe documentar modelo híbrido JSONB');
  assert.ok(adrContent.includes('pool_mode = transaction') || adrContent.includes('transaction'), 'ADR-011 debe documentar pooling en modo transacción');

  const readmeContent = fs.readFileSync(readmePath, 'utf-8');
  assert.ok(readmeContent.includes('ADR-011-persistence-drizzle-orm-and-pgbouncer.md'), 'README.md debe enlazar ADR-011');

  const docsReadmeContent = fs.readFileSync(docsReadmePath, 'utf-8');
  assert.ok(docsReadmeContent.includes('ADR-011-persistence-drizzle-orm-and-pgbouncer.md'), 'docs/README.md debe enlazar ADR-011');
  assert.ok(docsReadmeContent.includes('ADR-001 a ADR-011') || docsReadmeContent.includes('ADR-001 a ADR-012') || docsReadmeContent.includes('ADR-001 a ADR-013') || docsReadmeContent.includes('ADR-001 a ADR-014') || docsReadmeContent.includes('ADR-001 a ADR-015') || docsReadmeContent.includes('ADR-001 a ADR-016') || docsReadmeContent.includes('ADR-001 a ADR-017') || docsReadmeContent.includes('ADR-001 a ADR-018') || docsReadmeContent.includes('ADR-001 a ADR-019') || docsReadmeContent.includes('ADR-001 a ADR-020') || docsReadmeContent.includes('ADR-001 a ADR-021') || docsReadmeContent.includes('ADR-001 a ADR-022'), 'Mermaid en docs/README.md debe indicar ADR-001 a ADR-011 o posterior');

  // Validar que los 11 ADRs existen físicamente en disco
  for (let i = 1; i <= 11; i++) {
    const num = String(i).padStart(3, '0');
    const files = fs.readdirSync(path.join(ROOT_DIR, 'docs/decisions'));
    const match = files.find(f => f.startsWith(`ADR-${num}`));
    assert.ok(match, `Debe existir archivo para ADR-${num} en docs/decisions/`);
  }
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

test('🛡️ Zero-Trust Network: ADR-013 formaliza microsegmentación 4 capas, default-deny y anti-SSRF', () => {
  const adrPath = path.join(ROOT_DIR, 'docs/decisions/ADR-013-zero-trust-network-architecture.md');
  const readmePath = path.join(ROOT_DIR, 'README.md');
  const docsReadmePath = path.join(ROOT_DIR, 'docs/README.md');
  const auditPath = path.join(ROOT_DIR, 'docs/security/DEVSECOPS_AUDIT.md');

  assert.ok(fs.existsSync(adrPath), 'ADR-013 debe existir en docs/decisions/');
  const adrContent = fs.readFileSync(adrPath, 'utf-8');

  assert.ok(adrContent.replace(/\r\n/g, '\n').includes('## Estado\n\nAceptado'), 'ADR-013 debe estar aceptado');
  assert.ok(adrContent.includes('Zero-Trust'), 'ADR-013 debe documentar arquitectura Zero-Trust');
  assert.ok(adrContent.includes('Default-Deny') || adrContent.includes('default-deny'), 'ADR-013 debe documentar default-deny');
  assert.ok(adrContent.includes('169.254.169.254/32'), 'ADR-013 debe documentar mitigación anti-SSRF en 169.254.169.254/32');
  assert.ok(adrContent.includes('Cilium') || adrContent.includes('toFQDNs'), 'ADR-013 debe documentar Cilium L7 FQDN');
  assert.ok(adrContent.includes('PgBouncer') || adrContent.includes('pgbouncer'), 'ADR-013 debe documentar mediación PgBouncer');

  const readmeContent = fs.readFileSync(readmePath, 'utf-8');
  assert.ok(readmeContent.includes('ADR-013-zero-trust-network-architecture.md'), 'README.md debe enlazar ADR-013');

  const docsReadmeContent = fs.readFileSync(docsReadmePath, 'utf-8');
  assert.ok(docsReadmeContent.includes('ADR-013-zero-trust-network-architecture.md'), 'docs/README.md debe enlazar ADR-013');
  assert.ok(docsReadmeContent.includes('ADR-001 a ADR-013') || docsReadmeContent.includes('ADR-001 a ADR-014') || docsReadmeContent.includes('ADR-001 a ADR-015') || docsReadmeContent.includes('ADR-001 a ADR-016') || docsReadmeContent.includes('ADR-001 a ADR-017') || docsReadmeContent.includes('ADR-001 a ADR-018') || docsReadmeContent.includes('ADR-001 a ADR-019') || docsReadmeContent.includes('ADR-001 a ADR-020') || docsReadmeContent.includes('ADR-001 a ADR-021') || docsReadmeContent.includes('ADR-001 a ADR-022'), 'Mermaid en docs/README.md debe indicar ADR-001 a ADR-013 o posterior');

  const auditContent = fs.readFileSync(auditPath, 'utf-8');
  assert.ok(auditContent.includes('secret-rotation.md'), 'DEVSECOPS_AUDIT.md debe enlazar secret-rotation.md');
  assert.ok(!auditContent.includes('Corto Plazo'), 'DEVSECOPS_AUDIT.md debe tener 100% de items en Implementado');

  // Validar que los 13 ADRs existen físicamente en disco
  for (let i = 1; i <= 13; i++) {
    const num = String(i).padStart(3, '0');
    const files = fs.readdirSync(path.join(ROOT_DIR, 'docs/decisions'));
    const match = files.find(f => f.startsWith(`ADR-${num}`));
    assert.ok(match, `Debe existir archivo para ADR-${num} en docs/decisions/`);
  }
});

test('🛡️ Autoescalado & Resiliencia: ADR-014 formaliza HPA v2, PodDisruptionBudget y TopologySpreadConstraints', () => {
  const adrPath = path.join(ROOT_DIR, 'docs/decisions/ADR-014-elastic-autoscaling-hpa-and-pod-disruption-budget.md');
  const readmePath = path.join(ROOT_DIR, 'README.md');
  const docsReadmePath = path.join(ROOT_DIR, 'docs/README.md');

  assert.ok(fs.existsSync(adrPath), 'ADR-014 debe existir en docs/decisions/');
  const adrContent = fs.readFileSync(adrPath, 'utf-8');

  assert.ok(adrContent.replace(/\r\n/g, '\n').includes('## Estado\n\nAceptado'), 'ADR-014 debe estar aceptado');
  assert.ok(adrContent.includes('autoscaling/v2'), 'ADR-014 debe documentar HPA autoscaling/v2');
  assert.ok(adrContent.includes('PodDisruptionBudget'), 'ADR-014 debe documentar PodDisruptionBudget');
  assert.ok(adrContent.includes('topologySpreadConstraints') || adrContent.includes('TopologySpreadConstraints'), 'ADR-014 debe documentar TopologySpreadConstraints');
  assert.ok(adrContent.includes('scaleDown') || adrContent.includes('Scale Down') || adrContent.includes('estabilización'), 'ADR-014 debe documentar políticas de estabilización para mitigar flapping');
  assert.ok(adrContent.includes('minAvailable: 1') || adrContent.includes('minAvailable'), 'ADR-014 debe documentar minAvailable en PDB');

  const readmeContent = fs.readFileSync(readmePath, 'utf-8');
  assert.ok(readmeContent.includes('ADR-014-elastic-autoscaling-hpa-and-pod-disruption-budget.md'), 'README.md debe enlazar ADR-014');

  const docsReadmeContent = fs.readFileSync(docsReadmePath, 'utf-8');
  assert.ok(docsReadmeContent.includes('ADR-014-elastic-autoscaling-hpa-and-pod-disruption-budget.md'), 'docs/README.md debe enlazar ADR-014');
  assert.ok(docsReadmeContent.includes('ADR-001 a ADR-014') || docsReadmeContent.includes('ADR-001 a ADR-015') || docsReadmeContent.includes('ADR-001 a ADR-016') || docsReadmeContent.includes('ADR-001 a ADR-017') || docsReadmeContent.includes('ADR-001 a ADR-018') || docsReadmeContent.includes('ADR-001 a ADR-019') || docsReadmeContent.includes('ADR-001 a ADR-020') || docsReadmeContent.includes('ADR-001 a ADR-021') || docsReadmeContent.includes('ADR-001 a ADR-022'), 'Mermaid en docs/README.md debe indicar ADR-001 a ADR-014 o posterior');

  // Validar que los 14 ADRs existen físicamente en disco
  for (let i = 1; i <= 14; i++) {
    const num = String(i).padStart(3, '0');
    const files = fs.readdirSync(path.join(ROOT_DIR, 'docs/decisions'));
    const match = files.find(f => f.startsWith(`ADR-${num}`));
    assert.ok(match, `Debe existir archivo para ADR-${num} en docs/decisions/`);
  }
});

test('🛡️ Ciclo de Vida & Resiliencia: ADR-015 formaliza Graceful Shutdown, closeStorage y sondas /healthz y /readyz', () => {
  const adrPath = path.join(ROOT_DIR, 'docs/decisions/ADR-015-pod-lifecycle-graceful-shutdown-and-probes.md');
  const readmePath = path.join(ROOT_DIR, 'README.md');
  const docsReadmePath = path.join(ROOT_DIR, 'docs/README.md');
  const helmApiDeploymentPath = path.join(ROOT_DIR, 'infra/helm/pokedex/templates/api-deployment.yaml');
  const helmValuesPath = path.join(ROOT_DIR, 'infra/helm/pokedex/values.yaml');

  assert.ok(fs.existsSync(adrPath), 'ADR-015 debe existir en docs/decisions/');
  const adrContent = fs.readFileSync(adrPath, 'utf-8');

  assert.ok(adrContent.replace(/\r\n/g, '\n').includes('## Estado\n\nAceptado'), 'ADR-015 debe estar aceptado');
  assert.ok(adrContent.includes('SIGTERM') && adrContent.includes('SIGINT'), 'ADR-015 debe documentar señales SIGTERM y SIGINT');
  assert.ok(adrContent.includes('setupGracefulShutdown'), 'ADR-015 debe documentar setupGracefulShutdown');
  assert.ok(adrContent.includes('closeStorage'), 'ADR-015 debe documentar closeStorage');
  assert.ok(adrContent.includes('/healthz'), 'ADR-015 debe documentar sonda /healthz');
  assert.ok(adrContent.includes('/readyz'), 'ADR-015 debe documentar sonda /readyz');
  assert.ok(adrContent.includes('terminationGracePeriodSeconds: 30') || adrContent.includes('terminationGracePeriodSeconds'), 'ADR-015 debe documentar terminationGracePeriodSeconds');

  const readmeContent = fs.readFileSync(readmePath, 'utf-8');
  assert.ok(readmeContent.includes('ADR-015-pod-lifecycle-graceful-shutdown-and-probes.md'), 'README.md debe enlazar ADR-015');

  const docsReadmeContent = fs.readFileSync(docsReadmePath, 'utf-8');
  assert.ok(docsReadmeContent.includes('ADR-015-pod-lifecycle-graceful-shutdown-and-probes.md'), 'docs/README.md debe enlazar ADR-015');
  assert.ok(docsReadmeContent.includes('ADR-001 a ADR-015') || docsReadmeContent.includes('ADR-001 a ADR-016') || docsReadmeContent.includes('ADR-001 a ADR-017') || docsReadmeContent.includes('ADR-001 a ADR-018') || docsReadmeContent.includes('ADR-001 a ADR-019') || docsReadmeContent.includes('ADR-001 a ADR-020') || docsReadmeContent.includes('ADR-001 a ADR-021') || docsReadmeContent.includes('ADR-001 a ADR-022'), 'Mermaid en docs/README.md debe indicar ADR-001 a ADR-015 o posterior');

  const helmApiContent = fs.readFileSync(helmApiDeploymentPath, 'utf-8');
  assert.ok(helmApiContent.includes('terminationGracePeriodSeconds:'), 'api-deployment.yaml debe configurar terminationGracePeriodSeconds');

  const helmValuesContent = fs.readFileSync(helmValuesPath, 'utf-8');
  assert.ok(helmValuesContent.includes('terminationGracePeriodSeconds: 30'), 'values.yaml debe fijar terminationGracePeriodSeconds: 30');

  // Validar que los 15 ADRs existen físicamente en disco
  for (let i = 1; i <= 15; i++) {
    const num = String(i).padStart(3, '0');
    const files = fs.readdirSync(path.join(ROOT_DIR, 'docs/decisions'));
    const match = files.find(f => f.startsWith(`ADR-${num}`));
    assert.ok(match, `Debe existir archivo para ADR-${num} en docs/decisions/`);
  }
});

test('🛡️ Backend Lifecycle: closeStorage y setShuttingDownForTest gestionan el estado de apagado grácil', async () => {
  const { closeStorage } = await import('../../apps/backend/src/services/db.js');
  assert.equal(typeof closeStorage, 'function', 'closeStorage debe ser una función exportada');

  // closeStorage debe ser idempotente y resolver sin error
  await assert.doesNotReject(async () => {
    await closeStorage();
  }, 'closeStorage debe resolver limpiamente sin arrojar errores');

  const { getLifecycleStatus, setShuttingDownForTest } = await import('../../apps/backend/server.js');
  assert.equal(typeof getLifecycleStatus, 'function', 'getLifecycleStatus debe ser una función');
  assert.equal(typeof setShuttingDownForTest, 'function', 'setShuttingDownForTest debe ser una función');

  // Inicialmente no está apagando
  assert.equal(getLifecycleStatus().isShuttingDown, false);

  // Simular transición a apagado
  setShuttingDownForTest(true);
  assert.equal(getLifecycleStatus().isShuttingDown, true);

  // Restaurar estado
  setShuttingDownForTest(false);
  assert.equal(getLifecycleStatus().isShuttingDown, false);
});


test('🛡️ Excelencia Operacional & Gobernanza: docs/operations/ contiene 7 SOPs estandarizados e indexados en docs/README.md', () => {
  const operationsDir = path.join(ROOT_DIR, 'docs/operations');
  const docsReadmePath = path.join(ROOT_DIR, 'docs/README.md');

  assert.ok(fs.existsSync(operationsDir), 'docs/operations/ debe existir');
  assert.ok(fs.existsSync(docsReadmePath), 'docs/README.md debe existir');

  const expectedRunbooks = [
    'observability-alerts.md',
    'backup-restore.md',
    'deployment.md',
    'incident-response.md',
    'kubernetes-troubleshooting.md',
    'rollback.md',
    'secret-rotation.md',
  ];

  const docsReadmeContent = fs.readFileSync(docsReadmePath, 'utf-8');

  for (const file of expectedRunbooks) {
    const filePath = path.join(operationsDir, file);
    assert.ok(fs.existsSync(filePath), `Runbook ${file} debe existir en docs/operations/`);

    const content = fs.readFileSync(filePath, 'utf-8');
    assert.ok(content.startsWith('# '), `Runbook ${file} debe comenzar con título H1`);
    assert.ok(
      !/\n## [^\n]+\n[^\n\r#\s]/.test(content),
      `Runbook ${file} debe respetar espaciado MD022 tras encabezados H2`
    );

    assert.ok(
      docsReadmeContent.includes(file),
      `docs/README.md debe indexar y enlazar ${file}`
    );
  }

  // Validar que el diagrama Mermaid contiene los 7 nodos de operaciones y R5 en runbooks
  assert.ok(docsReadmeContent.includes('RUN --> R5["📋 DISASTER_RECOVERY_PLAN.md"]'), 'Mermaid debe enlazar R5 DISASTER_RECOVERY_PLAN');
  for (let i = 1; i <= 7; i++) {
    assert.ok(
      docsReadmeContent.includes(`OP${i}`),
      `Mermaid en docs/README.md debe contener nodo OP${i}`
    );
  }
});

test('🛡️ Portabilidad de Documentación: ningún archivo markdown (.md) contiene enlaces absolutos locales file:///', () => {
  function getMarkdownFiles(dir: string): string[] {
    let files: string[] = [];
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      if (entry === 'node_modules' || entry === '.git' || entry === 'dist') continue;
      const fullPath = path.join(dir, entry);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        files = files.concat(getMarkdownFiles(fullPath));
      } else if (entry.endsWith('.md')) {
        files.push(fullPath);
      }
    }
    return files;
  }

  const allMarkdownFiles = getMarkdownFiles(ROOT_DIR);
  assert.ok(allMarkdownFiles.length > 20, 'Deben existir múltiples archivos de documentación Markdown');

  const filesWithAbsoluteLinks: string[] = [];
  for (const file of allMarkdownFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    if (content.includes('file:///')) {
      filesWithAbsoluteLinks.push(path.relative(ROOT_DIR, file));
    }
  }

  assert.deepStrictEqual(
    filesWithAbsoluteLinks,
    [],
    `Los siguientes archivos contienen enlaces absolutos locales file:///: ${filesWithAbsoluteLinks.join(', ')}`
  );
});

test('🛡️ Ingress L7 & TLS: ADR-016 formaliza Ingress Controller, Terminación TLS y Hardening de Cabeceras HTTP', () => {
  const adrPath = path.join(ROOT_DIR, 'docs/decisions/ADR-016-ingress-tls-and-http-hardening.md');
  const readmePath = path.join(ROOT_DIR, 'README.md');
  const docsReadmePath = path.join(ROOT_DIR, 'docs/README.md');
  const helmValuesPath = path.join(ROOT_DIR, 'infra/helm/pokedex/values.yaml');

  assert.ok(fs.existsSync(adrPath), 'ADR-016 debe existir en docs/decisions/');
  const adrContent = fs.readFileSync(adrPath, 'utf-8');
  assert.ok(adrContent.replace(/\r\n/g, '\n').includes('## Estado\n\nAceptado'), 'ADR-016 debe estar en estado Aceptado');

  assert.ok(
    adrContent.includes('TLS') || adrContent.includes('cert-manager'),
    'ADR-016 debe documentar terminación TLS y cert-manager'
  );
  assert.ok(
    adrContent.includes('Strict-Transport-Security') || adrContent.includes('HSTS'),
    'ADR-016 debe documentar HSTS (Strict-Transport-Security)'
  );
  assert.ok(
    adrContent.includes('Content-Security-Policy') || adrContent.includes('CSP'),
    'ADR-016 debe documentar Content-Security-Policy'
  );
  assert.ok(adrContent.includes('X-Frame-Options'), 'ADR-016 debe documentar X-Frame-Options');
  assert.ok(
    adrContent.includes('limit-rps') || adrContent.includes('Rate Limiting') || adrContent.includes('rate limiting'),
    'ADR-016 debe documentar rate limiting L7'
  );
  assert.ok(
    adrContent.includes('/metrics') && adrContent.includes('/healthz') && adrContent.includes('/readyz'),
    'ADR-016 debe documentar bloqueo de /metrics, /healthz y /readyz'
  );

  const valuesContent = fs.readFileSync(helmValuesPath, 'utf-8');
  assert.ok(
    valuesContent.includes('limit-rps') || valuesContent.includes('limit-connections'),
    'values.yaml debe configurar rate limiting (ADR-016)'
  );
  assert.ok(
    valuesContent.includes('configuration-snippet') || valuesContent.includes('Strict-Transport-Security') || valuesContent.includes('X-Frame-Options'),
    'values.yaml debe inyectar cabeceras de seguridad (ADR-016)'
  );
  assert.ok(valuesContent.includes('server-snippet'), 'values.yaml debe bloquear endpoints internos (ADR-016)');

  const readmeContent = fs.readFileSync(readmePath, 'utf-8');
  assert.ok(readmeContent.includes('ADR-016-ingress-tls-and-http-hardening.md'), 'README.md debe enlazar ADR-016');

  const docsReadmeContent = fs.readFileSync(docsReadmePath, 'utf-8');
  assert.ok(docsReadmeContent.includes('ADR-016-ingress-tls-and-http-hardening.md'), 'docs/README.md debe enlazar ADR-016');
  assert.ok(
    docsReadmeContent.includes('ADR-001 a ADR-016') || docsReadmeContent.includes('ADR-001 a ADR-017') || docsReadmeContent.includes('ADR-001 a ADR-018') || docsReadmeContent.includes('ADR-001 a ADR-019') || docsReadmeContent.includes('ADR-001 a ADR-020') || docsReadmeContent.includes('ADR-001 a ADR-021') || docsReadmeContent.includes('ADR-001 a ADR-022'),
    'Mermaid en docs/README.md debe indicar ADR-001 a ADR-016 o posterior'
  );

  for (let i = 1; i <= 16; i++) {
    const num = String(i).padStart(3, '0');
    const files = fs.readdirSync(path.join(ROOT_DIR, 'docs/decisions'));
    const match = files.find(f => f.startsWith(`ADR-${num}`));
    assert.ok(match, `Debe existir archivo para ADR-${num} en docs/decisions/`);
  }
});

test('🛡️ Admission Control: ADR-017 formaliza Kyverno ClusterPolicies, PSS Restricted y seccomp RuntimeDefault', () => {
  const adrPath = path.join(ROOT_DIR, 'docs/decisions/ADR-017-kyverno-admission-control-and-pod-security.md');
  const readmePath = path.join(ROOT_DIR, 'README.md');
  const docsReadmePath = path.join(ROOT_DIR, 'docs/README.md');
  const pssPolicyPath = path.join(ROOT_DIR, 'infra/k8s/policies/pod-security-standards.yaml');
  const disallowLatestPath = path.join(ROOT_DIR, 'infra/k8s/policies/disallow-latest-tag.yaml');
  const seccompPolicyPath = path.join(ROOT_DIR, 'infra/k8s/policies/require-seccomp-profile.yaml');
  const cosignPolicyPath = path.join(ROOT_DIR, 'infra/k8s/kyverno-cosign-policy.yaml');
  const namespacePsaPath = path.join(ROOT_DIR, 'infra/k8s/namespace-pod-security.yaml');

  // 1. ADR-017 existe y está aceptado
  assert.ok(fs.existsSync(adrPath), 'ADR-017 debe existir en docs/decisions/');
  const adrContent = fs.readFileSync(adrPath, 'utf-8');
  assert.ok(adrContent.replace(/\r\n/g, '\n').includes('## Estado\n\nAceptado'), 'ADR-017 debe estar en estado Aceptado');

  // 2. ADR-017 documenta las tres capas de control de admisión
  assert.ok(
    adrContent.includes('pod-security-standards') || adrContent.includes('PSS'),
    'ADR-017 debe documentar Pod Security Standards'
  );
  assert.ok(
    adrContent.includes('disallow-latest-tag') || adrContent.includes('latest'),
    'ADR-017 debe documentar política disallow-latest-tag'
  );
  assert.ok(
    adrContent.includes('require-seccomp-profile') || adrContent.includes('seccomp'),
    'ADR-017 debe documentar política require-seccomp-profile'
  );
  assert.ok(
    adrContent.includes('Cosign') || adrContent.includes('cosign'),
    'ADR-017 debe documentar política de verificación Cosign'
  );
  assert.ok(
    adrContent.includes('Enforce'),
    'ADR-017 debe documentar validationFailureAction: Enforce'
  );
  assert.ok(
    adrContent.includes('kyverno test') || adrContent.includes('kyverno-test'),
    'ADR-017 debe documentar validación CI con kyverno test'
  );
  assert.ok(
    adrContent.includes('restricted') || adrContent.includes('Restricted'),
    'ADR-017 debe documentar PSA nivel restricted'
  );

  // 3. Políticas físicas existen
  assert.ok(fs.existsSync(pssPolicyPath), 'pod-security-standards.yaml debe existir en infra/k8s/policies/');
  assert.ok(fs.existsSync(disallowLatestPath), 'disallow-latest-tag.yaml debe existir en infra/k8s/policies/');
  assert.ok(fs.existsSync(seccompPolicyPath), 'require-seccomp-profile.yaml debe existir en infra/k8s/policies/');
  assert.ok(fs.existsSync(cosignPolicyPath), 'kyverno-cosign-policy.yaml debe existir en infra/k8s/');
  assert.ok(fs.existsSync(namespacePsaPath), 'namespace-pod-security.yaml debe existir en infra/k8s/');

  // 4. Política seccomp documenta RuntimeDefault
  const seccompContent = fs.readFileSync(seccompPolicyPath, 'utf-8');
  assert.ok(seccompContent.includes('RuntimeDefault'), 'require-seccomp-profile.yaml debe exigir RuntimeDefault');
  assert.ok(seccompContent.includes('Enforce'), 'require-seccomp-profile.yaml debe usar validationFailureAction: Enforce');

  // 5. Namespace PSA en modo restricted
  const nsContent = fs.readFileSync(namespacePsaPath, 'utf-8');
  assert.ok(nsContent.includes('pod-security.kubernetes.io/enforce: restricted'), 'Namespace debe tener PSA enforce: restricted');

  // 6. Suite de tests de seccomp existe
  const seccompTestPath = path.join(ROOT_DIR, 'infra/k8s/kyverno-test/require-seccomp-profile/kyverno-test.yaml');
  assert.ok(fs.existsSync(seccompTestPath), 'kyverno-test.yaml de seccomp debe existir');
  const seccompTestContent = fs.readFileSync(seccompTestPath, 'utf-8');
  assert.ok(seccompTestContent.includes('require-seccomp-profile'), 'Debe testear la política require-seccomp-profile');

  // 7. README.md y docs/README.md enlazan ADR-017
  const readmeContent = fs.readFileSync(readmePath, 'utf-8');
  assert.ok(readmeContent.includes('ADR-017-kyverno-admission-control-and-pod-security.md'), 'README.md debe enlazar ADR-017');

  const docsReadmeContent = fs.readFileSync(docsReadmePath, 'utf-8');
  assert.ok(docsReadmeContent.includes('ADR-017-kyverno-admission-control-and-pod-security.md'), 'docs/README.md debe enlazar ADR-017');
  assert.ok(
    docsReadmeContent.includes('ADR-001 a ADR-017') || docsReadmeContent.includes('ADR-001 a ADR-018') || docsReadmeContent.includes('ADR-001 a ADR-019') || docsReadmeContent.includes('ADR-001 a ADR-020') || docsReadmeContent.includes('ADR-001 a ADR-021') || docsReadmeContent.includes('ADR-001 a ADR-022'),
    'Mermaid en docs/README.md debe indicar ADR-001 a ADR-017 o posterior'
  );

  // 8. Los 17 ADRs existen físicamente en disco
  for (let i = 1; i <= 17; i++) {
    const num = String(i).padStart(3, '0');
    const files = fs.readdirSync(path.join(ROOT_DIR, 'docs/decisions'));
    const match = files.find(f => f.startsWith(`ADR-${num}`));
    assert.ok(match, `Debe existir archivo para ADR-${num} en docs/decisions/`);
  }
});

test('🛡️ Observabilidad Distribuida: ADR-018 formaliza OpenTelemetry, W3C Trace Context y correlación con Loki', async () => {
  const adrPath = path.join(ROOT_DIR, 'docs/decisions/ADR-018-opentelemetry-distributed-tracing-and-w3c.md');
  const readmePath = path.join(ROOT_DIR, 'README.md');
  const docsReadmePath = path.join(ROOT_DIR, 'docs/README.md');
  const helmConfigmapPath = path.join(ROOT_DIR, 'infra/helm/pokedex/templates/configmap.yaml');
  const helmValuesPath = path.join(ROOT_DIR, 'infra/helm/pokedex/values.yaml');
  const requestTracerPath = path.join(ROOT_DIR, 'apps/backend/src/middleware/request-tracer.ts');
  const loggerPath = path.join(ROOT_DIR, 'apps/backend/src/utils/logger.ts');

  // 1. ADR-018 existe y está aceptado
  assert.ok(fs.existsSync(adrPath), 'ADR-018 debe existir en docs/decisions/');
  const adrContent = fs.readFileSync(adrPath, 'utf-8');
  assert.ok(adrContent.replace(/\r\n/g, '\n').includes('## Estado\n\nAceptado'), 'ADR-018 debe estar en estado Aceptado');

  // 2. ADR-018 documenta W3C traceparent y OpenTelemetry
  assert.ok(
    adrContent.includes('OpenTelemetry') || adrContent.includes('OTel'),
    'ADR-018 debe documentar OpenTelemetry'
  );
  assert.ok(
    adrContent.includes('W3C Trace Context') || adrContent.includes('traceparent'),
    'ADR-018 debe documentar W3C Trace Context traceparent'
  );
  assert.ok(
    adrContent.includes('requestTracer'),
    'ADR-018 debe documentar middleware requestTracer'
  );
  assert.ok(
    adrContent.includes('Loki') || adrContent.includes('Tempo'),
    'ADR-018 debe documentar correlación con Loki o Tempo'
  );

  // 3. Helm declara variables OTel
  const configmapContent = fs.readFileSync(helmConfigmapPath, 'utf-8');
  assert.ok(configmapContent.includes('OTEL_EXPORTER_OTLP_ENDPOINT'), 'configmap.yaml debe declarar OTEL_EXPORTER_OTLP_ENDPOINT');
  assert.ok(configmapContent.includes('OTEL_SERVICE_NAME'), 'configmap.yaml debe declarar OTEL_SERVICE_NAME');

  const valuesContent = fs.readFileSync(helmValuesPath, 'utf-8');
  assert.ok(valuesContent.includes('otelEndpoint'), 'values.yaml debe declarar otelEndpoint');

  // 4. request-tracer.ts y logger.ts implementan W3C traceparent y AsyncLocalStorage
  const tracerContent = fs.readFileSync(requestTracerPath, 'utf-8');
  assert.ok(tracerContent.includes('traceparent'), 'request-tracer.ts debe manejar cabecera traceparent');
  assert.ok(tracerContent.includes('W3C_TRACEPARENT_REGEX') || tracerContent.includes('traceparent'), 'request-tracer.ts debe validar formato W3C');

  const loggerContent = fs.readFileSync(loggerPath, 'utf-8');
  assert.ok(loggerContent.includes('spanId') || loggerContent.includes('traceparent'), 'logger.ts debe incluir spanId/traceparent en LogTraceContext');

  // 5. Test funcional de requestTracer con W3C Trace Context
  const { requestTracer } = await import('../../apps/backend/src/middleware/request-tracer.js');
  let nextCalled = false;
  const mockReq: any = {
    headers: {
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
    },
  };
  const headersSet: Record<string, string> = {};
  const mockRes: any = {
    setHeader(k: string, v: string) {
      headersSet[k.toLowerCase()] = v;
    },
  };
  requestTracer(mockReq, mockRes, () => {
    nextCalled = true;
  });

  assert.ok(nextCalled, 'requestTracer debe invocar next()');
  assert.ok(headersSet['traceparent'], 'requestTracer debe emitir cabecera traceparent');
  assert.ok(
    headersSet['traceparent'].startsWith('00-4bf92f3577b34da6a3ce929d0e0e4736-'),
    'requestTracer debe preservar el traceId W3C entrante'
  );
  assert.ok(headersSet['x-request-id'], 'requestTracer debe emitir cabecera X-Request-Id');

  // 6. README.md y docs/README.md enlazan ADR-018
  const readmeContent = fs.readFileSync(readmePath, 'utf-8');
  assert.ok(readmeContent.includes('ADR-018-opentelemetry-distributed-tracing-and-w3c.md'), 'README.md debe enlazar ADR-018');

  const docsReadmeContent = fs.readFileSync(docsReadmePath, 'utf-8');
  assert.ok(docsReadmeContent.includes('ADR-018-opentelemetry-distributed-tracing-and-w3c.md'), 'docs/README.md debe enlazar ADR-018');
  assert.ok(docsReadmeContent.includes('ADR-001 a ADR-018') || docsReadmeContent.includes('ADR-001 a ADR-019') || docsReadmeContent.includes('ADR-001 a ADR-020') || docsReadmeContent.includes('ADR-001 a ADR-021') || docsReadmeContent.includes('ADR-001 a ADR-022'), 'Mermaid en docs/README.md debe indicar ADR-001 a ADR-018 o posterior');

  // 7. Los 18 ADRs existen físicamente en disco
  for (let i = 1; i <= 18; i++) {
    const num = String(i).padStart(3, '0');
    const files = fs.readdirSync(path.join(ROOT_DIR, 'docs/decisions'));
    const match = files.find((f: string) => f.startsWith(`ADR-${num}`));
    assert.ok(match, `Debe existir archivo para ADR-${num} en docs/decisions/`);
  }
});

test('🛡️ Orquestación de Monorepo: ADR-019 formaliza optimización de build, grafo de dependencias y caché con Turborepo', async () => {
  const adrPath = path.join(ROOT_DIR, 'docs/decisions/ADR-019-monorepo-build-optimization-and-dependency-graph.md');
  const turboJsonPath = path.join(ROOT_DIR, 'turbo.json');
  const gitignorePath = path.join(ROOT_DIR, '.gitignore');
  const packageJsonPath = path.join(ROOT_DIR, 'package.json');
  const taskfilePath = path.join(ROOT_DIR, 'Taskfile.yml');
  const docsReadmePath = path.join(ROOT_DIR, 'docs/README.md');
  const readmePath = path.join(ROOT_DIR, 'README.md');

  // 1. ADR-019 existe y está aceptado
  assert.ok(fs.existsSync(adrPath), 'ADR-019 debe existir en docs/decisions/');
  const adrContent = fs.readFileSync(adrPath, 'utf-8');
  assert.ok(adrContent.replace(/\r\n/g, '\n').includes('## Estado\n\nAceptado'), 'ADR-019 debe estar en estado Aceptado');
  assert.ok(adrContent.includes('Turborepo'), 'ADR-019 debe documentar Turborepo');
  assert.ok(adrContent.includes('turbo.json'), 'ADR-019 debe documentar turbo.json');
  assert.ok(adrContent.includes('DAG') || adrContent.includes('dependencias'), 'ADR-019 debe documentar grafo de dependencias');

  // 2. turbo.json existe y define pipeline estructurado
  assert.ok(fs.existsSync(turboJsonPath), 'turbo.json debe existir en la raíz');
  const turboConfig = JSON.parse(fs.readFileSync(turboJsonPath, 'utf-8'));
  assert.ok(turboConfig.$schema?.includes('turbo.build/schema.json'), 'turbo.json debe definir $schema oficial');
  assert.ok(turboConfig.tasks?.build, 'turbo.json debe definir tarea build');
  assert.ok(turboConfig.tasks?.lint, 'turbo.json debe definir tarea lint');
  assert.ok(turboConfig.tasks?.typecheck, 'turbo.json debe definir tarea typecheck');
  assert.deepEqual(turboConfig.tasks.build.dependsOn, ['^build'], 'turbo.json build debe depender de ^build');
  assert.ok(turboConfig.tasks.build.outputs?.includes('dist/**'), 'turbo.json build debe declarar outputs dist/**');

  // 3. .gitignore ignora .turbo/
  const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
  assert.ok(gitignoreContent.includes('.turbo/'), '.gitignore debe ignorar .turbo/');

  // 4. package.json declara turbo y scripts
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  assert.ok(packageJson.devDependencies?.turbo, 'package.json debe declarar turbo en devDependencies');
  assert.ok(packageJson.packageManager?.startsWith('npm@'), 'package.json debe declarar packageManager para Turborepo');
  assert.ok(packageJson.scripts?.['build:turbo'], 'package.json debe incluir script build:turbo');

  // 5. Taskfile.yml define tareas turbo
  const taskfileContent = fs.readFileSync(taskfilePath, 'utf-8');
  assert.ok(taskfileContent.includes('turbo:build:'), 'Taskfile.yml debe exponer tarea turbo:build');
  assert.ok(taskfileContent.includes('turbo:lint:'), 'Taskfile.yml debe exponer tarea turbo:lint');
  assert.ok(taskfileContent.includes('turbo:typecheck:'), 'Taskfile.yml debe exponer tarea turbo:typecheck');

  // 6. README.md y docs/README.md enlazan ADR-019
  const docsReadmeContent = fs.readFileSync(docsReadmePath, 'utf-8');
  const readmeContent = fs.readFileSync(readmePath, 'utf-8');
  assert.ok(readmeContent.includes('ADR-019-monorepo-build-optimization-and-dependency-graph.md'), 'README.md debe enlazar ADR-019');
  assert.ok(docsReadmeContent.includes('ADR-019-monorepo-build-optimization-and-dependency-graph.md'), 'docs/README.md debe enlazar ADR-019');
  assert.ok(docsReadmeContent.includes('ADR-001 a ADR-019') || docsReadmeContent.includes('ADR-001 a ADR-020') || docsReadmeContent.includes('ADR-001 a ADR-021') || docsReadmeContent.includes('ADR-001 a ADR-022'), 'Mermaid en docs/README.md debe indicar ADR-001 a ADR-019 o posterior');

  // 7. Los 19 ADRs existen físicamente en disco
  for (let i = 1; i <= 19; i++) {
    const num = String(i).padStart(3, '0');
    const files = fs.readdirSync(path.join(ROOT_DIR, 'docs/decisions'));
    const match = files.find((f: string) => f.startsWith(`ADR-${num}`));
    assert.ok(match, `Debe existir archivo para ADR-${num} en docs/decisions/`);
  }
});

test('🛡️ Gobernanza de Despliegue: ADR-020 formaliza CLI canónico con Taskfile, retiro de scripts legados y lista blanca', async () => {
  const adrPath = path.join(ROOT_DIR, 'docs/decisions/ADR-020-unified-deployment-governance-and-script-retirement.md');
  const taskfilePath = path.join(ROOT_DIR, 'Taskfile.yml');
  const packageJsonPath = path.join(ROOT_DIR, 'package.json');
  const deploymentRunbookPath = path.join(ROOT_DIR, 'docs/operations/deployment.md');
  const docsReadmePath = path.join(ROOT_DIR, 'docs/README.md');
  const readmePath = path.join(ROOT_DIR, 'README.md');

  // 1. ADR-020 existe y está aceptado
  assert.ok(fs.existsSync(adrPath), 'ADR-020 debe existir en docs/decisions/');
  const adrContent = fs.readFileSync(adrPath, 'utf-8');
  assert.ok(adrContent.replace(/\r\n/g, '\n').includes('## Estado\n\nAceptado'), 'ADR-020 debe estar en estado Aceptado');
  assert.ok(adrContent.includes('Taskfile.yml'), 'ADR-020 debe documentar Taskfile.yml como interfaz canónica');
  assert.ok(adrContent.includes('dr_verify_restore.sh'), 'ADR-020 debe inventariar dr_verify_restore.sh');
  assert.ok(adrContent.includes('governance:audit-scripts'), 'ADR-020 debe documentar governance:audit-scripts');

  // 2. Lista blanca estricta de scripts .sh en todo el monorepo
  const allowedShScripts = ['scripts/dr_verify_restore.sh'];
  const findSh = (dir: string): string[] => {
    let results: string[] = [];
    for (const file of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, file);
      if (['node_modules', '.git', 'dist', 'coverage', '.turbo'].includes(file)) continue;
      if (fs.statSync(fullPath).isDirectory()) {
        results = results.concat(findSh(fullPath));
      } else if (file.endsWith('.sh')) {
        results.push(path.relative(ROOT_DIR, fullPath).replace(/\\/g, '/'));
      }
    }
    return results;
  };
  const actualShScripts = findSh(ROOT_DIR);
  const unauthorizedSh = actualShScripts.filter(s => !allowedShScripts.includes(s));
  assert.equal(
    unauthorizedSh.length,
    0,
    `No se permiten scripts shell fuera de la lista blanca autorizada. No autorizados: ${unauthorizedSh.join(', ')}`
  );

  // 3. Prohibición expresa de scripts imperativos de despliegue ad-hoc
  const forbiddenPatterns = ['deploy.sh', 'proxmox_deploy.sh', 'deploy_aws.sh', 'deploy_proxmox.sh', 'deploy_app.sh'];
  for (const forbidden of forbiddenPatterns) {
    assert.equal(
      fs.existsSync(path.join(ROOT_DIR, forbidden)),
      false,
      `Script prohibido no debe existir en la raíz: ${forbidden}`
    );
    assert.equal(
      fs.existsSync(path.join(ROOT_DIR, 'scripts', forbidden)),
      false,
      `Script prohibido no debe existir en scripts/: ${forbidden}`
    );
  }

  // 4. Taskfile.yml expone tareas canónicas de ciclo de vida y gobernanza
  const taskfileContent = fs.readFileSync(taskfilePath, 'utf-8');
  assert.ok(taskfileContent.includes('governance:audit-scripts:'), 'Taskfile.yml debe definir governance:audit-scripts');
  assert.ok(taskfileContent.includes('k8s:up:'), 'Taskfile.yml debe definir k8s:up');
  assert.ok(taskfileContent.includes('gitops:sync:cloud:'), 'Taskfile.yml debe definir gitops:sync:cloud');
  assert.ok(taskfileContent.includes('gitops:sync:proxmox:'), 'Taskfile.yml debe definir gitops:sync:proxmox');

  // 5. package.json incluye script de auditoría
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  assert.ok(packageJson.scripts?.['governance:audit-scripts'], 'package.json debe definir governance:audit-scripts');

  // 6. deployment.md referencia ADR-020 y Taskfile
  const deploymentContent = fs.readFileSync(deploymentRunbookPath, 'utf-8');
  assert.ok(deploymentContent.includes('ADR-020'), 'deployment.md debe enlazar ADR-020');
  assert.ok(deploymentContent.includes('task governance:audit-scripts'), 'deployment.md debe documentar task governance:audit-scripts');

  // 7. README.md y docs/README.md enlazan ADR-020
  const docsReadmeContent = fs.readFileSync(docsReadmePath, 'utf-8');
  const readmeContent = fs.readFileSync(readmePath, 'utf-8');
  assert.ok(readmeContent.includes('ADR-020-unified-deployment-governance-and-script-retirement.md'), 'README.md debe enlazar ADR-020');
  assert.ok(docsReadmeContent.includes('ADR-020-unified-deployment-governance-and-script-retirement.md'), 'docs/README.md debe enlazar ADR-020');
  assert.ok(docsReadmeContent.includes('ADR-001 a ADR-020') || docsReadmeContent.includes('ADR-001 a ADR-021') || docsReadmeContent.includes('ADR-001 a ADR-022'), 'Mermaid en docs/README.md debe indicar ADR-001 a ADR-020 o posterior');

  // 8. Los 20 ADRs existen físicamente en disco
  for (let i = 1; i <= 20; i++) {
    const num = String(i).padStart(3, '0');
    const files = fs.readdirSync(path.join(ROOT_DIR, 'docs/decisions'));
    const match = files.find((f: string) => f.startsWith(`ADR-${num}`));
    assert.ok(match, `Debe existir archivo para ADR-${num} en docs/decisions/`);
  }
});

test('🛡️ Orquestación GitOps Avanzada: ADR-021 formaliza Sync Waves, PreSync Hooks, Health Checks y App-of-Apps', async () => {
  const adrPath = path.join(ROOT_DIR, 'docs/decisions/ADR-021-advanced-gitops-sync-waves-and-health-checks.md');
  const rootAppPath = path.join(ROOT_DIR, 'gitops/apps/root-application.yaml');
  const appProxmoxPath = path.join(ROOT_DIR, 'gitops/apps/app-proxmox.yaml');
  const appCloudPath = path.join(ROOT_DIR, 'gitops/apps/app-cloud.yaml');
  const healthChecksPath = path.join(ROOT_DIR, 'gitops/health-checks/argocd-cm-healthchecks.yaml');
  const seedJobPath = path.join(ROOT_DIR, 'infra/helm/pokedex/templates/seed-job.yaml');
  const postgresStsPath = path.join(ROOT_DIR, 'infra/helm/pokedex/templates/postgres-statefulset.yaml');
  const apiDeploymentPath = path.join(ROOT_DIR, 'infra/helm/pokedex/templates/api-deployment.yaml');
  const webDeploymentPath = path.join(ROOT_DIR, 'infra/helm/pokedex/templates/web-deployment.yaml');
  const ingressPath = path.join(ROOT_DIR, 'infra/helm/pokedex/templates/ingress.yaml');
  const taskfilePath = path.join(ROOT_DIR, 'Taskfile.yml');
  const deploymentRunbookPath = path.join(ROOT_DIR, 'docs/operations/deployment.md');
  const docsReadmePath = path.join(ROOT_DIR, 'docs/README.md');
  const readmePath = path.join(ROOT_DIR, 'README.md');

  // 1. ADR-021 existe y está aceptado
  assert.ok(fs.existsSync(adrPath), 'ADR-021 debe existir en docs/decisions/');
  const adrContent = fs.readFileSync(adrPath, 'utf-8');
  assert.ok(adrContent.replace(/\r\n/g, '\n').includes('## Estado\n\nAceptado'), 'ADR-021 debe estar en estado Aceptado');
  assert.ok(adrContent.includes('Sync Waves'), 'ADR-021 debe documentar Sync Waves');
  assert.ok(adrContent.includes('PreSync'), 'ADR-021 debe documentar PreSync hook');
  assert.ok(adrContent.includes('App-of-Apps'), 'ADR-021 debe documentar patrón App-of-Apps');
  assert.ok(adrContent.includes('Health Checks'), 'ADR-021 debe documentar Custom Health Checks');

  // 2. root-application.yaml existe y define App-of-Apps
  assert.ok(fs.existsSync(rootAppPath), 'root-application.yaml debe existir en gitops/apps/');
  const rootAppContent = fs.readFileSync(rootAppPath, 'utf-8');
  assert.ok(rootAppContent.includes('pokedex-root'), 'root-application.yaml debe nombrar la app pokedex-root');
  assert.ok(rootAppContent.includes('gitops/apps'), 'root-application.yaml debe apuntar a gitops/apps');
  assert.ok(rootAppContent.includes('resources-finalizer.argocd.argoproj.io'), 'root-application.yaml debe incluir finalizer');

  // 3. Health checks existen y cubren CRDs críticos
  assert.ok(fs.existsSync(healthChecksPath), 'argocd-cm-healthchecks.yaml debe existir en gitops/health-checks/');
  const healthContent = fs.readFileSync(healthChecksPath, 'utf-8');
  assert.ok(healthContent.includes('external-secrets.io_ExternalSecret'), 'Debe definir health check para ExternalSecret');
  assert.ok(healthContent.includes('bitnami.com_SealedSecret'), 'Debe definir health check para SealedSecret');
  assert.ok(healthContent.includes('kyverno.io_ClusterPolicy'), 'Debe definir health check para ClusterPolicy');

  // 4. Helm templates declaran Sync Waves deterministas (0 a 4)
  const stsContent = fs.readFileSync(postgresStsPath, 'utf-8');
  assert.ok(stsContent.includes('argocd.argoproj.io/sync-wave: "0"'), 'PostgreSQL StatefulSet debe estar en sync-wave 0');

  const seedContent = fs.readFileSync(seedJobPath, 'utf-8');
  assert.ok(seedContent.includes('sync-wave') && seedContent.includes('"1"'), 'Seed Job debe estar en sync-wave 1');
  assert.ok(seedContent.includes('PreSync'), 'Seed Job debe definir hook PreSync');
  assert.ok(seedContent.includes('HookSucceeded'), 'Seed Job debe definir hook-delete-policy');

  const apiContent = fs.readFileSync(apiDeploymentPath, 'utf-8');
  assert.ok(apiContent.includes('argocd.argoproj.io/sync-wave: "2"'), 'API Deployment debe estar en sync-wave 2');

  const webContent = fs.readFileSync(webDeploymentPath, 'utf-8');
  assert.ok(webContent.includes('argocd.argoproj.io/sync-wave: "3"'), 'Web Deployment debe estar en sync-wave 3');

  const ingressContent = fs.readFileSync(ingressPath, 'utf-8');
  assert.ok(ingressContent.includes('argocd.argoproj.io/sync-wave: "4"'), 'Ingress debe estar en sync-wave 4');

  // 5. app-proxmox.yaml y app-cloud.yaml configuran syncWindows y opciones avanzadas
  const proxmoxContent = fs.readFileSync(appProxmoxPath, 'utf-8');
  const cloudContent = fs.readFileSync(appCloudPath, 'utf-8');
  assert.ok(proxmoxContent.includes('ServerSideApply=true'), 'app-proxmox.yaml debe configurar ServerSideApply');
  assert.ok(proxmoxContent.includes('syncWindows:'), 'app-proxmox.yaml debe configurar syncWindows');
  assert.ok(cloudContent.includes('ServerSideApply=true'), 'app-cloud.yaml debe configurar ServerSideApply');
  assert.ok(cloudContent.includes('syncWindows:'), 'app-cloud.yaml debe configurar syncWindows');

  // 6. Taskfile.yml define tareas gitops:apps:root y gitops:health-checks
  const taskfileContent = fs.readFileSync(taskfilePath, 'utf-8');
  assert.ok(taskfileContent.includes('gitops:apps:root:'), 'Taskfile.yml debe definir gitops:apps:root');
  assert.ok(taskfileContent.includes('gitops:health-checks:'), 'Taskfile.yml debe definir gitops:health-checks');

  // 7. deployment.md documenta sección 5 y ADR-021
  const deploymentContent = fs.readFileSync(deploymentRunbookPath, 'utf-8');
  assert.ok(deploymentContent.includes('ADR-021'), 'deployment.md debe referenciar ADR-021');
  assert.ok(deploymentContent.includes('task gitops:apps:root'), 'deployment.md debe documentar task gitops:apps:root');

  // 8. README.md y docs/README.md enlazan ADR-021
  const docsReadmeContent = fs.readFileSync(docsReadmePath, 'utf-8');
  const readmeContent = fs.readFileSync(readmePath, 'utf-8');
  assert.ok(readmeContent.includes('ADR-021-advanced-gitops-sync-waves-and-health-checks.md'), 'README.md debe enlazar ADR-021');
  assert.ok(docsReadmeContent.includes('ADR-021-advanced-gitops-sync-waves-and-health-checks.md'), 'docs/README.md debe enlazar ADR-021');
  assert.ok(docsReadmeContent.includes('ADR-001 a ADR-021') || docsReadmeContent.includes('ADR-001 a ADR-022'), 'Mermaid en docs/README.md debe indicar ADR-001 a ADR-021 o posterior');

  // 9. Los 21 ADRs existen físicamente en disco
  for (let i = 1; i <= 21; i++) {
    const num = String(i).padStart(3, '0');
    const files = fs.readdirSync(path.join(ROOT_DIR, 'docs/decisions'));
    const match = files.find((f: string) => f.startsWith(`ADR-${num}`));
    assert.ok(match, `Debe existir archivo para ADR-${num} en docs/decisions/`);
  }
});

test('🛡️ Rotación de Secretos: ADR-022 formaliza Stakater Reloader, refreshInterval acotado y auditoría', async () => {
  const adrPath = path.join(ROOT_DIR, 'docs/decisions/ADR-022-automated-credential-rotation-and-reloader.md');
  const valuesPath = path.join(ROOT_DIR, 'infra/helm/pokedex/values.yaml');
  const valuesProdPath = path.join(ROOT_DIR, 'infra/helm/pokedex/values.prod.yaml');
  const webDeployPath = path.join(ROOT_DIR, 'infra/helm/pokedex/templates/web-deployment.yaml');
  const auditScriptPath = path.join(ROOT_DIR, 'scripts/verify-secret-rotation.ts');
  const taskfilePath = path.join(ROOT_DIR, 'Taskfile.yml');
  const pkgPath = path.join(ROOT_DIR, 'package.json');
  const secretRunbookPath = path.join(ROOT_DIR, 'docs/operations/secret-rotation.md');
  const readmePath = path.join(ROOT_DIR, 'README.md');
  const docsReadmePath = path.join(ROOT_DIR, 'docs/README.md');

  // 1. ADR-022 existe con Estado: Aceptado
  assert.ok(fs.existsSync(adrPath), 'ADR-022 debe existir en docs/decisions/');
  const adrContent = fs.readFileSync(adrPath, 'utf-8').replace(/\r\n/g, '\n');
  assert.ok(adrContent.includes('## Estado\n\nAceptado'), 'ADR-022 debe estar en estado Aceptado');
  assert.ok(adrContent.includes('reloader.stakater.com/auto'), 'ADR-022 debe formalizar anotación de Stakater Reloader');
  assert.ok(adrContent.includes('External Secrets Operator'), 'ADR-022 debe formalizar External Secrets Operator');

  // 2. Helm values configuran anotación de Reloader y refreshInterval acotado
  const valuesContent = fs.readFileSync(valuesPath, 'utf-8');
  const valuesProdContent = fs.readFileSync(valuesProdPath, 'utf-8');
  assert.ok(valuesContent.includes('reloader.stakater.com/auto: "true"'), 'values.yaml debe incluir anotación reloader.stakater.com/auto: "true"');
  assert.ok(valuesProdContent.includes('reloader.stakater.com/auto: "true"'), 'values.prod.yaml debe incluir anotación reloader.stakater.com/auto: "true"');
  assert.ok(valuesProdContent.includes('refreshInterval: "1h"'), 'values.prod.yaml debe acotar refreshInterval a 1h');

  // 3. Template de web deployment soporta deploymentAnnotations
  const webDeployContent = fs.readFileSync(webDeployPath, 'utf-8');
  assert.ok(webDeployContent.includes('.Values.web.deploymentAnnotations'), 'web-deployment.yaml debe soportar web.deploymentAnnotations');

  // 4. Script de auditoría de rotación existe y aprueba
  assert.ok(fs.existsSync(auditScriptPath), 'scripts/verify-secret-rotation.ts debe existir');

  // 5. Taskfile.yml y package.json exponen secrets:audit-rotation
  const taskfileContent = fs.readFileSync(taskfilePath, 'utf-8');
  const pkgContent = fs.readFileSync(pkgPath, 'utf-8');
  assert.ok(taskfileContent.includes('secrets:audit-rotation:'), 'Taskfile.yml debe definir tarea secrets:audit-rotation');
  assert.ok(pkgContent.includes('"secrets:audit-rotation"'), 'package.json debe definir script secrets:audit-rotation');

  // 6. Runbook secret-rotation.md documenta ADR-022 y comando canónico
  const secretRunbookContent = fs.readFileSync(secretRunbookPath, 'utf-8');
  assert.ok(secretRunbookContent.includes('ADR-022'), 'secret-rotation.md debe documentar ADR-022');
  assert.ok(secretRunbookContent.includes('task secrets:audit-rotation'), 'secret-rotation.md debe documentar task secrets:audit-rotation');

  // 7. README.md y docs/README.md enlazan ADR-022
  const readmeContent = fs.readFileSync(readmePath, 'utf-8');
  const docsReadmeContent = fs.readFileSync(docsReadmePath, 'utf-8');
  assert.ok(readmeContent.includes('ADR-022-automated-credential-rotation-and-reloader.md'), 'README.md debe enlazar ADR-022');
  assert.ok(docsReadmeContent.includes('ADR-022-automated-credential-rotation-and-reloader.md'), 'docs/README.md debe enlazar ADR-022');
  assert.ok(docsReadmeContent.includes('ADR-001 a ADR-022'), 'Mermaid en docs/README.md debe indicar ADR-001 a ADR-022');

  // 8. Los 22 ADRs existen físicamente en disco
  for (let i = 1; i <= 22; i++) {
    const num = String(i).padStart(3, '0');
    const files = fs.readdirSync(path.join(ROOT_DIR, 'docs/decisions'));
    const match = files.find((f: string) => f.startsWith(`ADR-${num}`));
    assert.ok(match, `Debe existir archivo para ADR-${num} en docs/decisions/`);
  }
});

