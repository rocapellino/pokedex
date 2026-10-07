/**
 * Controles de la barra de filtros: el panel "Filtros" plegable y el desplegable de tipos.
 * Solo manipula el DOM; el estado de los filtros vive en el controlador del catálogo.
 */

import { normalizeStr } from '../shared/index.js';

const byId = <T extends HTMLElement>(id: string): T | null => document.getElementById(id) as T | null;

export function isFiltersPanelOpen(): boolean {
  const panel = byId('moreFilters');
  return panel ? !panel.hidden : false;
}

/** Abre o cierra el panel; al cerrarlo también se pliega el desplegable de tipos. */
export function setFiltersPanelOpen(open: boolean): void {
  const panel = byId('moreFilters');
  if (panel) panel.hidden = !open;

  const toggle = byId('filtersToggle');
  if (toggle) {
    toggle.setAttribute('aria-expanded', String(open));
    const icon = toggle.querySelector('.filters-toggle-icon');
    if (icon) icon.textContent = open ? '−' : '+';
  }
  if (!open) setTypeListOpen(false);
}

/** Muestra cuántos filtros del panel están activos, en el contador y en el nombre accesible del botón. */
export function renderFiltersCount(count: number): void {
  const badge = byId('moreFiltersCount');
  if (badge) {
    badge.textContent = String(count);
    badge.hidden = count === 0;
  }
  byId('filtersToggle')?.setAttribute('aria-label', count > 0 ? `Filtros, ${count} activos` : 'Filtros');
}

export function setTypeListOpen(open: boolean): void {
  const list = byId('typeFilterList');
  if (list) list.hidden = !open;
  byId('typeFilterToggle')?.setAttribute('aria-expanded', String(open));
}

/** Texto del botón del desplegable: los tipos elegidos o, si son muchos, cuántos. */
export function summarizeTypes(types: readonly string[]): string {
  if (types.length === 0) return 'Cualquier tipo';
  if (types.length <= 2) return types.join(', ');
  return `${types.length} tipos`;
}

/** Refleja la selección de tipos en las casillas y en el texto del botón. */
export function syncTypeDropdown(selectedTypes: readonly string[]): void {
  const selected = new Set(selectedTypes.map(normalizeStr));
  for (const box of document.querySelectorAll<HTMLInputElement>('#typeFilterList input[type="checkbox"]')) {
    box.checked = selected.has(normalizeStr(box.value));
  }
  const summary = byId('typeFilterSummary');
  if (summary) summary.textContent = summarizeTypes(selectedTypes);
}

/**
 * Conecta el botón del panel y el desplegable de tipos. El desplegable se cierra con Escape (devolviendo
 * el foco a su botón), al sacar el foco de él y al pulsar fuera.
 */
export function initFiltersControls(onToggleType: (type: string) => void): void {
  byId('filtersToggle')?.addEventListener('click', () => setFiltersPanelOpen(!isFiltersPanelOpen()));

  const list = byId('typeFilterList');
  const field = byId('typeFilterField');
  byId('typeFilterToggle')?.addEventListener('click', () => setTypeListOpen(Boolean(list?.hidden)));

  list?.addEventListener('change', (event) => {
    const box = event.target as HTMLInputElement | null;
    if (box?.type === 'checkbox') onToggleType(box.value);
  });

  field?.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !list || list.hidden) return;
    event.stopPropagation();
    setTypeListOpen(false);
    byId('typeFilterToggle')?.focus();
  });

  field?.addEventListener('focusout', (event) => {
    const next = event.relatedTarget as Node | null;
    if (next && !field.contains(next)) setTypeListOpen(false);
  });

  document.addEventListener('click', (event) => {
    if (list && !list.hidden && field && !field.contains(event.target as Node | null)) setTypeListOpen(false);
  });
}
