/**
 * Mueve el foco al primer control habilitado de `container` (por ejemplo, la barra de paginación).
 * Devuelve `true` si lo movió. Un control deshabilitado no recibe foco, así que en la primera página
 * el destino es "Siguiente" y en la última, "Anterior".
 */
export function focusFirstEnabledControl(container: Element | null): boolean {
  const target = container?.querySelector<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled)');
  if (!target) return false;
  target.focus();
  return true;
}
