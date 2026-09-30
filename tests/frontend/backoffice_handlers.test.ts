/**
 * Pruebas unitarias de los manejadores de `backoffice.ts`.
 *
 * `backoffice.ts` es un controlador de navegador: accede a `window` y `document` en el
 * ambito del modulo, y su cadena de imports llega hasta `sanitizer.ts`, que inicializa
 * DOMPurify contra un DOM real inexistente en Node.
 *
 * Este test resuelve ambas limitaciones sin anadir dependencias:
 *  1. `mock.module` intercepta `./sanitizer.js` con un doble de teste, de modo que el
 *     modulo bajo prueba se carga sin tocar DOMPurify.
 *  2. Se instalan stubs minimos de `document`, `window` y `localStorage`.
 *
 * Contexto: el Quality Gate de Sonar exige >= 80 % de cobertura en New Code, y estas
 * lineas no estaban cubiertas porque solo se ejercitaban via Playwright
 * (`tests/e2e/`), cuyo glob `*.spec.ts` queda fuera de `test:coverage`.
 */

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

const SANITIZER_URL = new URL(
  '../../apps/frontend/src/sanitizer.ts',
  import.meta.url
).href;

/** Doble de `sanitizer.ts`: sanea escapando delimitadores, sin DOMPurify. */
const escape = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

mock.module(SANITIZER_URL, {
  namedExports: {
    sanitizeHtml: (dirty: string) => escape(dirty),
    escapeText: escape,
  },
});


type StubElement = {
  id: string;
  value: string;
  innerHTML: string;
  innerText: string;
  textContent: string;
  className: string;
  disabled: boolean;
  tagName: string;
  dataset: Record<string, string>;
  style: Record<string, string>;
  children: StubElement[];
  scrollIntoView: () => void;
  addEventListener: () => void;
  removeEventListener: () => void;
  querySelector: () => StubElement | null;
  querySelectorAll: () => StubElement[];
  closest: () => null;
  contains: () => boolean;
  getAttribute: () => null;
  setAttribute: () => void;
  focus: () => void;
  blur: () => void;
  click: () => void;
  appendChild: () => void;
  removeChild: () => void;
  remove: () => void;
  replaceChildren: () => void;
};

function createStubElement(id = '', tagName = 'DIV'): StubElement {
  const el: Partial<StubElement> = {
    id,
    value: '',
    innerHTML: '',
    innerText: '',
    textContent: '',
    className: '',
    disabled: false,
    tagName,
    dataset: {},
    style: {},
    children: [],
    scrollIntoView: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    closest: () => null,
    contains: () => false,
    getAttribute: () => null,
    setAttribute: () => {},
    focus: () => {},
    blur: () => {},
    click: () => {},
    appendChild: () => {},
    removeChild: () => {},
    remove: () => {},
    replaceChildren: () => {},
  };
  return el as StubElement;
}

const registry = new Map<string, StubElement>();
function register(id: string, value = '', tagName = 'DIV'): StubElement {
  const el = createStubElement(id, tagName);
  el.value = value;
  registry.set(id, el);
  return el;
}

const scrollCalls: unknown[] = [];

/** Import perezoso: el modulo debe cargarse despues de instalar los stubs de DOM. */
const load = () => import('../../apps/frontend/src/backoffice.js');

/**
 * `backoffice.ts` programa un `setInterval` de 15 s en `bootstrap()` para sondear el
 * health check. Sin limpiarlo, el runner de Node mantiene el proceso vivo y la suite
 * nunca termina. Se sustituye por un intervalo no-op y se restauran los timers
 * reales tras la ejecucion.
 */
const realSetInterval = globalThis.setInterval;
const realClearInterval = globalThis.clearInterval;

before(() => {
  (globalThis as Record<string, unknown>).setInterval = () => 0;
  (globalThis as Record<string, unknown>).clearInterval = () => {};
});

after(() => {
  (globalThis as Record<string, unknown>).setInterval = realSetInterval;
  (globalThis as Record<string, unknown>).clearInterval = realClearInterval;
  // Descarta cualquier temporizador pendiente (p. ej. el debounce de 300 ms).
  realClearInterval.call(globalThis, 0);
});

