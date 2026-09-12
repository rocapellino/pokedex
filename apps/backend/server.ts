import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { Pokemon } from './src/types.js';
import { generateDiagram, generateMockup, generateImage } from './src/services/ai.js';
import {
  initStorage,
  getAllPokemons,
  getPokemonById,
  savePokemon,
  deletePokemon,
  getNextPokemonId,
  getStorageHealth,
  getPostgresVersion,
  consumeDistributedRateLimit,
  isWritableStorageAvailable,
} from './src/services/db.js';
import { checkRequiredEnvVars } from './src/config/startup-env-check.js';
import { validatePokemonPayload } from './src/validation/pokemon.js';
import { parsePaginationLimit, parsePaginationOffset } from './src/utils/pagination.js';
import {
  generateSessionToken,
  verifySessionToken,
  verifySessionTokenDetailed,
  revokeSessionToken,
  revokeSessionTokenDetailed,
} from './src/services/auth.js';
import { logger } from './src/utils/logger.js';
import { requestTracer } from './src/middleware/request-tracer.js';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const candidatePublicDirs = [
  path.join(process.cwd(), 'apps', 'frontend', 'dist'),
  path.join(process.cwd(), 'apps', 'frontend', 'public'),
  path.join(process.cwd(), '..', 'frontend', 'dist'),
  path.join(process.cwd(), '..', 'frontend', 'public'),
  path.join(process.cwd(), 'public'),
];
const PUBLIC_DIR = candidatePublicDirs.find((p) => fs.existsSync(p)) || path.join(process.cwd(), 'apps', 'frontend', 'dist');


// ---------------------------------------------------------------------------
// Error Boundary Helper: Async Handler para Express 4.x
// Reenvía automáticamente los rechazos de promesas al middleware global de errores
// ---------------------------------------------------------------------------
const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

// ---------------------------------------------------------------------------
// Security Helper: Prevención de Log Injection / CWE-117 (tssecurity:S5145)
// Sanitiza saltos de línea y caracteres de control antes de escribir al log
// ---------------------------------------------------------------------------
function sanitizeLogString(val: unknown): string {
  if (val === undefined || val === null) return '';
  return String(val).replace(/[\r\n\t]/g, '_').slice(0, 100);
}

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
// Confianza explícita únicamente en proxies de infraestructura local (loopback / linklocal / RFC1918)
app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);

app.use(requestTracer);

app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; img-src 'self' https://raw.githubusercontent.com data: blob:; connect-src 'self'; font-src 'self' https://fonts.gstatic.com; object-src 'none'; frame-ancestors 'self'; base-uri 'self'; form-action 'self';"
  );
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  if (process.env.NODE_ENV === 'production' || req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// Configured or dynamic CORS (Fail-closed en producción contra abusos)
const isProduction = process.env.NODE_ENV === 'production';
const configuredCorsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
  : null;

// Orígenes locales seguros permitidos por defecto en entorno de desarrollo
const DEFAULT_DEV_CORS_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:8080',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:8080',
];

