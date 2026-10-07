/**
 * Orden del catálogo y valores de estadística usados por el filtro de estadística mínima.
 * Funciones puras: el controlador solo conserva la clave de orden elegida.
 */

import type { Pokemon } from '../types.js';
import { BASE_STAT_DEFS, isValidStat } from './base-stats.js';

export const STAT_KEYS = ['total', ...BASE_STAT_DEFS.map((def) => def.key)] as const;
export type StatKey = (typeof STAT_KEYS)[number];

export const SORT_KEYS = ['id', 'name', ...STAT_KEYS] as const;
export type SortKey = (typeof SORT_KEYS)[number];

/** Cota superior del filtro: cubre el mayor total de estadísticas base posible. */
export const MAX_STAT_MIN = 780;

export interface MinStat {
  key: StatKey;
  min: number;
}

/** Etiqueta corta de cada estadística para chips y selectores. */
export const STAT_LABELS: Record<StatKey, string> = {
  total: 'Total',
  ...Object.fromEntries(BASE_STAT_DEFS.map((def) => [def.key, def.label])),
} as Record<StatKey, string>;

export function isStatKey(value: unknown): value is StatKey {
  return (STAT_KEYS as readonly unknown[]).includes(value);
}

export function isSortKey(value: unknown): value is SortKey {
  return (SORT_KEYS as readonly unknown[]).includes(value);
}

/** Valor de una estadística base del Pokémon; `total` suma las seis y exige que estén todas. */
export function getStatValue(p: Pokemon, key: StatKey): number | undefined {
  if (key !== 'total') {
    const value = p.stats?.[key];
    return isValidStat(value) ? value : undefined;
  }
  let sum = 0;
  for (const def of BASE_STAT_DEFS) {
    const value = p.stats?.[def.key];
    if (!isValidStat(value)) return undefined;
    sum += value;
  }
  return sum;
}

/** Devuelve una copia ordenada: número y nombre ascendentes, estadísticas de mayor a menor. */
export function sortPokemons(list: readonly Pokemon[], key: SortKey): Pokemon[] {
  const sorted = [...list];
  if (key === 'id') return sorted.sort((a, b) => a.id - b.id);
  if (key === 'name') return sorted.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') || a.id - b.id);

  return sorted.sort((a, b) => {
    const va = getStatValue(a, key);
    const vb = getStatValue(b, key);
    if (va === undefined && vb === undefined) return a.id - b.id;
    if (va === undefined) return 1;
    if (vb === undefined) return -1;
    return vb - va || a.id - b.id;
  });
}
