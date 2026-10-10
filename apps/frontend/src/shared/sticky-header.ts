/** Variable CSS con la altura de la zona fija; `style.css` la usa para no tapar anclas, foco ni el salto de página. */
export const STICKY_HEIGHT_VAR = '--sticky-top-height';

/**
 * Publica la altura de la zona fija (cabecera, búsqueda y panel de filtros). Cambia al abrir el panel, al
 * envolver controles en móvil o al girar el dispositivo, así que se observa en vez de calcularla una vez.
 * Devuelve una función que deja de observar.
 */
export function trackStickyHeight(
  el: HTMLElement | null = document.getElementById('stickyTop'),
  root: HTMLElement = document.documentElement,
): () => void {
  if (!el) return () => {};
  const publish = () => root.style.setProperty(STICKY_HEIGHT_VAR, `${Math.ceil(el.getBoundingClientRect().height)}px`);
  publish();
  if (typeof ResizeObserver === 'undefined') return () => {};
  const observer = new ResizeObserver(publish);
  observer.observe(el);
  return () => observer.disconnect();
}
