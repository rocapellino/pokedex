import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stylesheetVersion, versionStylesheetLinks } from '../../apps/frontend/css-version.js';

const FRONTEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../apps/frontend');

test('🎨 Caché CSS: la versión depende del contenido del CSS y no es fija', () => {
  const a = stylesheetVersion('.a { color: red; }');
  const b = stylesheetVersion('.a { color: blue; }');

  assert.match(a, /^[0-9a-f]{10}$/);
  assert.notEqual(a, b, 'un CSS distinto debe dar otra versión');
  assert.equal(a, stylesheetVersion('.a { color: red; }'), 'el mismo CSS da la misma versión');
});

test('🎨 Caché CSS: reemplaza la versión fija o ausente del enlace al CSS', () => {
  const css = '.a { color: red; }';
  const v = stylesheetVersion(css);

  assert.equal(
    versionStylesheetLinks('<link rel="stylesheet" href="/css/style.css?v=2.0">', css),
    `<link rel="stylesheet" href="/css/style.css?v=${v}">`,
  );
  assert.equal(
    versionStylesheetLinks('<link rel="stylesheet" href="/css/style.css">', css),
    `<link rel="stylesheet" href="/css/style.css?v=${v}">`,
  );
});

test('🎨 Caché CSS: no toca otros enlaces ni otras hojas de estilo', () => {
  const html =
    '<link href="https://fonts.googleapis.com/css2?family=Outfit" rel="stylesheet"><link href="/css/otro.css">';

  assert.equal(versionStylesheetLinks(html, '.a{}'), html);
});

test('🎨 Caché CSS: las dos páginas del frontend enlazan el CSS sin una versión fija escrita a mano', () => {
  // La versión real la inyecta el build; una "?v=2.0" fija dejaba el CSS viejo en caché tras cada despliegue.
  for (const page of ['index.html', 'backoffice.html']) {
    const html = fs.readFileSync(path.join(FRONTEND_DIR, page), 'utf-8');
    assert.match(html, /href="\/css\/style\.css"/, `${page} debe enlazar /css/style.css sin versión manual`);
  }
});
