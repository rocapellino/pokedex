import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import crypto from 'crypto';
import { initialPokemons } from './src/data/initialPokemons.js';
import { Pokemon } from './src/types.js';
import { generateDiagram, generateMockup, generateImage } from './src/services/ai.js';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const PUBLIC_DIR = path.join(process.cwd(), 'apps', 'web', 'public');

// ---------------------------------------------------------------------------
// In-Memory Data Store & Indexed Lookup Map
// ---------------------------------------------------------------------------
let pokemons: Pokemon[] = JSON.parse(JSON.stringify(initialPokemons));
const pokemonMap = new Map<number, Pokemon>();
for (const p of pokemons) {
  pokemonMap.set(p.id, p);
}
let nextId = pokemons.reduce((max, p) => Math.max(max, p.id), 1008) + 1;

// ---------------------------------------------------------------------------
// Metrics & Observability Tracking (Prometheus Exposition Format)
// ---------------------------------------------------------------------------
const startTime = Date.now();
let totalRequests = 0;
const httpRequestsTotal = new Map<string, number>();
const httpDurationSum = new Map<string, number>();
const httpDurationCount = new Map<string, number>();

function normalizeEndpoint(req: Request): string {
  const p = req.path || '/';
  if (/^\/pokemons\/\d+$/.test(p)) {
    return '/pokemons/:id';
  }
  if (p.startsWith('/api/v1/ai/')) {
    return '/api/v1/ai/:service';
  }
  return p;
}

// ---------------------------------------------------------------------------
// Security: Server Hardening & Security Headers
// ---------------------------------------------------------------------------
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Configured or dynamic CORS
const configuredCorsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
  : null;

app.use(cors({
  origin: (origin, callback) => {
    // Permitir solicitudes sin origin (como herramientas internas, curl, mismo dominio)
    if (!origin || !configuredCorsOrigins || configuredCorsOrigins.includes('*')) {
      return callback(null, true);
    }
    if (configuredCorsOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Bloqueado por directiva de seguridad CORS'));
  },
  credentials: true,
}));

// Payload limit reducido a 250kb para prevenir abusos de memoria
app.use(express.json({ limit: '250kb' }));
app.use(express.urlencoded({ extended: true, limit: '250kb' }));

// Prometheus metrics collection middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  totalRequests++;
  const start = process.hrtime();

  res.on('finish', () => {
    const [seconds, nanoseconds] = process.hrtime(start);
    const durationSeconds = seconds + nanoseconds / 1e9;
    const endpoint = normalizeEndpoint(req);
    const status = String(res.statusCode);
    const method = req.method;

    const key = `${endpoint}|${status}|${method}`;
    httpRequestsTotal.set(key, (httpRequestsTotal.get(key) || 0) + 1);

    httpDurationSum.set(endpoint, (httpDurationSum.get(endpoint) || 0) + durationSeconds);
    httpDurationCount.set(endpoint, (httpDurationCount.get(endpoint) || 0) + 1);
  });

  next();
});

// ---------------------------------------------------------------------------
// Rate Limiter en Memoria (Ventana Deslizante)
// ---------------------------------------------------------------------------
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

function createRateLimiter(maxRequests: number, windowMs: number, serviceName = 'Servicio') {
  const clients = new Map<string, RateLimitEntry>();

  // Limpieza periódica de IPs inactivas
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of clients.entries()) {
      if (now > entry.resetTime) {
        clients.delete(ip);
      }
    }
  }, windowMs * 2);

  return (req: Request, res: Response, next: NextFunction) => {
    // Usar directamente req.ip gestionado de forma segura con trust proxy configurado
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const now = Date.now();
    const entry = clients.get(ip);

    if (!entry || now > entry.resetTime) {
      clients.set(ip, { count: 1, resetTime: now + windowMs });
      return next();
    }

    if (entry.count >= maxRequests) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      return res.status(429).json({
        detail: `Límite de peticiones para ${serviceName} excedido (${maxRequests}/min). Por favor intenta de nuevo en ${retryAfter} segundos.`,
        retry_after_seconds: retryAfter,
      });
    }

    entry.count++;
    next();
  };
}

const aiRateLimiter = createRateLimiter(10, 60 * 1000, 'Endpoints IA');
const mutationRateLimiter = createRateLimiter(30, 60 * 1000, 'Modificaciones CRUD');

