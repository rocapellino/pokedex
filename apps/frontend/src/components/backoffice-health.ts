/**
 * Monitor de salud del backend y clúster para Pokédex Backoffice
 */

import { errorMessage } from '../shared/index.js';

export async function checkHealthStatus(): Promise<void> {
  const statusEl = document.getElementById('backendStatus');
  const dotEl = document.getElementById('statusDot');
  if (!statusEl || !dotEl) return;

  const startTime = performance.now();
  try {
    const res = await fetch('/healthz');
    const elapsed = Math.round(performance.now() - startTime);
    if (res.ok) {
      statusEl.innerText = `Kubernetes & Backend Saludables (${elapsed}ms)`;
      dotEl.style.backgroundColor = '#10b981';
      dotEl.style.boxShadow = '0 0 8px #10b981';
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (err) {
    statusEl.innerText = `Fallo en Healthcheck: ${errorMessage(err)}`;
    dotEl.style.backgroundColor = '#ef4444';
    dotEl.style.boxShadow = '0 0 8px #ef4444';
  }
}
