export interface PokemonCharacteristics {
  peso: number;
  altura: number;
  fuerza: number;
  edad?: number;
  categoria?: string;
  descripcion?: string;
  habitat?: string;
  [key: string]: unknown;
}

/** Alias de compatibilidad e interoperabilidad entre capas */
export type PokemonCaracteristicas = PokemonCharacteristics;

export interface PokemonStats {
  hp: number;
  attack: number;
  defense: number;
  sp_attack: number;
  sp_defense: number;
  speed: number;
  [key: string]: number | undefined;
}

export interface EvolutionNode {
  id: number;
  nombre: string;
  etapa?: string;
  metodo?: string | null;
  imagen?: string | null;
  evolves_to?: EvolutionNode[];
  evoluciones?: EvolutionNode[];
}

export interface Pokemon {
  id: number;
  nombre: string;
  imagen: string;
  tipo: string;
  tipos?: string[];
  habitat?: string;
  caracteristicas: PokemonCharacteristics;
  habilidades: string[];
  stats?: PokemonStats;
  fuerza?: number;
  peso?: number;
  altura?: number;
  edad?: number;
  evoluciones?: EvolutionNode[] | { arbol?: EvolutionNode };
  [key: string]: unknown;
}
