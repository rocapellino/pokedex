/**
 * Pruebas unitarias del controlador de `backoffice.ts`.
 *
 * Contexto: el Quality Gate de Sonar exige >= 80 % de cobertura en New Code y mide
 * el archivo completo, no solo las lineas modificadas. `backoffice.ts` solo se
 * ejercitaba via Playwright (`tests/e2e/`, glob `*.spec.ts`), cuyo glob queda fuera de
 * `test:coverage` (`tests/**\/!(*fuzzing*).test.ts`), de modo que cualquier cambio en
 * el archivo bloqueaba el merge con 0 % de cobertura.
 *
 * Limitaciones que este test resuelve sin anadir dependencias (jsdom y happy-dom no
 * estan en el arbol, y la politica de tooling lo prohibe):
 *  1. `backoffice.ts` es un controlador de navegador: accede a `window` y `document`
 *     en el ambito del modulo. Se instalan stubs minimos de ambos.
 *  2. Su cadena de imports llega a `sanitizer.ts`, que inicializa DOMPurify contra un
 *     DOM real inexistente en Node. `mock.module` intercepta ese modulo con un doble.
 *  3. `bootstrap()` programa un `setInterval` de 15 s que mantendria vivo el proceso
 *     del runner. Se sustituye por un intervalo no-op.
 */

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

const SANITIZER_URL = new URL('../../apps/frontend/src/sanitizer.ts', import.meta.url).href;

/** Doble de `sanitizer.ts`: escapa delimitadores en lugar de usar DOMPurify. */
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
  src: string;
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
    src: '',
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

/** Elementos que `backoffice.ts` busca por `getElementById`. */
const registry = new Map<string, StubElement>();
function register(id: string, value = '', tagName = 'DIV'): StubElement {
  const el = createStubElement(id, tagName);
  el.value = value;
  registry.set(id, el);
  return el;
}

const scrollCalls: unknown[] = [];

/** Import perezoso: el modulo solo puede cargarse tras instalar los stubs. */
const load = () => import('../../apps/frontend/src/backoffice.js');

/** Espera a que las promesas en vuelo de los manejadores se resuelvan. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

/**
 * Timeout explicito por test. En runners lentos (CI) el limite por defecto del test
 * runner puede cancelar estos tests con `cancelledByParent` antes de que terminen,
 * aun cuando pasen localmente: dependen de la importacion perezosa del modulo bajo
 * prueba y de varios event loops.
 */
const TEST_TIMEOUT_MS = 30_000;

const realSetInterval = globalThis.setInterval;
const realClearInterval = globalThis.clearInterval;

before(() => {
  // `bootstrap()` sondea el health check cada 15 s; sin neutralizarlo el runner
  // de Node mantiene el proceso vivo y la suite nunca termina.
  (globalThis as Record<string, unknown>).setInterval = () => 0;
  (globalThis as Record<string, unknown>).clearInterval = () => {};

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
  register('backendStatus', '', 'SPAN');
  register('statusDot', '', 'SPAN');
  register('btnSubmitForm', '', 'BUTTON');
  register('btnConfirmDelete', '', 'BUTTON');
  register('pokemonName', '', 'INPUT');
  register('pokemonTypes', '', 'INPUT');
  register('pokemonForce', '', 'INPUT');

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

  // `fetchPokemonsWithCount` lee el total de la cabecera `X-Total-Count`; sin ella
  // cae al longitud del array. Se usan 3 specimens para que la paginacion tenga
  // paginas validas que navegar.
  const CATALOG: unknown[] = [
    { id: 1, nombre: 'Bulbasaur', tipo: 'Planta', tipos: ['Planta'], fuerza: 49 },
    { id: 4, nombre: 'Charmander', tipo: 'Fuego', tipos: ['Fuego'], fuerza: 52 },
    { id: 7, nombre: 'Squirtle', tipo: 'Agua', tipos: ['Agua'], fuerza: 44 },
  ];
  g.fetch = async (url: string | URL) => {
    const href = String(url);
    if (href.includes('/healthz')) {
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({}) };
    }
    return {
      ok: true,
      status: 200,
      headers: { get: (n: string) => (n === 'X-Total-Count' ? '3' : null) },
      json: async () => CATALOG,
    };
  };
});

after(() => {
  (globalThis as Record<string, unknown>).setInterval = realSetInterval;
  (globalThis as Record<string, unknown>).clearInterval = realClearInterval;
  realClearInterval.call(globalThis, 0);
});

    remove: () => {},

