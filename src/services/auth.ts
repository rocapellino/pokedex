import crypto from 'crypto';

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
  jti?: string;
}

export interface SessionTokenResult {
  token: string;
  expiresIn: number;
  expiresAt: number;
}

// Registro en memoria para revocación instantánea
const revokedTokensSet = new Set<string>();

/**
 * Revoca explícitamente un token de sesión antes de su expiración natural.
 */
export function revokeSessionToken(token: string): boolean {
  if (!token || typeof token !== 'string') return false;
  revokedTokensSet.add(token.trim());
  return true;
}

/**
 * Verifica si un token ha sido revocado.
 */
export function isTokenRevoked(token: string): boolean {
  if (!token || typeof token !== 'string') return false;
  return revokedTokensSet.has(token.trim());
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
 */
export function verifySessionToken(token: string): boolean {
  if (!token || typeof token !== 'string') return false;
  const cleanToken = token.trim();
  if (isTokenRevoked(cleanToken)) return false;

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
    return true;
  } catch {
    return false;
  }
}
