/**
 * ==============================================================================
 * Cabeceras de seguridad EFECTIVAS de nginx (AUD-ARCH-NGX-001 / AUD-ARCH-NGX-002)
 * ==============================================================================
 *
 * En nginx, `add_header` se hereda del nivel superior SOLO si el bloque actual no
 * define ninguno. Las cabeceras declaradas a nivel de `server` (COOP, CORP, COEP,
 * X-XSS-Protection...) dejaban de enviarse en toda `location` que declarara su
 * propio `add_header` (`/`, assets estáticos, `/admin`): el test anterior solo
 * comprobaba que la cadena existiera en el archivo, no que llegara a la respuesta.
 *
 * Además, las `location` de proxy heredaban las cabeceras del servidor y Express
 * emite las suyas, de modo que la respuesta llevaba cada cabecera duplicada.
 *
 * Este test simula la regla de herencia sobre la plantilla (SSOT) y verifica la
 * configuración efectiva por `location`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR } from '../../helpers/repo.js';

const REQUIRED_HEADERS = [
  'X-Content-Type-Options',
  'X-Frame-Options',
  'X-XSS-Protection',
  'Referrer-Policy',
  'Strict-Transport-Security',
  'Content-Security-Policy',
  'Permissions-Policy',
  'Cross-Origin-Opener-Policy',
  'Cross-Origin-Resource-Policy',
  'Cross-Origin-Embedder-Policy',
];

interface Block {
  header: string;
  body: string;
}

/** Extrae el cuerpo de `{ ... }` que empieza en `openIndex`, respetando llaves anidadas. */
function readBraced(source: string, openIndex: number): { body: string; end: number } {
  let depth = 0;
  for (let i = openIndex; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return { body: source.slice(openIndex + 1, i), end: i };
    }
  }
  throw new Error('Llaves desbalanceadas en la configuración de nginx');
}

function parseServer(template: string): { serverHeaders: string[]; locations: Block[]; locationBodies: string[] } {
  const server = readBraced(template, template.indexOf('{', template.indexOf('server')));
  const locations: Block[] = [];
  let serverLevel = server.body;

  const locationRe = /location\s+([^{]+)\{/g;
  let match = locationRe.exec(server.body);
  while (match) {
    const open = match.index + match[0].length - 1;
    const block = readBraced(server.body, open);
    locations.push({ header: match[1].trim(), body: block.body });
    serverLevel = serverLevel.replace(server.body.slice(match.index, block.end + 1), '');
    locationRe.lastIndex = block.end + 1;
    match = locationRe.exec(server.body);
  }

  const names = (text: string) =>
    [...text.matchAll(/^\s*add_header\s+([A-Za-z-]+)\s/gm)].map((m) => m[1].toLowerCase());
  return {
    serverHeaders: names(serverLevel),
    locations,
    locationBodies: locations.map((l) => l.body),
  };
}

function ownHeaders(body: string): string[] {
  return [...body.matchAll(/^\s*add_header\s+([A-Za-z-]+)\s/gm)].map((m) => m[1].toLowerCase());
}

function hiddenHeaders(body: string): string[] {
  return [...body.matchAll(/^\s*proxy_hide_header\s+([A-Za-z-]+)\s*;/gm)].map((m) => m[1].toLowerCase());
}

// Sin comentarios: una palabra como `location` dentro de un comentario no debe confundir al parser.
const template = fs
  .readFileSync(path.join(ROOT_DIR, 'apps/frontend/nginx.conf.template'), 'utf-8')
  .replace(/(^|\s)#.*$/gm, '');
const { serverHeaders, locations } = parseServer(template);

test('🛡️ Nginx efectivo: el nivel server declara todas las cabeceras de seguridad requeridas', () => {
  for (const header of REQUIRED_HEADERS) {
    assert.ok(serverHeaders.includes(header.toLowerCase()), `server debe declarar ${header}`);
  }
});

test('🛡️ Nginx efectivo: toda location que sirve contenido envía TODAS las cabeceras (herencia de add_header)', () => {
  const served = locations.filter((l) => !/proxy_pass/.test(l.body));
  assert.ok(served.length >= 3, 'Debe haber locations de contenido (estáticos, backoffice, SPA)');

  for (const location of served) {
    const own = ownHeaders(location.body);
    // nginx: si la location declara algún add_header, NO hereda ninguno del server.
    const effective = own.length > 0 ? own : serverHeaders;
    for (const header of REQUIRED_HEADERS) {
      assert.ok(
        effective.includes(header.toLowerCase()),
        `location ${location.header}: la respuesta no incluye ${header} (add_header propio descarta los heredados)`,
      );
    }
  }
});

test('🛡️ Nginx efectivo: las locations de proxy ocultan las cabeceras del upstream para no duplicarlas', () => {
  const proxied = locations.filter(
    (l) => /proxy_pass/.test(l.body) && !/location\s+\/metrics/.test(`location ${l.header}`),
  );
  const apiLocations = proxied.filter((l) => /^\/(api\/|pokemons)/.test(l.header));
  assert.ok(apiLocations.length >= 2, 'Debe haber locations de proxy /api/ y /pokemons');

  for (const location of apiLocations) {
    const own = ownHeaders(location.body);
    const effective = own.length > 0 ? own : serverHeaders;
    const hidden = hiddenHeaders(location.body);
    for (const header of REQUIRED_HEADERS) {
      // Si nginx emite la cabecera, la copia del upstream (Express) debe ocultarse.
      if (effective.includes(header.toLowerCase())) {
        assert.ok(
          hidden.includes(header.toLowerCase()),
          `location ${location.header}: ${header} se emitiría duplicada (nginx y Express); falta proxy_hide_header`,
        );
      }
    }
  }
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
    assert.ok(
      !content.includes("style-src 'self' 'unsafe-inline'"),
      `${relPath} no debe contener unsafe-inline en style-src`,
    );
    assert.ok(content.includes("style-src 'self';"), `${relPath} debe definir style-src estricto`);
    assert.ok(content.includes("base-uri 'self';"), `${relPath} debe contener base-uri 'self'`);
    assert.ok(content.includes("form-action 'self';"), `${relPath} debe contener form-action 'self'`);
    assert.ok(content.includes('Permissions-Policy'), `${relPath} debe incluir Permissions-Policy`);
  }
});

test('🛡️ Nginx Security: nginx.conf y template inyectan Cross-Origin-Opener-Policy y Cross-Origin-Resource-Policy', () => {
  const confFiles = ['apps/frontend/nginx.conf', 'apps/frontend/nginx.conf.template'];

  for (const relPath of confFiles) {
    const fullPath = path.join(ROOT_DIR, relPath);
    assert.ok(fs.existsSync(fullPath), `${relPath} debe existir`);
    const content = fs.readFileSync(fullPath, 'utf-8');
    assert.ok(
      content.includes('Cross-Origin-Opener-Policy "same-origin" always'),
      `${relPath} debe configurar Cross-Origin-Opener-Policy`,
    );
    assert.ok(
      content.includes('Cross-Origin-Resource-Policy "same-origin" always'),
      `${relPath} debe configurar Cross-Origin-Resource-Policy`,
    );
  }
});
