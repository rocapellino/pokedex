#!/usr/bin/env node
/**
 * =============================================================================
 * Generador del fallback local de Nginx [APPS-001]
 * =============================================================================
 *
 * `apps/frontend/nginx.conf` NO se mantiene a mano: se GENERA a partir de
 * `apps/frontend/nginx.conf.template`, que es el SSOT unico de la configuracion
 * de Nginx.
 *
 * MOTIVO (APPS-001): ambos archivos eran copias paralelas mantenidas
 * manualmente. Solo difieren en las allowlists `/admin` y `/metrics`, donde la
 * plantilla usa placeholders y el fallback concretaba IPs fijas. Eso duplicaba
 * 119 lineas por mantener y permitia que el fallback se desincronizara del
 * template sin que ningun gate lo detectara: el riesgo real es que una
 * directiva de seguridad (CSP, COOP, allowlists) se endureciera en el template
 * y quedara laxa en el fallback, que es justo lo que persiguen los tests de
 * seguridad de Nginx.
 *
 * El fallback SE CONSERVA (no se elimina) porque cumple una funcion real:
 * desarrollo local directo con Nginx en el host, sin Docker. Los tests de
 * seguridad lo validan en igualdad con el template, asi que eliminarlo obligaria
 * a reescribirlos y reduciria cobertura.
 *
 * NOTA: este script es independiente de `render-nginx-config.mjs` (DOC-003),
 * que renderiza el template en el runner para validar la configuracion contra
 * la imagen productiva en CI. Aqui no hay validacion: hay generacion de un
 * artefacto versionado.
 *
 * CONTRATO:
 *   - `nginx.conf.template` es el SSOT. Se edita ese.
 *   - `nginx.conf` es un ARTEFACTO GENERADO. Se regenera con `npm run nginx:conf`.
 *   - `npm run nginx:conf:check` falla si el artefacto esta desactualizado.
 *
 * Los valores por defecto son los de desarrollo local. NO son valores de
 * produccion: en produccion los resuelve `envsubst` sobre el template dentro
 * del contenedor (ver `apps/frontend/Dockerfile`).
 *
 * Uso:
 *   node scripts/generate-nginx-conf.mjs          # regenera nginx.conf
 *   node scripts/generate-nginx-conf.mjs --check  # falla si esta desactualizado
 * =============================================================================
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TEMPLATE_PATH = 'apps/frontend/nginx.conf.template';
const OUTPUT_PATH = 'apps/frontend/nginx.conf';

/**
 * Valores por defecto del fallback local, alineados con `.env.example`.
 * Si se anade un placeholder nuevo a la plantilla hay que declararlo aqui:
 * el invariante fail-closed de mas abajo lo exige.
 */
const DEFAULTS = {
  BACKOFFICE_ALLOWED_IP_1: '10.42.0.1/32',
  BACKOFFICE_ALLOWED_IP_2: '192.168.1.50/32',
  METRICS_ALLOWED_CIDR: '10.42.0.0/24',
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

const placeholders = Object.keys(DEFAULTS);
const pattern = new RegExp(`\\$\\{(${placeholders.join('|')})\\}`, 'g');
const template = normalizeEol(readFileSync(resolve(TEMPLATE_PATH), 'utf8'));
const rendered = template.replace(pattern, (match, key) => DEFAULTS[key] ?? match);

// Invariante fail-closed: ningun placeholder puede sobrevivir al renderizado.
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
  console.log(`${OUTPUT_PATH} regenerado desde ${TEMPLATE_PATH} (${placeholders.length} placeholders).`);
}