app.use(cors({
  origin: (origin, callback) => {
    // Permitir solicitudes sin origin (como herramientas internas, curl, llamadas entre servicios locales)
    if (!origin) {
      return callback(null, true);
    }
    // En producción, si no hay orígenes configurados explícitamente, denegar por defecto (fail-closed)
    if (!configuredCorsOrigins || configuredCorsOrigins.length === 0) {
      if (isProduction) {
        return callback(new Error('Bloqueado por directiva de seguridad CORS: CORS_ORIGINS no configurado en producción'));
      }
      // En desarrollo sin CORS_ORIGINS explícito, restringir estrictamente a orígenes locales reconocidos
      if (DEFAULT_DEV_CORS_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Bloqueado por directiva de seguridad CORS: Origen no permitido en entorno de desarrollo'));
    }
    // La especificación CORS y navegadores modernos prohíben wildcard '*' con credentials: true
    if (configuredCorsOrigins.includes('*')) {
      return callback(new Error('Directiva CORS inválida: no se permite wildcard (*) combinado con credentials: true'));
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
// Rate Limiter Híbrido (Redis Distribuido con Fallback a Memoria Local)
// ---------------------------------------------------------------------------
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

export interface RateLimiterOptions {
  failClosedOnRedisOutage?: boolean;
}

export function createRateLimiter(
  maxRequests: number,
  windowMs: number,
  serviceName = 'Servicio',
  options: RateLimiterOptions = {}
) {
  const clients = new Map<string, RateLimitEntry>();

  // Limpieza periódica de IPs inactivas en el almacén local
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of clients.entries()) {
      if (now > entry.resetTime) {
        clients.delete(ip);
      }
    }
  }, windowMs * 2).unref();

  return (req: Request, res: Response, next: NextFunction) => {
    (async () => {
      // Excluir endpoints de salud y observabilidad de rate limiting para evitar falsos negativos en K8s
      if (req.path === '/healthz' || req.path === '/readyz' || req.path === '/metrics') {
        return next();
      }

      // Usar directamente req.ip gestionado de forma segura con trust proxy configurado
      const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
      const rateKey = `${serviceName.toLowerCase().replace(/[^a-z0-9]/g, '')}:${ip}`;

      const unit = windowMs >= 24 * 3600 * 1000 ? 'día' : (windowMs >= 3600 * 1000 ? 'hora' : 'min');

      // 1. Intentar rate limiting distribuido con Redis (multi-pod / multi-instancia)
      const distResult = await consumeDistributedRateLimit(rateKey, maxRequests, windowMs);
      if (distResult !== null) {
        if (!distResult.allowed) {
          res.setHeader('Retry-After', distResult.retryAfterSeconds);
          return res.status(429).json({
            detail: `Límite de peticiones para ${serviceName} excedido (${maxRequests}/${unit}). Por favor intenta de nuevo en ${distResult.retryAfterSeconds} segundos.`,
            retry_after_seconds: distResult.retryAfterSeconds,
          });
        }
        return next();
      }

      // Fail-Closed: para endpoints de alto costo o consumo de cuotas externas (ej. IA Gemini),
      // si Redis está configurado pero temporalmente fuera de línea, denegar con 503
      // para prevenir agotamiento de cuota o evasión del límite distribuido entre pods.
      if (options.failClosedOnRedisOutage && Boolean(process.env.REDIS_URL)) {
        return res.status(503).json({
          detail: `Servicio temporalmente no disponible: el limitador de tasa distribuido para ${serviceName} requiere conectividad con Redis.`,
        });
      }

      // 2. Fallback resiliente a memoria local si Redis no está configurado o para endpoints públicos
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
          detail: `Límite de peticiones para ${serviceName} excedido (${maxRequests}/${unit}). Por favor intenta de nuevo en ${retryAfter} segundos.`,
          retry_after_seconds: retryAfter,
        });
      }

      entry.count++;
      next();
    })().catch(next);
  };
}

const aiRateLimiter = createRateLimiter(10, 60 * 1000, 'Endpoints IA', { failClosedOnRedisOutage: true });
const aiDailyQuotaLimiter = createRateLimiter(200, 24 * 60 * 60 * 1000, 'Cuota Diaria IA', { failClosedOnRedisOutage: true });
const mutationRateLimiter = createRateLimiter(30, 60 * 1000, 'Modificaciones CRUD');
const authRateLimiter = createRateLimiter(5, 60 * 1000, 'Autenticación');
const globalRateLimiter = createRateLimiter(300, 60 * 1000, 'API Global');

// Middleware global de rate limiting para protección contra DDoS y saturación general
app.use(globalRateLimiter);

