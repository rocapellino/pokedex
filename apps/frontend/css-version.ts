/**
 * Versionado por contenido de la hoja de estilos.
 *
 * `public/css/style.css` no pasa por el hash de Vite y nginx cachea los .css un día: con una
 * versión fija (`?v=2.0`) el navegador mezclaba HTML y JS nuevos con el CSS del despliegue anterior.
 */

import { createHash } from 'node:crypto';

const STYLESHEET_LINK = /href="\/css\/style\.css(?:\?v=[^"]*)?"/g;

/** Huella corta y estable del contenido del CSS. */
export function stylesheetVersion(css: string): string {
  return createHash('sha256').update(css).digest('hex').slice(0, 10);
}

/** Reemplaza la versión (fija o ausente) de los enlaces a `/css/style.css` por la huella del contenido. */
export function versionStylesheetLinks(html: string, css: string): string {
  return html.replace(STYLESHEET_LINK, `href="/css/style.css?v=${stylesheetVersion(css)}"`);
}
