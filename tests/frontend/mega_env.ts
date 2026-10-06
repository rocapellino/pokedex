/**
 * Entorno de navegador mínimo para las pruebas de la sección de megaevolución.
 *
 * Debe importarse ANTES que los módulos del frontend (los `import` ESM se evalúan en orden):
 * DOMPurify necesita `window` disponible al cargarse para poder sanear HTML.
 */

import { JSDOM } from 'jsdom';

export const dom = new JSDOM('<!doctype html><html><body><div id="detailContent"></div></body></html>', {
  url: 'http://localhost:8080/',
});

const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
g.HTMLElement = dom.window.HTMLElement;
