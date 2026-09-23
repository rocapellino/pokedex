import { Request, Response, NextFunction } from 'express';
import { getStorageHealth } from '../services/db.js';
import { aiCircuitBreaker } from '../services/ai.js';

// ---------------------------------------------------------------------------
// Metrics & Observability Tracking (Prometheus Exposition Format)
// ---------------------------------------------------------------------------
export const startTime = Date.now();
let totalRequests = 0;
export function getTotalRequests(): number {
  return totalRequests;
}
export const httpRequestsTotal = new Map<string, number>();
export const httpDurationSum = new Map<string, number>();
export const httpDurationCount = new Map<string, number>();
export const DURATION_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10];
export const httpDurationBuckets = new Map<string, number>();

export function normalizeEndpoint(req: Request): string {
  const p = req.path || '/';
  if (/^\/pokemons\/\d+$/.test(p)) {
    return '/pokemons/:id';
  }
  if (p.startsWith('/api/v1/ai/')) {
    return '/api/v1/ai/:service';
  }
  return p;
}

export const metricsCollector = (req: Request, res: Response, next: NextFunction) => {
  totalRequests++;
  const start = process.hrtime();

  res.on('finish', () => {
    const [seconds, nanoseconds] = process.hrtime(start);
    const durationSeconds = seconds + nanoseconds / 1e9;
    const endpoint = normalizeEndpoint(req);
    const status = String(res.statusCode);
    const method = req.method;

    const key = `${endpoint}|${status}|${method}`;
    httpRequestsTotal.set(key, (httpRequestsTotal.get(key) || 0) + 1);

    httpDurationSum.set(endpoint, (httpDurationSum.get(endpoint) || 0) + durationSeconds);
    httpDurationCount.set(endpoint, (httpDurationCount.get(endpoint) || 0) + 1);

    for (const b of DURATION_BUCKETS) {
      if (durationSeconds <= b) {
        const bKey = `${endpoint}|${b}`;
        httpDurationBuckets.set(bKey, (httpDurationBuckets.get(bKey) || 0) + 1);
      }
    }
  });

  next();
};

