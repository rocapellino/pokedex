/**
 * Tipos Compartidos para la Aplicación Frontend Pokédex
 */

export interface PokemonStats {
  hp?: number;
  attack?: number;
  defense?: number;
  sp_attack?: number;
  sp_defense?: number;
  speed?: number;
  [key: string]: number | undefined;
}

export interface PokemonCaracteristicas {
  peso?: number;
  altura?: number;
  fuerza?: number;
  edad?: number;
  categoria?: string;
  descripcion?: string;
  habitat?: string;
  [key: string]: unknown;
}

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
  caracteristicas?: PokemonCaracteristicas;
  habilidades?: string[] | string;
  stats?: PokemonStats;
  evoluciones?: EvolutionNode[] | { arbol?: EvolutionNode };
  [key: string]: unknown;
}

export interface SessionInfo {
  token: string;
  expiresIn: number;
  expiresAt: number;
  role: string;
}
