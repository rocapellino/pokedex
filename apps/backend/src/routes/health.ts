import express, { Request, Response } from 'express';
import { getStorageHealth, getPostgresVersion } from '../services/db.js';
import { getLifecycleStatus } from '../utils/lifecycle.js';
import { startTime, generatePrometheusMetrics } from '../middleware/metrics.js';
import { asyncHandler } from '../utils/async-handler.js';

export const healthRouter = express.Router();

// ---------------------------------------------------------------------------
// Healthcheck & Observability Endpoints
// ---------------------------------------------------------------------------
healthRouter.get('/healthz', (_req: Request, res: Response) => {
  res.type('text/plain').status(200).send('healthy\n');
});

healthRouter.get('/readyz', (_req: Request, res: Response) => {
  const { isShuttingDown } = getLifecycleStatus();
  if (isShuttingDown) {
    return res.status(503).json({
      status: 'shutting_down',
      detail: 'Servidor en proceso de terminación grácil (SIGTERM/SIGINT recibido). No admitiendo tráfico nuevo.',
    });
  }
  const health = getStorageHealth();
  if (!health.postgres_connected) {
    return res.status(503).json({
      status: 'unready',
      database: health.database,
      postgres_connected: health.postgres_connected,
      redis_connected: health.redis_connected,
      postgres_total_records: health.postgres_total_records,
      memory_total_records: health.memory_total_records,
      pokemons_count: health.total_records,
      detail: 'PostgreSQL no está conectado o el servicio está en modo degradado',
    });
  }
  return res.status(200).json({
    status: 'ready',
    database: health.database,
    postgres_connected: health.postgres_connected,
    redis_connected: health.redis_connected,
    postgres_total_records: health.postgres_total_records,
    memory_total_records: health.memory_total_records,
    pokemons_count: health.total_records,
  });
});

healthRouter.get(['/version', '/api/v1/version'], asyncHandler(async (_req: Request, res: Response) => {
  const health = getStorageHealth();
  const postgresVersion = await getPostgresVersion();
  const uptimeSeconds = ((Date.now() - startTime) / 1000).toFixed(2);

  return res.status(200).json({
    app: 'pokedex',
    version: process.env.APP_VERSION || '1.0.0',
    git_sha: process.env.GIT_SHA || process.env.COMMIT_SHA || 'unknown',
    node_version: process.version,
    uptime_seconds: Number.parseFloat(uptimeSeconds),
    environment: process.env.NODE_ENV || 'development',
    database: {
      engine: health.database,
      postgres_connected: health.postgres_connected,
      postgres_version: postgresVersion ?? (health.postgres_connected ? 'available' : 'unavailable'),
      redis_connected: health.redis_connected,
      mode: health.postgres_connected ? 'normal' : 'degraded',
    },
  });
}));

healthRouter.get('/metrics', (_req: Request, res: Response) => {
  const metricsOutput = generatePrometheusMetrics();
  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  return res.status(200).send(metricsOutput);
});
