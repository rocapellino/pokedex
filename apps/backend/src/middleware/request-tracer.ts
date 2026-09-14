import { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { traceStorage } from '../utils/logger.js';

export interface TraceContext {
  traceId: string;
  spanId: string;
  traceparent: string;
}

declare global {
  namespace Express {
    interface Request {
      traceId?: string;
      spanId?: string;
      traceContext?: TraceContext;
    }
  }
}

// Regex estándar W3C Trace Context: 00-{32 hex traceId}-{16 hex spanId}-{2 hex flags}
const W3C_TRACEPARENT_REGEX = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

/**
 * Middleware para Trazabilidad Distribuida con OpenTelemetry y W3C Trace Context.
 *
 * 1. Extrae o genera cabeceras de contexto de traza conforme a la especificación W3C `traceparent`.
 * 2. Mantiene compatibilidad total con `X-Request-Id` / `X-Correlation-Id`.
 * 3. Inyecta `traceparent` y `X-Request-Id` en las cabeceras de respuesta HTTP.
 * 4. Encapsula la ejecución en AsyncLocalStorage para correlacionar logs JSON estructurados con Loki/Tempo.
 */
export function requestTracer(req: Request, res: Response, next: NextFunction): void {
  const rawTraceparent = req.headers['traceparent'];
  let traceId = '';
  let traceFlags = '01';

  if (typeof rawTraceparent === 'string') {
    const match = W3C_TRACEPARENT_REGEX.exec(rawTraceparent.trim().toLowerCase());
    if (match && match[1] !== '00000000000000000000000000000000' && match[2] !== '0000000000000000') {
      traceId = match[1];
      traceFlags = match[3];
    }
  }

  // Si no se proporcionó un traceparent W3C válido:
  if (!traceId) {
    const incomingId = req.headers['x-request-id'] || req.headers['x-correlation-id'];
    if (typeof incomingId === 'string' && /^[0-9a-fA-F]{32}$/.test(incomingId.trim())) {
      traceId = incomingId.trim().toLowerCase();
    } else if (typeof incomingId === 'string' && /^[0-9a-fA-F-]{36}$/.test(incomingId.trim())) {
      traceId = incomingId.trim().replace(/-/g, '').toLowerCase();
    } else {
      traceId = crypto.randomBytes(16).toString('hex');
    }
  }

  // Generar spanId unívoco para el ciclo de vida de esta petición
  const currentSpanId = crypto.randomBytes(8).toString('hex');
  const traceparent = `00-${traceId}-${currentSpanId}-${traceFlags}`;

  // Preservar o asignar X-Request-Id para clientes HTTP tradicionales
  const incomingRequestId = req.headers['x-request-id'] || req.headers['x-correlation-id'];
  const requestId = (typeof incomingRequestId === 'string' && /^[a-zA-Z0-9\-_]{1,64}$/.test(incomingRequestId))
    ? incomingRequestId
    : traceId;

  const traceContext: TraceContext = {
    traceId,
    spanId: currentSpanId,
    traceparent,
  };

  req.traceId = requestId;
  req.spanId = currentSpanId;
  req.traceContext = traceContext;

  res.setHeader('X-Request-Id', requestId);
  res.setHeader('traceparent', traceparent);

  traceStorage.run({ traceId, spanId: currentSpanId, traceparent }, () => {
    next();
  });
}
