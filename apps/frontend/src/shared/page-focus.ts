/** Texto que anuncia un lector de pantalla al cambiar de página: página, total y Pokémon mostrados. */
export function pageAnnouncement(page: number, totalPages: number, shown: number): string {
  return `Página ${page} de ${totalPages}, ${shown} Pokémon`;
}

/**
 * Lleva el foco y la vista al principio del catálogo tras cambiar de página. El foco no puede quedarse
 * en "Siguiente" o "Anterior": en los extremos el botón pasa a `disabled` y el foco caería en BODY.
 * `preventScroll` evita un segundo desplazamiento; el movimiento se omite si el usuario lo pidió.
 */
export function revealResults(grid: HTMLElement): void {
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  grid.focus({ preventScroll: true });
  grid.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
}
