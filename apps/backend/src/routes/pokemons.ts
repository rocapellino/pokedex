import express, { Request, Response } from 'express';
import crypto from 'crypto';
import { Pokemon } from '../types.js';
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

export const pokemonsRouter = express.Router();

// ---------------------------------------------------------------------------
// Security Helper: Prevención de Log Injection / CWE-117 (tssecurity:S5145)
// ---------------------------------------------------------------------------
function sanitizeLogString(val: unknown): string {
  if (val === undefined || val === null) return '';
  return String(val).replace(/[\r\n\t]/g, '_').slice(0, 100);
}

// ---------------------------------------------------------------------------
// Helper: ETag Seguro
// ---------------------------------------------------------------------------
function calculateETag(data: unknown): string {
  const hash = crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex').substring(0, 16);
  return `"${hash}"`;
}

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
  const id = Number.parseInt(req.params.id, 10);
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

  const body = req.body;
  const newId = await getNextPokemonId();
  const rawDesc = body.caracteristicas?.descripcion || `${body.nombre} registrado recientemente en la Pokédex.`;

  const newPokemon: Pokemon = {
    id: newId,
    nombre: String(body.nombre).trim().slice(0, 60),
    imagen: body.imagen || `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${newId}.png`,
    tipo: String(body.tipo).trim().slice(0, 30),
    tipos: Array.isArray(body.tipos) ? body.tipos.map((t: any) => String(t).slice(0, 30)) : [String(body.tipo).trim()],
    habitat: String(body.habitat || body.caracteristicas?.habitat || 'Kanto').slice(0, 50),
    fuerza: Number.parseInt(String(body.fuerza || body.caracteristicas?.fuerza || 50), 10),
    caracteristicas: {
      peso: Number.parseFloat(String(body.caracteristicas?.peso || 10.0)),
      altura: Number.parseFloat(String(body.caracteristicas?.altura || 1.0)),
      fuerza: Number.parseInt(String(body.fuerza || body.caracteristicas?.fuerza || 50), 10),
      edad: Number.parseInt(String(body.caracteristicas?.edad || 5), 10),
      categoria: String(body.caracteristicas?.categoria || 'Descubierto').slice(0, 60),
      descripcion: String(rawDesc).slice(0, 1000),
      habitat: String(body.habitat || body.caracteristicas?.habitat || 'Kanto').slice(0, 50),
    },
    habilidades: Array.isArray(body.habilidades)
      ? body.habilidades.map((h: any) => String(h).slice(0, 50))
      : [String(body.habilidades || 'Adaptable').slice(0, 50)],
    stats: body.stats || {
      hp: 50,
      attack: Number.parseInt(String(body.fuerza || body.caracteristicas?.fuerza || 50), 10),
      defense: 50,
      sp_attack: 50,
      sp_defense: 50,
      speed: 50,
    },
    evoluciones: body.evoluciones || [],
  };

  await savePokemon(newPokemon);

  logger.audit('Pokémon creado', {
    id: Number(newPokemon.id),
    nombre: sanitizeLogString(newPokemon.nombre),
  });
  return res.status(201).json(newPokemon);
}));

// Edición persistente con validación e invalidación de caché
pokemonsRouter.put('/pokemons/:id', mutationRateLimiterStandard, mutationRateLimiter, verifyAdmin, requireWritableStorage, asyncHandler(async (req: Request, res: Response) => {
  const id = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    return res.status(400).json({ detail: 'ID inválido' });
  }

  const existing = await getPokemonById(id);
  if (!existing) {
    return res.status(404).json({ detail: `Pokémon con id ${id} no encontrado` });
  }

  const body = req.body;
  const validation = validatePokemonPayload({ ...existing, ...body });
  if (!validation.valid) {
    return res.status(422).json({ detail: validation.error });
  }

  const updated: Pokemon = {
    id: existing.id,
    nombre: body.nombre ? String(body.nombre).trim().slice(0, 60) : existing.nombre,
    imagen: body.imagen || existing.imagen,
    tipo: body.tipo ? String(body.tipo).trim().slice(0, 30) : existing.tipo,
    tipos: body.tipos
      ? (Array.isArray(body.tipos) ? body.tipos.map((t: any) => String(t).slice(0, 30)) : [String(body.tipos)])
      : existing.tipos,
    habitat: body.habitat ? String(body.habitat).slice(0, 50) : existing.habitat,
    fuerza: body.fuerza !== undefined ? Number.parseInt(String(body.fuerza), 10) : existing.fuerza,
    habilidades: body.habilidades
      ? (Array.isArray(body.habilidades) ? body.habilidades.map((h: any) => String(h).slice(0, 50)) : [String(body.habilidades)])
      : existing.habilidades,
    caracteristicas: {
      peso: body.caracteristicas?.peso !== undefined ? Number.parseFloat(String(body.caracteristicas.peso)) : existing.caracteristicas.peso,
      altura: body.caracteristicas?.altura !== undefined ? Number.parseFloat(String(body.caracteristicas.altura)) : existing.caracteristicas.altura,
      fuerza: body.fuerza !== undefined ? Number.parseInt(String(body.fuerza), 10) : (body.caracteristicas?.fuerza !== undefined ? Number.parseInt(String(body.caracteristicas.fuerza), 10) : existing.caracteristicas.fuerza),
      edad: body.caracteristicas?.edad !== undefined ? Number.parseInt(String(body.caracteristicas.edad), 10) : existing.caracteristicas.edad,
      categoria: body.caracteristicas?.categoria !== undefined ? String(body.caracteristicas.categoria).slice(0, 60) : existing.caracteristicas.categoria,
      descripcion: body.caracteristicas?.descripcion !== undefined ? String(body.caracteristicas.descripcion).slice(0, 1000) : existing.caracteristicas.descripcion,
      habitat: body.habitat !== undefined ? String(body.habitat).slice(0, 50) : (body.caracteristicas?.habitat !== undefined ? String(body.caracteristicas.habitat).slice(0, 50) : existing.caracteristicas.habitat),
    },
    stats: body.stats ? {
      hp: body.stats.hp !== undefined ? Number.parseInt(String(body.stats.hp), 10) : (existing.stats?.hp ?? 50),
      attack: body.stats.attack !== undefined ? Number.parseInt(String(body.stats.attack), 10) : (existing.stats?.attack ?? 50),
      defense: body.stats.defense !== undefined ? Number.parseInt(String(body.stats.defense), 10) : (existing.stats?.defense ?? 50),
      sp_attack: body.stats.sp_attack !== undefined ? Number.parseInt(String(body.stats.sp_attack), 10) : (existing.stats?.sp_attack ?? 50),
      sp_defense: body.stats.sp_defense !== undefined ? Number.parseInt(String(body.stats.sp_defense), 10) : (existing.stats?.sp_defense ?? 50),
      speed: body.stats.speed !== undefined ? Number.parseInt(String(body.stats.speed), 10) : (existing.stats?.speed ?? 50),
    } : existing.stats,
    evoluciones: body.evoluciones !== undefined ? body.evoluciones : existing.evoluciones,
  };

  await savePokemon(updated);

  logger.audit('Pokémon actualizado', {
    id: Number(id),
    nombre: sanitizeLogString(updated.nombre),
  });
  return res.json(updated);
}));

// Eliminación persistente
pokemonsRouter.delete('/pokemons/:id', mutationRateLimiterStandard, mutationRateLimiter, verifyAdmin, requireWritableStorage, asyncHandler(async (req: Request, res: Response) => {
  const id = Number.parseInt(req.params.id, 10);
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
