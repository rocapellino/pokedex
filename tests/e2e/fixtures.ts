import { test as base, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

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

interface DiagnosticEvent {
  kind: 'http' | 'requestfailed' | 'console' | 'pageerror';
  detail: string;
}

/**
 * Diagnóstico de la inestabilidad de `mobile-chrome` en CI. Solo observa: no cambia el comportamiento de
 * ningún test. Se adjunta únicamente cuando el test falla o se reintenta, para no ensuciar los runs
 * limpios, y se imprime en una línea `[e2e-diag]` fácil de filtrar en el log del job.
 */
async function cardsPerPage(pages: Page[]): Promise<number[]> {
  return Promise.all(
    pages.map((page) =>
      page
        .locator('.pokemon-card')
        .count()
        .catch(() => -1),
    ),
  );
}

interface AnimationSnapshot {
  target: string;
  kind: string;
  property: string;
  state: string;
  progress: number | null;
}

/**
 * Animaciones y transiciones vivas en el instante del fallo. Axe mide el contraste con el color
 * computado en ese momento: si un fallo de contraste coincide con una transición sin terminar, este
 * volcado lo demuestra (y dice sobre qué elemento y propiedad) en lugar de dejarlo como hipótesis.
 */
async function liveAnimations(pages: Page[]): Promise<AnimationSnapshot[][]> {
  return Promise.all(
    pages.map((page) =>
      page
        .evaluate(() =>
          document.getAnimations().map((animation) => {
            const target = animation.effect instanceof KeyframeEffect ? animation.effect.target : null;
            const classes = target instanceof Element ? [...target.classList].join('.') : '';
            return {
              target: target instanceof Element ? `${target.tagName.toLowerCase()}${classes ? `.${classes}` : ''}` : '',
              kind: animation.constructor.name,
              property: 'transitionProperty' in animation ? String(animation.transitionProperty) : animation.id || '',
              state: animation.playState,
              progress: animation.effect?.getComputedTiming().progress ?? null,
            };
          }),
        )
        .catch(() => []),
    ),
  );
}

export const test = base.extend<{ e2eDiagnostics: undefined }>({
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
  e2eDiagnostics: [
    async ({ context }, use, testInfo) => {
      const events: DiagnosticEvent[] = [];
      context.on('response', (response) => {
        if (response.status() >= 400) {
          events.push({
            kind: 'http',
            detail: `${response.status()} ${response.request().method()} ${response.url()}`,
          });
        }
      });
      context.on('requestfailed', (request) => {
        events.push({
          kind: 'requestfailed',
          detail: `${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`.trim(),
        });
      });
      context.on('console', (message) => {
        if (message.type() === 'error') events.push({ kind: 'console', detail: message.text() });
      });
      context.on('weberror', (webError) => {
        events.push({ kind: 'pageerror', detail: webError.error().message });
      });

      const startedAt = Date.now();
      await use(undefined);

      if (testInfo.status === testInfo.expectedStatus && testInfo.retry === 0) return;
      const report = {
        test: testInfo.titlePath.join(' > '),
        project: testInfo.project.name,
        status: testInfo.status,
        retry: testInfo.retry,
        workerIndex: testInfo.workerIndex,
        durationMs: Date.now() - startedAt,
        cardsPerPage: await cardsPerPage(context.pages()),
        liveAnimations: await liveAnimations(context.pages()),
        events,
      };
      const body = JSON.stringify(report, null, 2);
      await testInfo.attach('diagnostico-e2e', { body, contentType: 'application/json' });
      console.log(`[e2e-diag] ${JSON.stringify(report)}`);
    },
    { auto: true },
  ],
});

export { expect };
