export interface PokemonCharacteristics {
  peso: number;
  altura: number;
  fuerza: number;
  edad?: number;
  categoria?: string;
  descripcion?: string;
  habitat?: string;
}

export interface PokemonStats {
  hp: number;
  attack: number;
  defense: number;
  sp_attack: number;
  sp_defense: number;
  speed: number;
}

export interface EvolutionNode {
  id: number;
  nombre: string;
  etapa?: string;
  metodo?: string | null;
  imagen?: string;
  evolves_to?: EvolutionNode[];
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
  evoluciones?: EvolutionNode[] | { arbol?: EvolutionNode };
}