// ---------------------------------------------------------------------------
// Security: Verificación de Clave con Prevención de Timing Attacks
// ---------------------------------------------------------------------------
function safeCompareKeys(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  try {
    const hashA = crypto.createHash('sha256').update(provided.trim()).digest();
    const hashB = crypto.createHash('sha256').update(expected.trim()).digest();
    return crypto.timingSafeEqual(hashA, hashB);
  } catch {
    return false;
  }
}

function extractApiKey(req: Request): string {
  const authHeader = (req.headers['authorization'] || '') as string;
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return ((req.headers['x-api-key'] || authHeader) as string).trim();
}

function verifyAdmin(req: Request, res: Response, next: NextFunction) {
  const adminKey = extractApiKey(req);
  const configuredKey = process.env.ADMIN_API_KEY;

  if (!configuredKey) {
    console.error('[Security Warning] Intento de acceso a ruta protegida pero ADMIN_API_KEY no está configurada.');
    return res.status(503).json({
      detail: 'Servicio administrativo no disponible: ADMIN_API_KEY no configurada en el servidor.',
    });
  }

  if (!adminKey) {
    return res.status(401).json({
      detail: 'Credencial de autenticación faltante en la cabecera X-API-Key / Authorization',
    });
  }

  if (safeCompareKeys(adminKey, configuredKey)) {
    return next();
  }

  return res.status(401).json({
    detail: 'Credencial de autenticación administrativa inválida',
  });
}

function verifyAIKey(req: Request, res: Response, next: NextFunction) {
  const expectedAiKey = process.env.AI_API_KEY || process.env.GEMINI_API_KEY;
  const configuredAdminKey = process.env.ADMIN_API_KEY;

  if (!expectedAiKey) {
    return res.status(503).json({
      detail: 'Servicio de IA no disponible: AI_API_KEY no configurada en el servidor.',
    });
  }

  const providedKey = extractApiKey(req);
  if (!providedKey) {
    return res.status(401).json({
      detail: 'Acceso no autorizado al servicio de IA: se requiere clave en X-API-Key / Authorization.',
    });
  }

  const isAiValid = safeCompareKeys(providedKey, expectedAiKey);
  const isAdminValid = configuredAdminKey ? safeCompareKeys(providedKey, configuredAdminKey) : false;

  if (isAiValid || isAdminValid) {
    return next();
  }

  return res.status(401).json({
    detail: 'Acceso no autorizado al servicio de IA: clave proporcionada inválida.',
  });
}

// ---------------------------------------------------------------------------
// Validación Robusta de Datos de Entrada (Sanitización y Límites Anti-XSS)
// ---------------------------------------------------------------------------
const XSS_REGEX = /<[^>]*>|javascript:|onerror=|onload=|eval\(|<script/i;

function validatePokemonPayload(body: any): { valid: boolean; error?: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'El cuerpo de la petición debe ser un objeto JSON válido' };
  }

  if (typeof body.nombre !== 'string' || !body.nombre.trim()) {
    return { valid: false, error: 'El campo nombre es requerido y no puede estar vacío' };
  }
  if (body.nombre.trim().length > 60) {
    return { valid: false, error: 'El nombre no puede exceder los 60 caracteres' };
  }
  if (XSS_REGEX.test(body.nombre)) {
    return { valid: false, error: 'El campo nombre contiene código HTML o scripts no permitidos (prevención XSS)' };
  }

  if (typeof body.tipo !== 'string' || !body.tipo.trim()) {
    return { valid: false, error: 'El campo tipo es requerido' };
  }
  if (body.tipo.trim().length > 30) {
    return { valid: false, error: 'El tipo no puede exceder los 30 caracteres' };
  }
  if (XSS_REGEX.test(body.tipo)) {
    return { valid: false, error: 'El campo tipo contiene código HTML o scripts no permitidos (prevención XSS)' };
  }

  const peso = parseFloat(body.caracteristicas?.peso ?? body.peso ?? 10);
  if (isNaN(peso) || peso <= 0 || peso > 10000) {
    return { valid: false, error: 'El peso debe ser un número positivo menor o igual a 10.000 kg' };
  }

  const altura = parseFloat(body.caracteristicas?.altura ?? body.altura ?? 1);
  if (isNaN(altura) || altura <= 0 || altura > 200) {
    return { valid: false, error: 'La altura debe ser un número positivo menor o igual a 200 m' };
  }

  const fuerza = parseInt(body.fuerza ?? body.caracteristicas?.fuerza ?? 50, 10);
  if (isNaN(fuerza) || fuerza < 0 || fuerza > 1000) {
    return { valid: false, error: 'La fuerza debe ser un número entero entre 0 y 1.000' };
  }

  if (body.caracteristicas?.descripcion) {
    const desc = String(body.caracteristicas.descripcion);
    if (desc.length > 1000) {
      return { valid: false, error: 'La descripción no puede exceder los 1.000 caracteres' };
    }
    if (XSS_REGEX.test(desc)) {
      return { valid: false, error: 'La descripción contiene código HTML o scripts no permitidos (prevención XSS)' };
    }
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Helper: ETag Seguro
// ---------------------------------------------------------------------------
function calculateETag(data: unknown): string {
  const hash = crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex').substring(0, 16);
  return `"${hash}"`;
}

// ---------------------------------------------------------------------------
// Healthcheck & Observability Endpoints
// ---------------------------------------------------------------------------
app.get('/healthz', (_req: Request, res: Response) => {
  res.type('text/plain').status(200).send('healthy\n');
});

app.get('/readyz', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ready',
    database: 'in-memory-map',
    degraded_mode: false,
    pokemons_count: pokemons.length,
  });
});