// ---------------------------------------------------------------------------
// Security: Verificación de Clave con Prevención de Timing Attacks
// ---------------------------------------------------------------------------
function safeCompareKeys(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  try {
    const bufProvided = Buffer.from(provided.trim(), 'utf8');
    const bufExpected = Buffer.from(expected.trim(), 'utf8');
    if (bufProvided.length !== bufExpected.length) {
      // Simular comparación de tiempo constante para prevenir timing attacks por discrepancia de longitud
      crypto.timingSafeEqual(bufExpected, bufExpected);
      return false;
    }
    return crypto.timingSafeEqual(bufProvided, bufExpected);
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

async function verifyAdmin(req: Request, res: Response, next: NextFunction) {
  const credential = extractApiKey(req);
  const configuredKey = process.env.ADMIN_API_KEY;

  if (!configuredKey) {
    logger.warn('Intento de acceso a ruta protegida pero ADMIN_API_KEY no está configurada', { security: true });
    return res.status(503).json({
      detail: 'Servicio administrativo no disponible: ADMIN_API_KEY no configurada en el servidor.',
    });
  }

  if (!credential) {
    return res.status(401).json({
      detail: 'Credencial de autenticación faltante en la cabecera X-API-Key / Authorization',
    });
  }

  // 1. Validar si la credencial es un token de sesión firmado de corta duración
  const sessionCheck = await verifySessionTokenDetailed(credential);
  if (sessionCheck.valid) {
    (req as any).authMechanism = 'hmac_session_token';
    return next();
  }

  // Fail-Closed: si el servicio distribuido de revocación está caído, rechazar con 503 por seguridad
  if (sessionCheck.reason === 'service_unavailable') {
    return res.status(503).json({
      detail: 'Servicio de autenticación distribuida temporalmente no disponible (Redis offline). Operación administrativa bloqueada por seguridad (Fail-Closed).',
    });
  }

  // 2. Validar si es la API key maestra (retrocompatibilidad para scripts, pipelines de CI y curl)
  if (safeCompareKeys(credential, configuredKey)) {
    (req as any).authMechanism = 'master_api_key';
    if (process.env.NODE_ENV !== 'test') {
      const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
      logger.audit(`Acceso administrativo vía MASTER_API_KEY en ${req.method} ${req.path}`, {
        clientIp,
        method: req.method,
        path: req.path,
      });
    }
    return next();
  }

  return res.status(401).json({
    detail: 'Credencial de autenticación administrativa inválida o sesión expirada',
  });
}

function requireWritableStorage(_req: Request, res: Response, next: NextFunction) {
  if (!isWritableStorageAvailable()) {
    return res.status(503).json({
      detail: 'Almacenamiento persistente (PostgreSQL) no disponible. Operaciones de escritura suspendidas para prevenir pérdida de datos.',
    });
  }
  next();
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
// Helper: ETag Seguro
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helper: ETag Seguro
// ---------------------------------------------------------------------------
function calculateETag(data: unknown): string {
  const hash = crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex').substring(0, 16);
  return `"${hash}"`;
}

// ---------------------------------------------------------------------------
// Autenticación de Operador: Emisión de Tokens de Sesión de Corta Duración
// ---------------------------------------------------------------------------
app.post('/api/v1/auth/session', authRateLimiter, (req: Request, res: Response) => {
  const { apiKey } = req.body || {};
  const configuredKey = process.env.ADMIN_API_KEY;

  if (!configuredKey) {
    return res.status(503).json({
      detail: 'Servicio de autenticación no disponible: ADMIN_API_KEY no configurada en el servidor.',
    });
  }

  if (!apiKey || typeof apiKey !== 'string' || !safeCompareKeys(apiKey.trim(), configuredKey)) {
    return res.status(401).json({
      detail: 'Clave administrativa inválida.',
    });
  }

  const { token, expiresIn } = generateSessionToken();
  return res.status(200).json({
    token,
    token_type: 'Bearer',
    expires_in: expiresIn,
  });
});

app.post('/api/v1/auth/logout', authRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const token = extractApiKey(req);
  if (token) {
    const revokeResult = await revokeSessionTokenDetailed(token);
    if (!revokeResult.success) {
      if (revokeResult.reason === 'invalid_signature' || revokeResult.reason === 'invalid_format') {
        return res.status(400).json({
          detail: 'Token de sesión inválido o firma HMAC apócrifa.',
        });
      }
      if (revokeResult.reason === 'service_unavailable') {
        return res.status(503).json({
          detail: 'No fue posible registrar la revocación de la sesión en el clúster distribuido (Redis no disponible).',
        });
      }
    }
  }
  return res.status(200).json({
    detail: 'Sesión finalizada y token revocado correctamente.',
  });
}));

// ---------------------------------------------------------------------------
// Healthcheck & Observability Endpoints
// ---------------------------------------------------------------------------
app.get('/healthz', (_req: Request, res: Response) => {
  res.type('text/plain').status(200).send('healthy\n');
});

app.get('/readyz', (_req: Request, res: Response) => {
  const health = getStorageHealth();
  if (!health.postgres_connected) {
    return res.status(503).json({
      status: 'unready',
      database: health.database,
      postgres_connected: health.postgres_connected,
      redis_connected: health.redis_connected,
      postgres_total_records: health.postgres_total_records,
      memory_total_records: health.memory_total_records,
      pokemons_count: health.total_records,
      detail: 'PostgreSQL no está conectado o el servicio está en modo degradado',
    });
  }
  return res.status(200).json({
    status: 'ready',
    database: health.database,
    postgres_connected: health.postgres_connected,
    redis_connected: health.redis_connected,
    postgres_total_records: health.postgres_total_records,
    memory_total_records: health.memory_total_records,
    pokemons_count: health.total_records,
  });
});

app.get(['/version', '/api/v1/version'], asyncHandler(async (_req: Request, res: Response) => {
  const health = getStorageHealth();
  const postgresVersion = await getPostgresVersion();
  const uptimeSeconds = ((Date.now() - startTime) / 1000).toFixed(2);

  return res.status(200).json({
    app: 'pokedex',
    version: process.env.APP_VERSION || '1.0.0',
    git_sha: process.env.GIT_SHA || process.env.COMMIT_SHA || 'unknown',
    node_version: process.version,
    uptime_seconds: Number.parseFloat(uptimeSeconds),
    environment: process.env.NODE_ENV || 'development',
    database: {
      engine: health.database,
      postgres_connected: health.postgres_connected,
      postgres_version: postgresVersion ?? (health.postgres_connected ? 'available' : 'unavailable'),
      redis_connected: health.redis_connected,
      mode: health.postgres_connected ? 'normal' : 'degraded',
    },
  });
}));

app.get('/metrics', (_req: Request, res: Response) => {
  const uptimeSeconds = ((Date.now() - startTime) / 1000).toFixed(2);
  const health = getStorageHealth();
  const degradedMode = health.postgres_connected ? 0 : 1;
  const lines: string[] = [
    '# HELP pokedex_uptime_seconds Tiempo que la aplicación ha estado activa en segundos.',
    '# TYPE pokedex_uptime_seconds gauge',
    `pokedex_uptime_seconds ${uptimeSeconds}`,
    '',
    '# HELP pokedex_total_pokemons Cantidad actual de Pokémon registrados en memoria o base de datos.',
    '# TYPE pokedex_total_pokemons gauge',
    `pokedex_total_pokemons ${health.total_records}`,
    '',
    '# HELP pokedex_degraded_mode Indicador de modo degradado (1 = activo, 0 = normal).',
    '# TYPE pokedex_degraded_mode gauge',
    `pokedex_degraded_mode ${degradedMode}`,
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
// Pokémon REST API Routes (PostgreSQL + Redis Caching con Fallback Resiliente)
// ---------------------------------------------------------------------------
app.get('/pokemons', asyncHandler(async (req: Request, res: Response) => {
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
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  return res.json(list);
}));

// Búsqueda instantánea vía PostgreSQL / Redis con ETag
app.get('/pokemons/:id', asyncHandler(async (req: Request, res: Response) => {
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
app.post('/pokemons', mutationRateLimiter, verifyAdmin, requireWritableStorage, asyncHandler(async (req: Request, res: Response) => {
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
app.put('/pokemons/:id', mutationRateLimiter, verifyAdmin, requireWritableStorage, asyncHandler(async (req: Request, res: Response) => {
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
app.delete('/pokemons/:id', mutationRateLimiter, verifyAdmin, requireWritableStorage, asyncHandler(async (req: Request, res: Response) => {
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

// ---------------------------------------------------------------------------
// Google AI Studio (Gemini) Endpoints con Rate Limit Minuto, Cuota Diaria y Auth
// ---------------------------------------------------------------------------
app.post('/api/v1/ai/diagram', aiRateLimiter, aiDailyQuotaLimiter, verifyAIKey, asyncHandler(async (req: Request, res: Response) => {
  const { prompt, diagram_type } = req.body || {};
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'El campo prompt es requerido y debe ser texto' });
  }
  const cleanPrompt = prompt.trim().slice(0, 1000);
  const result = await generateDiagram(cleanPrompt, diagram_type);
  res.json(result);
}));

app.post('/api/v1/ai/mock', aiRateLimiter, aiDailyQuotaLimiter, verifyAIKey, asyncHandler(async (req: Request, res: Response) => {
  const { prompt, framework } = req.body || {};
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'El campo prompt es requerido y debe ser texto' });
  }
  const cleanPrompt = prompt.trim().slice(0, 1000);
  const result = await generateMockup(cleanPrompt, framework);
  res.json(result);
}));

app.post('/api/v1/ai/image', aiRateLimiter, aiDailyQuotaLimiter, verifyAIKey, asyncHandler(async (req: Request, res: Response) => {
  const { prompt, aspect_ratio } = req.body || {};
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'El campo prompt es requerido y debe ser texto' });
  }
  const cleanPrompt = prompt.trim().slice(0, 1000);
  const result = await generateImage(cleanPrompt, aspect_ratio);
  res.json(result);
}));

// ---------------------------------------------------------------------------
// Download Repository ZIP Endpoint (Protegido con verifyAdmin y Rate Limiting)
// DevSecOps Hardening: En producción, deshabilitado por defecto para reducir superficie de ataque
// ---------------------------------------------------------------------------
app.get(['/download', '/download-zip', '/download/repo'], mutationRateLimiter, verifyAdmin, (_req: Request, res: Response) => {
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_REPO_DOWNLOAD !== 'true') {
    return res.status(403).json({
      error: 'Acceso denegado: La descarga del código fuente del repositorio se encuentra deshabilitada en producción por directivas de seguridad.'
    });
  }
  const zipPath = path.join(PUBLIC_DIR, 'pokedex-updated.zip');
  if (!fs.existsSync(zipPath)) {
    return res.status(404).json({ error: 'El archivo ZIP del repositorio no está disponible en este entorno.' });
  }
  res.download(zipPath, 'pokedex-v2-migrated.zip', (err) => {
    if (err) {
      logger.error('Error al generar o servir archivo zip del repositorio', { error: err?.message || String(err) });
      if (!res.headersSent) {
        res.status(500).json({ error: 'No se pudo generar o descargar el archivo ZIP.' });
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Control de Acceso por IP para el Backoffice Administrativo
// ---------------------------------------------------------------------------
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

// Defensa en profundidad: interceptar '/backoffice.html', '/admin' y '/backoffice'
// antes de que express.static sirva cualquier archivo estático
app.get(['/admin', '/backoffice', '/backoffice.html'], authRateLimiter, adminIpRestricted, (_req: Request, res: Response) => {
  res.sendFile(path.join(PUBLIC_DIR, 'backoffice.html'));
});

// Prevenir bypass mediante acceso directo a /backoffice.html a través de express.static
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path === '/backoffice.html' || req.path.endsWith('/backoffice.html')) {
    return authRateLimiter(req, res, () => {
      adminIpRestricted(req, res, () => {
        res.sendFile(path.join(PUBLIC_DIR, 'backoffice.html'));
      });
    });
  }
  next();
});

// ---------------------------------------------------------------------------
// Static Assets & Single Page Application Routing
// ---------------------------------------------------------------------------
app.use(express.static(PUBLIC_DIR));

app.get('*', globalRateLimiter, (_req: Request, res: Response) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// ---------------------------------------------------------------------------
// Middleware Global de Manejo de Errores (Express Error Boundary)
// ---------------------------------------------------------------------------
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Error no controlado en el servidor Express', {
    error: err?.message || String(err),
    stack: err?.stack,
  });
  if (res.headersSent) {
    return;
  }
  res.status(500).json({
    error: 'Error interno del servidor. La solicitud no pudo ser procesada de forma segura.',
  });
});

// Start Server tras inicializar la capa de persistencia y caché (solo si no es test runner)
const isRunningTests = process.env.NODE_ENV === 'test' || process.argv.some(arg => arg.includes('test'));
if (!isRunningTests) {
  checkRequiredEnvVars();
  initStorage().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      const health = getStorageHealth();
      logger.info(`Pokédex Server iniciado en http://0.0.0.0:${PORT}`, {
        port: PORT,
        storage: health.database.toUpperCase(),
        pgConnected: health.postgres_connected,
        redisConnected: health.redis_connected,
      });
    });
  });
}

export { app };
