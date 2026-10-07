export function focusFirstEnabledControl(container: Element | null): boolean {
  // Un control deshabilitado no recibe foco: en la primera página el destino es "Siguiente" y en la última, "Anterior".
  const target = container?.querySelector<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled)');
  if (!target) return false;
  target.focus();
  return true;
}
