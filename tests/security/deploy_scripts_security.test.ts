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
  const content = fs.readFileSync(baselinePath, 'utf-8');
  assert.ok(content.includes('ufw'), 'host_baseline.yml debe configurar firewall ufw');
  assert.ok(!content.includes('ignore_errors: true'), 'host_baseline.yml no debe ocultar fallos con ignore_errors: true');
  assert.ok(content.includes('docker info'), 'host_baseline.yml debe verificar el funcionamiento de Docker');
  assert.ok(content.includes('install_docker'), 'host_baseline.yml debe permitir condicionar el runtime de contenedores');
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
  const content = fs.readFileSync(playbookPath, 'utf-8');

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





