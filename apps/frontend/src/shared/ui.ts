/**
 * Utilidades de UI y Rendering Compartidas para Frontend Pokédex
 */

import { escapeText, sanitizeHtml } from '../sanitizer.js';
import { normalizeStr } from './formatters.js';

/**
 * Muestra una notificación flotante estilo Toast en el contenedor #toastContainer.
 */
export function showToast(message: string, isError = false, durationMs = 4000): void {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${isError ? 'toast-error' : 'toast-success'}`;

  const span = document.createElement('span');
  span.textContent = message;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'toast-close';
  closeBtn.textContent = '×';
  closeBtn.setAttribute('aria-label', 'Cerrar notificación');
  closeBtn.addEventListener('click', () => toast.remove());

  toast.appendChild(span);
  toast.appendChild(closeBtn);
  container.appendChild(toast);

  setTimeout(() => toast.remove(), durationMs);
}

/**
 * Renderiza el HTML higienizado de una insignia de tipo Pokémon.
 */
export function renderTypeBadge(tipo: string): string {
  const safeTipo = escapeText(tipo);
  const normType = escapeText(normalizeStr(tipo));
  return `<span class="type-badge" data-type="${normType}">${safeTipo}</span>`;
}

/**
 * Renderiza el conjunto de insignias de tipos para un Pokémon.
 */
export function renderTypeBadges(tipo: string, tipos?: string[]): string {
  if (Array.isArray(tipos) && tipos.length > 0) {
    return tipos.map((t) => renderTypeBadge(t)).join('');
  }
  return renderTypeBadge(tipo);
}

/**
 * Renderiza un bloque HTML de estado vacío o de error recuperable.
 */
export function renderEmptyState(options: {
  icon?: string;
  title: string;
  description: string;
  retryBtnId?: string;
  retryBtnText?: string;
}): string {
  const icon = options.icon || '⚠️';
  const retryBtn = options.retryBtnId
    ? `<button class="btn btn-primary mt-4" id="${escapeText(options.retryBtnId)}">${escapeText(options.retryBtnText || 'Reintentar')}</button>`
    : '';

  return sanitizeHtml(`
    <div class="empty-state">
      <div class="empty-icon">${escapeText(icon)}</div>
      <h3 class="empty-title">${escapeText(options.title)}</h3>
      <p class="error-detail">${escapeText(options.description)}</p>
      ${retryBtn}
    </div>
  `);
}
