/**
 * ==============================================================================
 * Logger Estructurado JSON de Alto Rendimiento (Pino / Loki Compatible)
 * ==============================================================================
 * Escribe registros en formato JSON estándar con timestamp ISO, severidad jerárquica
 * y soporte para inyección de identificadores de correlación distribuida (traceId)
 * mediante Node.js AsyncLocalStorage o paso explícito.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_WEIGHTS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const CURRENT_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

export interface LogTraceContext {
  traceId: string;
}

export const traceStorage = new AsyncLocalStorage<LogTraceContext>();

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  traceId?: string;
  context?: Record<string, unknown>;
  [key: string]: unknown;
}

export class StructuredLogger {
  private defaultContext: Record<string, unknown>;

  constructor(defaultContext: Record<string, unknown> = {}) {
    this.defaultContext = defaultContext;
  }

  child(context: Record<string, unknown>): StructuredLogger {
    return new StructuredLogger({ ...this.defaultContext, ...context });
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_WEIGHTS[level] >= LEVEL_WEIGHTS[CURRENT_LEVEL];
  }

  private output(level: LogLevel, message: string, context?: Record<string, unknown>, traceId?: string): void {
    if (!this.shouldLog(level)) return;

    const activeTraceId = traceId || traceStorage.getStore()?.traceId;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(activeTraceId ? { traceId: activeTraceId } : {}),
      ...this.defaultContext,
      ...(context ? { context } : {}),
    };

    const jsonString = JSON.stringify(entry);

    if (level === 'error') {
      console.error(jsonString);
    } else if (level === 'warn') {
      console.warn(jsonString);
    } else {
      console.log(jsonString);
    }
  }

  debug(message: string, context?: Record<string, unknown>, traceId?: string): void {
    this.output('debug', message, context, traceId);
  }

  info(message: string, context?: Record<string, unknown>, traceId?: string): void {
    this.output('info', message, context, traceId);
  }

  warn(message: string, context?: Record<string, unknown>, traceId?: string): void {
    this.output('warn', message, context, traceId);
  }

  error(message: string, context?: Record<string, unknown>, traceId?: string): void {
    this.output('error', message, context, traceId);
  }

  audit(message: string, context?: Record<string, unknown>, traceId?: string): void {
    this.output('info', message, { audit: true, ...context }, traceId);
  }
}

export const logger = new StructuredLogger({ service: 'pokedex-api' });
