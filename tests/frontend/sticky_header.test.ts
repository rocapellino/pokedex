import { dom } from './mega_env.js';
import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STICKY_HEIGHT_VAR, trackStickyHeight } from '../../apps/frontend/src/shared/sticky-header.js';

const win = dom.window;
const g = globalThis as Record<string, unknown>;
const originalObserver = g.ResizeObserver;

/** Elemento cuya altura se controla desde la prueba (jsdom no hace maquetación). */
function boxWithHeight(initial: number): { el: HTMLElement; setHeight: (h: number) => void } {
  const el = win.document.createElement('div');
  let height = initial;
  el.getBoundingClientRect = () => ({ height }) as DOMRect;
  return {
    el,
    setHeight: (h) => {
      height = h;
    },
  };
}

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  observed: Element[] = [];
  disconnected = false;
  constructor(private readonly callback: () => void) {
    FakeResizeObserver.instances.push(this);
  }
  observe(el: Element): void {
    this.observed.push(el);
  }
  disconnect(): void {
    this.disconnected = true;
  }
  fire(): void {
    this.callback();
  }
}

afterEach(() => {
  g.ResizeObserver = originalObserver;
  FakeResizeObserver.instances = [];
});

test('📌 Zona fija: publica la altura redondeada hacia arriba en la variable CSS del documento', () => {
  const { el } = boxWithHeight(189.4);
  const root = win.document.createElement('html');

  trackStickyHeight(el, root);

  assert.equal(root.style.getPropertyValue(STICKY_HEIGHT_VAR), '190px');
});

test('📌 Zona fija: vuelve a publicar la altura cuando el observador detecta un cambio de tamaño', () => {
  g.ResizeObserver = FakeResizeObserver;
  const { el, setHeight } = boxWithHeight(190);
  const root = win.document.createElement('html');

  trackStickyHeight(el, root);
  assert.deepEqual(FakeResizeObserver.instances[0]?.observed, [el]);
  assert.equal(root.style.getPropertyValue(STICKY_HEIGHT_VAR), '190px');

  setHeight(481); // el panel de filtros se abre
  FakeResizeObserver.instances[0]?.fire();
  assert.equal(root.style.getPropertyValue(STICKY_HEIGHT_VAR), '481px');

  setHeight(190); // y se cierra
  FakeResizeObserver.instances[0]?.fire();
  assert.equal(root.style.getPropertyValue(STICKY_HEIGHT_VAR), '190px');
});

test('📌 Zona fija: la función devuelta deja de observar', () => {
  g.ResizeObserver = FakeResizeObserver;
  const { el } = boxWithHeight(190);

  const stop = trackStickyHeight(el, win.document.createElement('html'));
  stop();

  assert.equal(FakeResizeObserver.instances[0]?.disconnected, true);
});

test('📌 Zona fija: sin ResizeObserver publica la altura una vez y sin fallar', () => {
  g.ResizeObserver = undefined;
  const { el } = boxWithHeight(200);
  const root = win.document.createElement('html');

  const stop = trackStickyHeight(el, root);

  assert.equal(root.style.getPropertyValue(STICKY_HEIGHT_VAR), '200px');
  assert.doesNotThrow(stop);
});

test('📌 Zona fija: sin elemento no hace nada', () => {
  const root = win.document.createElement('html');

  const stop = trackStickyHeight(null, root);

  assert.equal(root.style.getPropertyValue(STICKY_HEIGHT_VAR), '');
  assert.doesNotThrow(stop);
});

test('📌 Zona fija: el HTML la compone de cabecera, búsqueda y filtros, y deja fuera el catálogo', () => {
  const html = readFileSync(new URL('../../apps/frontend/index.html', import.meta.url), 'utf8');
  const doc = new win.DOMParser().parseFromString(html, 'text/html');
  const zone = doc.getElementById('stickyTop');

  assert.ok(zone, 'existe #stickyTop');
  assert.ok(zone.querySelector('header.navbar'), 'incluye la cabecera');
  assert.ok(zone.querySelector('[data-theme-val="dark"]'), 'incluye el selector de tema');
  assert.ok(zone.querySelector('#searchInput'), 'incluye el buscador');
  assert.ok(zone.querySelector('#filtersToggle'), 'incluye el botón de filtros');
  assert.ok(zone.querySelector('#moreFilters'), 'incluye el panel de filtros');
  for (const id of ['pokemonGrid', 'paginationBar', 'activeFilters', 'resultsSummary']) {
    assert.equal(zone.querySelector(`#${id}`), null, `#${id} no debe quedar dentro de la zona fija`);
  }
});

test('📌 Zona fija: la hoja de estilos la pega arriba y reserva su altura para anclas y saltos de página', () => {
  const css = readFileSync(new URL('../../apps/frontend/public/css/style.css', import.meta.url), 'utf8');
  const block = (selector: string): string => {
    const start = css.indexOf(`${selector} {`);
    assert.notEqual(start, -1, `existe la regla ${selector}`);
    return css.slice(start, css.indexOf('}', start));
  };

  assert.match(block('.sticky-top'), /position:\s*sticky/);
  assert.match(block('.sticky-top'), /top:\s*-/);
  assert.match(block('html'), /scroll-padding-top:[^;]*var\(--sticky-top-height/);
  assert.match(block('.pokemon-grid'), /scroll-margin-top:[^;]*var\(--sticky-top-height/);
});
