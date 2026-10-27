/**
 * ==============================================================================
 * Contrato HTTP por entorno activo: orígenes CORS coherentes con el ingress
 * ==============================================================================
 *
 * AUD-SEC-CORS-001: los entornos Proxmox heredaban `corsOrigins` del valor de
 * ejemplo del chart (`https://pokedex.example.com`). Los navegadores envían
 * `Origin` en todo POST, incluso en el mismo origen, así que el backend rechazaba
 * login y mutaciones del backoffice mientras los GET del catálogo funcionaban.
 *
 * El contrato combina `infra/helm/pokedex/values.yaml` con el values de cada
 * entorno activo del App-of-Apps (los que `root-application.yaml` no excluye).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runHelm } from '../../scripts/lib/helm.js';
import fs from 'node:fs';
import path from 'node:path';
import * as yaml from 'js-yaml';
import { parseDirectoryExclude } from '../helpers/argocd.js';
import { ROOT_DIR } from '../helpers/repo.js';

const CHART_DIR = path.join(ROOT_DIR, 'infra/helm/pokedex');

type Values = Record<string, any>;

function readYaml(file: string): Values {
  return yaml.load(fs.readFileSync(file, 'utf8')) as Values;
}

/** Merge con la semántica de Helm: los mapas se combinan y las listas se reemplazan. */
function mergeValues(base: Values, override: Values): Values {
  const result: Values = { ...base };
  for (const [key, value] of Object.entries(override ?? {})) {
    const current = result[key];
    const bothMaps =
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      current &&
      typeof current === 'object' &&
      !Array.isArray(current);
    result[key] = bothMaps ? mergeValues(current, value) : value;
  }
  return result;
}

/** Applications activas: las de gitops/apps/ que root-application.yaml no excluye. */
function activeEnvironments(): Array<{ app: string; values: Values; valueFiles: string[] }> {
  const appsDir = path.join(ROOT_DIR, 'gitops/apps');
  const excluded = parseDirectoryExclude(fs.readFileSync(path.join(appsDir, 'root-application.yaml'), 'utf-8'));

  return fs
    .readdirSync(appsDir)
    .filter((file) => file.endsWith('.yaml') && !excluded.includes(file))
    .map((file) => {
      const app = readYaml(path.join(appsDir, file));
      const valueFiles = (app.spec.source.helm.valueFiles as string[]).map((file) => path.resolve(CHART_DIR, file));
      const values = valueFiles.reduce((acc, valueFile) => mergeValues(acc, readYaml(valueFile)), {} as Values);
      return { app: app.metadata.name as string, values, valueFiles };
    });
}

/** Anotaciones del Ingress tal como las renderiza Helm para el entorno. */
function renderedIngressAnnotations(valueFiles: string[]): Record<string, string> {
  const rendered = runHelm([
    'template',
    'pokedex',
    CHART_DIR,
    ...valueFiles.flatMap((file) => ['-f', file]),
    '-s',
    'templates/ingress.yaml',
  ]);
  const ingress = yaml.loadAll(rendered).find((doc: any) => doc?.kind === 'Ingress') as Values | undefined;
  return ingress?.metadata?.annotations ?? {};
}

/** Esquema que el navegador usará para cada host según el bloque `tls` del ingress. */
function expectedOrigins(values: Values): string[] {
  const tlsHosts = new Set<string>((values.ingress.tls ?? []).flatMap((entry: any) => entry.hosts ?? []));
  return (values.ingress.hosts ?? [])
    .map((entry: any) => entry.host)
    .filter(Boolean)
    .map((host: string) => `${tlsHosts.has(host) ? 'https' : 'http'}://${host}`);
}

