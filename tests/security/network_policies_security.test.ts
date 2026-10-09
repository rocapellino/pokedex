/**
 * ==============================================================================
 * Test de Seguridad y Arquitectura: Políticas de Red Zero-Trust, Cilium L7 y Anti-SSRF
 * ==============================================================================
 *
 * Las políticas se verifican sobre el chart renderizado con `helm template` (default, prod y pre-prod), no sobre el
 * texto de la plantilla: una regla dentro de un `{{ if }}` que no se cumple, o una clave mal indentada, siguen
 * "apareciendo" en el texto pero no llegan al clúster.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { assertDocsPortalLinksAdrIndex } from '../helpers/docs-portal.js';
import { type K8sDoc, PROFILES, renderChart } from '../helpers/helm-render.js';
import { ROOT_DIR } from '../helpers/repo.js';
import { readYaml } from '../helpers/yaml.js';

const IMDS = '169.254.169.254/32';
const SSRF_BLOCKED_CIDRS = [IMDS, '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '127.0.0.0/8'];
const FQDN_ALLOWLIST = [
  { matchName: 'generativelanguage.googleapis.com' },
  { matchPattern: '*.githubusercontent.com' },
  { matchPattern: '*.pokeapi.co' },
];

const networkPolicies = (docs: K8sDoc[]) => docs.filter((d) => d.kind === 'NetworkPolicy');
const policyNamed = (docs: K8sDoc[], suffix: string) =>
  networkPolicies(docs).find((d) => d.metadata.name.endsWith(suffix));
const hasKubeDnsRule = (rules: any[]) =>
  rules.some((r) =>
    (r.to ?? r.toEndpoints ?? []).some(
      (peer: any) => (peer.podSelector ?? peer).matchLabels?.['k8s-app'] === 'kube-dns',
    ),
  );

test('🛡️ Helm Security: default-deny de Ingress y NetworkPolicies de PostgreSQL y Redis con Egress aislado (egress: [])', () => {
  for (const [profile, files] of Object.entries(PROFILES)) {
    const docs = renderChart(files);

    const denyAll = policyNamed(docs, '-default-deny-all-ingress');
    assert.ok(denyAll, `[${profile}] debe renderizarse el default-deny de Ingress`);
    assert.deepEqual(denyAll.spec.podSelector, {}, `[${profile}] el default-deny debe seleccionar todos los pods`);
    assert.deepEqual(denyAll.spec.policyTypes, ['Ingress']);
    assert.equal(denyAll.spec.ingress, undefined, `[${profile}] default-deny no puede declarar reglas de entrada`);

    for (const [suffix, component] of [
      ['-allow-postgres-ingress', 'database'],
      ['-allow-redis-ingress', 'redis'],
    ]) {
      const policy = policyNamed(docs, suffix);
      assert.ok(policy, `[${profile}] debe renderizarse ${suffix}`);
      assert.equal(policy.spec.podSelector.matchLabels['app.kubernetes.io/component'], component);
      assert.ok(
        policy.spec.policyTypes.includes('Egress'),
        `[${profile}] ${suffix} debe incluir Egress en policyTypes`,
      );
      assert.deepEqual(policy.spec.egress, [], `[${profile}] ${suffix} debe aislar totalmente la salida (egress: [])`);
    }
  }
});

test('🛡️ Helm Security: la API resuelve DNS y ninguna política depende de egress-gateway', () => {
  for (const [profile, files] of Object.entries(PROFILES)) {
    const docs = renderChart(files);
    const api = policyNamed(docs, '-allow-api-ingress');
    assert.ok(api, `[${profile}] debe renderizarse la política de la API`);
    assert.ok(hasKubeDnsRule(api.spec.egress), `[${profile}] la API debe poder resolver DNS en CoreDNS`);

    const policies = docs.filter((d) => d.kind === 'NetworkPolicy' || d.kind === 'CiliumNetworkPolicy');
    assert.ok(
      !JSON.stringify(policies).includes('egress-gateway'),
      `[${profile}] ninguna política puede depender de egress-gateway tras la poda`,
    );
  }
});

test('🛡️ Helm Security: todo egress abierto a 0.0.0.0/0 excluye IMDS, RFC1918 y loopback (Anti-SSRF)', () => {
  // Pre-prod no tiene Cilium y habilita externalHttps: es el perfil que sí renderiza el ipBlock abierto.
  const preprodApi = policyNamed(renderChart(PROFILES.preprod), '-allow-api-ingress');
  assert.ok(preprodApi);
  const openRule = preprodApi.spec.egress.find((r: any) => r.to?.some((p: any) => p.ipBlock?.cidr === '0.0.0.0/0'));
  assert.ok(openRule, 'pre-prod debe renderizar el egress HTTPS externo');
  assert.deepEqual(openRule.ports, [{ protocol: 'TCP', port: 443 }], 'el egress externo solo puede ser TCP/443');

  // Invariante general: en cualquier perfil, un ipBlock de egress abierto lleva siempre la lista de exclusión.
  let openBlocks = 0;
  for (const files of Object.values(PROFILES)) {
    for (const policy of networkPolicies(renderChart(files))) {
      for (const rule of policy.spec.egress ?? []) {
        for (const peer of rule.to ?? []) {
          if (peer.ipBlock?.cidr !== '0.0.0.0/0') continue;
          openBlocks += 1;
          assert.deepEqual(
            SSRF_BLOCKED_CIDRS.filter((cidr) => !peer.ipBlock.except?.includes(cidr)),
            [],
            `${policy.metadata.name}: el egress a 0.0.0.0/0 debe excluir IMDS, RFC1918 y loopback`,
          );
        }
      }
    }
  }
  assert.ok(openBlocks > 0, 'debe evaluarse al menos un egress abierto (si no, el invariante no se comprueba)');

  // Con Cilium activo (default y prod) el egress externo lo gobierna la allowlist FQDN: no debe quedar nada abierto.
  for (const files of [PROFILES.default, PROFILES.prod]) {
    const api = policyNamed(renderChart(files), '-allow-api-ingress');
    assert.ok(api);
    assert.ok(
      !api.spec.egress.some((r: any) => r.to?.some((p: any) => p.ipBlock)),
      'con Cilium activo no debe renderizarse egress por ipBlock',
    );
  }
});

test('🛡️ Helm Security: CiliumNetworkPolicy aísla la API en L7 con una allowlist FQDN estricta (Gemini, PokeAPI, GitHub)', () => {
  for (const files of [PROFILES.default, PROFILES.prod]) {
    const cnp = renderChart(files).find(
      (d) => d.kind === 'CiliumNetworkPolicy' && d.metadata.name.endsWith('-api-cilium-l7-policy'),
    );
    assert.ok(cnp, 'debe renderizarse la CiliumNetworkPolicy');
    assert.equal(cnp.apiVersion, 'cilium.io/v2');
    assert.equal(cnp.spec.endpointSelector.matchLabels['app.kubernetes.io/component'], 'api');

    const fqdnRules = cnp.spec.egress.filter((r: any) => r.toFQDNs);
    assert.equal(fqdnRules.length, 1, 'debe existir exactamente una regla de salida por FQDN');
    assert.deepEqual(fqdnRules[0].toFQDNs, FQDN_ALLOWLIST, 'la allowlist FQDN debe ser exactamente la autorizada');
    assert.deepEqual(fqdnRules[0].toPorts, [{ ports: [{ port: '443', protocol: 'TCP' }] }], 'solo HTTPS (443/TCP)');

    assert.ok(hasKubeDnsRule(cnp.spec.egress), 'debe permitir DNS hacia CoreDNS');
    const dnsRule = cnp.spec.egress.find((r: any) => r.toEndpoints?.[0]?.matchLabels?.['k8s-app'] === 'kube-dns');
    assert.deepEqual(dnsRule.toPorts[0].rules.dns, [{ matchPattern: '*' }], 'el DNS pasa por inspección de nombres');

    const openRules = cnp.spec.egress.filter((r: any) => r.toCIDR || r.toCIDRSet || r.toEntities);
    assert.deepEqual(openRules, [], 'la política no puede abrir CIDR ni entidades (world) sin pasar por FQDN');
  }

  assert.ok(
    !renderChart(PROFILES.preprod).some((d) => d.kind === 'CiliumNetworkPolicy'),
    'pre-prod (sin Cilium) no debe renderizar CiliumNetworkPolicy',
  );
});

/**
 * INFRA-011 / ADR-030 — `values.prod.yaml` es la base del blueprint prod cloud.
 *
 * Solo `app-cloud.yaml` (inactiva, excluida del App-of-Apps) lo consume, como
 * capa intermedia entre `values.yaml` y `gitops/environments/cloud/`. Ninguna
 * Application activa puede consumirlo: si pre-prod lo heredara, recibiría el
 * perfil HA (PgBouncer, Reloader, HPA) que el perfil Lean de Proxmox descarta.
 */
