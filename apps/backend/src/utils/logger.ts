/**
 * ==============================================================================
 * Logger Estructurado con Pino (Alto Rendimiento & Correlación Distribuida)
 * ==============================================================================
 * Emite registros JSON optimizados con timestamp ISO, severidad jerárquica
 * y correlación automática de traceId mediante Node.js AsyncLocalStorage + Pino mixin.
 */

import pino from 'pino';
import { AsyncLocalStorage } from 'node:async_hooks';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogTraceContext {
  traceId: string;
}

export const traceStorage = new AsyncLocalStorage<LogTraceContext>();

const pinoBase = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level(label: string) {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: 'pokedex-api',
  },
  mixin() {
    const store = traceStorage.getStore();
    return store?.traceId ? { traceId: store.traceId } : {};
  },
});

export class PinoStructuredLogger {
  private pinoInstance: pino.Logger;

  constructor(pinoLogger: pino.Logger = pinoBase) {
    this.pinoInstance = pinoLogger;
  }

  child(bindings: pino.Bindings): PinoStructuredLogger {
    return new PinoStructuredLogger(this.pinoInstance.child(bindings));
  }

  info(message: string, context?: Record<string, unknown>, traceId?: string): void {
    const data = traceId ? { traceId, ...context } : (context || {});
    this.pinoInstance.info(data, message);
  }

  warn(message: string, context?: Record<string, unknown>, traceId?: string): void {
    const data = traceId ? { traceId, ...context } : (context || {});
    this.pinoInstance.warn(data, message);
  }

  error(message: string, context?: Record<string, unknown>, traceId?: string): void {
    const data = traceId ? { traceId, ...context } : (context || {});
    this.pinoInstance.error(data, message);
  }

  debug(message: string, context?: Record<string, unknown>, traceId?: string): void {
    const data = traceId ? { traceId, ...context } : (context || {});
    this.pinoInstance.debug(data, message);
  }

  audit(message: string, context?: Record<string, unknown>, traceId?: string): void {
    const data = { audit: true, ...(traceId ? { traceId } : {}), ...(context || {}) };
    this.pinoInstance.info(data, message);
  }

  get raw(): pino.Logger {
    return this.pinoInstance;
  }
}

export const logger = new PinoStructuredLogger(pinoBase);
