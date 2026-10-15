/**
 * ==============================================================================
 * Pokédex Frontend - Tipos y Contratos
 * ==============================================================================
 * Re-exporta los contratos compartidos de @pokedex/contracts, adaptando las
 * interfaces para permitir renderizado reactivo y estados parciales en UI.
 * ==============================================================================
 */

import type {
  Pokemon as CanonicalPokemon,
  PokemonCharacteristics as CanonicalCharacteristics,
  PokemonStats as CanonicalStats,
} from '@pokedex/contracts';

export * from '@pokedex/contracts';

export type PokemonCaracteristicas = Partial<CanonicalCharacteristics>;
export type PokemonCharacteristics = PokemonCaracteristicas;
export type PokemonStats = Partial<CanonicalStats>;

export interface EvolutionNode {
  id?: number;
  nombre?: string;
  etapa?: string;
  metodo?: string | null;
  imagen?: string | null;
  evolves_to?: EvolutionNode[];
  evoluciones?: EvolutionNode[];
}

export interface Pokemon {
  id: number;
  nombre: string;
  tipo: string;
  tipos?: string[];
  imagen?: string | null;
  fuerza?: number;
  peso?: number;
  altura?: number;
  edad?: number;
  caracteristicas?: PokemonCharacteristics;
  habilidades?: string[] | string;
  stats?: PokemonStats;
  evoluciones?: EvolutionNode[] | { arbol?: EvolutionNode; es_ramificada?: boolean };
  megaevoluciones?: CanonicalPokemon['megaevoluciones'];
  clasificacion?: CanonicalPokemon['clasificacion'];
  [key: string]: unknown;
}
