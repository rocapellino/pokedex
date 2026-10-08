/**
 * Utilidades de UI y Rendering Compartidas para Frontend Pokédex
 */

import { normalizeStr } from './formatters.js';
import { html, type SafeHtml } from './html.js';

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
export function renderTypeBadge(tipo: string): SafeHtml {
  return html`<span class="type-badge" data-type="${normalizeStr(tipo)}">${tipo}</span>`;
}

/**
 * Renderiza el conjunto de insignias de tipos para un Pokémon.
 */
export function renderTypeBadges(tipo: string, tipos?: string[]): SafeHtml {
  if (Array.isArray(tipos) && tipos.length > 0) {
    return html`${tipos.map((t) => renderTypeBadge(t))}`;
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
}): SafeHtml {
  const icon = options.icon || '⚠️';
  const retryBtn = options.retryBtnId
    ? html`<button class="btn btn-primary mt-4" id="${options.retryBtnId}">${options.retryBtnText || 'Reintentar'}</button>`
    : html``;

  // `html` escapa cada dato y `setHtml` (el único punto de inserción en el DOM) sanea el resultado.
  return html`
    <div class="empty-state">
      <div class="empty-icon">${icon}</div>
      <h3 class="empty-title">${options.title}</h3>
      <p class="error-detail">${options.description}</p>
      ${retryBtn}
    </div>
  `;
}

/**
 * Abre un modal declarado como `<dialog>`: `showModal()` aporta foco, Escape, capa superior e
 * `inert` del resto de la página. Si el elemento no implementa la API (p. ej. jsdom) degrada a
 * marcar `[open]`.
 */
export function openModal(id: string): void {
  const el = document.getElementById(id) as HTMLDialogElement | null;
  if (!el || el.hasAttribute('open')) return;
  if (typeof el.showModal === 'function') el.showModal();
  else el.setAttribute('open', '');
}

export function closeModal(id: string): void {
  const el = document.getElementById(id) as HTMLDialogElement | null;
  if (!el?.hasAttribute('open')) return;
  if (typeof el.close === 'function') el.close();
  else el.removeAttribute('open');
}