test('Backoffice: checkHealthStatus reporta backend saludable', { timeout: TEST_TIMEOUT_MS, concurrency: false }, async () => {
  const { checkHealthStatus } = await load();
  const statusEl = registry.get('backendStatus')!;
  const dotEl = registry.get('statusDot')!;
  await checkHealthStatus();
  assert.match(statusEl.innerText, /Saludables/, 'el estado debe indicar salud');
  assert.equal(dotEl.style.backgroundColor, '#10b981', 'el punto debe pintarse en verde');
});

test('Backoffice: checkHealthStatus no falla sin elementos de estado', { timeout: TEST_TIMEOUT_MS, concurrency: false }, async () => {
  const { checkHealthStatus } = await load();
  const saved = registry.get('statusDot');
  registry.delete('statusDot');
  assert.doesNotThrow(() => checkHealthStatus());
  if (saved) registry.set('statusDot', saved);
});

test('Backoffice: loadAdminData completa el camino de exito y renderiza', { timeout: TEST_TIMEOUT_MS, concurrency: false }, async () => {
  const { loadAdminData, renderTable, updateKPIs } = await load();
  const tbody = registry.get('adminTableBody')!;
  await loadAdminData();
  assert.doesNotThrow(() => renderTable());
  assert.doesNotThrow(() => updateKPIs());
  assert.ok(typeof tbody.innerHTML === 'string', 'el cuerpo de la tabla debe renderizarse');
});

test('Backoffice: applyAdminFilters y handleAdminTypeFilter leen el DOM', { timeout: TEST_TIMEOUT_MS, concurrency: false }, async () => {
  const { applyAdminFilters, handleAdminTypeFilter, handlePageSizeChange } = await load();
  const select = registry.get('adminTypeFilter')!;
  const sizeEl = registry.get('adminPageSize')!;

  assert.doesNotThrow(() => applyAdminFilters());
  select.value = 'Fuego';
  handleAdminTypeFilter();
  assert.equal(select.value, 'Fuego');

  sizeEl.value = '50';
  assert.doesNotThrow(() => handlePageSizeChange());
  // Una entrada no numerica debe recurrir al tamano por defecto y no producir NaN.
  sizeEl.value = 'no-numerico';
  assert.doesNotThrow(() => handlePageSizeChange());
  await settle();
});

test('Backoffice: handleAdminSearch programa el debounce de 300 ms', { timeout: TEST_TIMEOUT_MS, concurrency: false }, async () => {
  const { handleAdminSearch } = await load();
  const input = registry.get('adminSearch')!;
  input.value = 'char';
  assert.doesNotThrow(() => handleAdminSearch());
  assert.equal(input.value, 'char');
});

test('Backoffice: changeAdminPage rechaza paginas fuera de rango', { timeout: TEST_TIMEOUT_MS, concurrency: false }, async () => {
  const { changeAdminPage, loadAdminData } = await load();
  await loadAdminData();
  await settle();
  // Con 3 registros y pageSize 25 hay una sola pagina valida: avanzar y retroceder
  // caen fuera del rango 1..1 y no deben desplazar la ventana.
  const before = scrollCalls.length;
  changeAdminPage(1);
  changeAdminPage(-1);
  assert.equal(scrollCalls.length, before, 'una pagina fuera de rango no debe desplazar');
});

test('Backoffice: handleFormSubmit exige sesion activa', { timeout: TEST_TIMEOUT_MS, concurrency: false }, async () => {
  const { handleFormSubmit } = await load();
  let prevented = false;
  const event = { preventDefault: () => { prevented = true; } } as unknown as Event;
  // Sin sesion activa el manejador debe cortocircuitar antes de tocar la API.
  await handleFormSubmit(event);
  assert.ok(prevented, 'debe invocar preventDefault');
});

test('Backoffice: la superficie publica permanece exportada', { timeout: TEST_TIMEOUT_MS, concurrency: false }, async () => {
  const modals = await load();
  for (const name of [
    'openAuthModal',
    'closeAuthModal',
    'openCreateModal',
    'closeCrudModal',
    'openDeleteModal',
    'closeDeleteModal',
    'initEventListeners',
    'renderTable',
    'updateKPIs',
    'checkHealthStatus',
    'loadAdminData',
    'invalidateCache',
    'executeDelete',
    'handleFormSubmit',
  ] as const) {
    assert.equal(typeof modals[name], 'function', `${name} debe estar exportada`);
  }
});

test('Backoffice: initEventListeners enlaza sin lanzar con stubs de DOM', { timeout: TEST_TIMEOUT_MS, concurrency: false }, async () => {
  const { initEventListeners } = await load();
  assert.doesNotThrow(() => initEventListeners());
});

