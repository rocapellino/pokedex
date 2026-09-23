// ---------------------------------------------------------------------------
// Estado del ciclo de vida del proceso para Kubernetes y Graceful Shutdown
// ---------------------------------------------------------------------------
let isShuttingDown = false;

export function getLifecycleStatus(): { isShuttingDown: boolean } {
  return { isShuttingDown };
}

export function setShuttingDownForTest(val: boolean): void {
  isShuttingDown = val;
}

export function setIsShuttingDown(val: boolean): void {
  isShuttingDown = val;
}
