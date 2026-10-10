import { dom } from './mega_env.js';
import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  AUTOHIDE_QUERY,
  HIDDEN_CLASS,
  autoHideStickyHeader,
  createScrollTracker,
} from '../../apps/frontend/src/shared/sticky-autohide.js';

const win = dom.window;
const doc = win.document;
const ZONE = 190;

test('🫥 Seguidor: cerca del inicio la zona siempre se ve', () => {
  const t = createScrollTracker();
  assert.equal(t.update(0, ZONE, false), false);
  assert.equal(t.update(100, ZONE, false), false);
  assert.equal(t.update(ZONE, ZONE, false), false);
});

test('🫥 Seguidor: se oculta tras bajar lo suficiente y reaparece al subir', () => {
  const t = createScrollTracker();
  t.reset(300);
  assert.equal(t.update(310, ZONE, false), false, 'menos de 24 px no la oculta');
  assert.equal(t.update(330, ZONE, false), true, '30 px acumulados hacia abajo la ocultan');
  assert.equal(t.update(335, ZONE, false), true, 'sigue oculta mientras se baja');
  assert.equal(t.update(330, ZONE, false), true, 'subir menos de 12 px no la muestra');
  assert.equal(t.update(320, ZONE, false), false, '15 px acumulados hacia arriba la muestran');
});

test('🫥 Seguidor: un salto grande hacia abajo (p. ej. scroll restaurado al recargar) oculta la zona', () => {
  const t = createScrollTracker();
  assert.equal(t.update(3000, ZONE, false), true);
});

test('🫥 Seguidor: un desplazamiento lento (pocos píxeles por evento) también cuenta', () => {
  const t = createScrollTracker();
  t.reset(400);
  let hidden = false;
  for (let y = 403; y <= 440; y += 3) hidden = t.update(y, ZONE, false);
  assert.equal(hidden, true);
});

test('🫥 Seguidor: cambiar de sentido reinicia lo acumulado', () => {
  const t = createScrollTracker();
  t.reset(400);
  t.update(415, ZONE, false); // 15 hacia abajo
  t.update(408, ZONE, false); // cambia de sentido
  assert.equal(t.update(425, ZONE, false), false, 'solo hay 17 px hacia abajo desde el giro');
  assert.equal(t.update(440, ZONE, false), true);
});

test('🫥 Seguidor: sin movimiento mantiene el estado', () => {
  const t = createScrollTracker();
  t.reset(300);
  t.update(340, ZONE, false);
  assert.equal(t.update(340, ZONE, false), true);
});

test('🫥 Seguidor: con keepVisible la zona se ve y se pierde lo acumulado', () => {
  const t = createScrollTracker();
  t.reset(300);
  assert.equal(t.update(340, ZONE, false), true);
  assert.equal(t.update(360, ZONE, true), false);
  assert.equal(t.update(370, ZONE, false), false, 'vuelve a empezar de cero al soltar el anclaje');
});

test('🫥 Seguidor: volver al inicio la muestra y un scroll negativo (rebote de iOS) no la oculta', () => {
  const t = createScrollTracker();
  t.reset(500);
  t.update(540, ZONE, false);
  assert.equal(t.update(0, ZONE, false), false);
  assert.equal(t.update(-30, ZONE, false), false);
});

// --- Conector al DOM -------------------------------------------------------------------------------------

type Listener = () => void;

function fakeMatchMedia(initial: boolean) {
  const listeners = new Set<Listener>();
  const query = {
    matches: initial,
    addEventListener: (_: string, l: Listener) => listeners.add(l),
    removeEventListener: (_: string, l: Listener) => listeners.delete(l),
  };
  return {
    query,
    set(matches: boolean) {
      query.matches = matches;
      for (const l of listeners) l();
    },
    listeners,
  };
}

let zone: HTMLElement;
let stop: () => void;
let media: ReturnType<typeof fakeMatchMedia>;
const w = win as unknown as Record<string, unknown>;
const originalMatchMedia = w.matchMedia;

function scrollTo(y: number): void {
  Object.defineProperty(win, 'scrollY', { value: y, configurable: true });
  win.dispatchEvent(new win.Event('scroll'));
}

