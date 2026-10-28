/**
 * Monitor de salud del backend y clúster para Pokédex Backoffice
 */

import { errorMessage } from '../shared/index.js';
import type { ServiceVersionResponse } from '../types.js';

/**
 * AUD-ARCH-ROUTE-001: `/healthz` lo responde nginx sin consultar la API (y el borde de
 * ingress-nginx lo bloquea); `/api/v1/version` llega a la API en todos los entornos.
 */
const HEALTH_ENDPOINT = '/api/v1/version';

function paintDot(dotEl: HTMLElement, color: string): void {
  dotEl.style.backgroundColor = color;
  dotEl.style.boxShadow = `0 0 8px ${color}`;
}

export async function checkHealthStatus(): Promise<void> {
  const statusEl = document.getElementById('backendStatus');
  const dotEl = document.getElementById('statusDot');
  if (!statusEl || !dotEl) return;

  const startTime = performance.now();
  try {
    const res = await fetch(HEALTH_ENDPOINT);
    const elapsed = Math.round(performance.now() - startTime);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const body = (await res.json()) as Partial<ServiceVersionResponse>;
    if (body.database?.postgres_connected === false) {
      statusEl.textContent = `Backend en modo degradado: PostgreSQL no disponible (${elapsed}ms)`;
      paintDot(dotEl, '#f59e0b');
      return;
    }
    statusEl.textContent = `Kubernetes & Backend Saludables (${elapsed}ms)`;
    paintDot(dotEl, '#10b981');
  } catch (err) {
    statusEl.textContent = `Fallo en Healthcheck: ${errorMessage(err)}`;
    paintDot(dotEl, '#ef4444');
  }
}
