/**
 * Cliente de API Unificado para Frontend Pokédex
 */

import type { Pokemon, SessionInfo } from '../types.js';

export interface ApiErrorResponse {
  detail?: string;
  message?: string;
  error?: string;
}

export class ApiError extends Error {
  status: number;
  data?: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorDetail = `Error HTTP ${res.status}`;
    try {
      const data = (await res.json()) as ApiErrorResponse;
      errorDetail = data.detail || data.message || data.error || errorDetail;
      throw new ApiError(errorDetail, res.status, data);
    } catch (err: unknown) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(errorDetail, res.status);
    }
  }
  return res.json() as Promise<T>;
}

// ----------------------------------------------------------------------------
// Catálogo Público de Pokémon
// ----------------------------------------------------------------------------

export async function fetchAllPokemons(): Promise<Pokemon[]> {
  const res = await fetch('/pokemons');
  return handleResponse<Pokemon[]>(res);
}

export async function fetchPokemonsWithCount(params: {
  offset?: number;
  limit?: number;
  nombre?: string;
  search?: string;
  tipo?: string;
  type?: string;
}): Promise<{ total: number; pokemons: Pokemon[] }> {
  const query = new URLSearchParams();
  if (params.offset !== undefined) query.set('offset', String(params.offset));
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  
  const searchVal = params.nombre || params.search;
  if (searchVal?.trim()) query.set('nombre', searchVal.trim());
  
  const typeVal = params.tipo || params.type;
  if (typeVal && typeVal !== 'all') query.set('tipo', typeVal);

  const url = `/pokemons?${query.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    let errorDetail = `Error HTTP ${res.status}`;
    try {
      const data = (await res.json()) as ApiErrorResponse;
      errorDetail = data.detail || data.message || data.error || errorDetail;
      throw new ApiError(errorDetail, res.status, data);
    } catch (err: unknown) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(errorDetail, res.status);
    }
  }

  const countHeader = res.headers.get('X-Total-Count');
  const pokemons = (await res.json()) as Pokemon[];
  const total = countHeader ? Number.parseInt(countHeader, 10) : pokemons.length;
  return { pokemons, total };
}

export async function fetchPokemonById(id: number): Promise<Pokemon> {
  const res = await fetch(`/pokemons/${id}`);
  return handleResponse<Pokemon>(res);
}

// ----------------------------------------------------------------------------
// Gestión de Sesión Administrativa (HttpOnly Cookie)
// ----------------------------------------------------------------------------

export async function getSessionStatus(): Promise<SessionInfo> {
  const res = await fetch('/api/v1/auth/session', { credentials: 'same-origin' });
  return handleResponse<SessionInfo>(res);
}

export async function loginWithApiKey(apiKey: string): Promise<SessionInfo> {
  const res = await fetch('/api/v1/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey }),
    credentials: 'same-origin',
  });
  return handleResponse<SessionInfo>(res);
}

export async function logoutSession(): Promise<void> {
  const res = await fetch('/api/v1/auth/logout', {
    method: 'POST',
    credentials: 'same-origin',
  });
  if (!res.ok) {
    let errorDetail = `Error HTTP ${res.status}`;
    try {
      const data = (await res.json()) as ApiErrorResponse;
      errorDetail = data.detail || data.message || data.error || errorDetail;
      throw new ApiError(errorDetail, res.status, data);
    } catch (err: unknown) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(errorDetail, res.status);
    }
  }
}

// ----------------------------------------------------------------------------
// Operaciones CRUD de Backoffice (Requiere Sesión Activa)
// ----------------------------------------------------------------------------

export async function createPokemon(data: Partial<Pokemon>): Promise<Pokemon> {
  const res = await fetch('/pokemons', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    credentials: 'same-origin',
  });
  return handleResponse<Pokemon>(res);
}

export async function updatePokemon(id: number, data: Partial<Pokemon>): Promise<Pokemon> {
  const res = await fetch(`/pokemons/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    credentials: 'same-origin',
  });
  return handleResponse<Pokemon>(res);
}

export async function deletePokemon(id: number): Promise<void> {
  const res = await fetch(`/pokemons/${id}`, {
    method: 'DELETE',
    credentials: 'same-origin',
  });
  if (!res.ok) {
    let errorDetail = `Error HTTP ${res.status}`;
    try {
      const data = (await res.json()) as ApiErrorResponse;
      errorDetail = data.detail || data.message || data.error || errorDetail;
      throw new ApiError(errorDetail, res.status, data);
    } catch (err: unknown) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(errorDetail, res.status);
    }
  }
}
