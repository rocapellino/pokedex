import { serializeFilterParams, type FilterState } from './filter-url.js';

/**
 * `push` crea una entrada de historial (un cambio discreto que «atrás» debe poder deshacer);
 * `replace` reescribe la actual (escritura continua, normalización o restauración de la URL).
 */
export type HistoryMode = 'push' | 'replace';

/** Refleja los filtros en la URL; no hace nada si la URL ya los describe. Conserva ruta y ancla. */
export function commitFiltersToUrl(state: FilterState, mode: HistoryMode): void {
  const next = serializeFilterParams(state);
  if (next === window.location.search) return;
  const url = `${window.location.pathname}${next}${window.location.hash}`;
  if (mode === 'replace') window.history.replaceState(null, '', url);
  else window.history.pushState(null, '', url);
}

/** `true` si la URL actual ya describe exactamente estos filtros (p. ej. un cambio de ancla, no de filtros). */
export function urlMatchesFilters(state: FilterState): boolean {
  return window.location.search === serializeFilterParams(state);
}