test('🗂️ INFRA-011: solo el blueprint prod cloud consume values.prod.yaml', () => {
  const appsDir = 'gitops/apps';
  const appFiles = fs
    .readdirSync(path.join(ROOT_DIR, appsDir))
    .filter((f) => f.startsWith('app-') && f.endsWith('.yaml'));
  assert.ok(appFiles.length >= 2, 'Deben existir Applications de ArgoCD en gitops/apps');

  const valueFilesOf = (file: string): string[] => {
    const app = readYaml(`${appsDir}/${file}`);
    const sources = app.spec.sources ?? [app.spec.source];
    return sources.flatMap((source: any) => source?.helm?.valueFiles ?? []);
  };

  const consumers = appFiles.filter((f) => valueFilesOf(f).includes('values.prod.yaml'));
  assert.deepEqual(
    consumers,
    ['app-cloud.yaml'],
    'INFRA-011: values.prod.yaml solo puede consumirlo el blueprint prod cloud (app-cloud.yaml, ADR-030). ' +
      'Las Applications activas usan values.yaml + su override de gitops/environments/.',
  );

  assert.ok(
    valueFilesOf('app-proxmox-preprod.yaml').some((f) => f.endsWith('gitops/environments/proxmox-preprod/values.yaml')),
    'INFRA-011: pre-prod debe usar su override de gitops/environments/proxmox-preprod',
  );
});

