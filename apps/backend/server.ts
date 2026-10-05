import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { initStorage, getStorageHealth, closeStorage } from './src/services/db.js';
import { checkRequiredEnvVars } from './src/config/startup-env-check.js';
import { logger } from './src/utils/logger.js';
import { errorMessage } from './src/utils/errors.js';
import { requestTracer } from './src/middleware/request-tracer.js';
import { metricsCollector } from './src/middleware/metrics.js';
import {
  globalRateLimiter,
  globalRateLimiterStandard,
  createRateLimiter,
  type RateLimiterOptions,
} from './src/middleware/rate-limiter.js';
import {
  DEFAULT_DEV_CORS_ORIGINS,
  getConfiguredCorsOrigins,
  adminIpRestricted,
  buildSessionCookie,
  extractSessionTokenFromRequest,
  verifyAdmin,
  requireWritableStorage,
} from './src/middleware/auth.js';
import { getLifecycleStatus, setShuttingDownForTest, setIsShuttingDown } from './src/utils/lifecycle.js';
import { authRouter } from './src/routes/auth.js';
import { healthRouter } from './src/routes/health.js';
import { pokemonsRouter } from './src/routes/pokemons.js';
import { aiRouter } from './src/routes/ai.js';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const candidatePublicDirs = [
  path.join(process.cwd(), 'apps', 'frontend', 'dist'),
  path.join(process.cwd(), 'apps', 'frontend', 'public'),
  path.join(process.cwd(), '..', 'frontend', 'dist'),
  path.join(process.cwd(), '..', 'frontend', 'public'),
  path.join(process.cwd(), 'public'),
];
const PUBLIC_DIR =
  candidatePublicDirs.find((p) => fs.existsSync(p)) || path.join(process.cwd(), 'apps', 'frontend', 'dist');

// ---------------------------------------------------------------------------
// Security: Server Hardening & Security Headers
// ---------------------------------------------------------------------------
app.disable('x-powered-by');
// Confianza explícita únicamente en proxies de infraestructura local (loopback / linklocal / RFC1918)
app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);

app.use(requestTracer);

app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; img-src 'self' https://raw.githubusercontent.com data: blob:; connect-src 'self'; font-src 'self' https://fonts.gstatic.com; object-src 'none'; frame-ancestors 'self'; base-uri 'self'; form-action 'self';",
  );
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');

  if (process.env.NODE_ENV === 'production' || req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// Configured or dynamic CORS (Fail-closed en producción contra abusos)
const isProduction = process.env.NODE_ENV === 'production';
const configuredCorsOrigins = getConfiguredCorsOrigins();

/**
 * Rechazo de un origen por la política CORS (AUD-SEC-CORS-002). El handler global
 * lo responde con 403 sin stack; los errores de configuración siguen siendo 500.
 */
class CorsOriginRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CorsOriginRejectedError';
  }
}

app.use(
  cors({
    origin: (origin, callback) => {
      // Permitir solicitudes sin origin (como herramientas internas, curl, llamadas entre servicios locales)
      if (!origin) {
        return callback(null, true);
      }
      // En producción, si no hay orígenes configurados explícitamente, denegar por defecto (fail-closed)
      if (!configuredCorsOrigins || configuredCorsOrigins.length === 0) {
        if (isProduction) {
          return callback(
            new Error('Bloqueado por directiva de seguridad CORS: CORS_ORIGINS no configurado en producción'),
          );
        }
        // En desarrollo sin CORS_ORIGINS explícito, restringir estrictamente a orígenes locales reconocidos
        if (DEFAULT_DEV_CORS_ORIGINS.includes(origin)) {
          return callback(null, true);
        }
        return callback(
          new CorsOriginRejectedError(
            'Bloqueado por directiva de seguridad CORS: Origen no permitido en entorno de desarrollo',
          ),
        );
      }
      // La especificación CORS y navegadores modernos prohíben wildcard '*' con credentials: true
      if (configuredCorsOrigins.includes('*')) {
        return callback(
          new Error('Directiva CORS inválida: no se permite wildcard (*) combinado con credentials: true'),
        );
      }
      if (configuredCorsOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new CorsOriginRejectedError('Bloqueado por directiva de seguridad CORS'));
    },
    credentials: true,
  }),
);

