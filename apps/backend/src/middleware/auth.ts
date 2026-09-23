import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { verifySessionTokenDetailed } from '../services/auth.js';
import { isWritableStorageAvailable } from '../services/db.js';
import { logger } from '../utils/logger.js';

// Orígenes locales seguros permitidos por defecto en entorno de desarrollo
export const DEFAULT_DEV_CORS_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:8080',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:8080',
];

export function getConfiguredCorsOrigins(): string[] | null {
  return process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
    : null;
}

// ---------------------------------------------------------------------------
// Security: Verificación de Clave con Prevención de Timing Attacks
// ---------------------------------------------------------------------------
export function safeCompareKeys(provided: string, expected: string): boolean {
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

/**
 * Extrae exclusivamente tokens de sesión efímeros firmados con HMAC.
 */
export function extractSessionTokenFromRequest(req: Request): string {
  const authHeader = (req.headers['authorization'] || '') as string;
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  const cookieHeader = (req.headers.cookie || '') as string;
  if (cookieHeader) {
    const cookiePairs = cookieHeader.split(';').map((entry) => entry.trim());
    for (const pair of cookiePairs) {
      if (!pair) continue;
      const [name, ...rest] = pair.split('=');
      if (name === 'pokedex_admin_session') {
        const value = rest.join('=');
        try {
          return decodeURIComponent(value);
        } catch {
          return value;
        }
      }
    }
  }

  const sessionHeader = (req.headers['x-session-token'] || '') as string;
  if (sessionHeader) {
    return sessionHeader.trim();
  }
  return '';
}

export function extractSessionToken(req: Request): string {
  return extractSessionTokenFromRequest(req);
}

export function buildSessionCookie(token: string, expiresInSeconds: number): string {
  const value = encodeURIComponent(token.trim());
  const secure = process.env.NODE_ENV === 'production' || process.env.SECURE_COOKIES === 'true';
  const maxAgeSeconds = Math.max(1, Math.floor(expiresInSeconds));
  const parts = [
    `pokedex_admin_session=${value}`,
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
    'HttpOnly',
    'SameSite=Lax',
  ];

  if (secure) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

/**
 * Extrae exclusivamente claves de API maestras (X-API-Key o Basic/Custom auth).
 */
export function extractApiKey(req: Request): string {
  const keyHeader = (req.headers['x-api-key'] || '') as string;
  if (keyHeader) {
    return keyHeader.trim();
  }
  const authHeader = (req.headers['authorization'] || '') as string;
  if (authHeader && !authHeader.startsWith('Bearer ')) {
    return authHeader.trim();
  }
  return '';
}

export async function verifyAdmin(req: Request, res: Response, next: NextFunction) {
  const configuredKey = process.env.ADMIN_API_KEY;

  if (!configuredKey) {
    logger.warn('Intento de acceso a ruta protegida pero ADMIN_API_KEY no está configurada', { security: true });
    return res.status(503).json({
      detail: 'Servicio administrativo no disponible: ADMIN_API_KEY no configurada en el servidor.',
    });
  }

  const sessionToken = extractSessionToken(req);
  const apiKey = extractApiKey(req);

  if (!sessionToken && !apiKey) {
    return res.status(401).json({
      detail: 'Credencial de autenticación faltante en la cabecera X-API-Key / Authorization',
    });
  }

  // 1. Validar si se suministra un token de sesión firmado de corta duración
  if (sessionToken) {
    const sessionCheck = await verifySessionTokenDetailed(sessionToken);
    if (sessionCheck.valid) {
      // Mitigación CSRF para mutaciones respaldadas por cookie de sesión
      const isMutative = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method);
      const isCookieAuth = Boolean(req.headers.cookie && req.headers.cookie.includes('pokedex_admin_session='));
      const originHeader = (req.headers['origin'] || req.headers['referer']) as string | undefined;

      if (isMutative && isCookieAuth && originHeader) {
        try {
          const originUrl = new URL(originHeader);
          const originHost = originUrl.origin;
          const allowed = getConfiguredCorsOrigins() || DEFAULT_DEV_CORS_ORIGINS;
          const isAllowed = allowed.includes(originHost) || Boolean(req.headers.host && originHost.includes(req.headers.host));
          if (!isAllowed) {
            logger.warn('Rechazo CSRF en operación administrativa: Origen no permitido', { origin: originHost, path: req.path });
            return res.status(403).json({
              detail: 'Origen no autorizado para ejecutar mutaciones administrativas mediante cookie (CSRF protection).',
            });
          }
        } catch {
          return res.status(403).json({
            detail: 'Cabecera Origin/Referer inválida para operación administrativa.',
          });
        }
      }

      (req as any).authMechanism = 'hmac_session_token';
      return next();
    }

    // Fail-Closed: si el servicio distribuido de revocación está caído, rechazar con 503 por seguridad
    if (sessionCheck.reason === 'service_unavailable') {
      return res.status(503).json({
        detail: 'Servicio de autenticación distribuida temporalmente no disponible (Redis offline). Operación administrativa bloqueada por seguridad (Fail-Closed).',
      });
    }
  }

  // 2. Validar si es la API key maestra (retrocompatibilidad para scripts, pipelines de CI y curl)
  if (apiKey && safeCompareKeys(apiKey, configuredKey)) {
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

export function requireWritableStorage(_req: Request, res: Response, next: NextFunction) {
  if (!isWritableStorageAvailable()) {
    return res.status(503).json({
      detail: 'Almacenamiento persistente (PostgreSQL) no disponible. Operaciones de escritura suspendidas para prevenir pérdida de datos.',
    });
  }
  next();
}

export function verifyAIKey(req: Request, res: Response, next: NextFunction) {
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
// Control de Acceso por IP para el Backoffice Administrativo
// ---------------------------------------------------------------------------
export const adminIpRestricted = (req: Request, res: Response, next: NextFunction) => {
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
