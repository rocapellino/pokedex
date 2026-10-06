/**
 * Predicado de filtrado del catálogo público (búsqueda, tipo, generación y megaevolución).
 * Es una función pura: el controlador solo conserva el estado de los filtros.
 */

import type { Pokemon } from '../types.js';
import { getGeneration, normalizeStr } from './formatters.js';
import { hasMegaEvolution } from './pokemon-types.js';

export interface CatalogFilters {
  /** Texto de búsqueda sin normalizar. */
  searchQuery: string;
  /** Tipo seleccionado o `all`. */
  type: string;
  /** Generación seleccionada (número como texto) o `all`. */
  generation: string;
  /** Si es `true`, solo Pokémon con al menos una megaevolución. */
  onlyWithMega: boolean;
}

export function matchesCatalogFilters(p: Pokemon, filters: CatalogFilters): boolean {
  const term = normalizeStr(filters.searchQuery);
  const targetType = normalizeStr(filters.type);

  const matchesSearch =
    !term ||
    normalizeStr(p.nombre).includes(term) ||
    normalizeStr(p.tipo).includes(term) ||
    (Array.isArray(p.tipos) && p.tipos.some((t) => normalizeStr(t).includes(term))) ||
    (Array.isArray(p.habilidades) && p.habilidades.some((h) => normalizeStr(h).includes(term))) ||
    (typeof p.habilidades === 'string' && normalizeStr(p.habilidades).includes(term)) ||
    (p.caracteristicas?.habitat && normalizeStr(p.caracteristicas.habitat).includes(term)) ||
    (typeof p.habitat === 'string' && normalizeStr(p.habitat).includes(term)) ||
    String(p.id).includes(term);

  const matchesType =
    filters.type === 'all' ||
    normalizeStr(p.tipo) === targetType ||
    (Array.isArray(p.tipos) && p.tipos.some((t) => normalizeStr(t) === targetType));

  const matchesGen = filters.generation === 'all' || getGeneration(p.id) === Number.parseInt(filters.generation, 10);

  const matchesMega = !filters.onlyWithMega || hasMegaEvolution(p);

  return Boolean(matchesSearch) && matchesType && matchesGen && matchesMega;
}
