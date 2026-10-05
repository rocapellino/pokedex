export const AI_TIMEOUT_MS = 12000;

// ==============================================================================
// Patrón Circuit Breaker para Resiliencia de Servicios de IA
// ==============================================================================
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  failureThreshold: number; // Número consecutivo de fallos para abrir el circuito
  cooldownMs: number; // Tiempo de espera en milisegundos antes de intentar reabrir
}

export class AICircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = {
      failureThreshold: config.failureThreshold ?? 3,
      cooldownMs: config.cooldownMs ?? 30000,
    };
  }

  getState(): CircuitState {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.config.cooldownMs) {
        this.state = 'HALF_OPEN';
      }
    }
    return this.state;
  }

  canExecute(): boolean {
    const currentState = this.getState();
    return currentState === 'CLOSED' || currentState === 'HALF_OPEN';
  }

  recordSuccess(): void {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.config.failureThreshold) {
      this.state = 'OPEN';
    }
  }

  reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.lastFailureTime = 0;
  }

  getFailureCount(): number {
    return this.failureCount;
  }

  isOpen(): boolean {
    return this.getState() === 'OPEN';
  }
}

export const aiCircuitBreaker = new AICircuitBreaker();

/**
 * Envoltorio de resiliencia con cancelación preventiva ante demoras extremas del proveedor de IA.
 * Previene acumulación de conexiones abiertas y garantiza degradación elegante hacia fallback local.
 */
export async function withTimeout<T>(promise: Promise<T>, timeoutMs = AI_TIMEOUT_MS): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Timeout de servicio IA: la llamada excedió el límite de ${timeoutMs}ms`));
    }, timeoutMs).unref();
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}
