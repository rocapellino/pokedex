import type { AddressInfo } from 'node:net';
import { app } from '../../apps/backend/server.js';

export interface RunningApp {
  baseUrl: string;
  close: () => Promise<void>;
}

export interface ApiResponse {
  status: number;
  headers: Headers;
  /** Cuerpo interpretado como JSON; `undefined` si la respuesta no es JSON. */
  body: any;
  text: string;
}

export interface ApiOptions {
  method?: string;
  headers?: Record<string, string>;
  /** Se serializa como JSON y añade `Content-Type: application/json`. */
  json?: unknown;
  /** IP de cliente simulada (X-Forwarded-For; el backend confía en el loopback). */
  clientIp?: string;
}

/** Levanta la app Express real en un puerto efímero. */
export async function startApp(): Promise<RunningApp> {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

let ipCounter = 0;

/**
 * IP de documentación (RFC 5737) distinta en cada llamada. Los limitadores de tasa son por IP y viven en el
 * proceso: dar una IP propia a cada test evita que se agoten los cupos entre casos.
 */
export function nextClientIp(): string {
  ipCounter += 1;
  return `198.51.100.${(ipCounter % 250) + 1}`;
}

/** Petición HTTP contra la app; devuelve estado, cabeceras y cuerpo ya interpretado. */
export async function api(baseUrl: string, path: string, options: ApiOptions = {}): Promise<ApiResponse> {
  const headers: Record<string, string> = { ...options.headers };
  if (options.json !== undefined) headers['content-type'] = 'application/json';
  if (options.clientIp) headers['x-forwarded-for'] = options.clientIp;

  const res = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.json !== undefined ? JSON.stringify(options.json) : undefined,
  });
  const text = await res.text();
  let body: any;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }
  return { status: res.status, headers: res.headers, body, text };
}
