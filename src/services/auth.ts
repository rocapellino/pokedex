import crypto from 'crypto';

const SESSION_TOKEN_TTL_MS = 4 * 60 * 60 * 1000; // 4 horas de validez
const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_API_KEY || 'pokedex-internal-hmac-session-secret-entropy';

export interface SessionTokenPayload {
  role: 'admin';
  exp: number;
}

export interface SessionTokenResult {
  token: string;
  expiresIn: number;
  expiresAt: number;
}

/**
 * Genera un token de sesión firmado con HMAC SHA-256 para administradores.
 */
export function generateSessionToken(ttlMs: number = SESSION_TOKEN_TTL_MS): SessionTokenResult {
  const expiresAt = Date.now() + ttlMs;
  const payload: SessionTokenPayload = { role: 'admin', exp: expiresAt };
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(payloadBase64).digest('base64url');
  return {
    token: `${payloadBase64}.${signature}`,
    expiresIn: Math.floor(ttlMs / 1000),
    expiresAt,
  };
}

/**
 * Valida la firma HMAC y expiración de un token de sesión de administrador.
 */
export function verifySessionToken(token: string): boolean {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payloadBase64, signature] = parts;
  try {
    const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payloadBase64).digest('base64url');
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