// Payload limit reducido a 250kb para prevenir abusos de memoria
app.use(express.json({ limit: '250kb' }));
app.use(express.urlencoded({ extended: true, limit: '250kb' }));

// Prometheus metrics collection middleware
app.use(metricsCollector);

// Middleware global de rate limiting para protección contra DDoS y saturación general
app.use(globalRateLimiterStandard);
app.use(globalRateLimiter);

// ---------------------------------------------------------------------------
// Rutas Modulares
// ---------------------------------------------------------------------------
app.use(authRouter);
app.use(healthRouter);
app.use(pokemonsRouter);
app.use(aiRouter);

// ---------------------------------------------------------------------------
// Static Assets & Web Serving (Fallback de Desarrollo Local y Standalone)
// NOTA ARQUITECTÓNICA (APPS-003 / APPS-004):
// En producción Kubernetes (GitOps), el frontend MPA es empaquetado en su propio
// contenedor ligero Nginx Alpine (apps/frontend/Dockerfile) y servido directamente
// detrás del Ingress/proxy reverso. Las siguientes rutas Express constituyen una
// contingencia para desarrollo local y entornos standalone sin Nginx activo.
// ---------------------------------------------------------------------------
const INDEX_HTML_PATH = path.join(PUBLIC_DIR, 'index.html');
const BACKOFFICE_HTML_PATH = path.join(PUBLIC_DIR, 'backoffice.html');

let cachedIndexHtml = '';
let cachedBackofficeHtml = '';

function getIndexHtml(): string {
  if (!cachedIndexHtml || process.env.NODE_ENV !== 'production') {
    cachedIndexHtml = fs.existsSync(INDEX_HTML_PATH) ? fs.readFileSync(INDEX_HTML_PATH, 'utf8') : '';
  }
  return cachedIndexHtml;
}

function getBackofficeHtml(): string {
  if (!cachedBackofficeHtml || process.env.NODE_ENV !== 'production') {
    cachedBackofficeHtml = fs.existsSync(BACKOFFICE_HTML_PATH) ? fs.readFileSync(BACKOFFICE_HTML_PATH, 'utf8') : '';
  }
  return cachedBackofficeHtml;
}

// Defensa en profundidad: interceptar '/backoffice.html', '/admin' y '/backoffice'
// antes de que express.static sirva cualquier archivo estático
app.get(
  ['/admin', '/backoffice', '/backoffice.html'],
  globalRateLimiter,
  adminIpRestricted,
  (_req: Request, res: Response) => {
    const html = getBackofficeHtml();
    if (!html) {
      return res.status(404).json({ error: 'Panel administrativo no disponible' });
    }
    res.type('html').send(html);
  },
);

app.use(express.static(PUBLIC_DIR));

app.get('/{*splat}', globalRateLimiter, (_req: Request, res: Response) => {
  const html = getIndexHtml();
  if (!html) {
    return res.status(404).json({ error: 'Aplicación cliente no disponible' });
  }
  res.type('html').send(html);
});

// ---------------------------------------------------------------------------
// Middleware Global de Manejo de Errores (Express Error Boundary)
// ---------------------------------------------------------------------------
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const traceId = req.traceId || (req.headers['x-request-id'] as string) || undefined;
  if (err instanceof CorsOriginRejectedError) {
    logger.warn('Petición rechazada por la política CORS', { origin: req.headers.origin, path: req.path, traceId });
    if (res.headersSent) {
      return;
    }
    return res.status(403).json({
      error: 'Origen no permitido por la política CORS.',
      code: 'CORS_ORIGIN_REJECTED',
      requestId: traceId,
    });
  }
  logger.error('Error no controlado en el servidor Express', {
    error: errorMessage(err),
    stack: err instanceof Error ? err.stack : undefined,
    traceId,
  });
  if (res.headersSent) {
    return;
  }
  res.status(500).json({
    error: 'Error interno del servidor. La solicitud no pudo ser procesada de forma segura.',
    code: 'INTERNAL_SERVER_ERROR',
    requestId: traceId,
  });
});

