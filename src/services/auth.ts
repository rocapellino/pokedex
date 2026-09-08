import crypto from 'crypto';
import { setRevokedJti, isJtiRevokedInRedis } from './db.js';

const SESSION_TOKEN_TTL_MS = 4 * 60 * 60 * 1000; // 4 horas de validez

let ephemeralDevSecret: string | null = null;

/**
 * Obtiene el secreto para firmado y verificación de tokens HMAC.
 * En producción falla cerrado (throw Error) si no hay variable de entorno configurada.
 * En entornos de desarrollo y testing genera una clave criptográfica aleatoria efímera
 * en memoria, eliminando cualquier secreto estático quemado en el repositorio.
 */
export function getSessionSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_API_KEY;
  if (secret && secret.trim()) {
    return secret.trim();
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Configuración de seguridad crítica faltante: ADMIN_SESSION_SECRET o ADMIN_API_KEY es obligatorio en producción.');
  }
  if (!ephemeralDevSecret) {
    ephemeralDevSecret = crypto.randomBytes(32).toString('hex');
  }
  return ephemeralDevSecret;
}

export interface SessionTokenPayload {
  role: 'admin';
  exp: number;
  jti: string;
}

export interface SessionTokenResult {
  token: string;
  expiresIn: number;
  expiresAt: number;
}

// Registro en memoria local con TTL para fallback transparente ante caída de Redis
const localRevokedTokens = new Map<string, number>(); // jti -> expiresAt

/**
 * Limpia periódicamente identificadores de sesión expirados del mapa local de fallback.
 */
setInterval(() => {
  const now = Date.now();
  for (const [jti, exp] of localRevokedTokens.entries()) {
    if (now > exp) {
      localRevokedTokens.delete(jti);
    }
  }
}, 60 * 1000).unref();

function decodeTokenPayload(token: string): SessionTokenPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.trim().split('.');
  if (parts.length !== 2) return null;
  try {
    return JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function isLocallyRevoked(jti: string): boolean {
  const exp = localRevokedTokens.get(jti);
  if (!exp) return false;
  if (Date.now() > exp) {
    localRevokedTokens.delete(jti);
    return false;
  }
  return true;
}

/**
 * Revoca explícitamente un token de sesión antes de su expiración natural.
 * Registra el jti en Redis con un TTL exacto al tiempo de vida restante,
 * eliminando memory leaks y permitiendo revocación distribuida en clúster multi-pod.
 */
export async function revokeSessionToken(token: string): Promise<boolean> {
  if (!token || typeof token !== 'string') return false;
  const payload = decodeTokenPayload(token);
  if (!payload || !payload.jti || typeof payload.exp !== 'number') {
    return false;
  }

  const remainingSeconds = Math.max(1, Math.ceil((payload.exp - Date.now()) / 1000));

  // 1. Guardar en mapa local con timestamp de expiración (fallback)
  localRevokedTokens.set(payload.jti, payload.exp);

  // 2. Guardar en Redis distribuido con TTL automático
  await setRevokedJti(payload.jti, remainingSeconds);
  return true;
}

/**
 * Verifica si un token ha sido revocado en memoria local o en Redis.
 */
export async function isTokenRevoked(token: string): Promise<boolean> {
  if (!token || typeof token !== 'string') return false;
  const payload = decodeTokenPayload(token);
  if (!payload || !payload.jti) return false;

  if (isLocallyRevoked(payload.jti)) return true;
  const redisRevoked = await isJtiRevokedInRedis(payload.jti);
  return redisRevoked === true;
}

/**
 * Genera un token de sesión firmado con HMAC SHA-256 para administradores.
 * Incluye un identificador criptográfico único (jti) para posibilitar revocación.
 */
export function generateSessionToken(ttlMs: number = SESSION_TOKEN_TTL_MS): SessionTokenResult {
  const expiresAt = Date.now() + ttlMs;
  const jti = crypto.randomBytes(16).toString('hex');
  const payload: SessionTokenPayload = { role: 'admin', exp: expiresAt, jti };
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', getSessionSecret()).update(payloadBase64).digest('base64url');
  return {
    token: `${payloadBase64}.${signature}`,
    expiresIn: Math.floor(ttlMs / 1000),
    expiresAt,
  };
}

/**
 * Valida la firma HMAC, expiración y estado de revocación de un token de sesión de administrador.
 * Primero valida la firma criptográfica y expiración (CPU puro sin I/O), y solo si es válido
 * consulta el estado de revocación en Redis.
 */
export async function verifySessionToken(token: string): Promise<boolean> {
  if (!token || typeof token !== 'string') return false;
  const cleanToken = token.trim();

  const parts = cleanToken.split('.');
  if (parts.length !== 2) return false;
  const [payloadBase64, signature] = parts;
  try {
    const expectedSig = crypto.createHmac('sha256', getSessionSecret()).update(payloadBase64).digest('base64url');
    if (signature.length !== expectedSig.length) return false;
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      return false;
    }
    const payload: SessionTokenPayload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString('utf8'));
    if (payload.role !== 'admin') return false;
    if (typeof payload.exp !== 'number' || Date.now() > payload.exp) return false;

    // Verificación de revocación por jti
    if (payload.jti) {
      if (isLocallyRevoked(payload.jti)) return false;
      const redisRevoked = await isJtiRevokedInRedis(payload.jti);
      if (redisRevoked === true) return false;
    }

    return true;
  } catch {
    return false;
  }
}