/**
 * INFRA-011 — la cabecera de `values.prod.yaml` debe declarar su rol.
 *
 * Sin ese contexto, el archivo parece gobernar un entorno desplegado y las
 * aserciones de los tests vuelven a leerse como garantías operativas.
 */
test('🗂️ INFRA-011: la cabecera declara que es la base del blueprint inactivo', () => {
  // La asercion es INMUNE al final de linea y al locale. `values.prod.yaml` esta
  // versionado con CRLF y los runners Linux no convierten al hacer checkout, de
  // modo que el `\r` final y las vocales acentuadas impiden el match de una
  // expresion literal. Se normaliza el texto y se eliminan los caracteres no ASCII.
  const raw = fs.readFileSync(path.join(ROOT_DIR, 'infra/helm/pokedex/values.prod.yaml'), 'utf-8');
  // biome-ignore lint/suspicious/noControlCharactersInRegex: se eliminan caracteres no ASCII a proposito
  const prodValues = raw.replace(/\r\n/g, '\n').replace(/[^\x00-\x7F]/g, '');

  assert.match(
    prodValues,
    /BLUEPRINT PROD CLOUD/,
    'INFRA-011: values.prod.yaml debe rotularse como base del blueprint prod cloud',
  );
  assert.match(prodValues, /INACTIV/, 'INFRA-011: la cabecera debe declarar que el blueprint esta inactivo');
  assert.match(
    prodValues,
    /gitops\/environments\/cloud\//,
    'INFRA-011: la cabecera debe apuntar al override cloud que lo completa',
  );
});

