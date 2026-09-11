import DOMPurify from 'dompurify';
import type { Config } from 'dompurify';

/**
 * Módulo de Sanitización DOM contra Ataques XSS
 * Basado en DOMPurify con políticas estrictas de seguridad.
 */

const SANITIZE_CONFIG: Config = {
  ALLOWED_TAGS: [
    'article', 'section', 'header', 'footer', 'main', 'nav', 'aside',
    'div', 'span', 'p', 'a', 'b', 'i', 'strong', 'em', 'small', 'code', 'pre',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'button', 'input', 'select', 'option', 'label', 'form',
    'img', 'svg', 'path', 'circle', 'line', 'polyline', 'rect',
  ],
  ALLOWED_ATTR: [
    'class', 'id', 'style', 'href', 'target', 'rel', 'src', 'alt',
    'title', 'width', 'height', 'loading', 'data-id', 'data-theme-val',
    'data-pokemon-id', 'data-type', 'data-evol-id', 'data-close-modal',
    'type', 'value', 'placeholder', 'disabled', 'readonly', 'checked',
    'viewBox', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
    'd', 'cx', 'cy', 'r', 'x1', 'y1', 'x2', 'y2', 'xmlns', 'role', 'aria-label',
  ],
  ALLOW_DATA_ATTR: true,
  FORCE_BODY: false,
};

/**
 * Sanitiza una cadena HTML potencialmente maliciosa antes de insertarla en el DOM.
 */
export function sanitizeHtml(dirty: string): string {
  if (!dirty) return '';
  const clean = DOMPurify.sanitize(dirty, SANITIZE_CONFIG);
  return typeof clean === 'string' ? clean : String(clean);
}

/**
 * Escapa texto plano para uso seguro en contextos donde no se permite HTML.
 */
export function escapeText(str: unknown): string {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/`/g, '&#96;');
}
