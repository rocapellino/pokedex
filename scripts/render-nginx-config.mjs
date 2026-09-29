#!/usr/bin/env node
/**
 * =============================================================================
 * Renderizador de la configuracion de Nginx para validacion en CI [DOC-003]
 * =============================================================================
 *
 * El Dockerfile de produccion renderiza `apps/frontend/nginx.conf.template`
 * sustituyendo las variables de entorno antes de iniciar Nginx. Este script
 * replica esa sustitucion en el runner para poder validar la configuracion
 * resultante contra la imagen productiva.
 *
 * Existe como archivo propio, y no embebido en el workflow, por dos motivos:
 *   1. Evita la expansion de bash: los delimitadores de backtick y las
 *      secuencias `${...}` se interpretan como command substitution y
 *      parametro expansion cuando el codigo viaja dentro de comillas dobles.
 *   2. Es testeable de forma aislada, sin depender del runner ni de Docker.
 *
 * Falla (exit 1) si queda algun placeholder sin sustituir, e informa las lineas
 * afectadas para que el diagnostico sea accionable.
 *
 * Uso: node scripts/render-nginx-config.mjs <salida> [entrada]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TEMPLATE_PATH = 'apps/frontend/nginx.conf.template';
const PLACEHOLDERS = [
  'BACKOFFICE_ALLOWED_IP_1',
  'BACKOFFICE_ALLOWED_IP_2',
  'METRICS_ALLOWED_CIDR',
];

const outputPath = process.argv[2];
const templatePath = process.argv[3] ?? TEMPLATE_PATH;

if (!outputPath) {
  console.error('Uso: node scripts/render-nginx-config.mjs <salida> [plantilla]');
  process.exit(1);
}

const pattern = new RegExp(`\\$\\{(${PLACEHOLDERS.join('|')})\\}`, 'g');
const template = readFileSync(resolve(templatePath), 'utf8');

const unresolved = [];
const rendered = template.replace(pattern, (_, key) => {
  const value = process.env[key];
  if (value === undefined || value === '') unresolved.push(key);
  return value ?? '';
});

// Cualquier placeholder que sobreviva (incluidos los no declarados) es un error.
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

writeFileSync(outputPath, rendered, 'utf8');
console.log(`Configuracion de Nginx renderizada en ${outputPath} (${PLACEHOLDERS.length} variables).`);
