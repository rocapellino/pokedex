/**
 * ==============================================================================
 * @pokedex/contracts - Contratos de Servicios de Inteligencia Artificial
 * ==============================================================================
 */

export interface AIMockupResponse {
  html_code: string;
  framework?: string;
  explanation?: string;
}

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface AICircuitBreakerConfig {
  failureThreshold?: number;
  recoveryTimeMs?: number;
  timeoutMs?: number;
}
