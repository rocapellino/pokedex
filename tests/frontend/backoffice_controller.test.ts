/**
 * Pruebas unitarias del controlador de `backoffice.ts`.
 *
 * Contexto: el Quality Gate de Sonar exige >= 80 % de cobertura en New Code y mide
 * el archivo completo, no solo las lineas modificadas. `backoffice.ts` solo se
 * ejercitaba via Playwright (`tests/e2e/`, glob `*.spec.ts`), cuyo glob queda fuera de
 * `test:coverage` (`tests/**\/!(*fuzzing*).test.ts`), de modo que cualquier cambio en
 * el archivo bloqueaba el merge con 0 % de cobertura.
 *
 * `backoffice.ts` es un controlador de navegador. Se monta un DOM real con jsdom en un
 * modulo auxiliar (`backoffice_env.ts`), de modo que la cadena de imports (incluido
 * DOMPurify en `sanitizer.ts`) se inicializa igual que en el navegador. jsdom no depende de
 * ninguna capacidad experimental del runner, a diferencia de `mock.module`, que se
 * cancelaba con `cancelledByParent` en CI con Node 22 pese a pasar en local con Node 24.
 *
 * El montaje vive en un modulo aparte por el orden de evaluacion de ESM: los `import` se
 * evaluan antes que cualquier sentencia, de modo que un import estatico de
 * `backoffice.ts` en el tope de este archivo exigiria que el DOM ya estuviera montado.
 */

import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
// El orden de los imports es significativo: `backoffice_env` monta el DOM y debe
// evaluarse ANTES que `backoffice`, cuyo import aparece mas abajo en este archivo.
import { dom, scrollCalls } from './backoffice_env.js';

type Pokemon = {
  id: number;
  nombre: string;
  tipo: string;
  tipos: string[];
  fuerza: number;
  imagen?: string;
};

/** Catálogo de la API: 3 specimens permiten paginar (pageSize 2 -> 2 páginas). */
const CATALOG: Pokemon[] = [
  { id: 1, nombre: 'Bulbasaur', tipo: 'Planta', tipos: ['Planta'], fuerza: 49 },
  { id: 4, nombre: 'Charmander', tipo: 'Fuego', tipos: ['Fuego'], fuerza: 52 },
  { id: 7, nombre: 'Squirtle', tipo: 'Agua', tipos: ['Agua'], fuerza: 44 },
];

const realSetInterval = globalThis.setInterval;
const realClearInterval = globalThis.clearInterval;
const realFetch = globalThis.fetch;

/**
 * Acceso al modulo bajo prueba.
 *
 * El import es ESTATICO a proposito: el instrumentado de V8 de Node no registra para
 * cobertura los modulos cargados con `import()` dinamico, por lo que un import dinamico
 * dejaba `backoffice.ts` fuera de `coverage/lcov.info` y Sonar reportaba 0 % de New Code
 * pese a que los tests se ejecutaban y pasaban.
 */
import * as backoffice from '../../apps/frontend/src/backoffice.js';

const load = async (): Promise<typeof backoffice> => backoffice;

