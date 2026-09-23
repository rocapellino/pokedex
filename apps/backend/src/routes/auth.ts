import express, { Request, Response } from 'express';
import {
  authRateLimiter,
  authRateLimiterStandard,
} from '../middleware/rate-limiter.js';
import {
  extractSessionToken,
  safeCompareKeys,
  buildSessionCookie,
} from '../middleware/auth.js';
import {
  generateSessionToken,
  verifySessionTokenDetailed,
  revokeSessionTokenDetailed,
} from '../services/auth.js';
import { asyncHandler } from '../utils/async-handler.js';

export const authRouter = express.Router();

// ---------------------------------------------------------------------------
// Autenticación de Operador: Emisión de Tokens de Sesión de Corta Duración
// ---------------------------------------------------------------------------
authRouter.post('/api/v1/auth/session', authRateLimiterStandard, authRateLimiter, (req: Request, res: Response) => {
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

  const { token, expiresIn, expiresAt } = generateSessionToken();
  res.setHeader('Set-Cookie', buildSessionCookie(token, expiresIn));
  // Inmunidad XSS: no se expone el token criptográfico a JavaScript, se transporta exclusivamente en cookie HttpOnly
  return res.status(200).json({
    authenticated: true,
    expires_in: expiresIn,
    expiresAt,
  });
});

authRouter.get('/api/v1/auth/session', asyncHandler(async (req: Request, res: Response) => {
  const token = extractSessionToken(req);
  if (!token) {
    return res.status(200).json({ authenticated: false });
  }
  const sessionCheck = await verifySessionTokenDetailed(token);
  if (!sessionCheck.valid) {
    return res.status(200).json({ authenticated: false });
  }
  return res.status(200).json({
    authenticated: true,
    expiresAt: sessionCheck.expiresAt,
  });
}));

authRouter.post('/api/v1/auth/logout', authRateLimiterStandard, authRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const token = extractSessionToken(req);
  res.setHeader('Set-Cookie', 'pokedex_admin_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax');
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
