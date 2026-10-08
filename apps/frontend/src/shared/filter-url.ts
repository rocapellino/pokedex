/**
 * Serialización de los filtros del catálogo en la query string (`?q=&tipo=&gen=&mega=&stat=&min=&clase=&hab=&orden=&dir=&pagina=`).
 * Son funciones puras: el controlador decide cuándo leer y cuándo escribir la URL.
 * Lo que llega de la URL es entrada no confiable, así que se valida contra los valores conocidos.
 */

import { TYPE_COLORS } from './constants.js';
import { isClassificationFilter, type ClassificationFilter } from './catalog-filters.js';
import {
  defaultSortDirection,
  isSortDirection,
  isSortKey,
  isStatKey,
  MAX_STAT_MIN,
  type MinStat,
  type SortDirection,
  type SortKey,
} from './catalog-sort.js';
import { normalizeStr } from './formatters.js';

export interface FilterState {
  searchQuery: string;
  /** Nombres canónicos de tipo (p. ej. `Eléctrico`). */
  types: string[];
  /** Generación como texto (`1` a `9`) o `all`. */
  generation: string;
  onlyWithMega: boolean;
  minStat: MinStat | null;
  clasificacion: ClassificationFilter | null;
  /** Habilidad exacta; al leer la URL llega normalizada (sin tildes) y el controlador la resuelve al nombre real. */
  habilidad: string | null;
  sort: SortKey;
  /** Sentido efectivo del orden (el de por defecto de `sort` si la URL no lo indica). */
  dir: SortDirection;
  /** Página del catálogo (desde 1). El controlador la ajusta al total de páginas que dejan los filtros. */
  page: number;
}

export const EMPTY_FILTER_STATE: Readonly<FilterState> = {
  searchQuery: '',
  types: [],
  generation: 'all',
  onlyWithMega: false,
  minStat: null,
  clasificacion: null,
  habilidad: null,
  sort: 'id',
  dir: 'asc',
  page: 1,
};

const MAX_QUERY_LENGTH = 80;
const MAX_ABILITY_LENGTH = 60;
const MAX_GENERATION = 9;
const MAX_PAGE = 10_000;

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

  const statKey = params.get('stat');
  const statMin = Number.parseInt(params.get('min') ?? '', 10);
  const minStat: MinStat | null =
    isStatKey(statKey) && statMin >= 1 && statMin <= MAX_STAT_MIN ? { key: statKey, min: statMin } : null;

  const habilidad = normalizeStr((params.get('hab') ?? '').slice(0, MAX_ABILITY_LENGTH));
  const orden = params.get('orden');
  const sort: SortKey = isSortKey(orden) ? orden : 'id';
  const dir = params.get('dir');
  const clase = params.get('clase');
  const page = Number.parseInt(params.get('pagina') ?? '', 10);

  return {
    searchQuery,
    types,
    generation,
    onlyWithMega: params.get('mega') === '1',
    minStat,
    clasificacion: isClassificationFilter(clase) ? clase : null,
    habilidad: habilidad || null,
    sort,
    dir: isSortDirection(dir) ? dir : defaultSortDirection(sort),
    page: page >= 1 && page <= MAX_PAGE ? page : 1,
  };
}

/** Devuelve la query string (con `?` inicial) o una cadena vacía si no hay filtros activos. */
export function serializeFilterParams(state: FilterState): string {
  const params = new URLSearchParams();
  const query = state.searchQuery.trim();
  if (query) params.set('q', query);
  if (state.types.length > 0) params.set('tipo', state.types.map(normalizeStr).join(','));
  if (state.generation !== 'all') params.set('gen', state.generation);
  if (state.onlyWithMega) params.set('mega', '1');
  if (state.minStat) {
    params.set('stat', state.minStat.key);
    params.set('min', String(state.minStat.min));
  }
  if (state.clasificacion) params.set('clase', state.clasificacion);
  if (state.habilidad) params.set('hab', normalizeStr(state.habilidad));
  if (state.sort !== 'id') params.set('orden', state.sort);
  if (state.dir !== defaultSortDirection(state.sort)) params.set('dir', state.dir);
  if (state.page > 1) params.set('pagina', String(state.page));

  const text = params.toString();
  return text ? `?${text}` : '';
}