export function generatePrometheusMetrics(): string {
  const uptimeSeconds = ((Date.now() - startTime) / 1000).toFixed(2);
  const health = getStorageHealth();
  const degradedMode = health.postgres_connected ? 0 : 1;
  const storageStatus = health.postgres_connected ? 1 : 0;
  const redisStatus = health.redis_connected ? 1 : 0;

  const lines: string[] = [
    '# HELP pokedex_uptime_seconds Tiempo que la aplicación ha estado activa en segundos.',
    '# TYPE pokedex_uptime_seconds gauge',
    `pokedex_uptime_seconds ${uptimeSeconds}`,
    '',
    '# HELP pokedex_storage_status Estado de conexión con el almacenamiento principal PostgreSQL (1 = conectado, 0 = desconectado).',
    '# TYPE pokedex_storage_status gauge',
    `pokedex_storage_status ${storageStatus}`,
    '',
    '# HELP pokedex_redis_status Estado de conexión con la capa de caché y rate limiting Redis (1 = conectado, 0 = desconectado).',
    '# TYPE pokedex_redis_status gauge',
    `pokedex_redis_status ${redisStatus}`,
    '',
    '# HELP pokedex_total_pokemons Cantidad actual de Pokémon registrados en memoria o base de datos.',
    '# TYPE pokedex_total_pokemons gauge',
    `pokedex_total_pokemons ${health.total_records}`,
    '',
    '# HELP pokedex_degraded_mode Indicador de modo degradado (1 = activo, 0 = normal).',
    '# TYPE pokedex_degraded_mode gauge',
    `pokedex_degraded_mode ${degradedMode}`,
    '',
    '# HELP pokedex_ai_circuit_breaker_open Estado del disyuntor de llamadas a Gemini (1 = circuito abierto/fallback, 0 = cerrado/operativo).',
    '# TYPE pokedex_ai_circuit_breaker_open gauge',
    `pokedex_ai_circuit_breaker_open ${aiCircuitBreaker.isOpen() ? 1 : 0}`,
    '',
    '# HELP pokedex_ai_circuit_breaker_failures Fallos acumulados consecutivos registrados por el disyuntor de IA.',
    '# TYPE pokedex_ai_circuit_breaker_failures gauge',
    `pokedex_ai_circuit_breaker_failures ${aiCircuitBreaker.getFailureCount()}`,
    '',
    '# HELP pokedex_http_requests_total Contador total de solicitudes HTTP recibidas por endpoint y estado.',
    '# TYPE pokedex_http_requests_total counter',
  ];

  if (httpRequestsTotal.size === 0) {
    lines.push(`pokedex_http_requests_total{endpoint="/",status="200",method="GET"} 0`);
  } else {
    for (const [key, count] of httpRequestsTotal.entries()) {
      const [endpoint, status, method] = key.split('|');
      lines.push(`pokedex_http_requests_total{endpoint="${endpoint}",status="${status}",method="${method}"} ${count}`);
    }
  }

  lines.push('');
  lines.push('# HELP http_requests_total Contador total estándar de solicitudes HTTP recibidas por endpoint, estado y método.');
  lines.push('# TYPE http_requests_total counter');
  if (httpRequestsTotal.size === 0) {
    lines.push(`http_requests_total{endpoint="/",status="200",method="GET"} 0`);
  } else {
    for (const [key, count] of httpRequestsTotal.entries()) {
      const [endpoint, status, method] = key.split('|');
      lines.push(`http_requests_total{endpoint="${endpoint}",status="${status}",method="${method}"} ${count}`);
    }
  }

  lines.push('');
  lines.push('# HELP http_request_duration_seconds Histograma y percentiles de duración de solicitudes HTTP en segundos.');
  lines.push('# TYPE http_request_duration_seconds histogram');
  const endpoints = Array.from(new Set([...httpDurationCount.keys(), '/']));
  for (const ep of endpoints) {
    for (const b of DURATION_BUCKETS) {
      const bCount = httpDurationBuckets.get(`${ep}|${b}`) || 0;
      lines.push(`http_request_duration_seconds_bucket{endpoint="${ep}",le="${b}"} ${bCount}`);
    }
    const infCount = httpDurationCount.get(ep) || 0;
    lines.push(`http_request_duration_seconds_bucket{endpoint="${ep}",le="+Inf"} ${infCount}`);
    lines.push(`http_request_duration_seconds_sum{endpoint="${ep}"} ${(httpDurationSum.get(ep) || 0).toFixed(6)}`);
    lines.push(`http_request_duration_seconds_count{endpoint="${ep}"} ${infCount}`);
  }

  lines.push('');
  lines.push('# HELP pokedex_http_request_duration_seconds_sum Suma acumulada de la duración de solicitudes HTTP en segundos.');
  lines.push('# TYPE pokedex_http_request_duration_seconds_sum counter');
  if (httpDurationSum.size === 0) {
    lines.push(`pokedex_http_request_duration_seconds_sum{endpoint="/"} 0`);
  } else {
    for (const [endpoint, sum] of httpDurationSum.entries()) {
      lines.push(`pokedex_http_request_duration_seconds_sum{endpoint="${endpoint}"} ${sum.toFixed(6)}`);
    }
  }

  lines.push('');
  lines.push('# HELP pokedex_http_request_duration_seconds_count Total de solicitudes HTTP medidas para duración.');
  lines.push('# TYPE pokedex_http_request_duration_seconds_count counter');
  if (httpDurationCount.size === 0) {
    lines.push(`pokedex_http_request_duration_seconds_count{endpoint="/"} 0`);
  } else {
    for (const [endpoint, count] of httpDurationCount.entries()) {
      lines.push(`pokedex_http_request_duration_seconds_count{endpoint="${endpoint}"} ${count}`);
    }
  }

  return lines.join('\n') + '\n';
}
