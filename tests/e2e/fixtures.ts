import { test as base, expect } from '@playwright/test';

/**
 * Los proyectos de Playwright corren a la vez contra el mismo backend, que limita a 300 peticiones por
 * minuto por IP (apps/backend/src/middleware/rate-limiter.ts). Con una sola IP de origen se agota el
 * cupo y los últimos tests de `mobile-chrome` se quedan sin catálogo ("Límite global de peticiones
 * excedido"). El backend confía en `X-Forwarded-For` desde loopback (`trust proxy`), así que cada
 * proyecto se identifica con una IP de documentación (RFC 5737) distinta.
 *
 * La cabecera se añade solo a las peticiones del mismo origen: en las cross-origin (imágenes con CORS
 * bajo COEP) una cabecera no estándar fuerza un preflight que las rompe.
 */
const CLIENT_IP_BY_PROJECT: Record<string, string> = {
  chromium: '203.0.113.10',
  'mobile-chrome': '203.0.113.11',
};

export const test = base.extend({
  context: async ({ context, baseURL }, use, testInfo) => {
    const clientIp = CLIENT_IP_BY_PROJECT[testInfo.project.name];
    if (clientIp && baseURL) {
      const origin = new URL(baseURL).origin;
      await context.route(
        (url) => url.origin === origin,
        (route) => route.continue({ headers: { ...route.request().headers(), 'x-forwarded-for': clientIp } }),
      );
    }
    await use(context);
  },
});

export { expect };
