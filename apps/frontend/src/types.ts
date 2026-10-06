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

/** Alias de compatibilidad e interoperabilidad entre capas */
export type PokemonCharacteristics = PokemonCaracteristicas;

export interface EvolutionNode {
  id?: number;
  nombre?: string;
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
  evoluciones?: EvolutionNode[] | { arbol?: EvolutionNode; es_ramificada?: boolean };
  /** Solo lectura: se carga desde el catálogo y la API no permite editarla. */
  megaevoluciones?: MegaEvolution[];
  [key: string]: unknown;
}

export interface SessionInfo {
  authenticated?: boolean;
  token?: string;
  expiresIn?: number;
  expires_in?: number;
  expiresAt?: number;
  role?: string;
}
