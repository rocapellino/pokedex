/**
 * Arranque del entorno de navegador para las pruebas de `backoffice.ts`.
 *
 * Este modulo existe por una restriccion del orden de evaluacion de ESM: los `import`
 * se evaluan ANTES que cualquier sentencia del modulo que los contiene. Por eso el DOM
 * no puede montarse en el cuerpo de `backoffice_controller.test.ts` si ese archivo
 * importa `backoffice.ts` de forma estatica en el tope.
 *
 * Separar el montaje en su propio modulo garantiza el orden correcto:
 * 1. se importa este archivo (monta el DOM y las globales);
 * 2. a continuacion se evalua el import estatico de `backoffice.ts` del archivo de test,
 *    que ya encuentra `document` y `window` disponibles.
 *
 * El import de `backoffice.ts` DEBE ser estatico. El instrumentado de V8 de Node no
 * registra para cobertura los modulos cargados mediante `import()` dinamico, por lo que
 * un `import()` dinamico dejaba `backoffice.ts` completamente fuera de
 * `coverage/lcov.info` y el Quality Gate de Sonar reportaba 0 % de New Code pese a que
 * los tests se ejecutaban y pasaban.
 */

import { JSDOM } from 'jsdom';

const HTML = `<!doctype html><html><body>
  <span id="backendStatus"></span><span id="statusDot"></span>
  <input id="adminSearch" value="pikachu">
  <select id="adminTypeFilter"><option value="all">all</option><option value="Fuego">Fuego</option></select>
  <select id="adminPageSize"><option value="2">2</option><option value="25">25</option></select>
  <table><tbody id="adminTableBody"></tbody></table>
  <div id="adminPagination"></div>
  <span id="kpiTotal"></span><span id="kpiAvgForce"></span><span id="kpiUniqueTypes"></span>
  <span id="pageInfo"></span><div id="toastContainer"></div>
  <button id="btnSubmitForm">Guardar Registro</button>
  <button id="btnConfirmDelete">Sí, Eliminar</button>
  <input id="pokemonName" value=""><input id="pokemonTypes" value=""><input id="pokemonForce" value="">
  <div id="crudModal"></div><div id="authModal"></div><div id="deleteModal"></div>
  <table><tbody id="tableBody"></tbody></table>
  <form id="crudForm"></form><form id="authForm"></form>
  <button id="btnAdminAuth"></button><button id="btnSyncCache"></button>
  <button id="btnOpenCreate"></button><button id="btnClearKeyBtn"></button>
  <button id="adminBtnPrev"></button><button id="adminBtnNext"></button>
  <button data-close-crud></button><button data-close-delete></button><button data-close-auth></button>
</body></html>`;

/** Espia de `window.scrollTo`, usado para observar la navegación entre páginas. */
export const scrollCalls: unknown[] = [];

export const dom = new JSDOM(HTML, {
  url: 'http://localhost:8080/backoffice.html',
  pretendToBeVisual: true,
});

const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
g.HTMLElement = dom.window.HTMLElement;
g.Event = dom.window.Event;
g.localStorage = dom.window.localStorage;
g.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);

// En jsdom innerText no propaga a textContent por defecto; emulamos el comportamiento
// para que las comprobaciones de DOM basadas en textContent reflejen asignaciones a innerText.
Object.defineProperty(dom.window.HTMLElement.prototype, 'innerText', {
  get() {
    return this.textContent;
  },
  set(v: string) {
    this.textContent = v;
  },
  configurable: true,
});

// Mock mínimo inicial de fetch para evitar errores de red al evaluar bootstrap() durante el import.
const defaultFetch = async () => ({
  ok: true,
  status: 200,
  headers: { get: () => null },
  json: async () => [],
});
g.fetch = defaultFetch;
dom.window.fetch = defaultFetch as unknown as typeof dom.window.fetch;

// `navigator` es un accessor de solo lectura en Node 22+: la asignacion directa lanza
// TypeError, por lo que debe redefinirse con `defineProperty`.
Object.defineProperty(globalThis, 'navigator', {
  value: dom.window.navigator,
  configurable: true,
  writable: true,
});

// `bootstrap()` sondea el health check cada 15 s; sin neutralizarlo el runner de Node
// mantiene el proceso vivo y la suite nunca termina.
g.setInterval = () => 0;
g.clearInterval = () => {};

// `scrollTo` no está implementado en jsdom; se sustituye por un espía.
dom.window.scrollTo = ((opts: unknown) => {
  scrollCalls.push(opts);
}) as unknown as typeof dom.window.scrollTo;
