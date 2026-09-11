import { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { traceStorage, logger } from '../utils/logger.js';

declare global {
  namespace Express {
    interface Request {
      traceId?: string;
    }
  }
}

/**
 * Middleware para Trazabilidad Distribuida y Correlación de Logs.
 * Extrae o genera un X-Request-Id único, lo inyecta en las cabeceras de respuesta
 * y encapsula la ejecución en AsyncLocalStorage para correlacionar logs automáticamente.
 */
export function requestTracer(req: Request, res: Response, next: NextFunction): void {
  const incomingId = req.headers['x-request-id'] || req.headers['x-correlation-id'];
  let traceId: string;

  if (typeof incomingId === 'string' && /^[a-zA-Z0-9\-_]{1,64}$/.test(incomingId)) {
    traceId = incomingId;
  } else {
    traceId = crypto.randomUUID();
  }

  req.traceId = traceId;
  res.setHeader('X-Request-Id', traceId);

  traceStorage.run({ traceId }, () => {
    next();
  });
}