function corsOrigins(values: Values): string[] {
  return String(values.api?.env?.corsOrigins ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

const environments = activeEnvironments();

test('🌐 AUD-SEC-CORS-001: existen entornos activos en el App-of-Apps', () => {
  assert.ok(environments.length > 0, 'root-application.yaml no deja ninguna Application activa');
});

for (const { app, values, valueFiles } of environments) {
  test(`🌐 AUD-SEC-CORS-001: ${app} no hereda orígenes CORS de ejemplo`, () => {
    const origins = corsOrigins(values);
    assert.ok(origins.length > 0, `${app}: api.env.corsOrigins está vacío`);
    for (const origin of origins) {
      assert.doesNotMatch(origin, /example\.(com|org|net)/, `${app}: origen de ejemplo ${origin}`);
      assert.notEqual(origin, '*', `${app}: wildcard no permitido con credentials`);
    }
  });

  // AUD-SEC-TLS-001: con nodeEnv=production el configmap fija SECURE_COOKIES=true y la
  // cookie de sesión lleva `Secure`; servida por HTTP el navegador la descarta.
  test(`🔐 AUD-SEC-TLS-001: ${app} sirve por TLS todo host cuando la cookie de sesión es Secure`, () => {
    if (!values.ingress?.enabled || values.api?.env?.nodeEnv !== 'production') return;

    const tlsHosts = new Set<string>((values.ingress.tls ?? []).flatMap((entry: any) => entry.hosts ?? []));
    for (const { host } of values.ingress.hosts ?? []) {
      assert.ok(tlsHosts.has(host), `${app}: el host ${host} no figura en ingress.tls`);
    }

    if (values.ingress.className === 'traefik') {
      const annotations = values.ingress.annotations ?? {};
      const entrypoints = String(annotations['traefik.ingress.kubernetes.io/router.entrypoints'] ?? '');
      assert.equal(entrypoints, 'websecure', `${app}: el router debe publicarse solo en websecure`);
      assert.equal(annotations['traefik.ingress.kubernetes.io/router.tls'], 'true', `${app}: falta router.tls`);
    }
  });

  // El chart base declara anotaciones de ingress-nginx y cert-manager; con Traefik y
  // certificado vía ESO son configuración inerte que no debe llegar al render.
  test(`🔐 AUD-SEC-TLS-001: ${app} no renderiza anotaciones de un controlador distinto`, () => {
    if (!values.ingress?.enabled || values.ingress.className !== 'traefik') return;
    const foreign = Object.keys(renderedIngressAnnotations(valueFiles)).filter((key) =>
      /^(nginx\.ingress\.kubernetes\.io|cert-manager\.io)\//.test(key),
    );
    assert.deepEqual(foreign, [], `${app}: anotaciones ignoradas por Traefik: ${foreign.join(', ')}`);
  });

  test(`🔐 AUD-SEC-TLS-001: ${app} obtiene el certificado TLS de una fuente declarada`, () => {
    if (!values.ingress?.enabled || !(values.ingress.tls ?? []).length) return;
    const viaEso = values.ingress.tlsExternalSecret?.enabled === true;
    const viaCertManager = Boolean(renderedIngressAnnotations(valueFiles)['cert-manager.io/cluster-issuer']);
    assert.ok(viaEso || viaCertManager, `${app}: ingress.tls sin ExternalSecret ni cert-manager que emita el Secret`);
    if (viaEso) {
      assert.ok(values.ingress.tlsExternalSecret.remoteRef?.key, `${app}: tlsExternalSecret.remoteRef.key vacío`);
    }
  });

  test(`🌐 AUD-SEC-CORS-001: ${app} autoriza el origen de cada host del ingress con su esquema real`, () => {
    if (!values.ingress?.enabled) return;
    const origins = corsOrigins(values);
    for (const expected of expectedOrigins(values)) {
      assert.ok(
        origins.includes(expected),
        `${app}: falta ${expected} en api.env.corsOrigins (declarado: ${origins.join(', ')})`,
      );
    }
  });

  // AUD-INF-NGINX-002: tras activar set_real_ip_from 10.42.0.0/16 en nginx, $remote_addr
  // contiene la IP real del cliente detrás de Traefik. Si el entorno activo en Proxmox no
  // declara web.env.backofficeAllowedIp1/2, hereda 10.42.0.1/32 y 192.168.1.50/32 del chart
  // base y responde 403 al Bastion (10.10.13.120) y a la red de gestión (10.10.13.0/24).
  test(`🛡️ AUD-INF-NGINX-002: ${app} declara allowlists de backoffice coherentes con el inventario de gestión`, () => {
    if (values.global?.environment !== 'onprem-proxmox-preprod') return;

    const proxmoxInventory = readYaml(path.join(ROOT_DIR, 'infra/ansible/inventories/proxmox/hosts.yaml'));
    const mgmtCidr = String(proxmoxInventory.all?.vars?.mgmt_cidr ?? '');
    const bastionIp = String(proxmoxInventory.all?.children?.bastion_servers?.hosts?.bastion?.ansible_host ?? '');
    assert.ok(mgmtCidr && bastionIp, 'El inventario de Proxmox debe declarar mgmt_cidr y bastion.ansible_host');

    const allowed = [
      String(values.web?.env?.backofficeAllowedIp1 ?? ''),
      String(values.web?.env?.backofficeAllowedIp2 ?? ''),
    ];
    assert.ok(
      !allowed.includes('192.168.1.50/32'),
      `${app}: web.env.backofficeAllowedIp* hereda el placeholder 192.168.1.50/32 del chart base`,
    );
    assert.ok(
      allowed.includes(`${bastionIp}/32`) || allowed.includes(bastionIp),
      `${app}: web.env.backofficeAllowedIp* debe autorizar al Bastion (${bastionIp}/32); declarado: ${allowed.join(', ')}`,
    );
    assert.ok(
      allowed.includes(mgmtCidr),
      `${app}: web.env.backofficeAllowedIp* debe autorizar la red de gestión (${mgmtCidr}); declarado: ${allowed.join(', ')}`,
    );
  });
}
