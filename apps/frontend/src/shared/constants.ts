/**
 * Constantes Compartidas del Frontend Pokédex
 */

export const TYPE_COLORS: Record<string, string> = {
  'Eléctrico': '#f59e0b',
  'Fuego': '#ef4444',
  'Agua': '#3b82f6',
  'Planta': '#10b981',
  'Psíquico': '#ec4899',
  'Roca': '#b45309',
  'Tierra': '#d97706',
  'Hielo': '#06b6d4',
  'Fantasma': '#8b5cf6',
  'Dragón': '#6366f1',
  'Normal': '#6b7280',
  'Lucha': '#dc2626',
  'Veneno': '#a855f7',
  'Bicho': '#84cc16',
  'Volador': '#38bdf8',
  'Acero': '#94a3b8',
  'Siniestro': '#334155',
  'Hada': '#f472b6',
};

export const DEFAULT_TYPE_COLOR = '#6b7280';

export const GENERATION_BOUNDARIES = [
  { maxId: 151, gen: 1 },
  { maxId: 251, gen: 2 },
  { maxId: 386, gen: 3 },
  { maxId: 493, gen: 4 },
  { maxId: 649, gen: 5 },
  { maxId: 721, gen: 6 },
  { maxId: 809, gen: 7 },
  { maxId: 905, gen: 8 },
] as const;
