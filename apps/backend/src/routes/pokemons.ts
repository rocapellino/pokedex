import express, { type Request, type Response } from 'express';
import {
  getAllPokemons,
  getPokemonById,
  savePokemon,
  deletePokemon,
  getNextPokemonId,
} from '../services/db.js';
import { validatePokemonPayload } from '../validation/pokemon.js';
import { parsePaginationLimit, parsePaginationOffset } from '../utils/pagination.js';
import {
  mutationRateLimiter,
  mutationRateLimiterStandard,
} from '../middleware/rate-limiter.js';
import {
  verifyAdmin,
  requireWritableStorage,
} from '../middleware/auth.js';
import { logger } from '../utils/logger.js';
import { asyncHandler } from '../utils/async-handler.js';
import { calculateETag } from '../utils/etag.js';
import {
  sanitizeLogString,
  buildPokemonFromPayload,
  applyPokemonUpdates,
} from '../controllers/pokemon-mapper.js';

// Re-exportar utilidades para retrocompatibilidad total
export {
  calculateETag,
  sanitizeLogString,
  buildPokemonFromPayload,
  applyPokemonUpdates,
};

export const pokemonsRouter = express.Router();

// ---------------------------------------------------------------------------
// Pokémon REST API Routes (PostgreSQL + Redis Caching con Fallback Resiliente)
// ---------------------------------------------------------------------------
pokemonsRouter.get('/pokemons', asyncHandler(async (req: Request, res: Response) => {
  const { tipo, nombre, limit, offset } = req.query;

  // Límite de paginación estricto contra abusos de DoS y saturación de base de datos
  const parsedLimit = parsePaginationLimit(limit as string | number | undefined);
  const parsedOffset = parsePaginationOffset(offset as string | number | undefined);
  const typeStr = typeof tipo === 'string' && tipo.trim() && tipo.toLowerCase() !== 'all' ? tipo.trim() : undefined;
  const searchStr = typeof nombre === 'string' && nombre.trim() ? nombre.trim() : undefined;

  const { total, pokemons: list } = await getAllPokemons({
    limit: parsedLimit,
    offset: parsedOffset,
    type: typeStr,
    search: searchStr,
  });

  const etag = calculateETag(list);
  if (req.headers['if-none-match'] === etag) {
    return res.status(304).end();
  }

  res.setHeader('ETag', etag);
  res.setHeader('X-Total-Count', String(total));
  res.setHeader('Access-Control-Expose-Headers', 'ETag, X-Total-Count');
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  return res.json(list);
}));

// Búsqueda instantánea vía PostgreSQL / Redis con ETag
pokemonsRouter.get('/pokemons/:id', asyncHandler(async (req: Request, res: Response) => {
  const id = Number.parseInt(String(req.params.id), 10);
  if (Number.isNaN(id)) {
    return res.status(400).json({ detail: 'ID de Pokémon debe ser un número entero' });
  }

  const found = await getPokemonById(id);
  if (!found) {
    return res.status(404).json({ detail: `Pokémon con id ${id} no encontrado` });
  }

  const etag = calculateETag(found);
  if (req.headers['if-none-match'] === etag) {
    return res.status(304).end();
  }

  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  return res.json(found);
}));

// Creación persistente con rate limiter, autenticación y validación
pokemonsRouter.post('/pokemons', mutationRateLimiterStandard, mutationRateLimiter, verifyAdmin, requireWritableStorage, asyncHandler(async (req: Request, res: Response) => {
  const validation = validatePokemonPayload(req.body);
  if (!validation.valid) {
    return res.status(422).json({ detail: validation.error });
  }

  const newId = await getNextPokemonId();
  const newPokemon = buildPokemonFromPayload(newId, req.body);

  await savePokemon(newPokemon);

  logger.audit('Pokémon creado', {
    id: Number(newPokemon.id),
    nombre: sanitizeLogString(newPokemon.nombre),
  });
  return res.status(201).json(newPokemon);
}));

// Edición persistente con validación e invalidación de caché
pokemonsRouter.put('/pokemons/:id', mutationRateLimiterStandard, mutationRateLimiter, verifyAdmin, requireWritableStorage, asyncHandler(async (req: Request, res: Response) => {
  const id = Number.parseInt(String(req.params.id), 10);
  if (Number.isNaN(id)) {
    return res.status(400).json({ detail: 'ID inválido' });
  }

  const existing = await getPokemonById(id);
  if (!existing) {
    return res.status(404).json({ detail: `Pokémon con id ${id} no encontrado` });
  }

  const validation = validatePokemonPayload({ ...existing, ...req.body });
  if (!validation.valid) {
    return res.status(422).json({ detail: validation.error });
  }

  const updated = applyPokemonUpdates(existing, req.body);
  await savePokemon(updated);

  logger.audit('Pokémon actualizado', {
    id: Number(id),
    nombre: sanitizeLogString(updated.nombre),
  });
  return res.json(updated);
}));

// Eliminación persistente
pokemonsRouter.delete('/pokemons/:id', mutationRateLimiterStandard, mutationRateLimiter, verifyAdmin, requireWritableStorage, asyncHandler(async (req: Request, res: Response) => {
  const id = Number.parseInt(String(req.params.id), 10);
  if (Number.isNaN(id)) {
    return res.status(400).json({ detail: 'ID inválido' });
  }

  const existing = await getPokemonById(id);
  if (!existing) {
    return res.status(404).json({ detail: `Pokémon con id ${id} no encontrado` });
  }

  await deletePokemon(id);

  logger.audit('Pokémon eliminado', {
    id: Number(id),
    nombre: sanitizeLogString(existing.nombre),
  });
  return res.json({
    mensaje: `Pokémon con id ${id} eliminado correctamente`,
    pokemon_eliminado: existing,
  });
}));