/** Espera a que las promesas en vuelo de los manejadores se resuelvan. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

after(() => {
  const g = globalThis as Record<string, unknown>;
  g.setInterval = realSetInterval;
  g.clearInterval = realClearInterval;
  g.fetch = realFetch;
  dom.window.close();
  realClearInterval.call(globalThis, 0);
});

beforeEach(() => {
  const g = globalThis as Record<string, unknown>;
  g.fetch = async (url: string | URL) => {
    const href = String(url);
    if (href.includes('/healthz')) {
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({}) };
    }
    // `fetchPokemonsWithCount` lee el total de la cabecera `X-Total-Count`.
    return {
      ok: true,
      status: 200,
      headers: { get: (n: string) => (n === 'X-Total-Count' ? String(CATALOG.length) : null) },
      json: async () => CATALOG,
    };
  };
});

test('Backoffice: checkHealthStatus reporta backend saludable', async () => {
  const { checkHealthStatus } = await load();
  await checkHealthStatus();
  const status = document.getElementById('backendStatus')!;
  const dot = document.getElementById('statusDot')!;
  assert.match(status.textContent ?? '', /Saludables/, 'el estado debe indicar salud');
  assert.equal(dot.style.backgroundColor, 'rgb(16, 185, 129)', 'el punto debe pintarse en verde');
});

test('Backoffice: checkHealthStatus marca rojo ante respuesta no-ok', async () => {
  const { checkHealthStatus } = await load();
  const g = globalThis as Record<string, unknown>;
  g.fetch = async () => ({ ok: false, status: 503, headers: { get: () => null }, json: async () => ({}) });
  await checkHealthStatus();
  const status = document.getElementById('backendStatus')!;
  const dot = document.getElementById('statusDot')!;
  assert.match(status.textContent ?? '', /Fallo en Healthcheck/, 'debe reportar el fallo');
  assert.equal(dot.style.backgroundColor, 'rgb(239, 68, 68)', 'el punto debe pintarse en rojo');
});

test('Backoffice: checkHealthStatus captura un rechazo de red', async () => {
  const { checkHealthStatus } = await load();
  const g = globalThis as Record<string, unknown>;
  g.fetch = async () => {
    throw new Error('ECONNREFUSED');
  };
  await checkHealthStatus();
  const status = document.getElementById('backendStatus')!;
  assert.match(status.textContent ?? '', /ECONNREFUSED/, 'debe propagar el motivo');
});

test('Backoffice: checkHealthStatus retorna pronto sin elementos de estado', async () => {
  const { checkHealthStatus } = await load();
  const dot = document.getElementById('statusDot')!;
  dot.remove();
  await checkHealthStatus();
  dot.id = 'statusDot';
  document.body.appendChild(dot);
});

test('Backoffice: loadAdminData completa el camino de exito', async () => {
  const { loadAdminData } = await load();
  await loadAdminData();
  const tbody = document.getElementById('adminTableBody')!;
  assert.match(tbody.innerHTML, /Bulbasaur/, 'debe renderizar el catálogo recibido');
});

test('Backoffice: loadAdminData muestra el estado de error sin lanzar', async () => {
  const { loadAdminData } = await load();
  const g = globalThis as Record<string, unknown>;
  g.fetch = async () => {
    throw new Error('API caída');
  };
  await loadAdminData();
  const tbody = document.getElementById('adminTableBody')!;
  assert.match(tbody.innerHTML, /Error de conexi/i, 'debe renderizar el error');
});

test('Backoffice: handlePageSizeChange aplica el valor seleccionado', async () => {
  const { handlePageSizeChange } = await load();
  const sizeEl = document.getElementById('adminPageSize') as HTMLSelectElement;
  sizeEl.value = '2';
  handlePageSizeChange();
  await settle();
  assert.equal(sizeEl.value, '2');
});

test('Backoffice: handleAdminSearch programa el debounce', async () => {
  const { handleAdminSearch } = await load();
  const input = document.getElementById('adminSearch') as HTMLInputElement;
  input.value = 'char';
  handleAdminSearch();
  assert.equal(input.value, 'char');
  await settle();
});

test('Backoffice: changeAdminPage navega dentro del rango y rechaza el exterior', async () => {
  const { changeAdminPage, loadAdminData, handlePageSizeChange } = await load();
  const sizeEl = document.getElementById('adminPageSize') as HTMLSelectElement;
  sizeEl.value = '2';
  handlePageSizeChange();
  await loadAdminData();
  await settle();

  // 3 specimens con pageSize 2 -> 2 paginas: avanzar es valido y desplaza la ventana.
  const before = scrollCalls.length;
  changeAdminPage(1);
  assert.equal(scrollCalls.length, before + 1, 'avanzar de pagina debe desplazar la ventana');
  // Retroceder una vez regresa a la página 1 (válido y desplaza).
  changeAdminPage(-1);
  assert.equal(scrollCalls.length, before + 2, 'retroceder a pagina valida debe desplazar');
  // Retroceder otra vez intenta ir a la pagina 0, fuera de rango: no debe desplazar.
  const after = scrollCalls.length;
  changeAdminPage(-1);
  assert.equal(scrollCalls.length, after, 'retroceder fuera de rango no debe desplazar');
});

test('Backoffice: handleFormSubmit exige sesion activa', async () => {
  const { handleFormSubmit } = await load();
  let prevented = false;
  const event = new dom.window.Event('submit');
  event.preventDefault = () => {
    prevented = true;
  };
  await handleFormSubmit(event as unknown as Event);
  assert.ok(prevented, 'debe invocar preventDefault');
});

test('Backoffice: los modales delegan sin lanzar', async () => {
  const modals = await load();
  assert.doesNotThrow(() => modals.openCreateModal());
  assert.doesNotThrow(() => modals.closeCrudModal());
  assert.doesNotThrow(() => modals.openEditModal(1));
  assert.doesNotThrow(() => modals.openDeleteModal(1));
  assert.doesNotThrow(() => modals.closeDeleteModal());
  assert.doesNotThrow(() => modals.openAuthModal());
  assert.doesNotThrow(() => modals.closeAuthModal());
});

test('Backoffice: executeDelete exige sesion activa', async () => {
  const { executeDelete } = await load();
  await executeDelete();
  await settle();
});

test('Backoffice: invalidateCache sincroniza tras recargar', async () => {
  const { invalidateCache } = await load();
  await invalidateCache();
  await settle();
});

test('Backoffice: initEventListeners enlaza sin lanzar', async () => {
  const { initEventListeners } = await load();
  assert.doesNotThrow(() => initEventListeners());
});

test('Backoffice: la superficie publica permanece exportada', async () => {
  const modals = await load();
  for (const name of [
    'openAuthModal',
    'closeAuthModal',
    'checkHealthStatus',
    'loadAdminData',
    'applyAdminFilters',
    'handleAdminSearch',
    'handleAdminTypeFilter',
    'handlePageSizeChange',
    'renderTable',
    'changeAdminPage',
    'updateKPIs',
    'openCreateModal',
    'openEditModal',
    'closeCrudModal',
    'handleFormSubmit',
    'openDeleteModal',
    'closeDeleteModal',
    'executeDelete',
    'invalidateCache',
    'initEventListeners',
  ] as const) {
    assert.equal(typeof modals[name], 'function', `${name} debe estar exportada`);
  }
});


test('Backoffice: handleFormSubmit con sesion activa rehabilita el boton', async () => {
  const { handleFormSubmit, setAdminSessionActive } = await load();
  setAdminSessionActive(true);
  const btn = document.getElementById('btnSubmitForm') as HTMLButtonElement;
  const event = new dom.window.Event('submit');
  event.preventDefault = () => {};
  await handleFormSubmit(event as unknown as Event);
  await settle();
  assert.equal(btn.disabled, false, 'el boton debe rehabilitarse en finally');
  assert.equal(btn.textContent, 'Guardar Registro');
  setAdminSessionActive(false);
});

test('Backoffice: applyAdminFilters recarga los datos', async () => {
  const { applyAdminFilters } = await load();
  applyAdminFilters();
  await settle();
  const tbody = document.getElementById('adminTableBody')!;
  assert.match(tbody.innerHTML, /Bulbasaur/);
});

test('Backoffice: handleAdminTypeFilter lee el valor del selector', async () => {
  const { handleAdminTypeFilter } = await load();
  const select = document.getElementById('adminTypeFilter') as HTMLSelectElement;
  select.value = 'Fuego';
  handleAdminTypeFilter();
  assert.equal(select.value, 'Fuego');
  await settle();
});
