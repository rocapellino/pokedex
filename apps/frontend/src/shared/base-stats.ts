/**
 * Definición y utilidades de presentación de las estadísticas base, compartidas por el
 * detalle del Pokémon y la sección de megaevolución.
 */

/** Máximo teórico de una estadística base en los juegos principales. */
export const STAT_SCALE_MAX = 255;

export const BASE_STAT_DEFS = [
  { key: 'hp', label: 'PS', name: 'PS' },
  { key: 'attack', label: 'Ataque', name: 'Ataque' },
  { key: 'defense', label: 'Defensa', name: 'Defensa' },
  { key: 'sp_attack', label: 'At. Esp.', name: 'Ataque especial' },
  { key: 'sp_defense', label: 'Def. Esp.', name: 'Defensa especial' },
  { key: 'speed', label: 'Velocidad', name: 'Velocidad' },
] as const;

export function statTier(value: number): 'low' | 'mid' | 'high' | 'top' {
  if (value < 50) return 'low';
  if (value < 80) return 'mid';
  if (value < 110) return 'high';
  return 'top';
}

/** Ancho de la barra en pasos de 5 % (clases `base-stat-fill--wN`); la CSP impide `style` inline. */
export function statWidthStep(value: number): number {
  return Math.min(100, Math.max(0, Math.round((value / STAT_SCALE_MAX) * 20) * 5));
}

export function isValidStat(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
