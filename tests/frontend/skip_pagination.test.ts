import { doc, documentReady, dom, indexDoc, mountIndexPage, serveCatalog } from './catalog_page.js';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { changePage, initInteractiveListeners, loadPokemons, renderPokemons } from '../../apps/frontend/src/pokedex.js';
import { focusFirstEnabledControl } from '../../apps/frontend/src/shared/skip-link.js';
import type { Pokemon } from '../../apps/frontend/src/types.js';

/**
 * Enlace "Saltar a la paginación": con 48 tarjetas por página, llegar a "Siguiente" con el teclado
 * costaba hasta 48 pulsaciones de Tab. El enlace mueve el foco a la barra sin tocar la URL (la
 * aplicación conserva `location.hash` al guardar los filtros, así que un ancla real lo contaminaría).
 */

const mk = (id: number): Pokemon => ({
  id,
  nombre: `Pokemon ${id}`,
  tipo: 'Normal',
  fuerza: 10,
  imagen: '',
  caracteristicas: { peso: 1, altura: 1, habitat: 'x' },
});
const catalogOf = (n: number): Pokemon[] => Array.from({ length: n }, (_, i) => mk(i + 1));
let restoreFetch: () => void;

const link = (): HTMLAnchorElement => doc.getElementById('skipToPagination') as HTMLAnchorElement;
const click = (): MouseEvent => {
  const event = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true });
  link().dispatchEvent(event);
  return event;
};

before(async () => {
  await documentReady();
  // Marcado real de `index.html`: el enlace, el catálogo y la barra de paginación.
  mountIndexPage(['#skipToPagination', '#pokemonGrid', '#paginationBar'], '<div id="toastContainer"></div>');
  restoreFetch = serveCatalog(catalogOf(96));
  await loadPokemons();
  initInteractiveListeners();
  // `changePage` lleva la vista al catálogo con `scrollIntoView`, que jsdom no implementa.
  (doc.getElementById('pokemonGrid') as HTMLElement).scrollIntoView = (() =>
    undefined) as HTMLElement['scrollIntoView'];
});

after(() => {
  restoreFetch();
});

test('♿ Estructura: el enlace precede al catálogo y la barra es una navegación con nombre', () => {
  const a = indexDoc.getElementById('skipToPagination');
  const grid = indexDoc.getElementById('pokemonGrid');
  const bar = indexDoc.getElementById('paginationBar');
  assert.ok(a && grid && bar, 'deben existir el enlace, el catálogo y la barra');
  assert.equal(a.tagName, 'A');
  assert.equal(a.getAttribute('href'), '#paginationBar');
  assert.equal(
    a.compareDocumentPosition(grid) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
    dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
    'el enlace va antes del catálogo, donde empiezan las tarjetas',
  );
  assert.equal(bar.tagName, 'NAV');
  assert.ok(bar.getAttribute('aria-label')?.trim(), 'la navegación necesita un nombre accesible');
});

test('♿ Con varias páginas el enlace es visible y el clic lleva el foco a "Siguiente" en la primera', () => {
  renderPokemons();
  assert.equal(link().hidden, false);
  const event = click();
  assert.equal(event.defaultPrevented, true, 'el ancla no navega: la URL no cambia');
  assert.equal(doc.activeElement?.id, 'btnNextPage', '"Anterior" está deshabilitado en la página 1');
});

test('♿ En la última página el foco cae en "Anterior"', () => {
  changePage(1);
  assert.equal((doc.getElementById('btnNextPage') as HTMLButtonElement).disabled, true);
  click();
  assert.equal(doc.activeElement?.id, 'btnPrevPage');
  changePage(-1);
});

test('♿ El clic no deja rastro en la URL', () => {
  const href = dom.window.location.href;
  click();
  assert.equal(dom.window.location.hash, '');
  assert.equal(dom.window.location.href, href);
});

test('♿ El enlace sobrevive a un nuevo render del catálogo (está fuera del contenedor que se reemplaza)', () => {
  const a = link();
  renderPokemons();
  assert.equal(doc.getElementById('skipToPagination'), a);
  assert.equal(doc.getElementById('pokemonGrid')?.contains(a), false);
});

test('♿ Con una sola página o sin resultados el enlace queda oculto', async () => {
  serveCatalog(catalogOf(3));
  await loadPokemons();
  assert.equal(link().hidden, true, 'una página: no hay nada que saltar');
  assert.equal(doc.getElementById('paginationBar')?.classList.contains('hidden'), true);

  serveCatalog([]);
  await loadPokemons();
  assert.equal(link().hidden, true, 'sin resultados');

  serveCatalog(catalogOf(96));
  await loadPokemons();
  assert.equal(link().hidden, false, 'vuelve a mostrarse cuando hay paginación');
});

test('♿ focusFirstEnabledControl: ignora controles deshabilitados y no falla sin barra', () => {
  const holder = doc.createElement('div');
  holder.innerHTML = '<button disabled id="a">a</button><button id="b">b</button>';
  doc.body.append(holder);
  assert.equal(focusFirstEnabledControl(holder), true);
  assert.equal(doc.activeElement?.id, 'b');
  assert.equal(focusFirstEnabledControl(null), false);
  holder.innerHTML = '<button disabled>x</button>';
  assert.equal(focusFirstEnabledControl(holder), false, 'sin controles habilitados no hay a dónde ir');
  holder.remove();
});