app.get('/metrics', (_req: Request, res: Response) => {
  const uptimeSeconds = ((Date.now() - startTime) / 1000).toFixed(2);
  const lines: string[] = [
    '# HELP pokedex_uptime_seconds Tiempo que la aplicación ha estado activa en segundos.',
    '# TYPE pokedex_uptime_seconds gauge',
    `pokedex_uptime_seconds ${uptimeSeconds}`,
    '',
    '# HELP pokedex_total_pokemons Cantidad actual de Pokémon registrados en memoria.',
    '# TYPE pokedex_total_pokemons gauge',
    `pokedex_total_pokemons ${pokemons.length}`,
    '',
    '# HELP pokedex_degraded_mode Indicador de modo degradado (1 = activo, 0 = normal).',
    '# TYPE pokedex_degraded_mode gauge',
    'pokedex_degraded_mode 0',
    '',
    '# HELP pokedex_http_requests_total Contador total de solicitudes HTTP recibidas por endpoint y estado.',
    '# TYPE pokedex_http_requests_total counter',
  ];

  if (httpRequestsTotal.size === 0) {
    lines.push(`pokedex_http_requests_total{endpoint="/",status="200",method="GET"} 0`);
  } else {
    for (const [key, count] of httpRequestsTotal.entries()) {
      const [endpoint, status, method] = key.split('|');
      lines.push(`pokedex_http_requests_total{endpoint="${endpoint}",status="${status}",method="${method}"} ${count}`);
    }
  }

  lines.push('');
  lines.push('# HELP pokedex_http_request_duration_seconds_sum Suma acumulada de la duración de solicitudes HTTP en segundos.');
  lines.push('# TYPE pokedex_http_request_duration_seconds_sum counter');
  if (httpDurationSum.size === 0) {
    lines.push(`pokedex_http_request_duration_seconds_sum{endpoint="/"} 0`);
  } else {
    for (const [endpoint, sum] of httpDurationSum.entries()) {
      lines.push(`pokedex_http_request_duration_seconds_sum{endpoint="${endpoint}"} ${sum.toFixed(6)}`);
    }
  }

  lines.push('');
  lines.push('# HELP pokedex_http_request_duration_seconds_count Total de solicitudes HTTP medidas para duración.');
  lines.push('# TYPE pokedex_http_request_duration_seconds_count counter');
  if (httpDurationCount.size === 0) {
    lines.push(`pokedex_http_request_duration_seconds_count{endpoint="/"} 0`);
  } else {
    for (const [endpoint, count] of httpDurationCount.entries()) {
      lines.push(`pokedex_http_request_duration_seconds_count{endpoint="${endpoint}"} ${count}`);
    }
  }

  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  return res.status(200).send(lines.join('\n') + '\n');
});

// ---------------------------------------------------------------------------
// Pokémon REST API Routes
// ---------------------------------------------------------------------------
app.get('/pokemons', (req: Request, res: Response) => {
  let list = pokemons;

  const { tipo, nombre, limit, offset } = req.query;

  if (typeof tipo === 'string' && tipo.trim() && tipo.toLowerCase() !== 'all') {
    const t = tipo.trim().toLowerCase();
    list = list.filter(p =>
      p.tipo.toLowerCase() === t ||
      (Array.isArray(p.tipos) && p.tipos.some(x => x.toLowerCase() === t))
    );
  }

  if (typeof nombre === 'string' && nombre.trim()) {
    const query = nombre.trim().toLowerCase();
    list = list.filter(p =>
      p.nombre.toLowerCase().includes(query) ||
      p.tipo.toLowerCase().includes(query) ||
      (p.caracteristicas?.habitat && p.caracteristicas.habitat.toLowerCase().includes(query)) ||
      String(p.id).includes(query)
    );
  }

  if (offset) {
    const skip = Math.max(0, parseInt(offset as string, 10) || 0);
    list = list.slice(skip);
  }

  if (limit) {
    const take = Math.max(1, parseInt(limit as string, 10) || list.length);
    list = list.slice(0, take);
  }

  const etag = calculateETag(list);
  if (req.headers['if-none-match'] === etag) {
    return res.status(304).end();
  }

  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  return res.json(list);
});

