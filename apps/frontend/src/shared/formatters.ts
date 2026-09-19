/**
 * Formateadores y Normalizadores Compartidos para Frontend Pokédex
 */

import { TYPE_COLORS, DEFAULT_TYPE_COLOR, GENERATION_BOUNDARIES } from './constants.js';

/**
 * Normaliza cadenas removiendo acentos, espacios y convirtiendo a minúsculas.
 */
export function normalizeStr(str: unknown): string {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Obtiene el color hexadecimal representativo de un tipo de Pokémon.
 */
export function getTypeColor(tipo?: string): string {
  if (!tipo) return DEFAULT_TYPE_COLOR;
  const match = Object.keys(TYPE_COLORS).find((k) => normalizeStr(k) === normalizeStr(tipo));
  return match ? TYPE_COLORS[match] : DEFAULT_TYPE_COLOR;
}

/**
 * Determina la generación Pokémon (1 a 9) a partir del identificador nacional.
 */
export function getGeneration(id: number): number {
  for (const boundary of GENERATION_BOUNDARIES) {
    if (id <= boundary.maxId) return boundary.gen;
  }
  return 9;
}

/**
 * Formatea un ID numérico a formato `#001` con padding estándar.
 */
export function formatPokemonId(id: number, digits = 3): string {
  return `#${String(id).padStart(digits, '0')}`;
}