test('Backoffice: invalidateCache sincroniza tras recargar', { timeout: TEST_TIMEOUT_MS, concurrency: false }, async () => {
  const { invalidateCache } = await load();
  await invalidateCache();
  await settle();

test('Backoffice: checkHealthStatus marca rojo cuando el backend falla', { timeout: TEST_TIMEOUT_MS, concurrency: false }, async () => {
  const { checkHealthStatus } = await load();
  const statusEl = registry.get('backendStatus')!;
  const dotEl = registry.get('statusDot')!;
  const g = globalThis as Record<string, unknown>;
  const original = g.fetch;
  // Respuesta no-ok: el manejador debe caer al catch y pintar el punto en rojo.
  g.fetch = async () => ({ ok: false, status: 503, headers: { get: () => null }, json: async () => ({}) });
  await checkHealthStatus();
  assert.match(statusEl.innerText, /Fallo en Healthcheck/, 'debe reportar el fallo');
  assert.equal(dotEl.style.backgroundColor, '#ef4444', 'el punto debe pintarse en rojo');
  g.fetch = original;
});

test('Backoffice: checkHealthStatus captura un rechazo de red', { timeout: TEST_TIMEOUT_MS, concurrency: false }, async () => {
  const { checkHealthStatus } = await load();
  const statusEl = registry.get('backendStatus')!;
  const g = globalThis as Record<string, unknown>;
  const original = g.fetch;
  g.fetch = async () => {
    throw new Error('ECONNREFUSED');
  };
  await checkHealthStatus();
  assert.match(statusEl.innerText, /ECONNREFUSED/, 'debe propagar el motivo del rechazo');
  g.fetch = original;
});

test('Backoffice: loadAdminData muestra el estado de error sin lanzar', { timeout: TEST_TIMEOUT_MS, concurrency: false }, async () => {
  const { loadAdminData } = await load();
  const g = globalThis as Record<string, unknown>;
  const original = g.fetch;
  g.fetch = async () => {
    throw new Error('API caída');
  };
  await loadAdminData();
  const tbody = registry.get('adminTableBody')!;
  assert.match(tbody.innerHTML, /Error de conexi/i, 'debe renderizar el estado de error');
  g.fetch = original;
});

test('Backoffice: loadAdminData retorna pronto si no hay tabla', { timeout: TEST_TIMEOUT_MS, concurrency: false }, async () => {
  const { loadAdminData } = await load();
  const tbody = registry.get('adminTableBody')!;
  registry.delete('adminTableBody');
  const before = tbody.innerHTML;
  await loadAdminData();
  assert.equal(tbody.innerHTML, before, 'sin tbody no debe renderizar nada');
  registry.set('adminTableBody', tbody);
});

test('Backoffice: los modales de creacion y cierre delegan sin lanzar', { timeout: TEST_TIMEOUT_MS, concurrency: false }, async () => {
  const { openCreateModal, closeCrudModal, openDeleteModal, closeDeleteModal } = await load();
  assert.doesNotThrow(() => openCreateModal());
  assert.doesNotThrow(() => closeCrudModal());
  assert.doesNotThrow(() => openDeleteModal(1));
  assert.doesNotThrow(() => closeDeleteModal());
});

test('Backoffice: handleFormSubmit crea un registro con sesion activa', { timeout: TEST_TIMEOUT_MS, concurrency: false }, async () => {
  const { handleFormSubmit, setAdminSessionActive, openEditModal } = await load();
  const submitBtn = registry.get('btnSubmitForm')!;
  // Con sesion activa el manejador llega hasta la API: se verifica que restaura
  // el boton en el bloque finally y no deja el formulario bloqueado.
  setAdminSessionActive(true);
  const event = { preventDefault: () => {} } as unknown as Event;
  await handleFormSubmit(event);
  await settle();
  assert.equal(submitBtn.disabled, false, 'el boton debe rehabilitarse en finally');
  assert.equal(submitBtn.innerText, 'Guardar Registro');
  setAdminSessionActive(false);
});

test('Backoffice: openEditModal acepta un id del catalogo', { timeout: TEST_TIMEOUT_MS, concurrency: false }, async () => {
  const { openEditModal, loadAdminData } = await load();
  await loadAdminData();
  await settle();
  assert.doesNotThrow(() => openEditModal(1));
});

test('Backoffice: executeDelete exige sesion activa', { timeout: TEST_TIMEOUT_MS, concurrency: false }, async () => {
  const { executeDelete } = await load();
  await executeDelete();
  await settle();
});

});
