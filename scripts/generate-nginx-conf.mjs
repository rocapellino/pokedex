#!/usr/bin/env node
/**
 * =============================================================================
 * Gestor y Generador Canónico de Configuración de Nginx [APPS-001, DOC-003]
 * =============================================================================
 *
 * `apps/frontend/nginx.conf.template` es el SSOT único de la configuración de Nginx.
 *
 * Este script unifica dos operaciones operativas sobre la plantilla:
 *
 * 1. MODO FALLBACK LOCAL (APPS-001):
 *    - `node scripts/generate-nginx-conf.mjs`: Regenera `apps/frontend/nginx.conf`
 *      usando los valores de allowlist por defecto para desarrollo local host.
 *    - `node scripts/generate-nginx-conf.mjs --check`: Falla si `nginx.conf` diverge
 *      del template (gate de consistencia).
 *
 * 2. MODO RENDERIZADO CI (DOC-003):
 *    - `node scripts/generate-nginx-conf.mjs --render <salida> [plantilla]`:
 *      Sustituye placeholders leyendo variables de entorno (`process.env`) para
 *      validar `nginx -t` contra la imagen real en los workflows de CI sin requerir
 *      expansiones bash propensas a errores. Falla (exit 1) si hay variables sin resolver.
 * =============================================================================
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TEMPLATE_PATH = 'apps/frontend/nginx.conf.template';
const OUTPUT_PATH = 'apps/frontend/nginx.conf';

const PLACEHOLDERS = [
  'BACKOFFICE_ALLOWED_IP_1',
  'BACKOFFICE_ALLOWED_IP_2',
  'METRICS_ALLOWED_CIDR',
];

const DEFAULTS = {
  BACKOFFICE_ALLOWED_IP_1: process.env.BACKOFFICE_ALLOWED_IP_1 || '10.42.0.1/32', // NOSONAR: IP privada RFC 1918 para fallback en desarrollo local
  BACKOFFICE_ALLOWED_IP_2: process.env.BACKOFFICE_ALLOWED_IP_2 || '192.168.1.50/32', // NOSONAR: IP privada RFC 1918 para fallback en desarrollo local
  METRICS_ALLOWED_CIDR: process.env.METRICS_ALLOWED_CIDR || '10.42.0.0/24', // NOSONAR: CIDR privado RFC 1918 para fallback en desarrollo local
};

const BANNER = [
  '# ============================================================================',
  '# ARCHIVO GENERADO - NO EDITAR A MANO',
  '# ============================================================================',
  '# Generado por `scripts/generate-nginx-conf.mjs` desde:',
  '#   apps/frontend/nginx.conf.template  (SSOT unico)',
  '#',
  '# Es el fallback para desarrollo local directo con Nginx en el host, sin Docker.',
  '# Para regenerarlo:       npm run nginx:conf',
  '# Para verificar que esta al dia: npm run nginx:conf:check',
  '# ============================================================================',
  '',
].join('\n');

const normalizeEol = (str) => str.replace(/\r\n/g, '\n');

// -----------------------------------------------------------------------------
// OPERACIÓN 1: Modo Renderizado para Validación en CI (--render <salida> [plantilla])
// -----------------------------------------------------------------------------
if (process.argv.includes('--render')) {
  const renderIndex = process.argv.indexOf('--render');
  const targetOutput = process.argv[renderIndex + 1];
  const targetTemplate = process.argv[renderIndex + 2] ?? TEMPLATE_PATH;

  if (!targetOutput) {
    console.error('Uso: node scripts/generate-nginx-conf.mjs --render <salida> [plantilla]');
    process.exit(1);
  }

  const pattern = new RegExp(`\\$\\{(${PLACEHOLDERS.join('|')})\\}`, 'g');
  const template = readFileSync(resolve(targetTemplate), 'utf8');

  const unresolved = [];
  const rendered = template.replace(pattern, (_, key) => {
    const value = process.env[key];
    if (value === undefined || value === '') unresolved.push(key);
    return value ?? '';
  });

  const leftovers = [...rendered.matchAll(/\$\{(\w+)\}/g)];
  if (leftovers.length > 0 || unresolved.length > 0) {
    console.error('ERROR: la plantilla quedo con variables sin renderizar.');
    if (unresolved.length > 0) {
      console.error(`  Variables de entorno ausentes: ${[...new Set(unresolved)].join(', ')}`);
    }
    rendered.split('\n').forEach((line, index) => {
      if (/\$\{\w+\}/.test(line)) {
        console.error(`  ${index + 1}: ${line}`);
      }
    });
    process.exit(1);
  }

  writeFileSync(resolve(targetOutput), rendered, 'utf8');
  console.log(`Configuracion de Nginx renderizada en ${targetOutput} (${PLACEHOLDERS.length} variables).`);
  process.exit(0);
}

// -----------------------------------------------------------------------------
// OPERACIÓN 2: Modo Generación / Verificación de Fallback Local (APPS-001)
// -----------------------------------------------------------------------------
const pattern = new RegExp(`\\$\\{(${PLACEHOLDERS.join('|')})\\}`, 'g');
const template = normalizeEol(readFileSync(resolve(TEMPLATE_PATH), 'utf8'));
const rendered = template.replace(pattern, (match, key) => DEFAULTS[key] ?? match);

const leftovers = [...rendered.matchAll(/\$\{(\w+)\}/g)];
if (leftovers.length > 0) {
  const keys = [...new Set(leftovers.map((m) => m[1]))];
  console.error(`ERROR: la plantilla quedo con placeholders sin renderizar: ${keys.join(', ')}`);
  console.error('  Si anadiste un placeholder nuevo, declaralo en DEFAULTS de este script.');
  process.exit(1);
}

const expected = normalizeEol(BANNER + rendered);

if (process.argv.includes('--check')) {
  let current;
  try {
    current = normalizeEol(readFileSync(resolve(OUTPUT_PATH), 'utf8'));
  } catch {
    console.error(`${OUTPUT_PATH} no existe. Ejecuta \`npm run nginx:conf\`.`);
    process.exit(1);
  }

  if (current !== expected) {
    console.error('APPS-001: apps/frontend/nginx.conf esta DESACTUALIZADO respecto al template.');
    console.error(`  Plantilla (SSOT): ${TEMPLATE_PATH}`);
    console.error('  Regenerar con:     npm run nginx:conf');
    const expectedLines = expected.split('\n');
    const currentLines = current.split('\n');
    const diffAt = expectedLines.findIndex((line, i) => line !== currentLines[i]);
    console.error(`  Primera divergencia en la linea ${diffAt + 1}:`);
    console.error(`    actual:   ${currentLines[diffAt] ?? '(fin de archivo)'}`);
    console.error(`    esperado: ${expectedLines[diffAt] ?? '(fin de archivo)'}`);
    process.exit(1);
  }

  console.log(`APPS-001: ${OUTPUT_PATH} esta sincronizado con ${TEMPLATE_PATH}.`);
} else {
  writeFileSync(resolve(OUTPUT_PATH), expected, 'utf8');
  console.log(`${OUTPUT_PATH} regenerado desde ${TEMPLATE_PATH} (${PLACEHOLDERS.length} placeholders).`);
}