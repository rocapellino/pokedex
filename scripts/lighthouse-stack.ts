/**
 * ==============================================================================
 * scripts/lighthouse-stack.ts
 *
 * Levanta el entorno que mide Lighthouse CI (`lighthouserc.json`, `startServerCommand`):
 *
 *   navegador ──▶ nginx (imagen productiva, digest del Dockerfile) ──▶ API simulada
 *
 * Antes se medía `dist/` con un servidor estático sin API: el catálogo devolvía 404 y la
 * página quedaba en el estado de error, por lo que CLS, TBT y LCP se calculaban sin una sola
 * tarjeta. Aquí nginx sirve `dist/` con su configuración y cabeceras reales (CSP, COEP, CORP)
 * y la API simulada responde con el catálogo nacional completo y la paginación del backend.
 *
 * Las imágenes de los Pokémon apuntan a un recurso local para que la puntuación no dependa
 * de la latencia de `raw.githubusercontent.com`: el gate mide el coste propio de la aplicación.
 *
 * Uso (lo invoca `lhci autorun`; también sirve en local):
 *   npx tsx scripts/lighthouse-stack.ts
 * Requiere Docker y `npm run build:frontend` ejecutado previamente.
 * ==============================================================================
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parsePagination } from '../apps/backend/src/utils/pagination.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const API_PORT = 3000;
export const WEB_PORT = 8080;
export const READY_MARKER = 'LIGHTHOUSE_STACK_READY';
export const LOCAL_IMAGE = '/favicon.png';
export const CONTAINER_NAME = 'lighthouse-nginx';

const CATALOG_PATH = path.join(ROOT, 'apps/backend/src/data/pokemon-catalog.full.json');
const DOCKERFILE_PATH = path.join(ROOT, 'apps/frontend/Dockerfile');
const DIST_PATH = path.join(ROOT, 'apps/frontend/dist');
const WORK_DIR = path.join(ROOT, 'tmp/lighthouse');

/** Redes privadas de Docker: el contenedor ve las peticiones del host desde el gateway del bridge. */
const MEASUREMENT_ENV = {
  BACKOFFICE_ALLOWED_IP_1: '172.16.0.0/12',
  BACKOFFICE_ALLOWED_IP_2: '192.168.0.0/16',
  METRICS_ALLOWED_CIDR: '10.42.0.0/24',
};

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** Sustituye toda URL de arte oficial remoto por el recurso local, a cualquier profundidad. */
export function localizeImages(value: Json): Json {
  if (typeof value === 'string') {
    return value.startsWith('https://raw.githubusercontent.com/') ? LOCAL_IMAGE : value;
  }
  if (Array.isArray(value)) return value.map(localizeImages);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, localizeImages(v)]));
  }
  return value;
}

/** Misma semántica que `GET /pokemons`: `limit` (máx. 100, 50 por defecto), `offset` y `X-Total-Count`. */
export function pageOf<T>(catalog: T[], query: URLSearchParams): { total: number; items: T[] } {
  const { limit, offset } = parsePagination({ limit: query.get('limit'), offset: query.get('offset') });
  return { total: catalog.length, items: catalog.slice(offset, offset + limit) };
}

export function createApiServer(catalog: Json[]): http.Server {
  const send = (res: http.ServerResponse, status: number, body: Json, headers: Record<string, string> = {}): void => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
    res.end(JSON.stringify(body));
  };

  return http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');

    if (req.method === 'GET' && url.pathname === '/pokemons') {
      const { total, items } = pageOf(catalog, url.searchParams);
      return send(res, 200, items, { 'X-Total-Count': String(total) });
    }
    const byId = /^\/pokemons\/(\d+)$/.exec(url.pathname);
    if (req.method === 'GET' && byId) {
      const found = catalog.find((p) => (p as { id?: number }).id === Number(byId[1]));
      return found ? send(res, 200, found) : send(res, 404, { error: 'Pokémon no encontrado' });
    }
    if (req.method === 'GET' && url.pathname === '/api/v1/auth/session') {
      return send(res, 200, { authenticated: false });
    }
    return send(res, 404, { error: 'No encontrado' });
  });
}

/** Imagen de nginx de producción: única SSOT, el `FROM nginx:<v>@sha256:<digest>` del Dockerfile. */
export function resolveNginxImage(dockerfile: string): string {
  const match = /^FROM (nginx:[^@\s]+@sha256:[a-f0-9]{64})/m.exec(dockerfile);
  if (!match?.[1]) throw new Error('No se pudo resolver la imagen de Nginx desde apps/frontend/Dockerfile');
  return match[1];
}

export function dockerRunArgs(image: string, confPath: string, distPath: string): string[] {
  return [
    'run',
    '--rm',
    '-d',
    '--name',
    CONTAINER_NAME,
    '-p',
    `${WEB_PORT}:8080`,
    '--add-host=api:host-gateway',
    '--mount',
    `type=bind,source=${confPath},target=/etc/nginx/conf.d/default.conf,readonly`,
    '--mount',
    `type=bind,source=${distPath},target=/usr/share/nginx/html,readonly`,
    image,
  ];
}

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv = process.env): string {
  const result = spawnSync(cmd, args, { cwd: ROOT, env, encoding: 'utf-8' });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args[0] ?? ''} falló: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

async function waitForHealth(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // nginx aún arrancando
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timeout esperando ${url}`);
}

async function main(): Promise<void> {
  if (!fs.existsSync(path.join(DIST_PATH, 'index.html'))) {
    throw new Error('Falta apps/frontend/dist: ejecutar `npm run build:frontend` antes.');
  }

  const catalog = localizeImages(JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf-8')) as Json) as Json[];
  const api = createApiServer(catalog);
  await new Promise<void>((resolve, reject) => {
    api.once('error', (err: NodeJS.ErrnoException) =>
      reject(
        err.code === 'EADDRINUSE'
          ? new Error(
              `El puerto ${API_PORT} está en uso: ¿una ejecución anterior sin cerrar? Detenerla antes de continuar.`,
            )
          : err,
      ),
    );
    api.listen(API_PORT, '0.0.0.0', resolve);
  });

  fs.mkdirSync(WORK_DIR, { recursive: true });
  const confPath = path.join(WORK_DIR, 'default.conf');
  run('node', ['scripts/generate-nginx-conf.mjs', '--render', confPath], { ...process.env, ...MEASUREMENT_ENV });

  const image = resolveNginxImage(fs.readFileSync(DOCKERFILE_PATH, 'utf-8'));
  spawnSync('docker', ['rm', '-f', CONTAINER_NAME], { cwd: ROOT, stdio: 'ignore' });
  run('docker', dockerRunArgs(image, confPath, DIST_PATH));

  let stopped = false;
  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    spawnSync('docker', ['stop', CONTAINER_NAME], { cwd: ROOT, stdio: 'ignore' });
    api.close();
  };
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.on(signal, () => {
      stop();
      process.exit(0);
    });
  }
  process.on('exit', stop);

  await waitForHealth(`http://localhost:${WEB_PORT}/healthz`, 30_000);
  console.log(`${READY_MARKER} http://localhost:${WEB_PORT} (${catalog.length} Pokémon, ${image})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    spawnSync('docker', ['rm', '-f', CONTAINER_NAME], { cwd: ROOT, stdio: 'ignore' });
    process.exit(1);
  });
}