// Búsqueda instantánea O(1) vía Map
app.get('/pokemons/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ detail: 'ID de Pokémon debe ser un número entero' });
  }

  const found = pokemonMap.get(id);
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
});

// Creación con rate limiter, autenticación y validación
app.post('/pokemons', mutationRateLimiter, verifyAdmin, (req: Request, res: Response) => {
  const validation = validatePokemonPayload(req.body);
  if (!validation.valid) {
    return res.status(422).json({ detail: validation.error });
  }

  const body = req.body;
  const newId = nextId++;
  const rawDesc = body.caracteristicas?.descripcion || `${body.nombre} registrado recientemente en la Pokédex.`;

  const newPokemon: Pokemon = {
    id: newId,
    nombre: String(body.nombre).trim().slice(0, 60),
    imagen: body.imagen || `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${newId}.png`,
    tipo: String(body.tipo).trim().slice(0, 30),
    tipos: Array.isArray(body.tipos) ? body.tipos.map((t: any) => String(t).slice(0, 30)) : [String(body.tipo).trim()],
    habitat: String(body.habitat || body.caracteristicas?.habitat || 'Kanto').slice(0, 50),
    fuerza: parseInt(body.fuerza || body.caracteristicas?.fuerza || 50, 10),
    caracteristicas: {
      peso: parseFloat(body.caracteristicas?.peso || 10.0),
      altura: parseFloat(body.caracteristicas?.altura || 1.0),
      fuerza: parseInt(body.fuerza || body.caracteristicas?.fuerza || 50, 10),
      edad: parseInt(body.caracteristicas?.edad || 5, 10),
      categoria: String(body.caracteristicas?.categoria || 'Descubierto').slice(0, 60),
      descripcion: String(rawDesc).slice(0, 1000),
      habitat: String(body.habitat || body.caracteristicas?.habitat || 'Kanto').slice(0, 50),
    },
    habilidades: Array.isArray(body.habilidades)
      ? body.habilidades.map((h: any) => String(h).slice(0, 50))
      : [String(body.habilidades || 'Adaptable').slice(0, 50)],
    stats: body.stats || {
      hp: 50,
      attack: parseInt(body.fuerza || body.caracteristicas?.fuerza || 50, 10),
      defense: 50,
      sp_attack: 50,
      sp_defense: 50,
      speed: 50,
    },
    evoluciones: body.evoluciones || [],
  };

  pokemons.push(newPokemon);
  pokemonMap.set(newPokemon.id, newPokemon);

  console.log(`[AUDIT] [${new Date().toISOString()}] Pokémon creado: ID ${newPokemon.id} - ${newPokemon.nombre}`);
  return res.status(201).json(newPokemon);
});

// Edición con validación
app.put('/pokemons/:id', mutationRateLimiter, verifyAdmin, (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ detail: 'ID inválido' });
  }

  const existing = pokemonMap.get(id);
  if (!existing) {
    return res.status(404).json({ detail: `Pokémon con id ${id} no encontrado` });
  }

  const body = req.body;
  const validation = validatePokemonPayload({ ...existing, ...body });
  if (!validation.valid) {
    return res.status(422).json({ detail: validation.error });
  }

  const updated: Pokemon = {
    ...existing,
    nombre: body.nombre ? String(body.nombre).trim().slice(0, 60) : existing.nombre,
    imagen: body.imagen || existing.imagen,
    tipo: body.tipo ? String(body.tipo).trim().slice(0, 30) : existing.tipo,
    tipos: body.tipos
      ? (Array.isArray(body.tipos) ? body.tipos.map((t: any) => String(t).slice(0, 30)) : [String(body.tipos)])
      : existing.tipos,
    habitat: body.habitat ? String(body.habitat).slice(0, 50) : existing.habitat,
    fuerza: body.fuerza !== undefined ? parseInt(body.fuerza, 10) : existing.fuerza,
    habilidades: body.habilidades
      ? (Array.isArray(body.habilidades) ? body.habilidades.map((h: any) => String(h).slice(0, 50)) : [String(body.habilidades)])
      : existing.habilidades,
    caracteristicas: {
      ...existing.caracteristicas,
      ...(body.caracteristicas || {}),
      fuerza: body.fuerza !== undefined ? parseInt(body.fuerza, 10) : (body.caracteristicas?.fuerza || existing.caracteristicas.fuerza),
    },
    stats: body.stats || existing.stats,
    evoluciones: body.evoluciones !== undefined ? body.evoluciones : existing.evoluciones,
  };

  // Actualizar en memoria y Map
  const index = pokemons.findIndex(p => p.id === id);
  if (index !== -1) {
    pokemons[index] = updated;
  }
  pokemonMap.set(id, updated);

  console.log(`[AUDIT] [${new Date().toISOString()}] Pokémon actualizado: ID ${id} - ${updated.nombre}`);
  return res.json(updated);
});

