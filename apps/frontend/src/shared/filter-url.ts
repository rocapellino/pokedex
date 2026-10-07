/**
 * Serialización de los filtros del catálogo en la query string (`?q=&tipo=&gen=&mega=`).
 * Son funciones puras: el controlador decide cuándo leer y cuándo escribir la URL.
 * Lo que llega de la URL es entrada no confiable, así que se valida contra los valores conocidos.
 */

import { TYPE_COLORS } from './constants.js';
import { normalizeStr } from './formatters.js';

export interface FilterState {
  searchQuery: string;
  /** Nombres canónicos de tipo (p. ej. `Eléctrico`). */
  types: string[];
  /** Generación como texto (`1` a `9`) o `all`. */
  generation: string;
  onlyWithMega: boolean;
}

export const EMPTY_FILTER_STATE: Readonly<FilterState> = {
  searchQuery: '',
  types: [],
  generation: 'all',
  onlyWithMega: false,
};

const MAX_QUERY_LENGTH = 80;
const MAX_GENERATION = 9;

const CANONICAL_TYPES = new Map(Object.keys(TYPE_COLORS).map((name) => [normalizeStr(name), name]));

/** Lee el estado de filtros de una query string, descartando cualquier valor desconocido. */
export function parseFilterParams(search: string): FilterState {
  const params = new URLSearchParams(search);

  const searchQuery = (params.get('q') ?? '').slice(0, MAX_QUERY_LENGTH).trim();

  const types: string[] = [];
  for (const slug of (params.get('tipo') ?? '').split(',')) {
    const canonical = CANONICAL_TYPES.get(normalizeStr(slug));
    if (canonical && !types.includes(canonical)) types.push(canonical);
  }

  const gen = Number.parseInt(params.get('gen') ?? '', 10);
  const generation = gen >= 1 && gen <= MAX_GENERATION ? String(gen) : 'all';

  return { searchQuery, types, generation, onlyWithMega: params.get('mega') === '1' };
}

/** Devuelve la query string (con `?` inicial) o una cadena vacía si no hay filtros activos. */
export function serializeFilterParams(state: FilterState): string {
  const params = new URLSearchParams();
  const query = state.searchQuery.trim();
  if (query) params.set('q', query);
  if (state.types.length > 0) params.set('tipo', state.types.map(normalizeStr).join(','));
  if (state.generation !== 'all') params.set('gen', state.generation);
  if (state.onlyWithMega) params.set('mega', '1');

  const text = params.toString();
  return text ? `?${text}` : '';
}
