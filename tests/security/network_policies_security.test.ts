/**
 * ==============================================================================
 * Test de Seguridad y Arquitectura: Políticas de Red Zero-Trust, Cilium L7, Nginx Hardening y Anti-SSRF
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

test('🛡️ Helm Security: CiliumNetworkPolicy implementa filtrado L7 FQDN eBPF (Gemini, PokeAPI, GitHub)', () => {
  const cnpPath = path.join(ROOT_DIR, 'infra/helm/pokedex/templates/cilium-network-policies.yaml');
  assert.ok(fs.existsSync(cnpPath), 'cilium-network-policies.yaml debe existir');
  const lines = fs.readFileSync(cnpPath, 'utf-8').split(/\r?\n/).map(l => l.trim());

  assert.ok(lines.some(l => l === 'kind: CiliumNetworkPolicy'), 'Debe ser de tipo CiliumNetworkPolicy');
  assert.ok(lines.some(l => l.includes('matchName') && l.includes('generativelanguage')), 'Debe permitir generativelanguage');
  assert.ok(lines.some(l => l.includes('matchPattern') && l.includes('pokeapi')), 'Debe permitir pokeapi');
  assert.ok(lines.some(l => l.includes('matchPattern') && l.includes('githubusercontent')), 'Debe permitir githubusercontent');
  assert.ok(lines.some(l => l.includes('port: "443"')), 'Debe permitir puerto HTTPS 443');
  assert.ok(lines.some(l => l.includes('k8s-app: kube-dns')), 'Debe permitir DNS interno en CoreDNS');
});

test('🛡️ Helm Security: network-policies.yaml consolida egress directo L4 con Anti-SSRF estricto', () => {
  const npPath = path.join(ROOT_DIR, 'infra/helm/pokedex/templates/network-policies.yaml');
  const content = fs.readFileSync(npPath, 'utf-8');

  assert.ok(!content.includes('egress-gateway'), 'network-policies.yaml no debe contener dependencias de egress-gateway tras la poda');
  assert.ok(content.includes('169.254.169.254/32'), 'Debe bloquear IMDS Cloud Metadata');
  assert.ok(content.includes('10.0.0.0/8'), 'Debe bloquear RFC1918 Clase A');
  assert.ok(content.includes('172.16.0.0/12'), 'Debe bloquear RFC1918 Clase B');
  assert.ok(content.includes('192.168.0.0/16'), 'Debe bloquear RFC1918 Clase C');
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

test('🛡️ Helm Security: values.prod.yaml exige Zero-Trust L7 (Cilium FQDN o Egress Gateway) sin fallback permisivo', () => {
  const prodValuesPath = path.join(ROOT_DIR, 'infra/helm/pokedex/values.prod.yaml');
  assert.ok(fs.existsSync(prodValuesPath), 'values.prod.yaml debe existir');
  const content = fs.readFileSync(prodValuesPath, 'utf-8');

  assert.ok(content.includes('externalHttps: false'), 'values.prod.yaml debe deshabilitar externalHttps para evitar 0.0.0.0/0 abierto');
  assert.ok(content.includes('ciliumNetworkPolicy:'), 'values.prod.yaml debe configurar ciliumNetworkPolicy');
  assert.ok(content.includes('enabled: true'), 'values.prod.yaml debe habilitar ciliumNetworkPolicy');
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
