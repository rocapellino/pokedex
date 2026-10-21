/**
 * ==============================================================================
 * scripts/mcp/audit.ts
 * ==============================================================================
 * Trazabilidad W3C (ADR-018) y registro de auditoría local de las operaciones
 * de gobernanza MCP (validate, generate, scan, doctor).
 *
 * - Propaga el contexto `traceparent` heredado de la variable de entorno
 *   `TRACEPARENT` (si es válido) o genera uno nuevo.
 * - Registra cada operación como una línea JSON en `tmp/mcp-audit.jsonl`
 *   (ignorado por Git, conforme a la política de higiene del repositorio).
 * - Nunca registra valores de variables de entorno ni argumentos de servidores.
 * ==============================================================================
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const W3C_TRACEPARENT_REGEX = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;
const ZERO_TRACE_ID = '0'.repeat(32);
const ZERO_SPAN_ID = '0'.repeat(16);

export interface McpTraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  traceparent: string;
}

export interface McpAuditEvent {
  timestamp: string;
  operation: string;
  outcome: 'success' | 'failure';
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  traceparent: string;
  durationMs: number;
  details?: Record<string, string | number | boolean>;
}

/**
 * Crea un contexto de traza W3C. Si `inherited` es un `traceparent` válido,
 * conserva su `traceId` y crea un nuevo span hijo; en caso contrario inicia una traza.
 */
export function createTraceContext(inherited: string | undefined = process.env.TRACEPARENT): McpTraceContext {
  const spanId = crypto.randomBytes(8).toString('hex');
  const match = inherited ? W3C_TRACEPARENT_REGEX.exec(inherited.trim().toLowerCase()) : null;

  if (match && match[1] !== ZERO_TRACE_ID && match[2] !== ZERO_SPAN_ID) {
    return {
      traceId: match[1],
      spanId,
      parentSpanId: match[2],
      traceparent: `00-${match[1]}-${spanId}-${match[3]}`,
    };
  }

  const traceId = crypto.randomBytes(16).toString('hex');
  return { traceId, spanId, traceparent: `00-${traceId}-${spanId}-01` };
}

export function getAuditLogPath(rootDir: string = process.cwd()): string {
  return path.join(rootDir, 'tmp', 'mcp-audit.jsonl');
}

export function recordMcpAudit(event: McpAuditEvent, rootDir: string = process.cwd()): void {
  try {
    const logPath = getAuditLogPath(rootDir);
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `${JSON.stringify(event)}\n`, 'utf-8');
  } catch {
    // La auditoría local es best-effort: nunca debe romper el flujo de gobernanza.
  }
}

/**
 * Ejecuta una operación MCP registrando su resultado en el log de auditoría.
 * El resultado `failure` se determina por excepción o por `isSuccess(result) === false`.
 */
export function withMcpAudit<T>(
  operation: string,
  fn: (ctx: McpTraceContext) => T,
  options: { isSuccess?: (result: T) => boolean; rootDir?: string } = {},
): T {
  const ctx = createTraceContext();
  const started = Date.now();
  const write = (outcome: McpAuditEvent['outcome']) =>
    recordMcpAudit(
      {
        timestamp: new Date().toISOString(),
        operation,
        outcome,
        traceId: ctx.traceId,
        spanId: ctx.spanId,
        parentSpanId: ctx.parentSpanId,
        traceparent: ctx.traceparent,
        durationMs: Date.now() - started,
      },
      options.rootDir,
    );

  try {
    const result = fn(ctx);
    write(options.isSuccess && !options.isSuccess(result) ? 'failure' : 'success');
    return result;
  } catch (err) {
    write('failure');
    throw err;
  }
}