test('🛡️ Helm Security: el perfil de referencia exige Zero-Trust L7 (Cilium FQDN) sin fallback permisivo', () => {
  // INFRA-011: `values.prod.yaml` es la base del blueprint prod cloud (inactivo, ADR-030). Se verifica que
  // mantiene la postura Zero-Trust L7 para que su activación parta de un perfil endurecido.
  const prod = readYaml('infra/helm/pokedex/values.prod.yaml');
  assert.equal(
    prod.networkPolicies.egress.externalHttps,
    false,
    'externalHttps debe ser false (sin 0.0.0.0/0 abierto)',
  );
  assert.equal(prod.networkPolicies.egress.antiSsrf, true);
  assert.equal(prod.ciliumNetworkPolicy.enabled, true, 'ciliumNetworkPolicy debe estar habilitada');
  assert.deepEqual(prod.ciliumNetworkPolicy.fqdnAllowlist, FQDN_ALLOWLIST);
});

test('🛡️ GITOPS-002: los entornos desplegables no deben declarar reglas de Ingress sin host', () => {
  // Variante CONSERVADORA aplicada: en lugar de eliminar la segunda regla, se restringe a un host explícito.
  // Así se cierra la exposición por `Host` arbitrario sin romper el acceso que hacían las pruebas.
  const deployableEnvs: Array<[string, string, readonly string[]]> = [
    ['proxmox-preprod', 'gitops/environments/proxmox-preprod/values.yaml', PROFILES.preprod],
  ];

  for (const [env, valuesPath, profile] of deployableEnvs) {
    // 1. Valores parseados: toda entrada de `ingress.hosts` debe tener un FQDN (un `host: ""` es un catch-all).
    const hosts: string[] = (readYaml(valuesPath).ingress?.hosts ?? []).map((h: any) => h.host);
    assert.ok(hosts.length > 0, `${valuesPath} debe declarar al menos un host de Ingress`);
    assert.deepEqual(
      hosts.filter((h) => typeof h !== 'string' || !h.includes('.')),
      [],
      `GITOPS-002: ${valuesPath} declara host(s) vacío(s) o sin dominio explícito (FQDN)`,
    );

    // 2. Lo que llega al clúster: ninguna regla del Ingress renderizado puede carecer de `host`.
    const ingress = renderChart(profile).find((d) => d.kind === 'Ingress');
    assert.ok(ingress, `[${env}] debe renderizarse un Ingress`);
    const rules: any[] = ingress.spec.rules;
    assert.ok(rules.length > 0);
    assert.deepEqual(
      rules.filter((rule) => !rule.host),
      [],
      `GITOPS-002: [${env}] el Ingress renderizado tiene reglas sin host (catch-all)`,
    );
  }

  // 3. La plantilla debe seguir soportando el render condicional (`if .host`) por retrocompatibilidad con
  //    `values.dev.yaml`, pero ningún entorno desplegable depende de él.
  const ingressTemplate = fs.readFileSync(path.join(ROOT_DIR, 'infra/helm/pokedex/templates/ingress.yaml'), 'utf-8');
  assert.ok(
    ingressTemplate.includes('{{- if .host }}'),
    'ingress.yaml debe mantener el render condicional de host (retrocompatible con values.dev.yaml)',
  );
});

test('🛡️ Zero-Trust Network: ADR-013 formaliza microsegmentación 4 capas, default-deny y anti-SSRF', () => {
  const adrPath = path.join(ROOT_DIR, 'docs/decisions/ADR-013-zero-trust-network-architecture.md');
  const readmePath = path.join(ROOT_DIR, 'README.md');
  const docsReadmePath = path.join(ROOT_DIR, 'docs/README.md');
  const auditPath = path.join(ROOT_DIR, 'docs/security/DEVSECOPS_AUDIT.md');

  assert.ok(fs.existsSync(adrPath), 'ADR-013 debe existir en docs/decisions/');
  const adrContent = fs.readFileSync(adrPath, 'utf-8');

  assert.ok(adrContent.includes('Zero-Trust'), 'ADR-013 debe documentar arquitectura Zero-Trust');
  assert.ok(
    adrContent.includes('Default-Deny') || adrContent.includes('default-deny'),
    'ADR-013 debe documentar default-deny',
  );
  assert.ok(
    adrContent.includes('169.254.169.254/32'),
    'ADR-013 debe documentar mitigación anti-SSRF en 169.254.169.254/32',
  );
  assert.ok(adrContent.includes('Cilium') || adrContent.includes('toFQDNs'), 'ADR-013 debe documentar Cilium L7 FQDN');
  assert.ok(
    adrContent.includes('PgBouncer') || adrContent.includes('pgbouncer'),
    'ADR-013 debe documentar mediación PgBouncer',
  );

  const readmeContent = fs.readFileSync(readmePath, 'utf-8');
  assert.ok(readmeContent.includes('ADR-013-zero-trust-network-architecture.md'), 'README.md debe enlazar ADR-013');

  const docsReadmeContent = fs.readFileSync(docsReadmePath, 'utf-8');
  assert.ok(
    docsReadmeContent.includes('ADR-013-zero-trust-network-architecture.md'),
    'docs/README.md debe enlazar ADR-013',
  );
  assertDocsPortalLinksAdrIndex(docsReadmeContent);

  const auditContent = fs.readFileSync(auditPath, 'utf-8');
  assert.ok(auditContent.includes('secret-rotation.md'), 'DEVSECOPS_AUDIT.md debe enlazar secret-rotation.md');
  assert.ok(!auditContent.includes('Corto Plazo'), 'DEVSECOPS_AUDIT.md debe tener 100% de items en Implementado');
});

