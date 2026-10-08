/**
 * Resume en el log de CI cuántas peticiones recibió realmente el backend del E2E y con qué estado, para
 * contrastar la hipótesis del límite de peticiones (`429`) con datos. `/metrics` está exento del
 * limitador, así que la lectura no altera lo que mide. Solo observa: nunca hace fallar la suite.
 */
export default async function globalTeardown(): Promise<void> {
  const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
  try {
    const response = await fetch(new URL('/metrics', baseURL), { signal: AbortSignal.timeout(5000) });
    if (!response.ok) {
      console.log(`[e2e-metrics] /metrics respondió ${response.status}`);
      return;
    }
    const byStatus = new Map<string, number>();
    for (const line of (await response.text()).split('\n')) {
      const match = /^pokedex_http_requests_total\{[^}]*status="(\d+)"[^}]*\} (\d+)$/.exec(line);
      if (match) byStatus.set(match[1], (byStatus.get(match[1]) ?? 0) + Number(match[2]));
    }
    const total = [...byStatus.values()].reduce((sum, count) => sum + count, 0);
    const detail = Object.fromEntries([...byStatus.entries()].sort(([a], [b]) => a.localeCompare(b)));
    console.log(`[e2e-metrics] ${JSON.stringify({ total, rateLimited: byStatus.get('429') ?? 0, byStatus: detail })}`);
  } catch (error) {
    console.log(`[e2e-metrics] no se pudo leer /metrics: ${error instanceof Error ? error.message : String(error)}`);
  }
}
