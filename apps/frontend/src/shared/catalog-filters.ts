/**
 * Predicado de filtrado del catálogo público (búsqueda, tipos, generación y megaevolución).
 * Es una función pura: el controlador solo conserva el estado de los filtros.
 */

import type { Pokemon } from '../types.js';
import { getGeneration, normalizeStr } from './formatters.js';
import { getStatValue, type MinStat } from './catalog-sort.js';
import { getClassification, hasMegaEvolution } from './pokemon-types.js';

/** Filtro de clasificación: una clase concreta o `especial` (legendarios y míticos). */
export const CLASSIFICATION_FILTERS = ['legendario', 'mitico', 'especial'] as const;
export type ClassificationFilter = (typeof CLASSIFICATION_FILTERS)[number];

export function isClassificationFilter(value: unknown): value is ClassificationFilter {
  return (CLASSIFICATION_FILTERS as readonly unknown[]).includes(value);
}

export interface CatalogFilters {
  /** Texto de búsqueda sin normalizar. */
  searchQuery: string;
  /** Tipos seleccionados; el Pokémon debe tenerlos todos. Vacío equivale a no filtrar. */
  types: readonly string[];
  /** Generación seleccionada (número como texto) o `all`. */
  generation: string;
  /** Si es `true`, solo Pokémon con al menos una megaevolución. */
  onlyWithMega: boolean;
  /** Estadística mínima exigida; `null` o ausente no filtra. Los Pokémon sin ese dato quedan fuera. */
  minStat?: MinStat | null;
  /** Solo legendarios, solo míticos o ambos (`especial`); `null` o ausente no filtra. */
  clasificacion?: ClassificationFilter | null;
}

interface NormalizedEntry {
  /** Campos buscables ya normalizados (nombre, tipos, habilidades, hábitat). */
  haystack: string[];
  /** Tipos normalizados del Pokémon. */
  types: Set<string>;
  id: string;
}

const entryCache = new WeakMap<Pokemon, NormalizedEntry>();

function buildEntry(p: Pokemon): NormalizedEntry {
  const types = new Set<string>();
  if (p.tipo) types.add(normalizeStr(p.tipo));
  if (Array.isArray(p.tipos)) for (const t of p.tipos) types.add(normalizeStr(t));

  const haystack = [normalizeStr(p.nombre), ...types];
  if (Array.isArray(p.habilidades)) for (const h of p.habilidades) haystack.push(normalizeStr(h));
  else if (typeof p.habilidades === 'string') haystack.push(normalizeStr(p.habilidades));
  if (p.caracteristicas?.habitat) haystack.push(normalizeStr(p.caracteristicas.habitat));
  if (typeof p.habitat === 'string') haystack.push(normalizeStr(p.habitat));

  return { haystack, types, id: String(p.id) };
}

/** Devuelve el índice normalizado del Pokémon, calculándolo una sola vez por objeto. */
function getEntry(p: Pokemon): NormalizedEntry {
  let entry = entryCache.get(p);
  if (!entry) {
    entry = buildEntry(p);
    entryCache.set(p, entry);
  }
  return entry;
}

export function matchesCatalogFilters(p: Pokemon, filters: CatalogFilters): boolean {
  const entry = getEntry(p);
  const term = normalizeStr(filters.searchQuery);

  const matchesSearch = !term || entry.id.includes(term) || entry.haystack.some((field) => field.includes(term));

  const matchesTypes = filters.types.every((t) => entry.types.has(normalizeStr(t)));

  const matchesGen = filters.generation === 'all' || getGeneration(p.id) === Number.parseInt(filters.generation, 10);

  const matchesMega = !filters.onlyWithMega || hasMegaEvolution(p);

  const stat = filters.minStat ? getStatValue(p, filters.minStat.key) : undefined;
  const matchesStat = !filters.minStat || (stat !== undefined && stat >= filters.minStat.min);

  const clase = filters.clasificacion ? getClassification(p) : undefined;
  const matchesClass =
    !filters.clasificacion ||
    (clase !== undefined && (filters.clasificacion === 'especial' || filters.clasificacion === clase));

  return matchesSearch && matchesTypes && matchesGen && matchesMega && matchesStat && matchesClass;
}
