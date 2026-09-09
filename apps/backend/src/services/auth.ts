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
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (secret && secret.trim()) {
    return secret.trim();
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Configuración de seguridad crítica faltante: ADMIN_SESSION_SECRET es obligatorio en producción para el firmado y verificación de sesiones.');
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

export type RevokeSessionResult =
  | { success: true }
  | { success: false; reason: 'invalid_format' | 'invalid_signature' | 'service_unavailable' };

/**
 * Valida criptográficamente la firma HMAC y estructura de un token de sesión sin I/O.
 */
export function verifyTokenSignature(token: string): {
  valid: boolean;
  payload?: SessionTokenPayload;
  reason?: 'invalid_format' | 'invalid_signature';
} {
  if (!token || typeof token !== 'string') return { valid: false, reason: 'invalid_format' };
  const parts = token.trim().split('.');
  if (parts.length !== 2) return { valid: false, reason: 'invalid_format' };
  const [payloadBase64, signature] = parts;
  try {
    const expectedSig = crypto.createHmac('sha256', getSessionSecret()).update(payloadBase64).digest('base64url');
    if (signature.length !== expectedSig.length) return { valid: false, reason: 'invalid_signature' };
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      return { valid: false, reason: 'invalid_signature' };
    }
    const payload: SessionTokenPayload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString('utf8'));
    
    // Validación estricta de límites de payload (role, jti y exp)
    if (
      payload.role !== 'admin' ||
      typeof payload.jti !== 'string' ||
      !/^[a-f0-9]{16,64}$/i.test(payload.jti) ||
      typeof payload.exp !== 'number' ||
      !Number.isFinite(payload.exp) ||
      !Number.isInteger(payload.exp) ||
      payload.exp <= 0 ||
      payload.exp > 4102444800000 // Límite razonable (año 2100) contra desbordamientos numéricos
    ) {
      return { valid: false, reason: 'invalid_signature' };
    }
    return { valid: true, payload };
  } catch {
    return { valid: false, reason: 'invalid_format' };
  }
}

/**
 * Revoca explícitamente un token de sesión antes de su expiración natural.
 * Valida primero criptográficamente la firma HMAC para evitar ataques de polución o
 * inyección de claves apócrifas en Redis.
 * Registra el jti en Redis con un TTL exacto al tiempo de vida restante.
 * Retorna resultado detallado para permitir que la API responda 400 ante firmas apócrifas o 503 ante caída de Redis.
 * Consistencia distribuida: si REDIS_URL está configurado, Redis es la única fuente de verdad (Source of Truth).
 * Si la escritura en Redis falla, NO se almacena en memoria local para evitar desincronizaciones asimétricas entre pods.
 */
export async function revokeSessionTokenDetailed(token: string): Promise<RevokeSessionResult> {
  const verified = verifyTokenSignature(token);
  if (!verified.valid || !verified.payload) {
    return { success: false, reason: verified.reason || 'invalid_signature' };
  }

  const { exp, jti } = verified.payload;

  // Si el token ya expiró cronológicamente, ya no es válido en el sistema;
  // se considera revocado sin necesidad de escribir en Redis
  if (Date.now() > exp) {
    return { success: true };
  }

  const remainingSeconds = Math.max(1, Math.ceil((exp - Date.now()) / 1000));

  // 1. Si REDIS_URL está configurado, Redis es la fuente única de verdad distribuida (Multi-Pod)
  if (Boolean(process.env.REDIS_URL)) {
    const redisOk = await setRevokedJti(jti, remainingSeconds);
    if (!redisOk) {
      console.warn(`[Auth: Security Warning] Fallo al registrar revocación de token (jti: ${jti}) en Redis. Operación distribuida no garantizada.`);
      return { success: false, reason: 'service_unavailable' };
    }
    // Solo tras confirmar la persistencia en el clúster distribuido, actualizar la caché local del pod
    localRevokedTokens.set(jti, exp);
    return { success: true };
  }

  // 2. Fallback local: Si REDIS_URL no está configurado (entorno monoproceso / standalone)
  localRevokedTokens.set(jti, exp);
  return { success: true };
}

/**
 * Revoca explícitamente un token de sesión antes de su expiración natural.
 * Valida primero criptográficamente la firma HMAC del token.
 * Si REDIS_URL está configurado y la escritura en Redis falla, retorna false (Fail-Closed).
 */
export async function revokeSessionToken(token: string): Promise<boolean> {
  const res = await revokeSessionTokenDetailed(token);
  return res.success;
}

export type VerifySessionResult =
  | { valid: true }
  | { valid: false; reason: 'invalid_format' | 'invalid_signature' | 'expired' | 'revoked' | 'service_unavailable' };

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
 * Valida detalladamente la firma HMAC, expiración y estado de revocación en Redis.
 * Aplica política Fail-Closed: si REDIS_URL está configurado pero Redis está fuera de línea,
 * rechaza el token con reason: 'service_unavailable' para proteger operaciones multi-pod.
 */
export async function verifySessionTokenDetailed(token: string): Promise<VerifySessionResult> {
  const verified = verifyTokenSignature(token);
  if (!verified.valid || !verified.payload) {
    return { valid: false, reason: verified.reason || 'invalid_signature' };
  }
  const payload = verified.payload;
  if (Date.now() > payload.exp) {
    return { valid: false, reason: 'expired' };
  }

  // Verificación de revocación por jti
  if (payload.jti) {
    if (isLocallyRevoked(payload.jti)) return { valid: false, reason: 'revoked' };
    const redisRevoked = await isJtiRevokedInRedis(payload.jti);
    if (redisRevoked === true) return { valid: false, reason: 'revoked' };
    // Fail-Closed: si REDIS_URL está configurado pero Redis está caído, denegar por seguridad
    if (redisRevoked === null && Boolean(process.env.REDIS_URL)) {
      return { valid: false, reason: 'service_unavailable' };
    }
  }

  return { valid: true };
}

/**
 * Valida la firma HMAC, expiración y estado de revocación de un token de sesión de administrador.
 * Primero valida la firma criptográfica y expiración (CPU puro sin I/O), y solo si es válido
 * consulta el estado de revocación en Redis. Falla cerrado si Redis está inaccesible.
 */
export async function verifySessionToken(token: string): Promise<boolean> {
  const result = await verifySessionTokenDetailed(token);
  return result.valid;
}