// Eliminación
app.delete('/pokemons/:id', mutationRateLimiter, verifyAdmin, (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ detail: 'ID inválido' });
  }

  const index = pokemons.findIndex(p => p.id === id);
  if (index === -1) {
    return res.status(404).json({ detail: `Pokémon con id ${id} no encontrado` });
  }

  const [removed] = pokemons.splice(index, 1);
  pokemonMap.delete(id);

  console.log(`[AUDIT] [${new Date().toISOString()}] Pokémon eliminado: ID ${id} - ${removed.nombre}`);
  return res.json({
    mensaje: `Pokémon con id ${id} eliminado correctamente`,
    pokemon_eliminado: removed,
  });
});

// ---------------------------------------------------------------------------
// Google AI Studio (Gemini) Endpoints con Rate Limit y Auth
// ---------------------------------------------------------------------------
app.post('/api/v1/ai/diagram', aiRateLimiter, verifyAIKey, async (req: Request, res: Response) => {
  const { prompt, diagram_type } = req.body || {};
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'El campo prompt es requerido y debe ser texto' });
  }
  const cleanPrompt = prompt.trim().slice(0, 1000);
  const result = await generateDiagram(cleanPrompt, diagram_type);
  res.json(result);
});

app.post('/api/v1/ai/mock', aiRateLimiter, verifyAIKey, async (req: Request, res: Response) => {
  const { prompt, framework } = req.body || {};
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'El campo prompt es requerido y debe ser texto' });
  }
  const cleanPrompt = prompt.trim().slice(0, 1000);
  const result = await generateMockup(cleanPrompt, framework);
  res.json(result);
});

app.post('/api/v1/ai/image', aiRateLimiter, verifyAIKey, async (req: Request, res: Response) => {
  const { prompt, aspect_ratio } = req.body || {};
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'El campo prompt es requerido y debe ser texto' });
  }
  const cleanPrompt = prompt.trim().slice(0, 1000);
  const result = await generateImage(cleanPrompt, aspect_ratio);
  res.json(result);
});

// ---------------------------------------------------------------------------
// Download Repository ZIP Endpoint
// ---------------------------------------------------------------------------
app.get(['/download', '/download-zip', '/download/repo'], (_req: Request, res: Response) => {
  const zipPath = path.join(PUBLIC_DIR, 'pokedex-updated.zip');
  res.download(zipPath, 'pokedex-v2-migrated.zip', (err) => {
    if (err) {
      console.error('[Download] Error serving zip:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'No se pudo generar o descargar el archivo ZIP.' });
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Static Assets & Single Page Application Routing
// ---------------------------------------------------------------------------
app.use(express.static(PUBLIC_DIR));

const adminIpRestricted = (req: Request, res: Response, next: NextFunction) => {
  const allowed = process.env.ADMIN_ALLOWED_IPS;
  if (allowed) {
    const list = allowed.split(',').map(s => s.trim()).filter(Boolean);
    const clientIp = req.ip || req.socket.remoteAddress || '';
    if (list.length > 0 && !list.includes(clientIp) && clientIp !== '127.0.0.1' && clientIp !== '::1') {
      return res.status(403).json({ error: 'Acceso restringido: IP no autorizada para el panel de administración' });
    }
  }
  next();
};

app.get(['/admin', '/backoffice'], adminIpRestricted, (_req: Request, res: Response) => {
  res.sendFile(path.join(PUBLIC_DIR, 'backoffice.html'));
});

app.get('*', (_req: Request, res: Response) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Pokédex Server] Running with security hardening on http://0.0.0.0:${PORT}`);
  console.log(`[Pokédex Server] Loaded ${pokemons.length} Pokémon records in indexed memory.`);
});
