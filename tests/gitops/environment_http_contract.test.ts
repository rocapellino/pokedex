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
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const ROOT_DIR = process.cwd();
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
      value && typeof value === 'object' && !Array.isArray(value) &&
      current && typeof current === 'object' && !Array.isArray(current);
    result[key] = bothMaps ? mergeValues(current, value) : value;
  }
  return result;
}

/** Applications activas: las de gitops/apps/ que root-application.yaml no excluye. */
function activeEnvironments(): Array<{ app: string; values: Values }> {
  const appsDir = path.join(ROOT_DIR, 'gitops/apps');
  const root = readYaml(path.join(appsDir, 'root-application.yaml'));
  const excluded = String(root.spec.source.directory.exclude).split(/\s+/).filter(Boolean);

  return fs
    .readdirSync(appsDir)
    .filter((file) => file.endsWith('.yaml') && !excluded.includes(file))
    .map((file) => {
      const app = readYaml(path.join(appsDir, file));
      const valueFiles: string[] = app.spec.source.helm.valueFiles;
      const values = valueFiles.reduce(
        (acc, valueFile) => mergeValues(acc, readYaml(path.resolve(CHART_DIR, valueFile))),
        {} as Values
      );
      return { app: app.metadata.name as string, values };
    });
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

for (const { app, values } of environments) {
  test(`🌐 AUD-SEC-CORS-001: ${app} no hereda orígenes CORS de ejemplo`, () => {
    const origins = corsOrigins(values);
    assert.ok(origins.length > 0, `${app}: api.env.corsOrigins está vacío`);
    for (const origin of origins) {
      assert.doesNotMatch(origin, /example\.(com|org|net)/, `${app}: origen de ejemplo ${origin}`);
      assert.notEqual(origin, '*', `${app}: wildcard no permitido con credentials`);
    }
  });

  test(`🌐 AUD-SEC-CORS-001: ${app} autoriza el origen de cada host del ingress con su esquema real`, () => {
    if (!values.ingress?.enabled) return;
    const origins = corsOrigins(values);
    for (const expected of expectedOrigins(values)) {
      assert.ok(
        origins.includes(expected),
        `${app}: falta ${expected} en api.env.corsOrigins (declarado: ${origins.join(', ')})`
      );
    }
  });
}