test('🛡️ Ingress L7 & TLS: ADR-016 formaliza Ingress Controller, Terminación TLS y Hardening de Cabeceras HTTP', () => {
  const adrPath = path.join(ROOT_DIR, 'docs/decisions/ADR-016-ingress-tls-and-http-hardening.md');
  const readmePath = path.join(ROOT_DIR, 'README.md');
  const docsReadmePath = path.join(ROOT_DIR, 'docs/README.md');
  const helmValuesPath = path.join(ROOT_DIR, 'infra/helm/pokedex/values.yaml');

  assert.ok(fs.existsSync(adrPath), 'ADR-016 debe existir en docs/decisions/');
  const adrContent = fs.readFileSync(adrPath, 'utf-8');

  assert.ok(
    adrContent.includes('TLS') || adrContent.includes('cert-manager'),
    'ADR-016 debe documentar terminación TLS y cert-manager',
  );
  assert.ok(
    adrContent.includes('Strict-Transport-Security') || adrContent.includes('HSTS'),
    'ADR-016 debe documentar HSTS (Strict-Transport-Security)',
  );
  assert.ok(
    adrContent.includes('Content-Security-Policy') || adrContent.includes('CSP'),
    'ADR-016 debe documentar Content-Security-Policy',
  );
  assert.ok(adrContent.includes('X-Frame-Options'), 'ADR-016 debe documentar X-Frame-Options');
  assert.ok(
    adrContent.includes('limit-rps') || adrContent.includes('Rate Limiting') || adrContent.includes('rate limiting'),
    'ADR-016 debe documentar rate limiting L7',
  );
  assert.ok(
    adrContent.includes('/metrics') && adrContent.includes('/healthz') && adrContent.includes('/readyz'),
    'ADR-016 debe documentar bloqueo de /metrics, /healthz y /readyz',
  );

  const valuesContent = fs.readFileSync(helmValuesPath, 'utf-8');
  assert.ok(
    valuesContent.includes('limit-rps') || valuesContent.includes('limit-connections'),
    'values.yaml debe configurar rate limiting (ADR-016)',
  );
  assert.ok(
    valuesContent.includes('configuration-snippet') ||
      valuesContent.includes('Strict-Transport-Security') ||
      valuesContent.includes('X-Frame-Options'),
    'values.yaml debe inyectar cabeceras de seguridad (ADR-016)',
  );
  assert.ok(valuesContent.includes('server-snippet'), 'values.yaml debe bloquear endpoints internos (ADR-016)');

  const readmeContent = fs.readFileSync(readmePath, 'utf-8');
  assert.ok(readmeContent.includes('ADR-016-ingress-tls-and-http-hardening.md'), 'README.md debe enlazar ADR-016');

  const docsReadmeContent = fs.readFileSync(docsReadmePath, 'utf-8');
  assert.ok(
    docsReadmeContent.includes('ADR-016-ingress-tls-and-http-hardening.md'),
    'docs/README.md debe enlazar ADR-016',
  );
  assertDocsPortalLinksAdrIndex(docsReadmeContent);
});