// ---------------------------------------------------------------------------
// Graceful Shutdown Handler (Ciclo de Vida de Pods en Kubernetes / ADR-015)
// ---------------------------------------------------------------------------
export function setupGracefulShutdown(
  server: import('http').Server,
  options: { drainTimeoutMs?: number; shutdownTimeoutMs?: number } = {},
): () => void {
  const drainTimeoutMs = options.drainTimeoutMs ?? (process.env.NODE_ENV === 'test' ? 10 : 2000);
  const shutdownTimeoutMs = options.shutdownTimeoutMs ?? 15000;

  const handleShutdown = async (signal: string) => {
    if (getLifecycleStatus().isShuttingDown) return;
    setIsShuttingDown(true);
    logger.info(`[Lifecycle: Graceful Shutdown] Señal ${signal} recibida. Iniciando secuencia de apagado grácil...`, {
      signal,
    });

    // 1. Temporizador de salvaguarda en caso de sockets o pools bloqueados
    const forceExitTimer = setTimeout(() => {
      logger.error('[Lifecycle: Graceful Shutdown] Tiempo límite de apagado excedido. Forzando terminación.');
      if (process.env.NODE_ENV !== 'test') {
        process.exit(1);
      }
    }, shutdownTimeoutMs);
    forceExitTimer.unref();

    // 2. Breve pausa de amortiguación para permitir que el EndpointSlice Controller de Kubernetes
    // retire el Pod de los endpoints del Service y evitar peticiones en vuelo
    await new Promise((resolve) => setTimeout(resolve, drainTimeoutMs));

    // 3. Dejar de aceptar nuevas conexiones HTTP y drenar las existentes
    server.close(async (err) => {
      if (err) {
        logger.warn('[Lifecycle: Graceful Shutdown] Error al cerrar servidor HTTP', { error: err.message });
      } else {
        logger.info('[Lifecycle: Graceful Shutdown] Servidor HTTP cerrado correctamente');
      }

      // 4. Cerrar pools de persistencia (PostgreSQL) y caché (Redis)
      try {
        await closeStorage();
      } catch (closeErr) {
        logger.error('[Lifecycle: Graceful Shutdown] Error al cerrar capas de almacenamiento', {
          error: errorMessage(closeErr),
        });
      }

      clearTimeout(forceExitTimer);
      logger.info('[Lifecycle: Graceful Shutdown] Apagado grácil completado exitosamente.');
      if (process.env.NODE_ENV !== 'test') {
        process.exit(0);
      }
    });
  };

  const onSigterm = () => handleShutdown('SIGTERM');
  const onSigint = () => handleShutdown('SIGINT');

  process.once('SIGTERM', onSigterm);
  process.once('SIGINT', onSigint);

  return () => {
    process.removeListener('SIGTERM', onSigterm);
    process.removeListener('SIGINT', onSigint);
  };
}

function handleStartupError(err: unknown, exitFn: (code: number) => void = (code) => process.exit(code)): void {
  // [APPS-002] Fallo de arranque: en produccion se aborta el proceso con
  // codigo distinto de cero para que el orquestador NO marque el pod como
  // listo. No se escucha ningún puerto: es preferible no servir tráfico que
  // servirlo contra un esquema de datos inconsistente.
  logger.error('[Startup] La inicialización del almacenamiento falló. Abortando arranque.', {
    error: err instanceof Error ? err.message : String(err),
  });
  exitFn(1);
}

// Start Server tras inicializar la capa de persistencia y caché (solo si no es test runner)
const isRunningTests = process.env.NODE_ENV === 'test' || process.argv.some((arg) => arg.includes('test'));
if (!isRunningTests) {
  checkRequiredEnvVars();
  initStorage()
    .then(() => {
      const server = app.listen(PORT, '0.0.0.0', () => {
        const health = getStorageHealth();
        logger.info(`Pokédex Server iniciado en http://0.0.0.0:${PORT}`, {
          port: PORT,
          storage: health.database.toUpperCase(),
          pgConnected: health.postgres_connected,
          redisConnected: health.redis_connected,
        });
        if (process.env.NODE_ENV === 'production') {
          logger.info(
            '[APPS-003] Serving estático en Express activo como contingencia; el tráfico web productivo es canalizado por Nginx Ingress.',
          );
        }
      });
      setupGracefulShutdown(server);
    })
    .catch((err: unknown) => {
      handleStartupError(err);
      process.exit(1);
    });
}

export {
  app,
  createRateLimiter,
  type RateLimiterOptions,
  buildSessionCookie,
  extractSessionTokenFromRequest,
  verifyAdmin,
  requireWritableStorage,
  getLifecycleStatus,
  setShuttingDownForTest,
  handleStartupError,
};