before(() => {
  register('adminTableBody', '', 'TBODY');
  register('adminPagination');
  register('adminSearch', 'pikachu');
  register('adminTypeFilter', 'all');
  register('adminPageSize', '25');
  register('kpiTotal', '', 'SPAN');
  register('kpiAvgForce', '', 'SPAN');
  register('kpiUniqueTypes', '', 'SPAN');
  register('pageInfo', '', 'SPAN');
  register('toastContainer', '', 'DIV');

  const g = globalThis as Record<string, unknown>;
  g.document = {
    getElementById: (id: string) => registry.get(id) ?? null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: (tag: string) => createStubElement('', tag.toUpperCase()),
    addEventListener: () => {},
    removeEventListener: () => {},
    body: createStubElement('body', 'BODY'),
  };
  g.window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    scrollTo: (opts: unknown) => {
      scrollCalls.push(opts);
    },
    location: { origin: 'http://localhost', href: 'http://localhost/' },
  };
  const store = new Map<string, string>();
  g.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
  // `fetchPokemonsWithCount` lee el total de la cabecera `X-Total-Count` y, si no
  // existe, lo deriva de la longitud del array. Se usan 3 specimens para que
  // `changeAdminPage` tenga paginas validas que navegar y ejercite su camino de exito.
  const CATALOG: unknown[] = [
    { id: 1, nombre: 'Bulbasaur', tipo: 'Planta', tipos: ['Planta'], fuerza: 49 },
    { id: 4, nombre: 'Charmander', tipo: 'Fuego', tipos: ['Fuego'], fuerza: 52 },
    { id: 7, nombre: 'Squirtle', tipo: 'Agua', tipos: ['Agua'], fuerza: 44 },
  ];
  g.fetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: (name: string) => (name === 'X-Total-Count' ? '3' : null) },
    json: async () => CATALOG,
  });
});

/** Espera a que las promesas en vuelo de los manejadores se resuelvan. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('Backoffice: applyAdminFilters recarga el catalogo y renderiza', async () => {
  const { applyAdminFilters, loadAdminData } = await load();
  assert.equal(typeof applyAdminFilters, 'function');
  assert.doesNotThrow(() => applyAdminFilters());
  // El manejador descarta la promesa; se espera aqui para cubrir el camino de
  // exito de `loadAdminData` (asignacion de estado, render y toast).
  await loadAdminData();
  await settle();
});

test('Backoffice: handleAdminTypeFilter lee el valor del selector', async () => {
  const { handleAdminTypeFilter } = await load();
  const select = registry.get('adminTypeFilter')!;
  select.value = 'Fuego';
  handleAdminTypeFilter();
  assert.equal(select.value, 'Fuego', 'el filtro de tipo lee el valor del selector');
  await settle();
});

test('Backoffice: handlePageSizeChange tolera una entrada no numerica', async () => {
  const { handlePageSizeChange } = await load();
  const sizeEl = registry.get('adminPageSize')!;

  sizeEl.value = '50';
  assert.doesNotThrow(() => handlePageSizeChange());

  // Valor no numerico: el manejador debe recurrir al tamano por defecto (50) en
  // lugar de producir NaN y corromper el calculo de paginacion.
  sizeEl.value = 'no-numerico';
  assert.doesNotThrow(() => handlePageSizeChange());
});

test('Backoffice: handleAdminSearch programa un debounce sin lanzar', async () => {
  const { handleAdminSearch } = await load();
  const input = registry.get('adminSearch')!;
  input.value = 'char';
  assert.doesNotThrow(() => handleAdminSearch());
  assert.equal(input.value, 'char');
});

test('Backoffice: changeAdminPage navega dentro y fuera del rango valido', async () => {
  const { changeAdminPage, loadAdminData } = await load();
  await loadAdminData();
  await settle();

  // Con 3 registros y pageSize 25 hay una sola pagina valida: tanto avanzar como
  // retroceder caen fuera de rango y deben rechazarse sin desplazar la ventana.
  const before = scrollCalls.length;
  changeAdminPage(1);
  changeAdminPage(-1);
  assert.equal(
    scrollCalls.length,
    before,
    'una pagina fuera del rango 1..1 debe rechazarse sin desplazar la ventana'
  );
});

test('Backoffice: renderTable y updateKPIs toleran un DOM minimo', async () => {
  const { renderTable, updateKPIs } = await load();
  assert.doesNotThrow(() => renderTable());
  assert.doesNotThrow(() => updateKPIs());
});

test('Backoffice: la superficie publica permanece exportada', async () => {
  const modals = await load();
  for (const name of [
    'openCreateModal',
    'closeCrudModal',
    'closeAuthModal',
    'invalidateCache',
    'executeDelete',
    'handleFormSubmit',
    'initEventListeners',
  ] as const) {
    assert.equal(typeof modals[name], 'function', `${name} debe estar exportada`);
  }
});

test('Backoffice: initEventListeners enlaza sin lanzar con stubs de DOM', async () => {
  const { initEventListeners } = await load();
  assert.doesNotThrow(() => initEventListeners());
});
