/** Mismo corte que el CSS compacto de móvil (`style.css`): solo ahí la zona fija ocupa demasiada pantalla. */
export const AUTOHIDE_QUERY = '(max-width: 600px)';
/** Clase que desplaza la zona fija fuera de la ventana (`style.css`). */
export const HIDDEN_CLASS = 'is-hidden';

/** Desplazamiento acumulado hacia abajo que oculta la zona; los saltos pequeños no la parpadean. */
const HIDE_AFTER_PX = 24;
/** Desplazamiento acumulado hacia arriba que la muestra: reaparece antes de lo que tarda en ocultarse. */
const SHOW_AFTER_PX = 12;

export interface ScrollTracker {
  /** Devuelve si la zona debe estar oculta tras llegar a la posición `y`. */
  update(y: number, zoneHeight: number, keepVisible: boolean): boolean;
  /** Descarta el desplazamiento acumulado (p. ej. al recibir foco) y toma `y` como referencia. */
  reset(y: number): void;
}

/**
 * Decide cuándo ocultar la zona según la dirección del desplazamiento. Acumula el recorrido en cada
 * dirección (un desplazamiento lento de pocos píxeles por evento también cuenta) y lo reinicia al
 * cambiar de sentido. Cerca del inicio, o con `keepVisible`, la zona siempre se ve.
 */
export function createScrollTracker(hideAfter = HIDE_AFTER_PX, showAfter = SHOW_AFTER_PX): ScrollTracker {
  let lastY = 0;
  let travel = 0;
  let hidden = false;

  return {
    update(y, zoneHeight, keepVisible) {
      const dy = y - lastY;
      lastY = y;
      if (keepVisible || y <= zoneHeight) {
        travel = 0;
        hidden = false;
        return false;
      }
      if (dy === 0) return hidden;
      travel = Math.sign(dy) === Math.sign(travel) ? travel + dy : dy;
      if (travel >= hideAfter) hidden = true;
      else if (travel <= -showAfter) hidden = false;
      return hidden;
    },
    reset(y) {
      lastY = y;
      travel = 0;
      hidden = false;
    },
  };
}

/**
 * `true` si el foco está dentro de la zona y es visible: teclado, o un campo de texto (con el teclado en
 * pantalla). El foco que deja un toque o un clic en un botón no cuenta; si no, tras usar el tema o
 * «Filtros» la zona se quedaría fija hasta tocar en otro sitio.
 */
function hasVisibleFocusWithin(zone: HTMLElement): boolean {
  const focused = document.activeElement;
  if (!focused || !zone.contains(focused)) return false;
  try {
    return focused.matches(':focus-visible');
  } catch {
    return true; // entornos sin :focus-visible: ante la duda, no ocultar bajo el foco
  }
}

const active = new WeakMap<HTMLElement, () => void>();

/**
 * En móvil la zona fija se oculta al bajar y reaparece al subir, para no quitar casi un cuarto de la
 * pantalla mientras se lee el catálogo. Se mantiene a la vista con el panel de filtros (o el desplegable de
 * tipos) abierto y mientras haya foco visible dentro de ella (teclado o campo de texto); recibir foco la
 * muestra. Fuera de
 * móvil no hace nada. Devuelve una función que deja de observar; llamarla de nuevo sobre el mismo
 * elemento sustituye a la anterior.
 */
export function autoHideStickyHeader(el: HTMLElement | null = document.getElementById('stickyTop')): () => void {
  if (!el) return () => {};
  active.get(el)?.();

  const query = window.matchMedia?.(AUTOHIDE_QUERY);
  if (!query) return () => {};

  const tracker = createScrollTracker();
  const show = () => el.classList.remove(HIDDEN_CLASS);

  const onScroll = () => {
    if (!query.matches) {
      show();
      return;
    }
    const pinned = el.querySelector('[aria-expanded="true"]') !== null || hasVisibleFocusWithin(el);
    const hidden = tracker.update(window.scrollY, el.getBoundingClientRect().height, pinned);
    el.classList.toggle(HIDDEN_CLASS, hidden);
  };
  const onFocusIn = () => {
    tracker.reset(window.scrollY);
    show();
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  el.addEventListener('focusin', onFocusIn);
  query.addEventListener?.('change', onScroll);

  const stop = () => {
    window.removeEventListener('scroll', onScroll);
    el.removeEventListener('focusin', onFocusIn);
    query.removeEventListener?.('change', onScroll);
    show();
    active.delete(el);
  };
  active.set(el, stop);
  return stop;
}