function mount(matches = true): void {
  media = fakeMatchMedia(matches);
  w.matchMedia = (q: string) => {
    assert.equal(q, AUTOHIDE_QUERY);
    return media.query;
  };
  doc.body.innerHTML = `
    <div id="stickyTop">
      <button id="filtersToggle" aria-expanded="false">Filtros</button>
      <input id="searchInput">
    </div>
    <button id="outside">fuera</button>`;
  zone = doc.getElementById('stickyTop') as HTMLElement;
  zone.getBoundingClientRect = () => ({ height: ZONE }) as DOMRect;
  stop = autoHideStickyHeader(zone);
  scrollTo(0);
}

beforeEach(() => mount());

afterEach(() => {
  stop();
  w.matchMedia = originalMatchMedia;
});

const hidden = () => zone.classList.contains(HIDDEN_CLASS);

test('🫥 Zona fija: en móvil se oculta al bajar y reaparece al subir', () => {
  scrollTo(100);
  assert.equal(hidden(), false, 'cerca del inicio se ve');
  scrollTo(400);
  assert.equal(hidden(), true);
  scrollTo(390);
  assert.equal(hidden(), true, 'subir poco no la muestra');
  scrollTo(380);
  assert.equal(hidden(), false);
});

test('🫥 Zona fija: fuera de móvil nunca se oculta', () => {
  stop();
  mount(false);

  scrollTo(300);
  scrollTo(500);

  assert.equal(hidden(), false);
});

test('🫥 Zona fija: si la pantalla deja de ser de móvil, reaparece', () => {
  scrollTo(400);
  assert.equal(hidden(), true);

  media.set(false);

  assert.equal(hidden(), false);
});

test('🫥 Zona fija: con el panel de filtros abierto no se oculta', () => {
  scrollTo(300);
  assert.equal(hidden(), true);
  (doc.getElementById('filtersToggle') as HTMLElement).setAttribute('aria-expanded', 'true');

  scrollTo(400);
  scrollTo(500);

  assert.equal(hidden(), false);
});

test('🫥 Zona fija: mientras el foco está dentro no se oculta', () => {
  scrollTo(300);
  assert.equal(hidden(), true);
  (doc.getElementById('searchInput') as HTMLElement).focus();

  scrollTo(500);

  assert.equal(hidden(), false);
});

test('🫥 Zona fija: recibir foco con el teclado la muestra', () => {
  scrollTo(300);
  assert.equal(hidden(), true);

  zone.dispatchEvent(new win.Event('focusin', { bubbles: true }));

  assert.equal(hidden(), false);
});

test('🫥 Zona fija: tras recibir foco hay que volver a bajar lo suficiente para ocultarla', () => {
  scrollTo(300);
  zone.dispatchEvent(new win.Event('focusin', { bubbles: true }));
  (doc.getElementById('outside') as HTMLElement).focus();

  scrollTo(310);
  assert.equal(hidden(), false);
  scrollTo(340);
  assert.equal(hidden(), true);
});

test('🫥 Zona fija: la función devuelta deja de escuchar y la muestra', () => {
  scrollTo(300);
  assert.equal(hidden(), true);

  stop();
  assert.equal(hidden(), false);
  assert.equal(media.listeners.size, 0);

  scrollTo(600);
  assert.equal(hidden(), false);
});

test('🫥 Zona fija: registrar dos veces sobre el mismo elemento no duplica los oyentes', () => {
  const second = autoHideStickyHeader(zone);

  assert.equal(media.listeners.size, 1);
  second();
  assert.equal(media.listeners.size, 0);
});

test('🫥 Zona fija: sin elemento o sin matchMedia no hace nada', () => {
  assert.doesNotThrow(autoHideStickyHeader(null));
  w.matchMedia = undefined;
  assert.doesNotThrow(autoHideStickyHeader(zone));
});

test('🫥 Zona fija: la hoja de estilos desplaza la zona oculta fuera de la ventana solo en móvil', () => {
  const css = readFileSync(new URL('../../apps/frontend/public/css/style.css', import.meta.url), 'utf8');
  const mobile = css.slice(css.indexOf('@media (max-width: 600px)'));

  assert.match(mobile, /\.sticky-top\.is-hidden\s*\{[^}]*translateY\(-100%\)/);
  assert.doesNotMatch(css.slice(0, css.indexOf('@media (max-width: 600px)')), /\.sticky-top\.is-hidden/);
  assert.match(mobile, /prefers-reduced-motion: reduce\)\s*\{\s*\.sticky-top\s*\{\s*transition:\s*none/);
});
