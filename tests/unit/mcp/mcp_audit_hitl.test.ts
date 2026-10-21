import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createTraceContext, getAuditLogPath, withMcpAudit } from '../../../scripts/mcp/audit.js';
import { assertNoAutoApproval } from '../../../scripts/mcp/generate.js';

/**
 * ==============================================================================
 * tests/unit/mcp/mcp_audit_hitl.test.ts
 * ==============================================================================
 * Trazabilidad W3C (ADR-018) y HITL (sin auto-aprobación) en la gobernanza MCP.
 * ==============================================================================
 */

const TRACEPARENT = /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/;

test('🧪 MCP Audit: genera traceparent W3C válido cuando no hay contexto heredado', () => {
  const ctx = createTraceContext(undefined);
  assert.match(ctx.traceparent, TRACEPARENT);
  assert.equal(ctx.parentSpanId, undefined);
});

test('🧪 MCP Audit: hereda traceId y crea un span hijo', () => {
  const parent = `00-${'a'.repeat(32)}-${'b'.repeat(16)}-01`;
  const ctx = createTraceContext(parent);
  assert.equal(ctx.traceId, 'a'.repeat(32));
  assert.equal(ctx.parentSpanId, 'b'.repeat(16));
  assert.notEqual(ctx.spanId, 'b'.repeat(16));
  assert.match(ctx.traceparent, TRACEPARENT);
});

test('🧪 MCP Audit: descarta traceparent inválido o con IDs nulos', () => {
  for (const bad of ['basura', `00-${'0'.repeat(32)}-${'b'.repeat(16)}-01`]) {
    const ctx = createTraceContext(bad);
    assert.equal(ctx.parentSpanId, undefined);
    assert.match(ctx.traceparent, TRACEPARENT);
  }
});

test('🧪 MCP Audit: registra éxito y fallo en JSONL bajo tmp/', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-audit-'));
  try {
    withMcpAudit('test:ok', () => 1, { rootDir: root });
    withMcpAudit('test:fail', () => false, { rootDir: root, isSuccess: (r) => r });
    assert.throws(
      () =>
        withMcpAudit(
          'test:throw',
          () => {
            throw new Error('boom');
          },
          { rootDir: root },
        ),
      /boom/,
    );

    const lines = fs.readFileSync(getAuditLogPath(root), 'utf-8').trim().split('\n');
    const events = lines.map((l) => JSON.parse(l));
    assert.deepEqual(
      events.map((e) => [e.operation, e.outcome]),
      [
        ['test:ok', 'success'],
        ['test:fail', 'failure'],
        ['test:throw', 'failure'],
      ],
    );
    for (const e of events) assert.match(e.traceparent, TRACEPARENT);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('🧪 MCP HITL: rechaza directivas de auto-aprobación en configs generadas', () => {
  assert.doesNotThrow(() => assertNoAutoApproval({ mcpServers: { a: { command: 'npx', args: ['x'] } } }));
  assert.throws(() => assertNoAutoApproval({ mcpServers: { a: { autoApprove: ['*'] } } }), /HITL/);
  assert.throws(() => assertNoAutoApproval({ servers: [{ alwaysAllow: true }] }), /HITL/);
});
