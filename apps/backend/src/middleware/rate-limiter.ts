import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { consumeDistributedRateLimit } from '../services/db.js';

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

export const aiRateLimiter = createRateLimiter(10, 60 * 1000, 'Endpoints IA', { failClosedOnRedisOutage: true });
export const aiDailyQuotaLimiter = createRateLimiter(200, 24 * 60 * 60 * 1000, 'Cuota Diaria IA', { failClosedOnRedisOutage: true });
export const mutationRateLimiter = createRateLimiter(30, 60 * 1000, 'Modificaciones CRUD');
export const authRateLimiter = createRateLimiter(5, 60 * 1000, 'Autenticación');
export const globalRateLimiter = createRateLimiter(300, 60 * 1000, 'API Global');

// ---------------------------------------------------------------------------
// Rate Limiting de Doble Capa: Defensa en Profundidad (Dual-Layer Defense)
// ---------------------------------------------------------------------------
export const globalRateLimiterStandard = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/healthz' || req.path === '/readyz' || req.path === '/metrics',
  message: { detail: 'Límite global de peticiones excedido. Intenta más tarde.' },
});

export const mutationRateLimiterStandard = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { detail: 'Límite de peticiones para Modificaciones CRUD excedido. Intenta más tarde.' },
});

export const authRateLimiterStandard = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { detail: 'Límite de intentos de autenticación excedido. Intenta más tarde.' },
});

export const aiRateLimiterStandard = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { detail: 'Límite de peticiones para Endpoints IA excedido. Intenta más tarde.' },
});
