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

/** Respuesta de `GET /api/v1/version`: metadatos de release y estado de los almacenes. */
export interface ServiceVersionResponse {
  app: string;
  version: string;
  git_sha: string;
  node_version: string;
  uptime_seconds: number;
  environment: string;
  database: {
    engine: string;
    postgres_connected: boolean;
    postgres_version: string;
    redis_connected: boolean;
    mode: 'normal' | 'degraded';
  };
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
