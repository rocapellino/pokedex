/**
 * ==============================================================================
 * @pokedex/contracts - Contratos de API REST y Paginación
 * ==============================================================================
 */

import type { Pokemon } from './pokemon.js';

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiErrorResponse {
  error: string;
  message?: string;
  statusCode?: number;
  details?: unknown;
}

export interface PokemonFilters {
  tipo?: string;
  generacion?: number;
  search?: string;
  clasificacion?: string;
  sortBy?: 'id' | 'nombre' | 'fuerza' | 'peso' | 'altura';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface CreatePokemonDTO {
  nombre: string;
  tipo: string;
  tipos?: string[];
  imagen?: string | null;
  fuerza?: number;
  peso?: number;
  altura?: number;
  edad?: number;
  caracteristicas?: Pokemon['caracteristicas'];
  habilidades?: string[] | string;
  stats?: Pokemon['stats'];
}

export type UpdatePokemonDTO = Partial<CreatePokemonDTO>;
