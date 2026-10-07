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

/**
 * Megaevolución de un Pokémon. Es una transformación de combate de la especie base,
 * no una entrada del catálogo: no tiene número de Pokédex Nacional propio y por eso
 * cuelga de `Pokemon.megaevoluciones` sin `id`. `clave` es su identificador estable
 * dentro de la especie (slug de PokeAPI, p. ej. `charizard-mega-x`).
 */
export interface MegaEvolution {
  clave: string;
  nombre: string;
  imagen: string;
  tipos: string[];
  habilidades: string[];
  stats: PokemonStats;
  peso: number;
  altura: number;
}

/** Clasificación especial de una especie, tal como la publica PokeAPI (`is_legendary` / `is_mythical`). */
export type PokemonClassification = 'legendario' | 'mitico';

export const POKEMON_CLASSIFICATIONS: readonly PokemonClassification[] = ['legendario', 'mitico'];

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
  evoluciones?: EvolutionNode[] | { arbol?: EvolutionNode; es_ramificada?: boolean };
  /** Solo lectura: se carga desde el catálogo y la API no permite editarla. */
  megaevoluciones?: MegaEvolution[];
  /** Solo lectura: `legendario` o `mitico` según PokeAPI; ausente en el resto de especies. */
  clasificacion?: PokemonClassification;
  [key: string]: unknown;
}
