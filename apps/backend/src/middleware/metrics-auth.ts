import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * Protege `/metrics` con un token Bearer (AUD-SEC-OBS-001).
 *
 * La lista de CIDR de nginx no basta detrás de un ingress: nginx ve como origen al pod del
 * ingress controller, que cae dentro de la subred permitida. El control vive en la API para que
 * valga venga la petición por nginx o directa al servicio.
 *
 * Despliegue gradual: sin `METRICS_BEARER_TOKEN` el endpoint sigue abierto, de modo que el
 * scraper puede recibir el token antes de que el servidor lo exija.
 */

/** Compara en tiempo constante; el hash iguala las longitudes y evita filtrar la del token. */
function tokensMatch(provided: string, expected: string): boolean {
  const digest = (value: string) => crypto.createHash('sha256').update(value).digest();
  return crypto.timingSafeEqual(digest(provided), digest(expected));
}

export function requireMetricsToken(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.METRICS_BEARER_TOKEN?.trim();
  if (!expected) {
    next();
    return;
  }

  const match = /^Bearer (\S+)$/.exec(req.headers.authorization ?? '');
  if (match && tokensMatch(match[1], expected)) {
    next();
    return;
  }

  res.setHeader('WWW-Authenticate', 'Bearer realm="metrics"');
  res.status(401).json({ detail: 'Se requiere un token Bearer válido para consultar las métricas.' });
}
